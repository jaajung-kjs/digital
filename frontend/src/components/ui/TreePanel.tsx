import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { Input } from './Input';
import { isCommitKey } from './keyboard';
import { cn } from './cn';
import { HOVER_REVEAL } from './hoverReveal';
import { SELECTABLE, SELECTED } from './selection';
import { SelectionScope } from './SelectionScope';
import { useScrollSelectedIntoView } from './useScrollSelectedIntoView';
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
   * 이 줄을 **지금은 지울 수 없는 이유** — 있으면 휴지통이 잠기고 그 까닭을 말한다.
   *
   * 할 수 있냐 없냐는 층(`TreeKind`)이 정하지만, **지금 지울 수 있냐**는 그 줄이 담고 있는
   * 것에 달렸다(든 것이 있는 분류). 그래서 이것만 줄에 붙는다.
   */
  removeBlocked?: string;
}

/**
 * 이 층에 서는 것 — **문구는 전부 여기서 나온다**(「본부」·「전력지사」·「분류」).
 *
 * 트리는 「무엇들이 어떤 순서로 겹쳐 있는가」로 정의된다. 그래서 부르는 쪽은 「지사 추가」
 * 같은 문구를 한 글자도 적지 않는다 — 무엇이 만들어지는지는 **누른 자리의 층**이 정한다.
 * 예전에는 트리마다, 줄마다 그 문구를 손으로 적었고, 트리가 하나 늘 때마다 또 적었다.
 */
export interface TreeKind {
  /** 이 층에 서는 것의 이름. */
  label: string;
  /**
   * 새로 만들 수 있는가.
   *
   * - `inline` — 이름만 있으면 선다(뼈대: 본부·지사·변전소·분류). 그 자리에 줄이 서고
   *   「새 <이름>」이 채워진 채 글자가 잡힌다. **Enter 해야 서버로 간다** — 탐색기는 누르는
   *   순간 만들지만, 여기서 생기는 것은 모두가 보는 조직이라 물릴 길을 남긴다(Esc).
   * - `editor` — 이름만으로는 서지 않는다(품목: 포트·공량을 채워야 한다). 오른쪽 초안을 연다.
   * - 없음 — 만들 수 없다(케이블 그룹처럼 어휘가 고정된 층). 예외 코드가 아니라 **선언의 부재**다.
   */
  create?: 'inline' | 'editor';
  /** 이름을 그 자리에서 고칠 수 있는가 — 탐색기의 F2 와 같다(들어오면 이름이 통째로 잡힌다). */
  rename?: boolean;
  /** 지울 수 있는가. 되돌릴 수 없으므로 묻는 일은 부르는 쪽이 한다. */
  remove?: boolean;
  /**
   * 끌어서 순서를 바꿀 수 있는가 — **기본은 그렇다**(`onReorder` 를 준 트리라면).
   *
   * 기본을 「된다」로 둔 이유: 같은 판을 쓰는데 트리마다 켜고 끄면 반드시 어긋난다 —
   * 실제로 조직에서만 끌리고 대장에서는 안 끌렸다. 순서가 없는 층(날짜순 목록 같은 것)만
   * `false` 로 끈다.
   *
   * 옮기는 것은 **같은 부모 안에서만**이다. 다른 부모 밑으로 가는 것은 순서가 아니라
   * 소속을 바꾸는 일이라 서버 계약도 다르다(지금은 이름·순서만 고친다).
   */
  reorder?: boolean;
}

