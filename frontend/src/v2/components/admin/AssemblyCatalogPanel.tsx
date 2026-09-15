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
import { EmptyState, TreePanel, useConfirm, IssueReveal, type TreeKind, type TreeNode } from '../../../components/ui';
import { CatalogEditorBar } from './CatalogEditorBar';
import { useCatalogMutations, useReorder } from '../../hooks';
import { apiErrorMessage } from '../../apiError';
import {
  assemblyIssues, assemblyToDraft, draftToAssemblyBody, emptyAssemblyDraft,
  type AssemblyDraft,
} from '../../assemblyDraft';
import { NEW_ID } from '../../catalogDraft';
import { useEditorGate } from '../../useEditorGate';
import { useDraftSelection } from '../../useDraftSelection';
import { unsavedPrompt } from '../../leaveGuard';
import { useUnsavedMark } from '../../useUnsavedMark';
import { AssemblyPanel } from './AssemblyPanel';
import type { V2Assembly, V2Catalog, V2Category } from '../../types';
import { useV2Notice } from '../../store/noticeStore';

interface AssemblyCatalogPanelProps {
  catalog: V2Catalog;
  /* 분류는 **장비 품목과 같은 체계**(AssetCategory)다 — 고치는 일은 상자 하나가 하고(`useCategoryAdmin`)
     두 탭이 같은 것을 부른다. 어느 탭에서 만들든 양쪽 목록에 나타난다. */
  /** 분류를 다루는 손 — `useCategoryAdmin` 이 준다(장비 품목 탭과 같은 것). */
  category: {
    add: (name: string) => void;
    rename: (cat: V2Category, name: string) => void;
    remove: (cat: V2Category) => void;
    removeBlocked: (cat: V2Category) => string | undefined;
  };
}

/**
 * 층마다 무엇이 서는가 — 문구는 전부 여기서 나온다(「새 분류」·「새 설비 품목」).
 *
 * **뼈대는 트리에서, 내용은 편집기에서.** 분류는 이름만 있으면 서므로 그 자리에서 만들고,
 * 품목은 포트·공량을 채워야 하므로 오른쪽 초안을 연다(`create: 'editor'`).
 */
const KINDS = [
  { label: '분류', create: 'inline', rename: true, remove: true },
  { label: '설비 품목', create: 'editor' },
] as const satisfies ReadonlyArray<TreeKind>;

export function AssemblyCatalogPanel({
  catalog, category,
}: AssemblyCatalogPanelProps) {
  const { confirm, confirmDialog } = useConfirm();
  const reorder = useReorder();
  const m = useCatalogMutations();

  /* 첫 항목을 열어 둔다 — 케이블 탭이 이미 그렇게 하고 있었다. 기본 탭이 설비 품목이라,
     대장을 열면 빈 화면이 먼저 나오고 탭을 옮기면 갑자기 내용이 차 있어 어긋나 보였다. */
  const [saveError, setSaveError] = useState<string | null>(null);
  /* 고른 것·초안·떠나기 전 묻기는 세 탭이 같은 셸을 쓴다 — `useDraftSelection`. */
  const leaveIfConfirmed = useCallback(
    /* 묻는 말은 앱에 한 벌뿐이다 — `unsavedPrompt`. */
    () => confirm(unsavedPrompt(1)),
    [confirm],
  );

  const sel = useDraftSelection<V2Assembly, AssemblyDraft>({
    entities: catalog.assemblies,
    toDraft: assemblyToDraft,
    confirmLeave: leaveIfConfirmed,
  });
  const { selectedId, isNew, original, draft, setDraft, dirty } = sel;
  /* 저장 안 한 초안이 있으면 셸이 떠나기를 막는다 — 묻는 자리는 셸 하나다. */
  useUnsavedMark(dirty ? 1 : 0, sel.cancel);

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
        sel.markSaved();
        useV2Notice.getState().showSuccess(`'${draft.name}' 설비 품목을 만들었습니다`);
      } else {
        await m.updateAssembly.mutateAsync({ id: selectedId!, body });
        sel.markSaved();
        useV2Notice.getState().showSuccess(`'${draft.name}' 을 저장했습니다`);
      }
    } catch (e) {
      /* **서버가 말한 이유를 그대로** — 이 자리가 예전에는 `e.message` 였다. 그것은 axios 가
         지은 「Request failed with status code 400」이라, 어느 칸이 틀렸는지는커녕 한국어도
         아니었다. 번역은 한 곳에서만 한다(`apiErrorMessage`). */
      setSaveError(apiErrorMessage(e, '저장하지 못했습니다'));
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
  /** 트리가 돌려준 줄 → 그 분류. 트리는 id 만 알고, 무엇인지는 여기가 안다. */
  const byId = (id: string) => catalog.categories.find((c) => c.id === id)!;

  /** 그 분류 안에 설비 품목 하나 — 이름만으로는 서지 않으므로 오른쪽 초안을 연다. */
  const newInto = (categoryId: string) => void sel.startNew({ ...emptyAssemblyDraft(), categoryId });

  const nodes = useMemo<TreeNode[]>(() => {
    const out: TreeNode[] = [];
    for (const cat of catalog.categories) {
      const items = catalog.assemblies.filter((a) => a.categoryId === cat.id);
      out.push({
        id: cat.id,
        label: cat.name,
        text: cat.name,
        depth: 0,
        selectable: false,
        removeBlocked: category.removeBlocked(cat),
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
  }, [catalog.assemblies, catalog.categories, isNew, draft, category]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
        <TreePanel
          title="설비 품목"
          nodes={nodes}
          selectedId={selectedId}
          onSelect={(n) => void sel.select(n?.id ?? null)}
          kinds={KINDS}
          onCreate={({ level, parentId, name }) => (level === 0 ? category.add(name!) : newInto(parentId!))}
          onRename={(node, name) => category.rename(byId(node.id), name)}
          onRemove={(node) => category.remove(byId(node.id))}
          /* 순서는 조직 트리와 **같은 문**으로 저장된다. */
          onReorder={({ node, order }) =>
            reorder.mutateAsync({ kind: node.depth === 0 ? 'categories' : 'assemblies', ids: order }).then(() => undefined)
          }
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
              screen="설비 관리"
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
