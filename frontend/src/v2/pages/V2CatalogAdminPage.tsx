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
import { useState } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  IconButton,
  Badge,
  ErrorStrip,
  PromptModal,
  useConfirm,
  EmptyState,
  PanelHeader,
  Tabs,
  type TabItem,
} from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty } from '../catalogDraft';
import type { TypeDraft } from '../catalogDraft';
import { apiErrorMessage, apiErrorIssues } from '../apiError';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { PortsEditor } from '../components/admin/PortsEditor';
import { CableCatalogPanel } from '../components/admin/CableCatalogPanel';
import { AssemblyCatalogPanel } from '../components/admin/AssemblyCatalogPanel';
import type { V2AssetType, V2Category } from '../types';

type Tab = 'type' | 'assembly' | 'cable';

const CATALOG_TABS: readonly TabItem<Tab>[] = [
  // 도면에 놓이고 현황에 집계되는 단위 — 대장의 주인공이라 맨 앞에 둔다.
  { key: 'assembly', label: '설비 종류' },
  { key: 'type', label: '자산 종류' },
  { key: 'cable', label: '케이블 종류' },
];

export default function V2CatalogAdminPage() {
  const { confirm, confirmDialog } = useConfirm();
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  // 대장을 열면 **설비 종류**부터 — 도면에 놓이고 현황에 집계되는 단위가 주인공이다.
  const [activeTab, setActiveTab] = useState<Tab>('assembly');

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 현재 선택된 원본 타입 (신규이면 null)
  const original: V2AssetType | null = catalog?.types.find((t) => t.id === selectedTypeId) ?? null;

  // 구조 잠금: assetCount > 0 → 포트 read-only
  const locked = (original?.assetCount ?? 0) > 0;

  // dirty 여부
  const dirty = draft != null ? isDraftDirty(draft, original) : false;

  // 이슈 목록 (저장 시도 또는 실시간 표시)
  const issues = draft != null && catalog != null ? draftIssues(draft, catalog) : [];

  // ── draft onChange ────────────────────────────────────────────────────────
  function handleChange(patch: Partial<TypeDraft>) {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...patch }));
  }

  // ── 타입 선택 ─────────────────────────────────────────────────────────────
  async function selectType(id: string) {
    if (
      dirty &&
      !(await confirm({
        title: '저장하지 않은 변경',
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
  async function handleNewType(categoryId: string) {
    if (
      dirty &&
      !(await confirm({
        title: '저장하지 않은 변경',
        message: '편집 내용이 사라집니다. 이동할까요?',
        confirmLabel: '이동',
        danger: true,
      }))
    )
      return;
    setSelectedTypeId(null);
    setDraft(emptyDraft(categoryId));
    setSaveError(null);
    setActiveTab('type');
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (draft == null || catalog == null) return;
    const currentIssues = draftIssues(draft, catalog);
    if (currentIssues.length > 0) {
      setSaveError(`입력 오류가 있습니다 (${currentIssues.length}건)`);
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      if (selectedTypeId == null) {
        // 신규 생성
        const created = await mutations.createType.mutateAsync(draft);
        setSelectedTypeId(created.id);
      } else {
        // 수정
        await mutations.updateType.mutateAsync({ id: selectedTypeId, body: draft });
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
        message: '이 자산 종류를 삭제합니다. 이 종류로 만든 자산이 있으면 거부됩니다.',
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
        <Tabs items={CATALOG_TABS} value={activeTab} onChange={setActiveTab} className="-mb-px" />
      </PanelHeader>
      <div className="flex min-h-0 flex-1">
        {/* 목록은 탭이 각자 갖는다 — 지금 편집하는 것 옆에만 그 목록이 선다. */}
        {activeTab === 'type' && (
          <aside className="w-64 shrink-0 border-r border-line bg-sidebar">
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
          </aside>
        )}

        {/* ── 우측 영역 ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── 설비 종류 탭 ─────────────────────────────────────────── */}
          {activeTab === 'assembly' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AssemblyCatalogPanel catalog={catalog} />
            </div>
          )}

          {/* ── 케이블 종류 탭 ───────────────────────────────────────── */}
          {activeTab === 'cable' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
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
                <>
                  {/* 저장 바 */}
                  <div className="shrink-0 flex flex-col border-b border-line bg-surface">
                    {saveError != null && (
                      <div className="mx-auto flex w-full max-w-4xl items-center gap-1 border-b border-line px-4 py-1">
                        <span className="flex-1 text-xs text-danger">{saveError}</span>
                        <IconButton aria-label="오류 닫기" onClick={() => setSaveError(null)}>
                          <X size={12} />
                        </IconButton>
                      </div>
                    )}
                    {issues.length > 0 && saveError == null && (
                      <div className="mx-auto w-full max-w-4xl px-4 py-1 text-xs text-warning">
                        입력 오류 {issues.length}건 — 저장 전에 수정하세요
                      </div>
                    )}
                    {/* 구조 잠금 안내 — 개수는 배지가 말하므로 문장에서 되풀이하지 않는다.
                        (예전에는 "3개 사용 중" 배지 옆에 "자산 3개가 이 종류를 사용 중" 이 또 있었다.) */}
                    {locked && (
                      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-1.5">
                        <Badge status="warning">{original?.assetCount}개 사용 중</Badge>
                        <span className="text-xs text-warning">
                          포트 구조는 변경할 수 없습니다
                        </span>
                      </div>
                    )}
                    <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-2">
                      <span className="flex-1 text-xs text-content-muted">
                        {selectedTypeId == null ? '새 자산 종류' : (original?.name ?? '')}
                        {dirty && <span className="ml-1 text-warning">●</span>}
                      </span>
                      {selectedTypeId != null && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void handleDeleteType()}
                          className="text-danger hover:text-danger"
                        >
                          종류 삭제
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" disabled={!dirty || isSaving} onClick={handleCancel}>
                        취소
                      </Button>
                      <Button size="sm" disabled={!dirty || isSaving} onClick={() => void handleSave()}>
                        {isSaving ? '저장 중…' : '저장'}
                      </Button>
                    </div>
                  </div>

                  {/* 편집 폼 영역 — 스크롤 */}
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="mx-auto max-w-4xl space-y-3">
                    {/* 기본정보 · 배치 · 공량 */}
                    <TypeBasicsForm
                      draft={draft}
                      catalog={catalog}
                      onChange={handleChange}
                      issues={issues}
                    />

                    {/* 포트 템플릿 (잠금 대상) */}
                    <PortsEditor
                      draft={draft}
                      onChange={handleChange}
                      catalog={catalog}
                      locked={locked}
                      issues={issues}
                    />

                    {/* 통과 링크 규칙 (잠금 대상) */}
                    </div>
                  </div>
                </>
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
