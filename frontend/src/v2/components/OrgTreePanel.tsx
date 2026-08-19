import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, DetailRow, IconButton, Input, Modal, TreePanel, useConfirm } from '../../components/ui';
import { type OrgKind } from '../api';
import { flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useOrgMutations, useV2OrgTree } from '../hooks';

/**
 * 이 트리가 다루는 것 — **트리에 보이는 것만**.
 *
 * 층(`floors`)은 여기 없다. 예전에는 변전소 줄의 `+` 가 층을 만들었는데, **층은 트리에 줄로
 * 서지 않으므로** 만들어도 화면에 아무 변화가 없었다 — 누른 사람에게는 버그로 보인다.
 * 만드는 자리는 만든 것이 보이는 자리여야 한다: 층은 평면도의 층 탭 줄에서 만든다.
 */
type TreeOrgKind = Exclude<OrgKind, 'floors'>;

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
/** 화면에 쓰는 조직 종류 이름 — 모달 제목이 "추가" 한 마디로 끝나지 않게 한다. */
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

interface ModalState {
  mode: 'create' | 'rename';
  kind: TreeOrgKind;
  targetId: string;
  initial: string;
}

export function OrgTreePanel(props: { selectedId: string | null; onSelect: (node: FlatOrgNode | null) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const { data: tree } = useV2OrgTree();
  const { createOrgNode: createMut, renameOrgNode: renameMut, deleteOrgNode: deleteMut } = useOrgMutations();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [name, setName] = useState('');

  const nodes = tree ? flattenTree(tree) : [];

  /* 접고 펴는 일은 `TreePanel` 이 쥔다 — 트리마다 따로 구현하지 않는다. */

  function openCreateModal(kind: TreeOrgKind, targetId: string) {
    setName('');
    setModal({ mode: 'create', kind, targetId, initial: '' });
  }

  function openRenameModal(kind: TreeOrgKind, targetId: string, current: string) {
    setName(current);
    setModal({ mode: 'rename', kind, targetId, initial: current });
  }

  const confirmPending = createMut.isPending || renameMut.isPending;

  function handleConfirm() {
    if (!modal || !name.trim() || confirmPending) return;
    if (modal.mode === 'create') {
      const body: Record<string, string> = { name: name.trim() };
      const pf = PARENT_FIELD[modal.kind];
      if (pf) body[pf] = modal.targetId;
      createMut.mutate({ kind: modal.kind, body });
    } else {
      renameMut.mutate({ kind: modal.kind, id: modal.targetId, name: name.trim() });
    }
    setModal(null);
  }

  async function handleDelete(n: FlatOrgNode) {
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
      nodes.map((n) => ({
        id: n.id,
        label: n.name,
        text: n.name,
        depth: n.depth,
        actions: (
          <>
            {CHILD_KIND[n.kind] && (
              <IconButton
                aria-label={`${n.name} 에 ${KIND_LABEL[CHILD_KIND[n.kind]!]} 추가`}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateModal(CHILD_KIND[n.kind]!, n.id);
                }}
              >
                <Plus size={12} />
              </IconButton>
            )}
            <IconButton
              aria-label={`${n.name} 이름 변경`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openRenameModal(SELF_KIND[n.kind], n.id, n.name);
              }}
            >
              <Pencil size={12} />
            </IconButton>
            <IconButton
              aria-label={`${n.name} 삭제`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(n);
              }}
            >
              <Trash2 size={12} />
            </IconButton>
          </>
        ),
      })),
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
        onAdd={() => openCreateModal('headquarters', '')}
        addLabel="본부 추가"
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal ? `${KIND_LABEL[modal.kind]} ${modal.mode === 'create' ? '추가' : '이름 변경'}` : ''}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)}>
              취소
            </Button>
            {/* 「확인」은 무엇이 일어나는지 말해 주지 않는다 — 동사를 쓴다(§확인 상자와
                같은 규칙). 제목이 「본부 추가」면 단추도 「추가」다. */}
            <Button variant="primary" size="sm" disabled={confirmPending} onClick={handleConfirm}>
              {modal?.mode === 'create' ? '추가' : '이름 변경'}
            </Button>
          </>
        }
      >
        <DetailRow label="이름">
          <Input
            autoFocus
            aria-label={modal ? `${KIND_LABEL[modal.kind]} 이름` : '이름'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            placeholder={modal ? `${KIND_LABEL[modal.kind]} 이름 입력` : '이름'}
          />
        </DetailRow>
      </Modal>
      {confirmDialog}
    </div>
  );
}
