import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from './Input';
import { isCommitKey } from './keyboard';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu';
import { cn } from './cn';
import { SELECTABLE, SELECTED } from './selection';
import { SelectionScope } from './SelectionScope';
import { selectOrToggle } from './rowSelection';

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
   * 자식이 있는 가지인가 — 보통은 뒤따르는 줄의 깊이로 저절로 안다.
   *
   * 명시해야 하는 자리가 하나 있다: **지금 펼쳐져 있지 않은 다른 대장의 뿌리**. 그 아래
   * 줄이 아직 없어도 셰브런이 서야 「눌러서 열 수 있는 것」으로 읽힌다.
   */
  branch?: boolean;
  /**
   * 이 줄을 열면 무슨 일이 일어나는가 — 주면 접고 펴는 대신 **이것**이 불린다.
   *
   * 트리가 지금 담고 있지 않은 것을 가리키는 줄에 쓴다(다른 대장의 뿌리). 「열기」가
   * 무엇인지는 부르는 쪽이 안다 — 트리가 `root:` 같은 이름 규칙을 알아채게 하지 않는다.
   */
  onOpen?: () => void;
  /**
   * 이 줄의 이름을 **그 자리에서** 고친다 — 주면 `⋯` 에 「이름 바꾸기」가 선다.
   *
   * 상자를 띄우지 않는다: 이름을 고치는 중에 어느 줄을 고치는 중인지 화면에서 사라지면
   * 안 된다(탐색기의 F2 와 같은 어법).
   */
  rename?: (name: string) => void;
  /**
   * 이 줄 **아래에 하나 더** — 이름만 있으면 생기는 것(뼈대: 지사·변전소·분류).
   *
   * `⋯` 에 「<label> 추가」가 서고, 누르면 그 자리에 빈 줄이 선다. 여러 칸을 채워야 하는
   * 것(품목)은 여기 오지 않는다 — 그것은 오른쪽 편집기의 일이라 `menu` 로 준다.
   */
  addChild?: { label: string; run: (name: string) => void };
  /** 이 줄을 없앤다 — `⋯` 맨 아래, 위험 색. 못 지우는 줄이면 **이유를 적는다**. */
  remove?: { run: () => void; disabledReason?: string };
  /** 그 밖에 이 줄에서 할 수 있는 일 — 오른쪽 편집기를 여는 것 등. */
  menu?: OverflowMenuItem[];
}

export interface TreePanelProps {
  /** 머리줄에 적히는 이름 — 「조직」·「설비 품목」. */
  title: string;
  nodes: TreeNode[];
  selectedId: string | null;
  /**
   * 줄을 골랐다 — **고른 줄을 다시 누르면 `null`** 이 온다.
   *
   * 표와 같은 규칙이다(`selectableRow`). 앱에서 「고른 것을 놓는 방법」이 판마다 다르면
   * 사용자는 판마다 다시 익혀야 한다.
   */
  onSelect: (node: TreeNode | null) => void;
  /**
   * 머리줄은 **뿌리 줄**이다 — 여기서 만드는 것이 트리의 최상위가 된다.
   *
   * 예전에는 머리줄에 정체불명의 `+` 가 하나 서 있었다. 무엇이 만들어지는지 글자가 없어
   * (트리 이름으로 짐작해야 했다) 진입점이 갈리고, 어떤 트리는 그 `+` 가 상자를 열고
   * 어떤 트리는 줄을 만들었다. 지금은 줄과 **같은 `⋯`** 이고 안에 글자가 적힌다.
   */
  root?: { addChild?: { label: string; run: (name: string) => void }; menu?: OverflowMenuItem[] };
  emptyText?: string;
  /** Esc 로도 푼다 — 이 트리가 그 화면의 주인일 때만 준다(`SelectionScope`). */
  escapes?: boolean;
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
 * - **한 줄이 할 수 있는 일은 그 줄의 `⋯` 안에 글자로 적힌다** — 「지사 추가」·「이름 바꾸기」·
 *   「삭제」. 아이콘만 늘어놓으면 무엇을 하는 단추인지 손을 올려 봐야 알고, 트리마다 아이콘
 *   구성이 제각각 자란다(실제로 조직 트리는 아이콘 셋, 대장은 하나였다).
 * - **머리줄도 하나의 줄이다**(뿌리). 그래서 최상위를 만드는 일도 같은 `⋯` 안에 있다 —
 *   정체불명의 `+` 는 없다.
 * - **만드는 일과 이름 고치는 일은 트리 안에서 끝난다** — 그 자리에 빈 줄이 서고 이름을 친다.
 *   상자를 띄우면 어느 줄에 무엇을 만드는 중인지 화면에서 사라진다.
 * - **모든 줄은 눌리고, 손이 닿으면 반응한다.** 자식이 있는 줄은 눌러서 접고 편다.
 */
export function TreePanel({
  title,
  nodes,
  selectedId,
  onSelect,
  root,
  emptyText,
  escapes = false,
}: TreePanelProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * Tab 으로 닿는 줄은 **하나뿐**이다(roving tabindex).
   *
   * 예전에는 모든 줄이 `tabIndex=0` 이라, 장비 품목처럼 스물일곱 줄짜리 트리를 지나가려면
   * Tab 을 스물일곱 번 눌러야 했다. 줄 사이는 화살표로 옮긴다 — WAI-ARIA Tree View 가
   * 정한 규약이고, 파일 탐색기·메일함이 다 그렇게 움직인다.
   */
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * 지금 이름을 치고 있는 자리 — 고치는 중이거나(`renaming`) 만드는 중이거나(`creating`).
   *
   * 둘 다 트리 안의 **빈 줄 하나**로 끝난다. Enter·초점 잃음 = 확정, Esc = 물림, 빈 이름은
   * 아무 일도 하지 않는다(실수로 지우거나 이름 없는 것을 만드는 길을 두지 않는다).
   */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [creating, setCreating] = useState<
    { parentId: string | null; depth: number; label: string; run: (name: string) => void; value: string } | null
  >(null);

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

  /**
   * 만드는 중인 빈 줄은 **그 부모 바로 아래**에 선다 — 어디에 생기는지 목록이 보여 준다.
   * 뿌리에 만드는 중이면 맨 위에 선다.
   */
  /** 이름을 치는 상자 — 만들 때도 고칠 때도 이것 하나다. */
  function nameField(props: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    commit: (name: string) => void;
    cancel: () => void;
  }): ReactNode {
    return (
      <Input
        aria-label={props.label}
        size="sm"
        autoFocus
        value={props.value}
        /* 들어오면 이름이 **통째로 잡힌다** — 탐색기의 F2 와 같다. 그래야 바로 새 이름을
           칠 수 있고, 이어 붙이고 싶으면 →/← 한 번이면 된다. */
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        onBlur={() => props.commit(props.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // 트리의 화살표·Enter 규칙이 글자 치는 것을 가로채지 않게
          if (isCommitKey(e)) props.commit(props.value);
          if (e.key === 'Escape') props.cancel();
        }}
      />
    );
  }

