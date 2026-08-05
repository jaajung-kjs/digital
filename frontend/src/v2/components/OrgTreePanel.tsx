import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Modal, useConfirm } from '../../components/ui';
import { type OrgKind } from '../api';
import { flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useOrgMutations, useV2OrgTree } from '../hooks';

const CHILD_KIND: Record<FlatOrgNode['kind'], OrgKind | null> = {
  hq: 'branches',
  branch: 'substations',
  substation: 'floors',
};
const SELF_KIND: Record<FlatOrgNode['kind'], OrgKind> = {
  hq: 'headquarters',
  branch: 'branches',
  substation: 'substations',
};
const PARENT_FIELD: Record<OrgKind, string> = {
  headquarters: '',
  branches: 'headquartersId',
  substations: 'branchId',
  floors: 'substationId',
};

interface ModalState {
  mode: 'create' | 'rename';
  kind: OrgKind;
  targetId: string;
  initial: string;
}

export function OrgTreePanel(props: { selectedId: string | null; onSelect: (node: FlatOrgNode) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const { data: tree } = useV2OrgTree();
  const { createOrgNode: createMut, renameOrgNode: renameMut, deleteOrgNode: deleteMut } = useOrgMutations();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [name, setName] = useState('');

  const nodes = tree ? flattenTree(tree) : [];

  function openCreateModal(kind: OrgKind, targetId: string) {
    setName('');
    setModal({ mode: 'create', kind, targetId, initial: '' });
  }

  function openRenameModal(kind: OrgKind, targetId: string, current: string) {
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
      message: `'${n.name}' 을 삭제합니다. 하위 항목이 있으면 서버가 거부합니다.`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (ok) deleteMut.mutate({ kind: SELF_KIND[n.kind], id: n.id });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-content-muted">조직</span>
        <IconButton
          aria-label="본부 추가"
          onClick={() => openCreateModal('headquarters', '')}
        >
          <Plus size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`group flex cursor-pointer items-center gap-1 px-2 py-1 text-sm ${
              props.selectedId === n.id
                ? 'bg-surface-2 text-primary'
                : 'text-content hover:bg-surface-2'
            }`}
            style={{ paddingLeft: 8 + n.depth * 14 }}
            onClick={() => props.onSelect(n)}
          >
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              {CHILD_KIND[n.kind] && (
                <IconButton
                  aria-label="하위 추가"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreateModal(CHILD_KIND[n.kind]!, n.id);
                  }}
                >
                  <Plus size={12} />
                </IconButton>
              )}
              <IconButton
                aria-label="이름 변경"
                onClick={(e) => {
                  e.stopPropagation();
                  openRenameModal(SELF_KIND[n.kind], n.id, n.name);
                }}
              >
                <Pencil size={12} />
              </IconButton>
              <IconButton
                aria-label="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(n);
                }}
              >
                <Trash2 size={12} />
              </IconButton>
            </span>
          </div>
        ))}
      </div>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '추가' : '이름 변경'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)}>
              취소
            </Button>
            <Button variant="primary" size="sm" disabled={confirmPending} onClick={handleConfirm}>
              확인
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          placeholder="이름"
        />
      </Modal>
      {confirmDialog}
    </div>
  );
}
