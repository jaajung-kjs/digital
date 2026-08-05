/**
 * V2CatalogAdminPage — 관리자 카탈로그 화면
 *
 * 좌: TypeListPanel (280px, 분류·타입 목록)
 * 우: 탭(타입 | 케이블)
 *   타입 탭: TypeBasicsForm + FieldDefsEditor + ContainersEditor + PortsEditor + LinksEditor + 저장바
 *   케이블 탭: CableCatalogPanel
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton, Badge, ErrorStrip, PromptModal, useConfirm } from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty } from '../catalogDraft';
import type { TypeDraft } from '../catalogDraft';
import { apiErrorMessage, apiErrorIssues } from '../apiError';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { FieldDefsEditor } from '../components/admin/FieldDefsEditor';
import { ContainersEditor } from '../components/admin/ContainersEditor';
import { PortsEditor } from '../components/admin/PortsEditor';
import { LinksEditor } from '../components/admin/LinksEditor';
import { CableCatalogPanel } from '../components/admin/CableCatalogPanel';
import type { V2AssetType, V2Category } from '../types';

type Tab = 'type' | 'cable';

export default function V2CatalogAdminPage() {
  const { confirm, confirmDialog } = useConfirm();
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('type');

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 현재 선택된 원본 타입 (신규이면 null)
  const original: V2AssetType | null =
    catalog?.types.find((t) => t.id === selectedTypeId) ?? null;

  // 구조 잠금: assetCount > 0 → 컨테이너/포트/링크 read-only
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
        message: '이 타입의 편집 내용이 사라집니다. 이동할까요?',
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
        message: '이 타입의 편집 내용이 사라집니다. 이동할까요?',
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

  // ── 타입 삭제 ────────────────────────────────────────────────────────────
  async function handleDeleteType() {
    if (selectedTypeId == null) return;
    if (!(await confirm({ title: '타입 삭제', message: '이 자산 타입을 삭제합니다. 이 타입으로 만든 자산이 있으면 거부됩니다.', confirmLabel: '삭제', danger: true }))) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await mutations.deleteType.mutateAsync(selectedTypeId);
      setSelectedTypeId(null);
      setDraft(null);
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, '타입 삭제 실패'));
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
    return <div className="flex h-full items-center justify-center text-sm text-danger">카탈로그를 불러오지 못했습니다</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 분류 관리 오류 배너 */}
      <ErrorStrip
        message={categoryError}
        onDismiss={() => setCategoryError(null)}
        className="shrink-0 border-b border-line bg-surface px-4 py-1"
      />
      <div className="flex min-h-0 flex-1">
        {/* ── 좌측 패널 ────────────────────────────────────────────────── */}
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

        {/* ── 우측 영역 ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 탭 바 */}
          <div className="shrink-0 flex items-center gap-0 border-b border-line bg-surface px-4">
            <button
              type="button"
              onClick={() => setActiveTab('type')}
              className={`px-3 py-2 text-sm border-b-2 transition-colors focus-visible:outline-none ${
                activeTab === 'type'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              타입 명세
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cable')}
              className={`px-3 py-2 text-sm border-b-2 transition-colors focus-visible:outline-none ${
                activeTab === 'cable'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              케이블
            </button>
          </div>

          {/* ── 케이블 탭 ───────────────────────────────────────────── */}
          {activeTab === 'cable' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CableCatalogPanel catalog={catalog} />
            </div>
          )}

          {/* ── 타입 탭 ─────────────────────────────────────────────── */}
          {activeTab === 'type' && (
            <>
              {draft == null ? (
                <div className="flex flex-1 items-center justify-center text-sm text-content-faint">
                  좌측에서 타입을 선택하거나 + 버튼으로 추가하세요
                </div>
              ) : (
                <>
                  {/* 저장 바 */}
                  <div className="shrink-0 flex flex-col border-b border-line bg-surface">
                    {saveError != null && (
                      <div className="flex items-center gap-1 border-b border-line px-4 py-1">
                        <span className="flex-1 text-xs text-danger">{saveError}</span>
                        <IconButton aria-label="오류 닫기" onClick={() => setSaveError(null)}>
                          <X size={12} />
                        </IconButton>
                      </div>
                    )}
                    {issues.length > 0 && saveError == null && (
                      <div className="px-4 py-1 text-xs text-warning">
                        입력 오류 {issues.length}건 — 저장 전에 수정하세요
                      </div>
                    )}
                    {/* 구조 잠금 안내 */}
                    {locked && (
                      <div className="flex items-center gap-2 border-b border-line bg-warning-bg px-4 py-1.5">
                        <Badge status="warning">{original?.assetCount}개 사용 중</Badge>
                        <span className="text-xs text-warning">
                          자산 {original?.assetCount}개가 이 타입을 사용 중 — 구조(컨테이너·포트·링크)는 변경할 수 없습니다
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2">
                      <span className="flex-1 text-xs text-content-muted">
                        {selectedTypeId == null ? '신규 타입' : (original?.name ?? '')}
                        {dirty && <span className="ml-1 text-warning">●</span>}
                      </span>
                      {selectedTypeId != null && (
                        <Button variant="ghost" size="sm" disabled={isSaving} onClick={() => void handleDeleteType()} className="text-danger hover:text-danger">
                          타입 삭제
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
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
                    {/* 기본정보 · 배치 · 공량 */}
                    <TypeBasicsForm
                      draft={draft}
                      original={original}
                      catalog={catalog}
                      onChange={handleChange}
                      issues={issues}
                    />

                    {/* 필드 정의 (잠금 없음 — 항상 편집 가능) */}
                    <FieldDefsEditor
                      draft={draft}
                      onChange={handleChange}
                      issues={issues}
                    />

                    {/* 컨테이너 (잠금 대상) */}
                    <ContainersEditor
                      draft={draft}
                      onChange={handleChange}
                      catalog={catalog}
                      locked={locked}
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
                    <LinksEditor
                      draft={draft}
                      onChange={handleChange}
                      catalog={catalog}
                      locked={locked}
                      issues={issues}
                    />
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
        hint="자산 타입을 묶는 상위 분류입니다. 이름이 곧 키가 되므로 나중에 바꿀 수 없습니다."
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