export interface TreePanelProps {
  /** 머리줄에 적히는 이름 — 「조직」·「설비 품목」. */
  title: string;
  /** 머리줄 오른쪽 끝 — 레일 「접기」 단추 같은 것(`CollapsibleRail`). */
  headerActions?: ReactNode;
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
   * 층마다 무엇이 서는가 — **순서가 곧 계층**이다(0층 = 뿌리의 자식).
   *
   * 주지 않으면 그냥 **보는 트리**다: 아무 손잡이도 서지 않는다.
   */
  kinds?: ReadonlyArray<TreeKind>;
  /**
   * 만든다 — `parentId` 가 `null` 이면 뿌리에.
   *
   * `name` 은 `create: 'inline'` 인 층에서만 온다. `editor` 인 층은 이름 없이 불리고,
   * 부르는 쪽이 오른쪽 초안을 연다.
   *
   * **실패하면 던진다**(사람이 읽을 문구를 담아서). 그러면 치던 줄이 사라지지 않고 그대로
   * 남아 그 자리에서 이유를 말한다 — 이름만 고쳐 다시 확정하면 된다.
   */
  onCreate?: (at: { level: number; parentId: string | null; name?: string }) => void | Promise<void>;
  /** 이름을 고쳤다. 실패하면 던진다(만들 때와 같다). */
  onRename?: (node: TreeNode, name: string) => void | Promise<void>;
  /** 지운다 — **묻는 일은 부르는 쪽**이 한다(무엇을 지우는지 아는 쪽이다). */
  onRemove?: (node: TreeNode) => void;
  /**
   * 순서를 바꿨다 — `order` 는 **그 부모의 자식들 전체**를 새 순서로 늘어놓은 id 다.
   *
   * 「이 줄을 저 줄 앞에」가 아니라 결과를 통째로 준다: 부르는 쪽은 그대로 번호를 매기면
   * 되고(0,1,2…), 트리가 세는 방법과 서버가 세는 방법이 어긋날 일이 없다.
   */
  onReorder?: (at: { node: TreeNode; parentId: string | null; order: string[] }) => void | Promise<void>;
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
  headerActions,
  nodes,
  selectedId,
  onSelect,
  kinds,
  onCreate,
  onRename,
  onRemove,
  onReorder,
  emptyText,
  escapes = false,
}: TreePanelProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
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
  /**
   * 방금 확정한 것이 거절당한 이유 — **치던 그 자리에** 뜬다.
   *
   * 예전에는 줄이 사라지고 화면 맨 위 띠에 떴다. 「이미 같은 이름이 있습니다」를 읽고
   * 돌아오면 치던 이름은 사라져 처음부터 다시 쳐야 했고, 그 띠는 다른 화면까지 따라다녔다.
   */
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState<
    { parentId: string | null; level: number; depth: number; label: string; value: string } | null
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

  /* 고른 줄이 화면 밖이면 옮긴다 — 다른 데서(주소·상세 패널) 골라진 줄도 포함. 줄이 **그려져 있을
     때만** 키를 준다: 트리 자료가 늦게 오거나 접힌 가지 안이면, 그려지는 순간 한 번 옮긴다. */
  const listRef = useScrollSelectedIntoView<HTMLDivElement>(
    selectedId != null && shown.some((n) => n.id === selectedId) ? selectedId : null,
    'center-if-needed',
  );

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
    /**
     * 딴 데를 누르면 확정인가, 없던 일인가.
     *
     * **만들 때는 없던 일이다.** 이름이 미리 채워져 있지만 그것은 우리가 넣은 것이지 사람이
     * 정한 것이 아니다 — 손도 대지 않고 딴 데를 눌렀는데 「새 본부」가 생겨 있으면, 만든 적
     * 없는 것을 지우는 일이 남는다. **고칠 때는 확정이다.** 그건 이미 있는 것이고, 고르고
     * 글자를 친 것 자체가 뜻이다(탐색기·Finder 도 그렇게 한다). 둘 다 Esc 는 물림이다.
     */
    commitOnBlur: boolean;
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
        onBlur={() => (props.commitOnBlur ? props.commit(props.value) : props.cancel())}
        onKeyDown={(e) => {
          e.stopPropagation(); // 트리의 화살표·Enter 규칙이 글자 치는 것을 가로채지 않게
          if (isCommitKey(e)) props.commit(props.value);
          if (e.key === 'Escape') props.cancel();
        }}
      />
    );
  }

  /**
   * 지금 끌고 있는 줄과, 놓으면 들어갈 자리.
   *
   * `over` 는 「이 줄의 **위**에 놓는다」는 뜻이다(마지막 줄 아래는 `end`).
   */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; where: 'before' | 'after' } | null>(null);

  /** 이 줄의 부모 — 평평한 목록에서 위로 훑어 한 층 얕은 첫 줄이다. */
  function parentOf(id: string): string | null {
    const i = nodes.findIndex((n) => n.id === id);
    if (i < 0) return null;
    for (let j = i - 1; j >= 0; j--) {
      if (nodes[j]!.depth < nodes[i]!.depth) return nodes[j]!.id;
    }
    return null;
  }

  /** 같은 부모의 자식들 — 순서 바꾸기는 이 안에서만 일어난다. */
  function siblingsOf(id: string): TreeNode[] {
    const me = nodes.find((n) => n.id === id);
    if (!me) return [];
    const parent = parentOf(id);
    return nodes.filter((n) => n.depth === me.depth && parentOf(n.id) === parent);
  }

  /** 저 줄 자리에 놓을 수 있나 — 같은 부모의 같은 층끼리만. */
  function canDropOn(target: TreeNode): boolean {
    if (!dragId || dragId === target.id) return false;
    if (kindAt(target.depth)?.reorder === false) return false;
    const me = nodes.find((n) => n.id === dragId);
    if (!me || me.depth !== target.depth) return false;
    return parentOf(dragId) === parentOf(target.id);
  }

  /** 놓았다 — 새 순서를 통째로 알린다. */
  function drop() {
    const at = dropAt;
    const id = dragId;
    setDragId(null);
    setDropAt(null);
    if (!at || !id) return;
    const order = siblingsOf(id).map((n) => n.id).filter((x) => x !== id);
    const i = order.indexOf(at.id);
    if (i < 0) return;
    order.splice(at.where === 'before' ? i : i + 1, 0, id);
    const node = nodes.find((n) => n.id === id)!;
    void onReorder?.({ node, parentId: parentOf(id), order });
  }

  /** 치던 것을 접는다 — 오류도 함께 사라진다(그 오류는 이 줄의 것이었다). */
  function cancelEditing() {
    setCreating(null);
    setRenaming(null);
    setFailed(null);
  }

  /**
   * 확정한다 — 되면 줄을 접고, 거절당하면 **그 줄을 붙잡아 둔다**.
   *
   * 서버가 거절하는 이유(같은 이름·권한·참조)는 고쳐서 다시 낼 수 있는 것들이다.
   * 그래서 치던 이름을 지우지 않는다.
   */
  async function settle(run: () => void | Promise<void>, done: () => void) {
    setFailed(null);
    try {
      await run();
      done();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : '저장하지 못했습니다');
    }
  }

  /** 이 층에 서는 것 — 없으면 그 층은 트리가 다루지 않는다. */
  const kindAt = (level: number): TreeKind | undefined => kinds?.[level];

  /**
   * 만들기 시작 — 그 줄을 펴고 **그 안에** 빈 줄을 세운다.
   *
   * 무엇이 만들어지는지는 **자리**가 정한다(다음 층). 그래서 손잡이는 어느 줄에서나 `+`
   * 하나면 되고, 누른 결과가 「새 전력지사」라는 이름으로 그 자리에 바로 보인다 —
   * 탐색기에서 폴더 안에 새 폴더를 만드는 것과 같다.
   */
  function startCreate(parent: TreeNode | null) {
    const level = parent ? parent.depth + 1 : 0;
    const kind = kindAt(level);
    if (!kind?.create) return;
    if (kind.create === 'editor') return onCreate?.({ level, parentId: parent?.id ?? null });
    if (parent) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
    }
    setRenaming(null);
    setFailed(null);
    /* 이름을 미리 채워 둔다 — 그대로 Enter 해도 쓸 수 있는 이름이어야 한다. */
    setCreating({ parentId: parent?.id ?? null, level, depth: level, label: kind.label, value: `새 ${kind.label}` });
  }

  /**
   * 이 줄의 손잡이 — **어느 줄에서나 같은 셋**이고, 무엇을 하는지는 자리가 정한다.
   *
   * `+` 는 「이 안에 하나 더」(다음 층), 연필은 이름, 휴지통은 삭제. 층이 그 일을 선언하지
   * 않았으면 그 손잡이는 서지 않는다 — 잎에는 `+` 가 없고, 품목 줄에는 아무것도 없다.
   */
  function handlesFor(n: TreeNode): ReactNode[] {
    const self = kindAt(n.depth);
    const child = kindAt(n.depth + 1);
    const out: ReactNode[] = [];
    if (child?.create) {
      out.push(
        <IconButton key="add" size="sm" aria-label={`${n.text} 하위 ${child.label} 추가`} onClick={() => startCreate(n)}>
          <Plus size={12} />
        </IconButton>,
      );
    }
    if (self?.rename) {
      out.push(
        <IconButton
          key="rename"
          size="sm"
          aria-label={`${n.text} 이름 변경`}
          onClick={() => {
            setCreating(null);
            setFailed(null);
            setRenaming({ id: n.id, value: n.text });
          }}
        >
          <Pencil size={12} />
        </IconButton>,
      );
    }
    if (self?.remove) {
      out.push(
        <IconButton
          key="remove"
          size="sm"
          aria-label={`${n.text} 삭제`}
          disabled={n.removeBlocked != null}
          disabledReason={n.removeBlocked}
          onClick={() => onRemove?.(n)}
        >
          <Trash2 size={12} />
        </IconButton>,
      );
    }
    return out;
  }

  const CREATE_ROW = '__creating__';
  const rows = useMemo(() => {
    if (!creating) return shown;
    const row: TreeNode = { id: CREATE_ROW, label: '', text: '', depth: creating.depth };
    /* 뿌리에 만드는 줄은 **맨 아래**에 선다 — 누른 자리(바닥의 「새 …」)와 같은 자리이고,
       새로 만든 것이 실제로 목록 끝에 붙기 때문이다(정렬 순서 = 만든 순). */
    if (creating.parentId === null) return [...shown, row];
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
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-content-muted">{title}</span>
        {headerActions}
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
          /* 지금 이 줄에서 이름을 치고 있나 — 거절당한 이유는 그 줄 아래에 붙는다. */
          const editingHere = n.id === CREATE_ROW || renaming?.id === n.id;
          return (
            <Fragment key={n.id}>
            <div
              data-selectable=""
              data-id={n.id}
              /* 끌 수 있는 줄인가 — 이름을 치는 중에는 끌지 않는다(글자를 고르는 중이다). */
              draggable={onReorder != null && kindAt(n.depth)?.reorder !== false && !creating && !renaming}
              onDragStart={(e) => {
                setDragId(n.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropAt(null);
              }}
              onDragOver={(e) => {
                if (!canDropOn(n)) return;
                e.preventDefault(); // 놓을 수 있는 자리라고 브라우저에 알린다
                const box = e.currentTarget.getBoundingClientRect();
                setDropAt({ id: n.id, where: e.clientY < box.top + box.height / 2 ? 'before' : 'after' });
              }}
              onDrop={(e) => {
                if (!canDropOn(n)) return;
                e.preventDefault();
                drop();
              }}
              className={cn(
                'group flex items-center gap-1 px-2 py-1 text-sm',
                SELECTABLE,
                selectedId === n.id ? SELECTED : 'text-content',
                /* 놓일 자리를 **선 하나**로 보여 준다 — 줄을 통째로 물들이면 어느 쪽에
                   들어가는지(위·아래) 말하지 못한다. */
                dropAt?.id === n.id && dropAt.where === 'before' && 'border-t-2 border-primary',
                dropAt?.id === n.id && dropAt.where === 'after' && 'border-b-2 border-primary',
                dragId === n.id && 'opacity-40',
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
                      commitOnBlur: false, // 만들다 만 것은 만들지 않는다
                      label: `새 ${creating.label} 이름`,
                      value: creating.value,
                      onChange: (v) => setCreating((c) => (c ? { ...c, value: v } : c)),
                      commit: (name) => {
                        const trimmed = name.trim();
                        if (!trimmed) return cancelEditing();
                        void settle(
                          () => onCreate?.({ level: creating.level, parentId: creating.parentId, name: trimmed }),
                          () => setCreating(null),
                        );
                      },
                      cancel: cancelEditing,
                    })
                  : renaming?.id === n.id
                    ? nameField({
                        commitOnBlur: true, // 이미 있는 것을 고치는 중이다
                        label: `${n.text} 이름`,
                        value: renaming.value,
                        onChange: (v) => setRenaming((r) => (r ? { ...r, value: v } : r)),
                        commit: (name) => {
                          const trimmed = name.trim();
                          if (!trimmed || trimmed === n.text) return cancelEditing();
                          void settle(() => onRename?.(n, trimmed), () => setRenaming(null));
                        },
                        cancel: cancelEditing,
                      })
                    : n.label}
              </span>
              {n.id !== CREATE_ROW && handlesFor(n).length > 0 && (
                /* 자리는 항상 차지하고 보이기만 바뀐다 — 호버할 때 요소가 끼어들면 줄 크기가
                   바뀌고, 그 바람에 호버가 껐다 켜졌다 반복한다(목록이 떠는 원인). */
                <span
                  className={cn('flex shrink-0 items-center gap-0.5', HOVER_REVEAL)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {handlesFor(n)}
                </span>
              )}
            </div>
            {editingHere && failed && (
              /* 이름을 치던 자리 바로 아래 — 고쳐서 다시 확정하면 되는 것들이다. */
              <p role="alert" className="px-2 pb-1 text-xs text-danger" style={{ paddingLeft: 8 + n.depth * 14 + 16 }}>
                {failed}
              </p>
            )}
            </Fragment>
          );
        })}

        {kindAt(0)?.create && !creating && (
          /**
           * **최상위를 만드는 자리는 마지막 줄 바로 아래다.**
           *
           * 예전에는 머리줄의 아이콘 `+` 하나였다 — 무엇이 만들어지는지 글자가 없어 아무도
           * 찾지 못했다. 그렇다고 패널 **바닥에 못 박으면** 줄이 넷뿐인 트리에서 저 아래
           * 홀로 떠 있어 목록과 상관없는 것처럼 보인다. 목록의 끝에 붙여 함께 흐르게 한다
           * (사이드바의 「새 페이지」·「채널 추가」가 있는 자리).
           */
          <button
            type="button"
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-content-faint hover:bg-surface-2 hover:text-content"
            onClick={() => startCreate(null)}
          >
            <Plus size={12} />
            새 {kindAt(0)!.label}
          </button>
        )}
      </SelectionScope>

    </div>
  );
}
