/**
 * V2CatalogAdminPage — 설비관리대장
 *
 * 대장이 정하는 것은 현황표의 **「종류」 열**이다. 그래서 탭 이름도 그 말로 통일한다:
 *
 *   설비 종류 — 도면에 놓이고 현황에 집계되는 단위. 격자 + 구성.
 *   자산 종류 — 설비 안에 들어가는 것. 포트와 공량을 갖는다.
 *   케이블 종류 — 잇는 것.
 *
 * **목록은 탭이 각자 갖는다.** 예전에는 자산 목록이 화면 왼쪽에 고정돼 있어, 설비 종류
 * 탭을 열면 목록이 둘(자산 | 설비) 나란히 뜨고 왼쪽 264px 는 아무 일도 하지 않았다 —
 * 어느 목록이 지금 편집 대상인지 화면이 말해 주지 않았다.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ErrorStrip,
  PromptModal,
  useConfirm,
  EmptyState,
  PanelHeader,
  Tabs,
  type TabItem,
  IssueReveal,
} from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { UnsavedGuardProvider, useHasUnsaved, useReportUnsaved } from '../unsavedGuard';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty } from '../catalogDraft';
import type { TypeDraft } from '../catalogDraft';
import { apiErrorMessage, apiErrorIssues } from '../apiError';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { CatalogEditorBar, InUseNotice } from '../components/admin/CatalogEditorBar';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { PortsEditor } from '../components/admin/PortsEditor';
import { CableCatalogPanel } from '../components/admin/CableCatalogPanel';
import { AssemblyCatalogPanel } from '../components/admin/AssemblyCatalogPanel';
import type { V2AssetType, V2Category } from '../types';
import { useV2Notice } from '../store/noticeStore';

type Tab = 'type' | 'assembly' | 'cable';

const CATALOG_TABS: readonly TabItem<Tab>[] = [
  // 도면에 놓이고 현황에 집계되는 단위 — 대장의 주인공이라 맨 앞에 둔다.
  { key: 'assembly', label: '설비 종류' },
  { key: 'type', label: '자산 종류' },
  { key: 'cable', label: '케이블 종류' },
];

/* 저장 안 한 변경을 알리는 자리는 이 화면 **바깥**에 있어야 한다 — 안쪽에서 만들면
   그 자리를 읽는 것도 안쪽이라 패널이 알린 값을 못 본다. */
export default function V2CatalogAdminPage() {
  return (
    <UnsavedGuardProvider>
      <CatalogAdmin />
    </UnsavedGuardProvider>
  );
}

