import { forwardRef, type HTMLAttributes } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { SELECTABLE, SELECTED } from './selection';

/**
 * 한 층 들여쓰기 — 셰브런(12px) + 틈(4px). 그래서 자식 줄의 셰브런이 **부모 이름의 첫 글자 바로 아래**에 선다.
 * 깊이 6단(소내전원반 → 분전반 → 충전기 → …)도 96px 라 1280 에서 이름이 잘리지 않는다.
 */
const TREE_INDENT = 16;

/** 깊이 `depth` 줄의 왼쪽 여백 — 줄 아래에 붙는 것(오류 한 줄 등)도 이 값으로 맞춘다. */
export const treeIndent = (depth: number) => 8 + depth * TREE_INDENT;

export interface TreeRowProps extends HTMLAttributes<HTMLDivElement> {
  depth: number;
  /** 자식을 품은 줄 — 셰브런이 선다. 없으면 같은 폭의 빈 자리(이름이 층마다 어긋나지 않게). */
  branch?: boolean;
  collapsed?: boolean;
  /** 셰브런을 눌렀다 — 줄 누름(선택)과 따로다. */
  onToggle?: () => void;
  /** 셰브런 단추의 이름 앞부분 — 「<이것> 펼치기/접기」. */
  toggleLabel?: string;
  selected?: boolean;
}

/**
 * 트리 **한 줄의 모양** — 들여쓰기 · 셰브런 자리 · 28px 높이(`py-1`) · 호버/선택색. 조직 트리(`TreePanel`)와
 * 전원 계통도가 이 한 줄을 쓴다. 무엇을 담을지(이름·메타·손잡이)와 누르면 무슨 일인지는 부르는 쪽이 정한다.
 *
 * `role="treeitem"` 과 `aria-level`·`aria-selected`·`aria-expanded` 를 함께 단다 — 고른 줄을 화면 안으로 옮기는
 * `useScrollSelectedIntoView` 가 `aria-selected` 를 찾는다. 줄에 `group` 이 걸려 있어 안의 손잡이는 `HOVER_REVEAL` 로 드러난다.
 */
export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(function TreeRow(
  { depth, branch = false, collapsed = false, onToggle, toggleLabel, selected = false, className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-selectable=""
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={branch ? !collapsed : undefined}
      className={cn('group flex items-center gap-1 px-2 py-1 text-sm', SELECTABLE, selected ? SELECTED : 'text-content', className)}
      style={{ paddingLeft: treeIndent(depth), ...style }}
      {...rest}
    >
      {/* 셰브런 자리는 늘 차지한다 — 없으면 이름이 층마다 어긋나 보인다. */}
      {branch ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${toggleLabel ?? ''} ${collapsed ? '펼치기' : '접기'}`.trim()}
          className="shrink-0 rounded text-content-faint hover:text-content"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : (
        <span className="w-3 shrink-0" aria-hidden />
      )}
      {children}
    </div>
  );
});
