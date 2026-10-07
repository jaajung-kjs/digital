import { useMemo, type ReactNode } from 'react';
import { TreePanel, useConfirm, type TreeKind, type TreeNode } from '../../components/ui';
import { type OrgKind } from '../api';
import { apiErrorMessage } from '../apiError';
import { flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useOrgMutations, useReorder, useV2OrgTree } from '../hooks';

/**
 * 이 트리가 다루는 것 — **트리에 보이는 것만**.
 *
 * 층은 여기 없다. 예전에는 변전소 줄의 `+` 가 층을 만들었는데, **층은 트리에 줄로 서지
 * 않으므로** 만들어도 화면에 아무 변화가 없었다 — 누른 사람에게는 버그로 보인다. 만드는
 * 자리는 만든 것이 보이는 자리여야 한다: 층은 평면도의 층 탭 줄에서 만들고, 그 층은 자산과
 * 같은 채널로 저장된다(조직이 아니라 **변전소 안의 내용**이다).
 */
type TreeOrgKind = OrgKind;

/**
 * 층마다 무엇이 서는가 — **순서가 곧 계층**이고, 화면 문구는 전부 여기서 나온다.
 *
 * 예전에는 이 사실이 네 개의 지도(`CHILD_KIND`·`SELF_KIND`·`KIND_LABEL`·`PARENT_FIELD`)로
 * 흩어져 있었고, 줄마다 「지사 추가」 같은 문구를 손으로 적었다.
 */
const KINDS = [
  { key: 'headquarters', label: '본부', create: 'inline', rename: true, remove: true },
  { key: 'branches', label: '전력지사', create: 'inline', rename: true, remove: true },
  { key: 'substations', label: '변전소', create: 'inline', rename: true, remove: true },
] as const satisfies ReadonlyArray<TreeKind & { key: TreeOrgKind }>;

/** 이 층의 것이 매달리는 곳 — 본부는 매달릴 곳이 없다. */
const PARENT_FIELD: Record<TreeOrgKind, string> = {
  headquarters: '',
  branches: 'headquartersId',
  substations: 'branchId',
};

export function OrgTreePanel(props: { selectedId: string | null; onSelect: (node: FlatOrgNode | null) => void; headerActions?: ReactNode }) {
  const { confirm, confirmDialog } = useConfirm();
  const { data: tree } = useV2OrgTree();
  const { createOrgNode: createMut, renameOrgNode: renameMut, deleteOrgNode: deleteMut } = useOrgMutations();
  const reorderMut = useReorder();

  const nodes = tree ? flattenTree(tree) : [];

  /* 접고 펴는 일도, 이름을 치는 상자도, 무엇을 만들지 고르는 일도 `TreePanel` 이 쥔다 —
     트리마다 따로 구현하지 않는다. 예전에는 여기서 모달을 띄웠고, 그러면 **어느 지사 밑에
     만드는 중인지** 화면에서 사라졌다. */

  async function remove(node: TreeNode) {
    const ok = await confirm({
      title: '조직 삭제',
      target: node.text,
      message: '하위 항목이 있으면 서버가 거부합니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (ok) deleteMut.mutate({ kind: KINDS[node.depth]!.key, id: node.id });
  }

  const treeNodes = useMemo<TreeNode[]>(
    () => nodes.map((n) => ({ id: n.id, label: n.name, text: n.name, depth: n.depth })),
    [nodes],
  );

  return (
    <div className="flex h-full flex-col">
      <TreePanel
        title="조직"
        headerActions={props.headerActions}
        kinds={KINDS}
        nodes={treeNodes}
        selectedId={props.selectedId}
        onSelect={(t) => {
          const n = t ? nodes.find((x) => x.id === t.id) : null;
          props.onSelect(n ?? null);
        }}
        /* 실패는 **치던 자리**에서 말한다 — 던지면 트리가 그 줄을 붙잡아 둔다. */
        onCreate={({ level, parentId, name }) => {
          const kind = KINDS[level]!.key;
          const field = PARENT_FIELD[kind];
          return createMut
            .mutateAsync({ kind, body: { name: name!, ...(field && parentId ? { [field]: parentId } : {}) } })
            .then(() => undefined)
            .catch((err: unknown) => { throw new Error(apiErrorMessage(err, '만들지 못했습니다')); });
        }}
        onRename={(node, name) =>
          renameMut
            .mutateAsync({ kind: KINDS[node.depth]!.key, id: node.id, name })
            .then(() => undefined)
            .catch((err: unknown) => { throw new Error(apiErrorMessage(err, '이름을 바꾸지 못했습니다')); })
        }
        onRemove={(node) => void remove(node)}
        /* 끌어서 순서를 바꾼다 — 화면이 본 순서를 그대로 번호로 적는다. */
        onReorder={({ node, order }) => reorderMut.mutateAsync({ kind: KINDS[node.depth]!.key, ids: order }).then(() => undefined)}
      />
      {confirmDialog}
    </div>
  );
}
