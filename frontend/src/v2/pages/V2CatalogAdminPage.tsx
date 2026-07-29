/**
 * V2CatalogAdminPage — 관리자 카탈로그 화면
 *
 * 좌: TypeListPanel (280px, 분류·타입 목록)
 * 우: 선택 타입 편집 폼 + 저장 바
 *
 * Task 5에서 추가될 섹션(FieldDefsEditor/ContainersEditor/PortsEditor/LinksEditor)은
 * formSections 배열로 확장하고, 케이블 탭은 activeTab state로 확장한다.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../components/ui';
import { useV2Catalog, useCatalogMutations } from '../hooks';
import { typeToDraft, emptyDraft, draftIssues, isDraftDirty } from '../catalogDraft';
import type { TypeDraft } from '../catalogDraft';
import { TypeListPanel } from '../components/admin/TypeListPanel';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import type { V2AssetType, V2Category } from '../types';

export default function V2CatalogAdminPage() {
  const catalogQuery = useV2Catalog();
  const catalog = catalogQuery.data;
  const mutations = useCatalogMutations();

  // ── 선택 상태 ────────────────────────────────────────────────────────────
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 현재 선택된 원본 타입 (신규이면 null)
  const original: V2AssetType | null =
    catalog?.types.find((t) => t.id === selectedTypeId) ?? null;

  // dirty 여부
  const dirty = draft != null && original !== undefined ? isDraftDirty(draft, original) : false;

  // 이슈 목록 (저장 시도 또는 실시간 표시)
  const issues = draft != null && catalog != null ? draftIssues(draft, catalog) : [];

  // ── draft onChange ────────────────────────────────────────────────────────
  function handleChange(patch: Partial<TypeDraft>) {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...patch }));
  }

  // ── 타입 선택 ─────────────────────────────────────────────────────────────
  function selectType(id: string) {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 폐기하고 이동할까요?')) return;
    setSelectedTypeId(id);
    const type = catalog?.types.find((t) => t.id === id);
    setDraft(type ? typeToDraft(type) : null);
    setSaveError(null);
  }

  // ── 신규 타입 ─────────────────────────────────────────────────────────────
  function handleNewType(categoryId: string) {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 폐기하고 이동할까요?')) return;
    setSelectedTypeId(null);
    setDraft(emptyDraft(categoryId));
    setSaveError(null);
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
      const apiErr = (err as { response?: { data?: { error?: string; message?: string; details?: { path: string; message: string }[] } } }).response?.data;
      if (apiErr?.error === 'INVALID_TYPE_SPEC' && apiErr.details) {
        setSaveError(apiErr.details.map((d) => `[${d.path}] ${d.message}`).join(' / '));
      } else {
        setSaveError(apiErr?.message ?? '저장 실패');
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

  // ── 분류 관리 콜백 ────────────────────────────────────────────────────────
  async function handleRenameCategory(cat: V2Category, newName: string) {
    await mutations.patchCategory.mutateAsync({ id: cat.id, body: { name: newName } });
  }

  async function handleDeleteCategory(cat: V2Category) {
    await mutations.deleteCategory.mutateAsync(cat.id);
  }

  async function handleAddCategory() {
    const name = window.prompt('새 분류 이름을 입력하세요');
    if (!name?.trim()) return;
    const maxOrder = Math.max(0, ...(catalog?.categories.map((c) => c.sortOrder) ?? [0]));
    await mutations.createCategory.mutateAsync({ name: name.trim(), key: name.trim(), sortOrder: maxOrder + 1 });
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  if (catalogQuery.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-content-muted">로딩 중…</div>;
  }
  if (catalogQuery.isError || catalog == null) {
    return <div className="flex h-full items-center justify-center text-sm text-danger">카탈로그를 불러오지 못했습니다</div>;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── 좌측 패널 ────────────────────────────────────────────────── */}
      <TypeListPanel
        catalog={catalog}
        selectedTypeId={selectedTypeId}
        onSelectType={selectType}
        onNewType={handleNewType}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={handleAddCategory}
      />

      {/* ── 우측 편집 영역 ───────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
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
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 text-xs text-content-muted">
                  {selectedTypeId == null ? '신규 타입' : (original?.name ?? '')}
                  {dirty && <span className="ml-1 text-warning">●</span>}
                </span>
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
              {/* 기본정보 · 배치 · 공량 */}
              <TypeBasicsForm
                draft={draft}
                original={original}
                catalog={catalog}
                onChange={handleChange}
                issues={issues}
                locked={(original?.assetCount ?? 0) > 0}
              />
              {/*
               * Task 5 에서 아래에 추가:
               * <FieldDefsEditor draft={draft} onChange={handleChange} catalog={catalog} locked={locked} />
               * <ContainersEditor ... />
               * <PortsEditor ... />
               * <LinksEditor ... />
               */}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
