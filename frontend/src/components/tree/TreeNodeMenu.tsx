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

/**
 * 트리 노드 호버 케밥 메뉴. 드롭다운은 앱 표준 메뉴 패턴(CanvasContextMenu 동일)을 따른다 —
 * `fixed z-50` + `fixed inset-0 z-40` 백드롭 + 트리거 사각형 기준 좌표. 트리 행의
 * 스태킹/overflow 에 갇히지 않아 뒤 행 글씨에 가려지지 않는다.
 */
export function TreeNodeMenu({ node, onAddChild, onRename, onDelete }: TreeNodeMenuProps) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const addLabel = childLabel(node.type);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setPos(null); return; }
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  const choose = (e: React.MouseEvent, fn: (node: TreeNodeData) => void) => {
    e.stopPropagation();
    setPos(null);
    fn(node);
  };

  const itemClass = 'w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

  return (
    <div ref={wrapRef} className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
      <IconButton
        aria-label="노드 메뉴"
        active={open}
        draggable={false}
        className="p-1"
        onClick={toggle}
      >
        <MoreHorizontal size={16} />
      </IconButton>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setPos(null); }}
          />
          <div
            className="fixed z-50 min-w-[140px] rounded-md border border-line bg-surface py-1 shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            {addLabel && (
              <button type="button" className={`${itemClass} text-content hover:bg-surface-2`} onClick={(e) => choose(e, onAddChild)}>
                {addLabel}
              </button>
            )}
            <button type="button" className={`${itemClass} text-content hover:bg-surface-2`} onClick={(e) => choose(e, onRename)}>
              이름 변경
            </button>
            <button type="button" className={`${itemClass} text-danger hover:bg-danger-bg`} onClick={(e) => choose(e, onDelete)}>
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
