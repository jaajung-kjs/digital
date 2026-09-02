/**
 * V2CatalogAdminPage — 설비관리대장
 *
 * 대장이 정하는 것은 현황표의 **「종류」 열**이다. 그래서 탭 이름도 그 말로 통일한다:
 *
 *   설비 품목 — 도면에 놓이고 현황에 집계되는 단위. 격자 + 구성.
 *   장비 품목 — 설비 안에 들어가는 것. 포트와 공량을 갖는다.
 *   케이블 품목 — 잇는 것.
 *
 * **목록은 탭이 각자 갖는다.** 예전에는 자산 목록이 화면 왼쪽에 고정돼 있어, 설비 품목
 * 탭을 열면 목록이 둘(자산 | 설비) 나란히 뜨고 왼쪽 264px 는 아무 일도 하지 않았다 —
 * 어느 목록이 지금 편집 대상인지 화면이 말해 주지 않았다.
 */
import { useEffect, useRef, useState } from 'react';
import {
  useConfirm,
  EmptyState,
  IssueReveal,
  PageState,
} from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty, NEW_ID, draftToTypeBody } from '../catalogDraft';
import { useEditorGate } from '../useEditorGate';
import type { TypeDraft } from '../catalogDraft';
import { useUnsavedMark } from '../useUnsavedMark';
import { useCategoryAdmin } from '../useCategoryAdmin';
import { unsavedPrompt } from '../leaveGuard';
import { apiErrorMessage, apiErrorIssues } from '../apiError';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { CatalogEditorBar } from '../components/admin/CatalogEditorBar';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { PortsEditor } from '../components/admin/PortsEditor';
import type { V2AssetType } from '../types';
import { useV2Notice } from '../store/noticeStore';

