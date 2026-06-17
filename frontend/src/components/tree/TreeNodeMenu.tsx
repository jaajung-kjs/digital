import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '../ui';
import { childLabel } from './orgNodeActions';
import type { TreeNodeData } from '../../types/organization';

interface TreeNodeMenuProps {
  node: TreeNodeData;
  onAddChild: (node: TreeNodeData) => void;
  onRename: (node: TreeNodeData) => void;
  onDelete: (node: TreeNodeData) => void;
}

export function TreeNodeMenu({ node, onAddChild, onRename, onDelete }: TreeNodeMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const addLabel = childLabel(node.type);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (e: React.MouseEvent, fn: (node: TreeNodeData) => void) => {
    e.stopPropagation();
    setOpen(false);
    fn(node);
  };

  return (
    <div
      ref={wrapRef}
      className="relative opacity-0 group-hover:opacity-100 focus-within:opacity-100"
    >
      <IconButton
        aria-label="노드 메뉴"
        active={open}
        draggable={false}
        className="p-1"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} />
      </IconButton>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-32 rounded border border-line bg-surface py-1 shadow-lg">
          {addLabel && (
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-content hover:bg-surface-2"
              onClick={(e) => choose(e, onAddChild)}
            >
              {addLabel}
            </button>
          )}
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-content hover:bg-surface-2"
            onClick={(e) => choose(e, onRename)}
          >
            이름 변경
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-surface-2"
            onClick={(e) => choose(e, onDelete)}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
