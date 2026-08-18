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
  IssueReveal,
  PageState,
} from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty, NEW_ID } from '../catalogDraft';
import { useEditorGate } from '../useEditorGate';
import type { TypeDraft } from '../catalogDraft';
import { apiErrorMessage, apiErrorIssues } from '../apiError';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { CatalogEditorBar, InUseNotice } from '../components/admin/CatalogEditorBar';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { PortsEditor } from '../components/admin/PortsEditor';
import type { V2AssetType, V2Category } from '../types';
import { useV2Notice } from '../store/noticeStore';

export default function V2AssetTypesPage() {
  const { confirm, confirmDialog } = useConfirm();
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  // 대장을 열면 **설비 종류**부터 — 도면에 놓이고 현황에 집계되는 단위가 주인공이다.

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  /* 첫 항목을 열어 둔다 — 세 탭이 같아야 탭을 옮길 때 「갑자기 빈 화면」이 나오지 않는다. */
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  /* 만드는 중이면 원본이 없다 — 그 사실을 `NEW_ID` 하나로 말한다(`null` 선택 + 초안 있음
     이라는 조합을 없앤다). */
  const isNew = selectedTypeId === NEW_ID;
  const original: V2AssetType | null = isNew ? null : (catalog?.types.find((t) => t.id === selectedTypeId) ?? null);

  /**
   * 사용 중이면 **늘리기만** 된다 — 구획마다 「이 아래로는 못 내린다」는 바닥을 준다.
   *
   * 예전에는 자산이 하나라도 있으면 포트 칸을 통째로 잠갔다. 그런데 위험한 것은 없애는
   * 쪽이고(케이블이 물린 포트가 사라진다) 더하는 쪽은 빈 자리가 늘 뿐이다. 서버도 같은
   * 규칙으로 잰다(`comparePortStructure`) — 화면이 먼저 말해 주지 않으면 저장할 때 튕긴다.
   */
  const inUseCount = original?.assetCount ?? 0;
  const portFloors =
    inUseCount > 0 && original
      ? Object.fromEntries(original.portTemplates.map((p) => [p.group, p.count]))
      : null;

  // dirty 여부
  const dirty = draft != null ? isDraftDirty(draft, original) : false;

  // 이슈 목록 (저장 시도 또는 실시간 표시)
  const issues = draft != null && catalog != null ? draftIssues(draft, catalog) : [];
  /* 저장이 막혔을 때의 규칙은 세 탭이 같은 것을 쓴다 — `useEditorGate`. */
  const gate = useEditorGate({ issueCount: issues.length, resetKey: selectedTypeId, onSave: handleSave });

  // ── draft onChange ────────────────────────────────────────────────────────
  function handleChange(patch: Partial<TypeDraft>) {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...patch }));
  }

  // ── 타입 선택 ─────────────────────────────────────────────────────────────
  async function selectType(id: string | null) {
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
  }

  // ── 신규 타입 ─────────────────────────────────────────────────────────────
  /* 새 자산 종류 — 분류는 편집 화면에서 고른다. 예전에는 분류마다 `+` 를 달아 그 자리에서
     정하게 했는데, 그러면 머리줄의 `+` 는 「분류 추가」가 되어 설비 종류 탭의 `+`(종류 추가)와
     같은 자리에서 다른 뜻이 됐다. */
  /** `categoryId` 를 주면 그 분류에 만든다 — 트리에서 분류 줄의 `+` 를 누른 경우. */
  async function handleNewType(categoryId?: string) {
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
    /* 만드는 중인 것도 목록의 한 줄이다 — 어느 분류에 무엇이 생기는지 화면이 보여 준다. */
    setSelectedTypeId(NEW_ID);
    setDraft(emptyDraft(categoryId ?? catalog?.categories[0]?.id ?? ''));
    setSaveError(null);
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (draft == null || catalog == null) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      if (isNew) {
        // 신규 생성
        const created = await mutations.createType.mutateAsync(draft);
        setSelectedTypeId(created.id);
        useV2Notice.getState().showSuccess(`'${draft.name}' 자산 종류를 만들었습니다`);
      } else {
        // 수정
        await mutations.updateType.mutateAsync({ id: selectedTypeId!, body: draft });
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
    /* 만들던 것을 물리면 그 줄도 목록에서 사라진다 — 저장한 적이 없으니 남을 것이 없다. */
    if (isNew) {
      setSelectedTypeId(null);
      setDraft(null);
    } else {
      setDraft(original ? typeToDraft(original) : null);
    }
    setSaveError(null);
  }

  // ── 자산 종류 삭제 ────────────────────────────────────────────────────────────
  async function handleDeleteType() {
    if (selectedTypeId == null || isNew) return;
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
  if (catalogQuery.isLoading) return <PageState />;
  if (catalogQuery.isError || catalog == null) return <PageState error="카탈로그를 불러오지 못했습니다" />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 분류 관리 오류 배너 */}
      <ErrorStrip
        message={categoryError}
        onDismiss={() => setCategoryError(null)}
        className="shrink-0 border-b border-line bg-surface px-4 py-1"
      />
      <div className="flex min-h-0 flex-1">
        {/* 목록은 탭이 각자 갖는다 — 지금 편집하는 것 옆에만 그 목록이 선다.
            폭·테두리·검색은 `TreePanel` 이 소유한다(조직 트리와 같은 판). */}
        {(
          <TypeListPanel
            catalog={catalog}
            selectedTypeId={selectedTypeId}
            newDraft={isNew && draft ? { categoryId: draft.categoryId, name: draft.name } : null}
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
          {/* ── 자산 종류 탭 ─────────────────────────────────────────── */}
          {(
            <>
              {draft == null ? (
                <EmptyState
                  title="선택된 자산 종류가 없습니다"
                  description="왼쪽에서 고르거나, 분류 줄에 손을 얹고 + 로 새로 만드세요. 자산 종류는 설비 안에 들어가는 것입니다."
                />
              ) : (
                <IssueReveal.Provider value={gate.showIssues}>
                  <CatalogEditorBar
                    title={isNew ? '새 자산 종류' : (original?.name ?? '')}
                    dirty={dirty}
                    saving={isSaving}
                    issueCount={issues.length}
                    showIssues={gate.showIssues}
                    error={saveError ?? gate.blockedMessage}
                    onDismissError={() => setSaveError(null)}
                    notice={
                      portFloors ? (
                        <InUseNotice count={inUseCount} message="포트는 늘릴 수만 있습니다 — 줄이거나 지울 수 없습니다" />
                      ) : null
                    }
                    onDelete={isNew ? undefined : () => void handleDeleteType()}
                    deleteLabel="종류 삭제"
                    onCancel={handleCancel}
                    onSave={gate.save}
                  />

                  {/* **주인공은 왼쪽, 속성은 오른쪽** — 설비 종류·케이블 종류·워크스페이스
                      상세와 같은 배치다. 예전에는 이 화면만 두 단 그리드라 기본정보·공량이
                      **반대편**에 서 있었고, 오른쪽 폭도 화면따라 늘었다 줄었다 했다.
                      화면을 옮길 때 같은 카드를 눈으로 다시 찾아야 하는 이유가 이것이었다. */}
                  <div className="flex h-full min-h-0 w-full gap-3 p-4">
                    {/* 포트 — **판이 곧 편집기**다. 미리보기를 따로 두지 않는다:
                        개수는 그 구획이 무엇인지 말하는 값이라 구획 라벨 옆이 제 자리이고,
                        거기서 고치면 고친 결과가 같은 자리에서 바뀐다. */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <PortsEditor
                        draft={draft}
                        onChange={handleChange}
                        floors={portFloors}
                        issues={issues}
                      />
                    </div>

                    {/* 속성은 늘 같은 폭(384) — 화면이 넓어져도 라벨과 값이 멀어지지 않는다. */}
                    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
                      <TypeBasicsForm
                        draft={draft}
                        catalog={catalog}
                        onChange={handleChange}
                        issues={issues}
                      />
                    </aside>
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
