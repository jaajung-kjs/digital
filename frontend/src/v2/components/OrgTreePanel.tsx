import { useMemo } from 'react';
import { TreePanel, useConfirm } from '../../components/ui';
import { type OrgKind } from '../api';
import { flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useOrgMutations, useV2OrgTree } from '../hooks';

/**
 * 이 트리가 다루는 것 — **트리에 보이는 것만**.
 *
 * 층은 여기 없다. 예전에는 변전소 줄의 `+` 가 층을 만들었는데, **층은 트리에 줄로 서지
 * 않으므로** 만들어도 화면에 아무 변화가 없었다 — 누른 사람에게는 버그로 보인다. 만드는
 * 자리는 만든 것이 보이는 자리여야 한다: 층은 평면도의 층 탭 줄에서 만들고, 그 층은 자산과
 * 같은 채널로 저장된다(조직이 아니라 **변전소 안의 내용**이다).
 */
type TreeOrgKind = OrgKind;

const CHILD_KIND: Record<FlatOrgNode['kind'], TreeOrgKind | null> = {
  hq: 'branches',
  branch: 'substations',
  substation: null,
};
const SELF_KIND: Record<FlatOrgNode['kind'], TreeOrgKind> = {
  hq: 'headquarters',
  branch: 'branches',
  substation: 'substations',
};
/** 화면에 쓰는 조직 종류 이름 — 메뉴에 「지사 추가」처럼 **무엇을** 만드는지 적힌다. */
const KIND_LABEL: Record<TreeOrgKind, string> = {
  headquarters: '본부',
  branches: '지사',
  substations: '변전소',
};

const PARENT_FIELD: Record<TreeOrgKind, string> = {
  headquarters: '',
  branches: 'headquartersId',
  substations: 'branchId',
};

export function OrgTreePanel(props: { selectedId: string | null; onSelect: (node: FlatOrgNode | null) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const { data: tree } = useV2OrgTree();
  const { createOrgNode: createMut, renameOrgNode: renameMut, deleteOrgNode: deleteMut } = useOrgMutations();

  const nodes = tree ? flattenTree(tree) : [];

  /* 접고 펴는 일도, 이름을 치는 상자도 `TreePanel` 이 쥔다 — 트리마다 따로 구현하지 않는다.
     예전에는 여기서 모달을 띄웠다: 「본부 추가」 상자가 뜨면 **어느 지사 밑에 만드는 중인지**
     화면에서 사라졌고, 대장 트리들은 같은 일을 인라인으로 하고 있어 두 트리의 어법이 갈렸다. */

  function create(kind: TreeOrgKind, parentId: string, name: string) {
    const body: Record<string, string> = { name };
    const pf = PARENT_FIELD[kind];
    if (pf) body[pf] = parentId;
    createMut.mutate({ kind, body });
  }

  async function remove(n: FlatOrgNode) {
    const ok = await confirm({
      title: '조직 삭제',
      target: n.name,
      message: '하위 항목이 있으면 서버가 거부합니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (ok) deleteMut.mutate({ kind: SELF_KIND[n.kind], id: n.id });
  }

  const treeNodes = useMemo(
    () =>
      nodes.map((n) => {
        const childKind = CHILD_KIND[n.kind];
        return {
          id: n.id,
          label: n.name,
          text: n.name,
          depth: n.depth,
          ...(childKind
            ? { addChild: { label: KIND_LABEL[childKind], run: (name: string) => create(childKind, n.id, name) } }
            : {}),
          rename: (name: string) => renameMut.mutate({ kind: SELF_KIND[n.kind], id: n.id, name }),
          remove: { run: () => void remove(n) },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes],
  );

  return (
    <div className="flex h-full flex-col">
      <TreePanel
        title="조직"
        nodes={treeNodes}
        selectedId={props.selectedId}
        onSelect={(t) => {
          const n = t ? nodes.find((x) => x.id === t.id) : null;
          props.onSelect(n ?? null);
        }}
        root={{ addChild: { label: KIND_LABEL.headquarters, run: (name) => create('headquarters', '', name) } }}
      />
      {confirmDialog}
    </div>
  );
}