function CatalogAdmin() {
  const { confirm, confirmDialog } = useConfirm();
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  // 대장을 열면 **설비 종류**부터 — 도면에 놓이고 현황에 집계되는 단위가 주인공이다.
  const [activeTab, setActiveTab] = useState<Tab>('assembly');

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  /* 첫 항목을 열어 둔다 — 세 탭이 같아야 탭을 옮길 때 「갑자기 빈 화면」이 나오지 않는다. */
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 저장이 막혔을 때 폼 전체의 검증 문구를 켠다 — 평소에는 손댄 칸만 말한다. */
  const [revealIssues, setRevealIssues] = useState(false);
  /* 다른 종류로 옮기면 다시 잠근다 — 저기서 막혔던 표시를 여기 들고 오지 않는다. */
  useEffect(() => setRevealIssues(false), [selectedTypeId]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /* 카탈로그가 도착하면 첫 항목을 연다 — 한 번만. 그 뒤에 고른 것을 지우거나 「+」 로
     새로 만들면 `null` 이 되는데, 그때 다시 첫 항목으로 튕기면 안 된다. */
  const pickedFirstType = useRef(false);
  useEffect(() => {
    if (pickedFirstType.current || !catalog || catalog.types.length === 0) return;
    pickedFirstType.current = true;
    /* `selectType` 을 쓰면 안 된다 — 그건 **사용자가 목록에서 고른** 경우라 탭까지 옮긴다
       (`setActiveTab('type')`). 첫 로드에 그러면 설비 종류 탭으로 들어왔는데 자산 종류로
       튕긴다. 여기서는 고른 상태만 세운다. */
    const first = catalog.types[0]!;
    setSelectedTypeId(first.id);
    setDraft(typeToDraft(first));
  }, [catalog]);

  // 현재 선택된 원본 타입 (신규이면 null)
  const original: V2AssetType | null = catalog?.types.find((t) => t.id === selectedTypeId) ?? null;

  // 구조 잠금: assetCount > 0 → 포트 read-only
  const locked = (original?.assetCount ?? 0) > 0;

  // dirty 여부
  const dirty = draft != null ? isDraftDirty(draft, original) : false;
  useReportUnsaved(activeTab === 'type' && dirty);

  // 이슈 목록 (저장 시도 또는 실시간 표시)
  const issues = draft != null && catalog != null ? draftIssues(draft, catalog) : [];

  // ── draft onChange ────────────────────────────────────────────────────────
  function handleChange(patch: Partial<TypeDraft>) {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...patch }));
  }

  /** 지금 서 있는 화면이 저장 안 한 변경을 들고 있는가 — 각 패널이 알린다. */
  const hasUnsaved = useHasUnsaved();

  async function confirmLeave(): Promise<boolean> {
    if (!hasUnsaved()) return true;
    return confirm({
      title: '저장하지 않은 변경',
      target: null,
      message: '편집 내용이 사라집니다. 이동할까요?',
      confirmLabel: '이동',
      danger: true,
    });
  }

  async function switchTab(next: Tab) {
    if (next === activeTab) return;
    if (!(await confirmLeave())) return;
    setActiveTab(next);
  }

  // ── 타입 선택 ─────────────────────────────────────────────────────────────
  async function selectType(id: string) {
    if (
      dirty &&
      !(await confirm({
        title: '저장하지 않은 변경',
        target: null,
        message: '편집 내용이 사라집니다. 이동할까요?',
        confirmLabel: '이동',
        danger: true,
      }))
    )
      return;
    setSelectedTypeId(id);
    const type = catalog?.types.find((t) => t.id === id);
    setDraft(type ? typeToDraft(type) : null);
    setSaveError(null);
    setActiveTab('type');
  }

  // ── 신규 타입 ─────────────────────────────────────────────────────────────
  /* 새 자산 종류 — 분류는 편집 화면에서 고른다. 예전에는 분류마다 `+` 를 달아 그 자리에서
     정하게 했는데, 그러면 머리줄의 `+` 는 「분류 추가」가 되어 설비 종류 탭의 `+`(종류 추가)와
     같은 자리에서 다른 뜻이 됐다. */
  async function handleNewType() {
    if (
      dirty &&
      !(await confirm({
        title: '저장하지 않은 변경',
        target: null,
        message: '편집 내용이 사라집니다. 이동할까요?',
        confirmLabel: '이동',
        danger: true,
      }))
    )
      return;
    setSelectedTypeId(null);
    setDraft(emptyDraft(catalog?.categories[0]?.id ?? ''));
    setSaveError(null);
    setActiveTab('type');
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (draft == null || catalog == null) return;
    const currentIssues = draftIssues(draft, catalog);
    if (currentIssues.length > 0) {
      /* 몇 건인지만 말하고 어느 칸인지 안 짚으면 사람은 폼을 처음부터 훑어야 한다 —
         막고 있는 칸을 전부 켠다(`IssueReveal`). */
      setRevealIssues(true);
      setSaveError(`입력 오류가 있습니다 (${currentIssues.length}건) — 붉게 표시된 칸을 확인하세요`);
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      if (selectedTypeId == null) {
        // 신규 생성
        const created = await mutations.createType.mutateAsync(draft);
        setSelectedTypeId(created.id);
        useV2Notice.getState().showSuccess(`'${draft.name}' 자산 종류를 만들었습니다`);
      } else {
        // 수정
        await mutations.updateType.mutateAsync({ id: selectedTypeId, body: draft });
        /* 저장 바가 사라지는 것만으로는 「정말 저장됐나」를 알 수 없다 — 그래서 저장을
           두 번 누르게 된다. 값을 바꾼 모든 길은 결과를 말한다. */
        useV2Notice.getState().showSuccess(`'${draft.name}' 을 저장했습니다`);
      }
    } catch (err: unknown) {
      const issues = apiErrorIssues(err);
      if (issues) {
        setSaveError(issues.map((d) => `[${d.path}] ${d.message}`).join(' / '));
      } else {
        setSaveError(apiErrorMessage(err, '저장 실패'));
      }
    } finally {
      setIsSaving(false);
    }
  }

  // ── 취소 ─────────────────────────────────────────────────────────────────
  function handleCancel() {
    if (selectedTypeId) {
      const type = catalog?.types.find((t) => t.id === selectedTypeId);
      setDraft(type ? typeToDraft(type) : null);
    } else {
      setDraft(null);
      setSelectedTypeId(null);
    }
    setSaveError(null);
  }

  // ── 자산 종류 삭제 ────────────────────────────────────────────────────────────
  async function handleDeleteType() {
    if (selectedTypeId == null) return;
    if (
      !(await confirm({
        title: '자산 종류 삭제',
        target: draft?.name ?? '',
        message: '이 종류로 만든 자산이 있으면 거부됩니다.',
        confirmLabel: '삭제',
        danger: true,
      }))
    )
      return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await mutations.deleteType.mutateAsync(selectedTypeId);
      setSelectedTypeId(null);
      setDraft(null);
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, '자산 종류 삭제 실패'));
    } finally {
      setIsSaving(false);
    }
  }

  // ── 분류 관리 콜백 ────────────────────────────────────────────────────────
  async function handleRenameCategory(cat: V2Category, newName: string) {
    setCategoryError(null);
    try {
      await mutations.patchCategory.mutateAsync({ id: cat.id, body: { name: newName } });
    } catch (err: unknown) {
      setCategoryError(apiErrorMessage(err, '분류 이름 변경 실패'));
    }
  }

  async function handleDeleteCategory(cat: V2Category) {
    setCategoryError(null);
    try {
      await mutations.deleteCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      setCategoryError(apiErrorMessage(err, '분류 삭제 실패'));
    }
  }

  async function handleAddCategory(name: string) {
    setCategoryError(null);
    const maxOrder = Math.max(0, ...(catalog?.categories.map((c) => c.sortOrder) ?? [0]));
    try {
      await mutations.createCategory.mutateAsync({ name, key: name, sortOrder: maxOrder + 1 });
      setAddCategoryOpen(false); // 성공했을 때만 닫는다 — 실패하면 오류를 모달 안에서 보여준다
    } catch (err: unknown) {
      setCategoryError(apiErrorMessage(err, '분류 추가 실패'));
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  if (catalogQuery.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-content-muted">로딩 중…</div>;
  }
  if (catalogQuery.isError || catalog == null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-danger">카탈로그를 불러오지 못했습니다</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 분류 관리 오류 배너 */}
      <ErrorStrip
        message={categoryError}
        onDismiss={() => setCategoryError(null)}
        className="shrink-0 border-b border-line bg-surface px-4 py-1"
      />
      <PanelHeader className="px-4">
        {/* 탭을 옮기면 그 패널이 통째로 사라지고 초안도 함께 사라진다 — 묻고 옮긴다. */}
        <Tabs items={CATALOG_TABS} value={activeTab} onChange={(t) => void switchTab(t as Tab)} className="-mb-px" />
      </PanelHeader>
      <div className="flex min-h-0 flex-1">
        {/* 목록은 탭이 각자 갖는다 — 지금 편집하는 것 옆에만 그 목록이 선다.
            폭·테두리·검색은 `CatalogList` 가 소유한다(세 탭이 같은 판). */}
        {activeTab === 'type' && (
          <TypeListPanel
            catalog={catalog}
            selectedTypeId={selectedTypeId}
            onSelectType={selectType}
            onNewType={handleNewType}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onAddCategory={() => {
              setCategoryError(null);
              setAddCategoryOpen(true);
            }}
          />
        )}

        {/* ── 우측 영역 ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── 설비 종류 탭 ─────────────────────────────────────────── */}
          {/* 스크롤은 **패널 안쪽**이 쥔다. 바깥에서 `overflow-y-auto` 로 감싸면 안쪽이
              내용만큼만 커져서, 왼쪽 목록이 화면 중간에서 끊긴다(실측 505px / 화면 719px).
              자산 종류 탭에는 이 래퍼가 없어 세 탭의 모양이 달랐다. */}
          {activeTab === 'assembly' && (
            <div className="flex min-h-0 flex-1">
              <AssemblyCatalogPanel
                catalog={catalog}
                onRenameCategory={handleRenameCategory}
                onDeleteCategory={handleDeleteCategory}
                onAddCategory={() => {
                  setCategoryError(null);
                  setAddCategoryOpen(true);
                }}
              />
            </div>
          )}

          {/* ── 케이블 종류 탭 ───────────────────────────────────────── */}
          {activeTab === 'cable' && (
            <div className="flex min-h-0 flex-1">
              <CableCatalogPanel catalog={catalog} />
            </div>
          )}

          {/* ── 자산 종류 탭 ─────────────────────────────────────────── */}
          {activeTab === 'type' && (
            <>
              {draft == null ? (
                <EmptyState
                  title="선택된 자산 종류가 없습니다"
                  description="좌측 목록에서 고르거나, + 버튼으로 새로 만드세요. 자산 종류는 설비 안에 들어가는 것입니다."
                />
              ) : (
                <IssueReveal.Provider value={revealIssues}>
                  <CatalogEditorBar
                    title={selectedTypeId == null ? '새 자산 종류' : (original?.name ?? '')}
                    dirty={dirty}
                    saving={isSaving}
                    issueCount={issues.length}
                    showIssues={revealIssues}
                    error={saveError}
                    onDismissError={() => setSaveError(null)}
                    notice={
                      locked ? <InUseNotice count={original?.assetCount ?? 0} message="포트 구조는 변경할 수 없습니다" /> : null
                    }
                    onDelete={selectedTypeId != null ? () => void handleDeleteType() : undefined}
                    deleteLabel="종류 삭제"
                    onCancel={handleCancel}
                    onSave={() => void handleSave()}
                  />

                  {/* 편집 폼 영역 — 스크롤.
                      **가운데로 몰지 않는다.** 예전에는 `mx-auto max-w-4xl` 로 가운데 세워
                      좌우에 큰 여백이 남았는데, 워크스페이스는 트리·본문·상세가 화면을 꽉
                      채우는 판이라 이 화면만 홀로 떠 보였다. 대신 카드를 두 단으로 흘려
                      폭을 쓴다 — 넓은 화면에서 라벨+입력 한 줄이 1000px 로 늘어나는 것도
                      함께 막힌다(그게 애초에 폭을 묶은 까닭이다). */}
                  <div className="min-h-0 flex-1 p-4">
                    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-2">
                      {/* 기본정보 · 공량 — 짧으므로 제 높이만 쓰고 위에 붙는다. */}
                      <div className="min-h-0 space-y-3 self-start overflow-y-auto">
                      <TypeBasicsForm
                        draft={draft}
                        catalog={catalog}
                        onChange={handleChange}
                        issues={issues}
                      />
                      </div>

                      {/* 포트 — **판이 곧 편집기**다. 미리보기를 따로 두지 않는다:
                          개수는 그 구획이 무엇인지 말하는 값이라 구획 라벨 옆이 제 자리이고,
                          거기서 고치면 고친 결과가 같은 자리에서 바뀐다. */}
                      <PortsEditor
                        draft={draft}
                        onChange={handleChange}
                        locked={locked}
                        issues={issues}
                      />
                    </div>
                  </div>
                </IssueReveal.Provider>
              )}
            </>
          )}
        </div>
      </div>
      <PromptModal
        open={addCategoryOpen}
        title="분류 추가"
        hint="자산·설비 종류를 묶는 상위 분류입니다. 이름이 곧 키가 되므로 나중에 바꿀 수 없습니다."
        label="분류 이름"
        placeholder="예: 계측"
        busy={mutations.createCategory.isPending}
        error={categoryError}
        onConfirm={handleAddCategory}
        onClose={() => setAddCategoryOpen(false)}
      />
      {confirmDialog}
    </div>
  );
}
