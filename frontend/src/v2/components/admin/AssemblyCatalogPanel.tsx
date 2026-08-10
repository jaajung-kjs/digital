/**
 * AssemblyCatalogPanel — 설비 종류 목록 + 편집
 *
 * 설비 종류는 **한 번 만들어 계속 쓰는 것**이다. 그래서 목록에서 고르고 고치고 지운다 —
 * 배치할 때 그때그때 조립하는 일회성 도구가 아니다.
 *
 * 고쳐도 **이미 놓인 설비는 그대로다**(스냅샷). 놓을 때의 설비 종류 이름을 자산에 굳혀 두므로
 * 설비 종류를 고치거나 지워도 현장 데이터는 건드릴 것이 없다 — 그래서 자산 종류 명세와 달리
 * "쓰이는 중이면 잠금" 이 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, IconButton, cn, useConfirm, SELECTABLE } from '../../../components/ui';
import { useCatalogMutations } from '../../hooks';
import {
  assemblyIssues, assemblyToDraft, draftToAssemblyBody, emptyAssemblyDraft,
  type AssemblyDraft,
} from '../../assemblyDraft';
import { AssemblyPanel } from './AssemblyPanel';
import type { V2Catalog } from '../../types';

export function AssemblyCatalogPanel({ catalog }: { catalog: V2Catalog }) {
  const { confirm, confirmDialog } = useConfirm();
  const m = useCatalogMutations();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssemblyDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = useMemo(
    () => catalog.assemblies.find((a) => a.id === selectedId) ?? null,
    [catalog.assemblies, selectedId],
  );

  // 고른 설비 종류가 바뀌면 초안을 새로 뜬다 — 남은 편집이 다른 설비 종류에 새어들지 않게.
  useEffect(() => {
    setSaveError(null);
    if (selectedId === null) return;
    setDraft(original ? assemblyToDraft(original) : null);
  }, [selectedId, original]);

  const issues = draft ? assemblyIssues(draft, catalog.types) : [];
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(original ? assemblyToDraft(original) : emptyAssemblyDraft());
  const isSaving = m.createAssembly.isPending || m.updateAssembly.isPending;

  async function handleSave() {
    if (!draft || issues.length > 0) return;
    setSaveError(null);
    try {
      const body = draftToAssemblyBody(draft);
      if (selectedId === null) {
        const created = await m.createAssembly.mutateAsync(body);
        setSelectedId(created.id);
      } else {
        await m.updateAssembly.mutateAsync({ id: selectedId, body });
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다');
    }
  }

  async function handleDelete() {
    if (selectedId === null) return;
    const ok = await confirm({
      title: '설비 종류를 지울까요?',
      // 이미 놓인 설비는 스냅샷이라 그대로 남는다 — 그 사실을 미리 말해 준다.
      message: '이미 배치된 설비는 그대로 남습니다. 앞으로 이 설비 종류으로 새로 놓을 수만 없게 됩니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    await m.deleteAssembly.mutateAsync(selectedId);
    setSelectedId(null);
    setDraft(null);
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* 목록 */}
      <aside className="w-56 shrink-0 border-r border-line">
        <div className="flex items-center gap-1 border-b border-line px-3 py-2">
          <span className="flex-1 text-xs text-content-muted">설비 종류 {catalog.assemblies.length}</span>
          <IconButton
            aria-label="설비 종류 추가"
            onClick={() => {
              setSelectedId(null);
              setDraft(emptyAssemblyDraft());
            }}
          >
            <Plus size={14} />
          </IconButton>
        </div>
        <ul className="p-1">
          {catalog.assemblies.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={cn(
                  'w-full truncate rounded px-2 py-1.5 text-left text-sm',
                  SELECTABLE,
                  selectedId === a.id && 'bg-info-bg font-medium text-primary hover:bg-info-bg',
                )}
                onClick={() => setSelectedId(a.id)}
              >
                {a.name}
                <span className="ml-1 text-xs text-content-faint">{a.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 편집 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {draft == null ? (
          <EmptyState
            title="선택된 설비 종류가 없습니다"
            description="좌측 목록에서 설비 종류를 고르거나, + 버튼으로 새 설비 종류를 만드세요. 설비 종류는 「송변전광단말장치 1식」처럼 부품을 조립해 둔 한 설비입니다."
          />
        ) : (
          <>
            <div className="shrink-0 border-b border-line bg-surface">
              {saveError != null && (
                <p className="mx-auto w-full max-w-4xl px-4 py-1 text-xs text-danger">{saveError}</p>
              )}
              {issues.length > 0 && saveError == null && (
                <p className="mx-auto w-full max-w-4xl px-4 py-1 text-xs text-warning">
                  입력 오류 {issues.length}건 — 저장 전에 수정하세요
                </p>
              )}
              <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-2">
                <span className="flex-1 text-xs text-content-muted">
                  {selectedId == null ? '신규 설비 종류' : (original?.name ?? '')}
                  {dirty && <span className="ml-1 text-warning">●</span>}
                </span>
                {selectedId != null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => void handleDelete()}
                  >
                    설비 종류 삭제
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!dirty || isSaving}
                  onClick={() => setDraft(original ? assemblyToDraft(original) : emptyAssemblyDraft())}
                >
                  취소
                </Button>
                <Button size="sm" disabled={!dirty || isSaving || issues.length > 0} onClick={() => void handleSave()}>
                  {isSaving ? '저장 중…' : '저장'}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <AssemblyPanel draft={draft} onChange={setDraft} catalog={catalog} issues={issues} />
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
