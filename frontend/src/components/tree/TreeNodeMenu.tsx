import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * 트리 노드 호버 케밥 메뉴. 드롭다운은 `document.body` 로 portal 렌더한다 —
 * 트리거가 `opacity-0`(호버 노출) 래퍼와 `transform` 조상(케밥 컨테이너의 -translate-y-1/2)
 * 안에 있어서, 그 안에 두면 opacity 상속으로 안 보이거나 fixed 기준이 어긋난다.
 * portal + fixed + z-modal 으로 스태킹/opacity/transform 영향을 완전히 벗어난다.
 */
export function TreeNodeMenu({ node, onAddChild, onRename, onDelete }: TreeNodeMenuProps) {
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addLabel = childLabel(node.type);
  const open = pos !== null;

  // 외부 클릭/Esc 로 닫기 — 백드롭 없이(화면을 덮어 hover·클릭을 막지 않도록).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setPos(null);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setPos(null); return; }
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    // 아래 공간이 부족하면(맨 아래 항목/새로 추가된 항목) 트리거 위로 펼친다 — 화면 밖으로 넘쳐 안 보이지 않게.
    const openUp = r.bottom > window.innerHeight - 160;
    setPos(openUp ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 });
  };

  const choose = (e: React.MouseEvent, fn: (node: TreeNodeData) => void) => {
    e.stopPropagation();
    setPos(null);
    fn(node);
  };

  const itemClass = 'w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

  return (
    <div ref={wrapRef} className={open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}>
      <IconButton
        aria-label="노드 메뉴"
        active={open}
        draggable={false}
        className="p-1"
        onClick={toggle}
      >
        <MoreHorizontal size={16} />
      </IconButton>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-modal w-max rounded-md border border-line bg-surface py-1 shadow-lg"
          style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