export default function V2AssetTypesPage() {
  const { confirm, confirmDialog } = useConfirm();
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  // 대장을 열면 **설비 품목**부터 — 도면에 놓이고 현황에 집계되는 단위가 주인공이다.

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  /* 첫 항목을 열어 둔다 — 세 탭이 같아야 탭을 옮길 때 「갑자기 빈 화면」이 나오지 않는다. */
  /* **첫 항목은 처음 그릴 때부터** 열려 있어야 한다 — effect 로 열면 첫 프레임은 오른쪽이
     빈 채로 그려졌다가 다음 프레임에 채워져, 판을 옮길 때마다 화면이 깜빡인다(재어 보니 20ms).
     카탈로그가 이미 손에 있으면(거의 늘 그렇다 — 캐시) 그것으로 시작한다. */
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(() => catalogQuery.data?.types[0]?.id ?? null);
  const [draft, setDraft] = useState<TypeDraft | null>(() => {
    const first = catalogQuery.data?.types[0];
    return first ? typeToDraft(first) : null;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  /* 분류는 설비 품목 화면과 **같은 문**을 쓴다 — 여기서 다시 적으면 두 화면이 갈린다. */
  const category = useCategoryAdmin();
  const [isSaving, setIsSaving] = useState(false);

  /* 카탈로그가 도착하면 첫 항목을 연다 — 한 번만. 그 뒤에 고른 것을 지우거나 「+」 로
     새로 만들면 `null` 이 되는데, 그때 다시 첫 항목으로 튕기면 안 된다. */
  /* 처음 그릴 때 이미 열었으면 다시 열지 않는다(위 초기값). 아직 카탈로그가 없을 때만
     아래 effect 가 도착을 기다린다. */
  const pickedFirstType = useRef(catalogQuery.data != null && catalogQuery.data.types.length > 0);
  useEffect(() => {
    if (pickedFirstType.current || !catalog || catalog.types.length === 0) return;
    pickedFirstType.current = true;
    /* `selectType` 을 쓰면 안 된다 — 그건 **사용자가 목록에서 고른** 경우라 탭까지 옮긴다
       (`setActiveTab('type')`). 첫 로드에 그러면 설비 품목 탭으로 들어왔는데 장비 품목으로
       튕긴다. 여기서는 고른 상태만 세운다. */
    const first = catalog.types[0]!;
    setSelectedTypeId(first.id);
    setDraft(typeToDraft(first));
  }, [catalog]);

  /* 만드는 중이면 원본이 없다 — 그 사실을 `NEW_ID` 하나로 말한다(`null` 선택 + 초안 있음
     이라는 조합을 없앤다). */
  const isNew = selectedTypeId === NEW_ID;
  const original: V2AssetType | null = isNew ? null : (catalog?.types.find((t) => t.id === selectedTypeId) ?? null);

  // dirty 여부
  const dirty = draft != null ? isDraftDirty(draft, original) : false;
  /* 저장 안 한 초안이 있으면 셸이 떠나기를 막는다 — 묻는 자리는 셸 하나다. */
  useUnsavedMark(dirty ? 1 : 0, handleCancel);

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
      !(await confirm(unsavedPrompt(1)))
    )
      return;
    setSelectedTypeId(id);
    const type = catalog?.types.find((t) => t.id === id);
    setDraft(type ? typeToDraft(type) : null);
    setSaveError(null);
  }

  // ── 신규 타입 ─────────────────────────────────────────────────────────────
  /* 새 장비 품목 — 분류는 편집 화면에서 고른다. 예전에는 분류마다 `+` 를 달아 그 자리에서
     정하게 했는데, 그러면 머리줄의 `+` 는 「분류 추가」가 되어 설비 품목 탭의 `+`(종류 추가)와
     같은 자리에서 다른 뜻이 됐다. */
  /** `categoryId` 를 주면 그 분류에 만든다 — 트리에서 분류 줄의 `+` 를 누른 경우. */
  async function handleNewType(categoryId?: string) {
    if (
      dirty &&
      !(await confirm(unsavedPrompt(1)))
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
        const created = await mutations.createType.mutateAsync(draftToTypeBody(draft));
        setSelectedTypeId(created.id);
        useV2Notice.getState().showSuccess(`'${draft.name}' 장비 품목을 만들었습니다`);
      } else {
        // 수정
        await mutations.updateType.mutateAsync({ id: selectedTypeId!, body: draftToTypeBody(draft) });
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

  // ── 장비 품목 삭제 ────────────────────────────────────────────────────────────
  async function handleDeleteType() {
    if (selectedTypeId == null || isNew) return;
    if (
      !(await confirm({
        title: '장비 품목 삭제',
        target: draft?.name ?? '',
        message: '이 품목으로 만든 설비가 있으면 거부됩니다.',
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
      setSaveError(apiErrorMessage(err, '장비 품목 삭제 실패'));
    } finally {
      setIsSaving(false);
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  if (catalogQuery.isLoading) return <PageState />;
  if (catalogQuery.isError || catalog == null) return <PageState error="카탈로그를 불러오지 못했습니다" />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
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
            category={category}
          />
        )}

        {/* ── 우측 영역 ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── 장비 품목 탭 ─────────────────────────────────────────── */}
          {(
            <>
              {draft == null ? (
                <EmptyState
                  title="선택된 장비 품목이 없습니다"
                  description="왼쪽에서 고르거나, 분류 줄에 손을 얹고 + 로 새로 만드세요. 장비 품목은 설비 안에 들어가는 것입니다."
                />
              ) : (
                <IssueReveal.Provider value={gate.showIssues}>
                  <CatalogEditorBar
                    title={isNew ? '새 장비 품목' : (original?.name ?? '')}
                    dirty={dirty}
                    saving={isSaving}
                    issueCount={issues.length}
                    showIssues={gate.showIssues}
                    error={saveError ?? gate.blockedMessage}
                    onDismissError={() => setSaveError(null)}
                    onDelete={isNew ? undefined : () => void handleDeleteType()}
                    deleteLabel="품목 삭제"
                    onCancel={handleCancel}
                    onSave={gate.save}
                  />

                  {/* **주인공은 왼쪽, 속성은 오른쪽** — 설비 품목·케이블 품목·설비 관리
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
      {category.dialog}
      {confirmDialog}
    </div>
  );
}
