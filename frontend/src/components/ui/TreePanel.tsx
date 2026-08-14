import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { IconButton } from './IconButton';
import { Input } from './Input';
import { cn } from './cn';
import { SELECTABLE, SELECTED } from './selection';

/** 트리에 서는 줄 하나. 계층은 `depth` 가 말한다 — 이미 펼쳐 놓은 평평한 목록을 받는다. */
export interface TreeNode {
  id: string;
  /** 줄에 적히는 것. 이름을 그 자리에서 고칠 때는 입력 상자를 넣는다. */
  label: ReactNode;
  /** 검색이 훑는 글자 — `label` 이 상자일 수 있으므로 따로 받는다. */
  text: string;
  depth: number;
  /** 이름 앞 색점 — 도면에서 그려지는 색. */
  dot?: string;
  /**
   * 이 줄을 눌러서 고를 수 있는가. 기본은 그렇다.
   *
   * 고를 것이 없는 줄(대장의 분류처럼 묶기만 하는 줄)은 `false` — 그때 누르면 접고 편다.
   * 그래도 **손이 닿으면 반응하고 눌리기는 한다**: 아무 반응 없는 줄은 고장 난 것처럼 보인다.
   */
  selectable?: boolean;
  /**
   * 이 줄을 다루는 것 — 손이 닿으면 드러난다.
   *
   * **팝업이 아니라 아이콘 단추**를 준다. 트리는 스크롤 상자 안에 있어서, 떠 있는 메뉴를
   * 열면 상자 밖으로 나가는 부분이 잘린다(실제로 그랬다).
   */
  actions?: ReactNode;
}

export interface TreePanelProps {
  /** 머리줄에 적히는 이름 — 「조직」·「설비 종류」. */
  title: string;
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  /** 머리줄의 `+` — 이 트리의 것을 새로 만든다. */
  onAdd?: () => void;
  addLabel?: string;
  emptyText?: string;
}

/**
 * 왼쪽 트리 — **앱 전체가 이 한 판을 쓴다**(조직·대장).
 *
 * 예전에는 트리가 둘이었다. 조직 트리는 셰브런과 이름뿐인 깔끔한 판이었는데, 대장 목록은
 * 따로 자라서 머리줄 `⋯` · 「추가」 단추 · 분류 줄의 `⋯` · 개수 배지가 한 화면에 같이 섰다.
 * 같은 「고르는 목록」인데 무엇을 어디서 누르는지 화면마다 다시 익혀야 했다.
 *
 * 그래서 판을 하나로 합친다. 규칙은 셋뿐이다:
 *
 * - **만드는 손잡이는 머리줄의 `+` 하나.** 그 트리에 무엇이 만들어지는지는 트리 이름이 말한다.
 * - **줄을 다루는 것은 그 줄에 붙는다** — 손이 닿을 때 드러나는 아이콘 단추. 팝업은 쓰지
 *   않는다(스크롤 상자 밖으로 잘린다).
 * - **모든 줄은 눌리고, 손이 닿으면 반응한다.** 자식이 있는 줄은 눌러서 접고 편다.
 */
export function TreePanel({
  title,
  nodes,
  selectedId,
  onSelect,
  onAdd,
  addLabel,
  emptyText,
}: TreePanelProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  /** 이 줄이 자식을 갖는가 — 다음 줄이 더 깊으면 그렇다. */
  const hasChildren = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n, i) => {
      if (nodes[i + 1] && nodes[i + 1]!.depth > n.depth) set.add(n.id);
    });
    return set;
  }, [nodes]);

  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    /* 거르는 중에는 접지 않는다 — 찾은 것이 접힌 가지 안에 있으면 「없다」로 읽힌다. */
    const matched = q
      ? nodes.filter((n) => n.text.toLowerCase().includes(q))
      : nodes;
    if (q) return matched;
    /* 접힌 가지의 **자손 전부**를 감춘다 — 부모만 보고 판단하면 손자가 남는다. */
    const out: TreeNode[] = [];
    let hideDeeperThan: number | null = null;
    for (const n of nodes) {
      if (hideDeeperThan !== null && n.depth > hideDeeperThan) continue;
      hideDeeperThan = null;
      out.push(n);
      if (collapsed.has(n.id)) hideDeeperThan = n.depth;
    }
    return out;
  }, [nodes, query, collapsed]);

  function toggle(id: string, force?: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (force ?? !prev.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
        <span className="flex-1 truncate text-xs font-medium text-content-muted">{title}</span>
        {onAdd && (
          <IconButton aria-label={addLabel ?? `${title} 추가`} onClick={onAdd}>
            <Plus size={14} />
          </IconButton>
        )}
      </div>

      {/* 검색은 **모든 트리에 있다.** 예전에는 「항목이 스무 개를 넘는 트리에만」이라는
          기준을 두었는데, 그 기준을 부르는 쪽이 판단하게 되니 조직 트리에만 검색이 없어
          같은 판인데 손잡이가 달랐다. 트리마다 다시 판단할 일을 만들지 않는다 — 항목이
          셋뿐인 목록에 상자가 하나 서는 것은 손해가 없고, 목록은 늘 자란다. */}
      <div className="shrink-0 border-b border-line px-2 py-1.5">
        <Input
          aria-label={`${title} 검색`}
          size="sm"
          value={query}
          placeholder="이름으로 검색"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label={title}>
        {shown.length === 0 && (
          <p className="px-3 py-3 text-xs text-content-faint">
            {searching ? '검색 결과가 없습니다' : (emptyText ?? '없음')}
          </p>
        )}
        {shown.map((n) => {
          const branch = hasChildren.has(n.id);
          const isCollapsed = !searching && collapsed.has(n.id);
          return (
            <div
              key={n.id}
              className={cn(
                'group flex items-center gap-1 px-2 py-1 text-sm',
                SELECTABLE,
                selectedId === n.id ? SELECTED : 'text-content',
              )}
              style={{ paddingLeft: 8 + n.depth * 14 }}
              role="treeitem"
              aria-level={n.depth + 1}
              aria-selected={selectedId === n.id}
              aria-expanded={branch ? !isCollapsed : undefined}
              tabIndex={0}
              onClick={() => (n.selectable === false ? branch && toggle(n.id) : onSelect(n))}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                /* 좌우 화살표로 접었다 편다 — 트리에서 이건 관습이 아니라 규약이다. */
                if (branch && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                  e.preventDefault();
                  toggle(n.id, e.key === 'ArrowLeft');
                  return;
                }
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (n.selectable === false) branch && toggle(n.id);
                else onSelect(n);
              }}
            >
              {/* 셰브런 자리는 늘 차지한다 — 없으면 이름이 층마다 어긋나 보인다. */}
              {branch ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`${n.text} ${isCollapsed ? '펼치기' : '접기'}`}
                  className="shrink-0 rounded text-content-faint hover:text-content"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(n.id);
                  }}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                <span className="w-3 shrink-0" aria-hidden />
              )}
              {n.dot && (
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: n.dot }} />
              )}
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {n.actions && (
                /* 자리는 항상 차지하고 보이기만 바뀐다 — 호버할 때 요소가 끼어들면 줄 크기가
                   바뀌고, 그 바람에 호버가 껐다 켜졌다 반복한다(목록이 떠는 원인). */
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {n.actions}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
