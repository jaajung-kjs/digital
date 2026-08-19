/**
 * AssemblyCatalogPanel — 설비 품목 목록 + 편집
 *
 * 설비 품목은 **한 번 만들어 계속 쓰는 것**이다. 그래서 목록에서 고르고 고치고 지운다 —
 * 배치할 때 그때그때 조립하는 일회성 도구가 아니다.
 *
 * 고쳐도 **이미 놓인 설비의 구성은 그대로다**(스냅샷) — 분류만 이 종류를 계속 가리킨다.
 * 그래서 장비 품목과 달리 "쓰이는 중이면 구조 잠금" 이 없다.
 */
import { useCallback, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { EmptyState, IconButton, TreePanel, useConfirm, useInlineRename, IssueReveal, type TreeNode } from '../../../components/ui';
import { CatalogEditorBar } from './CatalogEditorBar';
import { useCatalogMutations } from '../../hooks';
import {
  assemblyIssues, assemblyToDraft, draftToAssemblyBody, emptyAssemblyDraft,
  type AssemblyDraft,
} from '../../assemblyDraft';
import { NEW_ID } from '../../catalogDraft';
import { useEditorGate } from '../../useEditorGate';
import { useDraftSelection } from '../../useDraftSelection';
import { useUnsavedMark } from '../../useUnsavedMark';
import { AssemblyPanel } from './AssemblyPanel';
import type { V2Assembly, V2Catalog, V2Category } from '../../types';
import { useV2Notice } from '../../store/noticeStore';

interface AssemblyCatalogPanelProps {
  catalog: V2Catalog;
  /* 분류는 **장비 품목과 같은 체계**(AssetCategory)다 — 관리 로직은 한 곳(페이지)에 두고
     두 탭이 같은 것을 부른다. 어느 탭에서 만들든 양쪽 목록에 나타난다. */
  onRenameCategory: (category: V2Category, newName: string) => void;
  onDeleteCategory: (category: V2Category) => void;
  onAddCategory: () => void;
}

export function AssemblyCatalogPanel({
  catalog, onRenameCategory, onDeleteCategory, onAddCategory,
}: AssemblyCatalogPanelProps) {
  const { confirm, confirmDialog } = useConfirm();
  const m = useCatalogMutations();

  /* 첫 항목을 열어 둔다 — 케이블 탭이 이미 그렇게 하고 있었다. 기본 탭이 설비 품목이라,
     대장을 열면 빈 화면이 먼저 나오고 탭을 옮기면 갑자기 내용이 차 있어 어긋나 보였다. */
  const [saveError, setSaveError] = useState<string | null>(null);
  /* 제자리 이름 바꾸기 — 세 탭이 같은 규칙을 쓴다(`useInlineRename`). */
  const rename = useInlineRename((id, name) => {
    const cat = catalog.categories.find((c) => c.id === id);
    if (cat) onRenameCategory(cat, name);
  });

  /* 고른 것·초안·떠나기 전 묻기는 세 탭이 같은 셸을 쓴다 — `useDraftSelection`. */
  const leaveIfConfirmed = useCallback(
    () =>
      confirm({
        title: '저장하지 않은 변경',
        target: null,
        message: '편집 내용이 사라집니다. 이동할까요?',
        confirmLabel: '이동',
        danger: true,
      }),
    [confirm],
  );
  const sel = useDraftSelection<V2Assembly, AssemblyDraft>({
    entities: catalog.assemblies,
    toDraft: assemblyToDraft,
    confirmLeave: leaveIfConfirmed,
  });
  const { selectedId, isNew, original, draft, setDraft, dirty } = sel;
  /* 저장 안 한 초안이 있으면 셸이 떠나기를 막는다 — 묻는 자리는 셸 하나다. */
  useUnsavedMark(dirty ? 1 : 0);

  const issues = draft ? assemblyIssues(draft, catalog.types) : [];
  /* 저장이 막혔을 때의 규칙은 세 탭이 같은 것을 쓴다 — `useEditorGate`. */
  const gate = useEditorGate({ issueCount: issues.length, resetKey: selectedId, onSave: handleSave });
  /* 탭을 옮기면 이 패널이 통째로 사라진다 — 떠나보내는 쪽(페이지)이 물을 수 있게 알린다. */
  const isSaving = m.createAssembly.isPending || m.updateAssembly.isPending;

  async function handleSave() {
    if (!draft) return;
    setSaveError(null);
    try {
      const body = draftToAssemblyBody(draft);
      if (isNew) {
        const created = await m.createAssembly.mutateAsync(body);
        sel.setRequestedId(created.id);
        useV2Notice.getState().showSuccess(`'${draft.name}' 설비 품목을 만들었습니다`);
      } else {
        await m.updateAssembly.mutateAsync({ id: selectedId!, body });
        useV2Notice.getState().showSuccess(`'${draft.name}' 을 저장했습니다`);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다');
    }
  }

  async function handleDelete() {
    if (selectedId === null || isNew) return;
    const ok = await confirm({
      title: '설비 품목 삭제',
      target: draft?.name ?? '',
      // 이미 놓인 설비는 스냅샷이라 그대로 남는다 — 그 사실을 미리 말해 준다.
      message: '이미 배치된 설비는 그대로 남습니다. 앞으로 이 설비 품목으로는 새로 놓을 수 없게 됩니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    await m.deleteAssembly.mutateAsync(selectedId);
    sel.setRequestedId(null);
    setDraft(null);
  }

  /* 목록은 **분류로 묶는다** — 장비 품목 탭과 같은 어법이고, 판도 같은 `TreePanel` 이다. */
  const nodes = useMemo<TreeNode[]>(() => {
    const out: TreeNode[] = [];
    const newInto = (categoryId: string) =>
      void sel.startNew({ ...emptyAssemblyDraft(), categoryId });
    for (const cat of catalog.categories) {
      const items = catalog.assemblies.filter((a) => a.categoryId === cat.id);
      /* 빈 분류만 지울 수 있다 — 장비 품목 탭과 같은 규칙이다(같은 분류를 지운다). */
      const inUse = items.length > 0 || catalog.types.some((t) => t.categoryId === cat.id);
      out.push({
        id: cat.id,
        label: rename.isEditing(cat.id) ? rename.field(cat.id, cat.name, `${cat.name} 이름 편집`) : cat.name,
        text: cat.name,
        depth: 0,
        selectable: false,
        actions: (
          <>
            <IconButton
              aria-label={`${cat.name} 에 설비 품목 추가`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                newInto(cat.id);
              }}
            >
              <Plus size={12} />
            </IconButton>
            <IconButton
              aria-label={`${cat.name} 이름 변경`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                rename.start(cat.id, cat.name);
              }}
            >
              <Pencil size={12} />
            </IconButton>
            <IconButton
              aria-label={`${cat.name} 분류 삭제`}
              size="sm"
              disabled={inUse}
              disabledReason={inUse ? '이 분류에 들어 있는 것이 있어 지울 수 없습니다' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCategory(cat);
              }}
            >
              <Trash2 size={12} />
            </IconButton>
          </>
        ),
      });
      for (const a of items) out.push({ id: a.id, label: a.name, text: a.name, depth: 1 });
      /* 만드는 중인 줄은 **그 분류 안**에 선다 — 어디에 무엇이 생기는지 목록이 보여 준다. */
      if (isNew && draft?.categoryId === cat.id) {
        const typed = draft.name.trim();
        out.push({
          id: NEW_ID,
          label: typed || <span className="text-content-faint">새 설비 품목</span>,
          text: typed,
          depth: 1,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.assemblies, catalog.categories, catalog.types, rename, onDeleteCategory, isNew, draft]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
        <TreePanel
          title="설비 품목"
          nodes={nodes}
          selectedId={selectedId}
          onSelect={(n) => void sel.select(n?.id ?? null)}
          onAdd={onAddCategory}
          addLabel="분류 추가"
          emptyText="설비 품목이 없습니다"
          escapes
        />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        {draft == null ? (
          <EmptyState
            title="선택된 설비 품목이 없습니다"
            description="왼쪽에서 고르거나, 분류 줄에 손을 얹고 + 로 새로 만드세요. 설비 품목은 도면에 놓이고 현황에 집계되는 단위입니다."
          />
        ) : (
          <>
            <CatalogEditorBar
              title={isNew ? '새 설비 품목' : (original?.name ?? '')}
              dirty={dirty}
              saving={isSaving}
              issueCount={issues.length}
              showIssues={gate.showIssues}
              error={saveError ?? gate.blockedMessage}
              onDismissError={() => setSaveError(null)}
              onDelete={isNew ? undefined : () => void handleDelete()}
              deleteLabel="품목 삭제"
              /* 만들던 것을 물리면 그 줄도 목록에서 사라진다 — 저장한 적이 없으니 남을 것이 없다. */
              onCancel={sel.cancel}
              onSave={gate.save}
            />

            {/* 스크롤은 **패널 안쪽**이 쥔다 — 바깥에서 감싸면 캔버스가 남는 자리를 못 쓰고,
                오른쪽 상세만 길어져도 캔버스까지 함께 밀려 올라간다(평면도와 같은 규칙). */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <IssueReveal.Provider value={gate.showIssues}>
                <AssemblyPanel draft={draft} onChange={setDraft} catalog={catalog} issues={issues} />
              </IssueReveal.Provider>
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
