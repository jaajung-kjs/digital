import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  DetailRow,
  IconButton,
  Input,
  Modal,
  useConfirm,
  PanelHeader,
  cn,
  SELECTABLE,
  SELECTED,
} from '../../components/ui';
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
/** 화면에 쓰는 조직 종류 이름 — 모달 제목이 "추가" 한 마디로 끝나지 않게 한다. */
const KIND_LABEL: Record<OrgKind, string> = {
  headquarters: '본부',
  branches: '지사',
  substations: '변전소',
  floors: '층',
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
      target: n.name,
      message: '하위 항목이 있으면 서버가 거부합니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (ok) deleteMut.mutate({ kind: SELF_KIND[n.kind], id: n.id });
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        variant="sidebar"
        title="조직"
        actions={
          <IconButton aria-label="본부 추가" onClick={() => openCreateModal('headquarters', '')}>
            <Plus size={14} />
          </IconButton>
        }
      />

      {/* 고르는 목록이다 — 행이 `option` 이므로 상자는 `listbox` 로 읽힌다. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="조직">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={cn(
              'group flex items-center gap-1 px-2 py-1 text-sm',
              SELECTABLE,
              props.selectedId === n.id ? SELECTED : 'text-content',
            )}
            style={{ paddingLeft: 8 + n.depth * 14 }}
            onClick={() => props.onSelect(n)}
            /* 키보드로도 고를 수 있어야 한다 — 예전에는 `div onClick` 뿐이라 Tab 으로는 행
               안의 아이콘 버튼 세 개에만 닿았고, 정작 **노드를 고르는 일**은 마우스로만
               됐다. 목록 안에서 고르는 것이므로 `option` 이 그 뜻을 맞게 읽어 준다. */
            role="option"
            aria-selected={props.selectedId === n.id}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              props.onSelect(n);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            {/* 액션은 항상 자리를 차지하고 보이기만 바뀐다.
                `hidden → group-hover:flex` 로 하면 호버할 때 행에 요소가 끼어들어 폭·높이가
                바뀌고, 그 바람에 커서가 다른 요소 위로 가면서 호버가 껐다 켜졌다 반복한다
                (목록이 부르르 떠는 원인). 자리를 미리 잡아 두면 레이아웃이 움직이지 않는다. */}
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {CHILD_KIND[n.kind] && (
                <IconButton
                  aria-label="하위 추가"
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
                aria-label="이름 변경"
                  size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openRenameModal(SELF_KIND[n.kind], n.id, n.name);
                }}
              >
                <Pencil size={12} />
              </IconButton>
              <IconButton
                aria-label="삭제"
                  size="sm"
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
        title={modal ? `${KIND_LABEL[modal.kind]} ${modal.mode === 'create' ? '추가' : '이름 변경'}` : ''}
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