  /** 만들기 시작 — 그 줄을 펴고 그 아래에 빈 줄을 세운다(접혀 있으면 안 보인다). */
  function startCreate(parent: TreeNode | null, add: { label: string; run: (name: string) => void }) {
    if (parent) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
    }
    setRenaming(null);
    setCreating({ parentId: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0, label: add.label, run: add.run, value: '' });
  }

  /**
   * 이 줄이 할 수 있는 일 — **순서가 뜻을 만든다**: 만드는 것 → 여는 것 → 이름 → 삭제.
   * 되돌릴 수 없는 것은 늘 맨 아래에 있어, 손이 미끄러져도 그 자리에 오지 않는다.
   */
  function itemsFor(n: TreeNode): OverflowMenuItem[] {
    const out: OverflowMenuItem[] = [];
    if (n.addChild) out.push({ label: `${n.addChild.label} 추가`, onSelect: () => startCreate(n, n.addChild!) });
    out.push(...(n.menu ?? []));
    if (n.rename) out.push({ label: '이름 바꾸기', onSelect: () => { setCreating(null); setRenaming({ id: n.id, value: n.text }); } });
    if (n.remove) {
      out.push({
        label: '삭제',
        danger: true,
        disabled: n.remove.disabledReason != null,
        disabledReason: n.remove.disabledReason,
        onSelect: n.remove.run,
      });
    }
    return out;
  }

  const CREATE_ROW = '__creating__';
  const rows = useMemo(() => {
    if (!creating) return shown;
    const row: TreeNode = { id: CREATE_ROW, label: '', text: '', depth: creating.depth };
    if (creating.parentId === null) return [row, ...shown];
    const i = shown.findIndex((n) => n.id === creating.parentId);
    if (i < 0) return shown;
    return [...shown.slice(0, i + 1), row, ...shown.slice(i + 1)];
  }, [shown, creating]);

  /** 화면에 보이는 줄들 사이를 옮긴다 — 접힌 가지 속은 건너뛴다(그 줄들은 없는 것이다). */
  function moveFocus(from: string, delta: number | 'first' | 'last') {
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    if (els.length === 0) return;
    const i = els.findIndex((el) => el.dataset.id === from);
    const next =
      delta === 'first' ? els[0] : delta === 'last' ? els[els.length - 1] : els[Math.min(Math.max(i + delta, 0), els.length - 1)];
    if (!next) return;
    setActiveId(next.dataset.id ?? null);
    next.focus();
  }

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
        {(root?.addChild || root?.menu?.length) && (
          <OverflowMenu
            label={`${title} 관리`}
            items={[
              ...(root.addChild ? [{ label: `${root.addChild.label} 추가`, onSelect: () => startCreate(null, root.addChild!) }] : []),
              ...(root.menu ?? []),
            ]}
          />
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

      {/* 목록 영역이 **선택의 주인**이다 — 여백을 누르면 풀린다(`SelectionScope`). */}
      <SelectionScope
        ref={listRef}
        onClear={() => onSelect(null)}
        escapes={escapes}
        className="min-h-0 flex-1 overflow-y-auto py-1"
        role="tree"
        aria-label={title}
      >
        {rows.length === 0 && (
          <p className="px-3 py-3 text-xs text-content-faint">
            {searching ? '검색 결과가 없습니다' : (emptyText ?? '없음')}
          </p>
        )}
        {rows.map((n) => {
          const branch = n.branch ?? hasChildren.has(n.id);
          const isCollapsed = !searching && collapsed.has(n.id);
          return (
            <div
              key={n.id}
              data-selectable=""
              data-id={n.id}
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
              /* Tab 으로 닿는 줄은 하나 — 고른 줄, 없으면 첫 줄. 나머지는 화살표로 온다. */
              tabIndex={(activeId ?? selectedId ?? shown[0]?.id) === n.id ? 0 : -1}
              onFocus={() => setActiveId(n.id)}
              /* 접힌 가지를 누르면 열린다 — 그 「열기」가 무엇인지는 부르는 쪽이 정한다
                 (다른 대장의 뿌리라면 그 대장으로 옮기는 일이다). */
              onClick={() => {
                if (n.onOpen) return n.onOpen();
                /* 갈 곳이 아닌 가지(대장의 분류)는 누르는 일이 곧 접고 펴는 일이다. */
                if (n.selectable === false) return void (branch && toggle(n.id));
                selectOrToggle({
                  selected: selectedId === n.id,
                  branch: branch ? { collapsed: isCollapsed, setCollapsed: (v) => toggle(n.id, v) } : undefined,
                  select: () => onSelect(n),
                  deselect: () => onSelect(null),
                });
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveFocus(n.id, e.key === 'ArrowDown' ? 1 : -1);
                  return;
                }
                if (e.key === 'Home' || e.key === 'End') {
                  e.preventDefault();
                  moveFocus(n.id, e.key === 'Home' ? 'first' : 'last');
                  return;
                }
                /* 좌우 화살표로 접었다 편다 — 트리에서 이건 관습이 아니라 규약이다. */
                if (!n.onOpen && branch && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                  e.preventDefault();
                  toggle(n.id, e.key === 'ArrowLeft');
                  return;
                }
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (n.onOpen) n.onOpen();
                else if (n.selectable === false) branch && toggle(n.id);
                else
                  selectOrToggle({
                    selected: selectedId === n.id,
                    branch: branch ? { collapsed: isCollapsed, setCollapsed: (v) => toggle(n.id, v) } : undefined,
                    select: () => onSelect(n),
                    deselect: () => onSelect(null),
                  });
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
                    if (n.onOpen) n.onOpen();
                    else toggle(n.id);
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
              <span className="min-w-0 flex-1 truncate">
                {n.id === CREATE_ROW && creating
                  ? nameField({
                      label: `새 ${creating.label} 이름`,
                      value: creating.value,
                      onChange: (v) => setCreating((c) => (c ? { ...c, value: v } : c)),
                      commit: (name) => {
                        const trimmed = name.trim();
                        setCreating(null);
                        if (trimmed) creating.run(trimmed);
                      },
                      cancel: () => setCreating(null),
                    })
                  : renaming?.id === n.id && n.rename
                    ? nameField({
                        label: `${n.text} 이름`,
                        value: renaming.value,
                        onChange: (v) => setRenaming((r) => (r ? { ...r, value: v } : r)),
                        commit: (name) => {
                          const trimmed = name.trim();
                          setRenaming(null);
                          if (trimmed && trimmed !== n.text) n.rename!(trimmed);
                        },
                        cancel: () => setRenaming(null),
                      })
                    : n.label}
              </span>
              {itemsFor(n).length > 0 && (
                /* 자리는 항상 차지하고 보이기만 바뀐다 — 호버할 때 요소가 끼어들면 줄 크기가
                   바뀌고, 그 바람에 호버가 껐다 켜졌다 반복한다(목록이 떠는 원인). */
                <span
                  className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OverflowMenu label={`${n.text} 관리`} items={itemsFor(n)} />
                </span>
              )}
            </div>
          );
        })}
      </SelectionScope>
    </div>
  );
}
