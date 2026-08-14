import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button, Input, OverflowMenu, cn, SELECTABLE, SELECTED, type OverflowMenuItem } from '../../../components/ui';

/** 목록에 서는 것 하나. */
export interface CatalogListItem {
  id: string;
  name: string;
  /**
   * 이름 앞 색점 — 그 항목이 도면에서 그려지는 색(케이블 그룹).
   *
   * 색은 고정 어휘라 고칠 데가 없다. 그래도 어디에도 안 보이면 「이 그룹이 도면에서 무슨
   * 색인지」를 도면을 열어 봐야만 알 수 있다.
   */
  dot?: string;
}

/** 분류로 묶인 한 덩이. 분류가 없는 대장(케이블 그룹)은 묶음 하나에 이름 없이 담는다. */
export interface CatalogListGroup {
  key: string;
  /** 분류 이름. null 이면 머리줄을 그리지 않는다(분류가 없는 대장). 편집 상자를 넣을 수도 있다. */
  label: ReactNode;
  /** 검색이 훑는 분류 이름 — `label` 이 상자일 수 있으므로 글자는 따로 받는다. */
  labelText?: string;
  items: CatalogListItem[];
  /** 이 분류 자체를 다루는 것 — 손이 닿으면 `⋯` 로 드러난다. */
  menu?: OverflowMenuItem[];
}

export interface CatalogListProps {
  /** 목록 머리의 이름 — 「설비 종류」·「자산 종류」·「케이블 그룹」. */
  title: string;
  groups: CatalogListGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * **이 대장의 것을 새로 만든다** — 자주 쓰는 일이므로 겉에 글자로 선다.
   *
   * 예전에는 머리줄의 아이콘 전용 `+` 였다. 무엇이 만들어지는지가 `aria-label` 에만 있어
   * 눈으로 보는 사람은 알 수 없었고, 바로 아래 「분류 추가」와 50px 안에 나란히 서서
   * 둘 다 같은 `Plus` 아이콘을 쓰는데 하나만 글자를 갖고 있었다.
   */
  onAdd?: () => void;
  /** 만들기 단추에 적히는 말 — 「설비 종류 추가」처럼 **만들어지는 것의 이름**을 적는다.
   *  동사는 앱 전체가 「추가」 하나를 쓴다(자산 추가·분류 추가·본부 추가). */
  addLabel?: string;
  /** 분류를 새로 만든다 — 드물게 쓰는 구조 변경이라 머리줄 `⋯` 안에 든다. */
  onAddGroup?: () => void;
  addGroupLabel?: string;
  emptyText?: string;
}

/**
 * 대장의 왼쪽 목록 — **세 탭이 같은 판을 쓴다**.
 *
 * 예전에는 탭마다 목록을 따로 그렸다: 설비 종류는 분류를 무시한 평면 목록(w-56), 자산 종류는
 * 분류로 묶은 트리(w-64), 케이블은 목록 없이 여섯 그룹을 한 장에 세로로 늘어놓았다. 셋 다
 * 「분류 → 항목」 2단인데 손길이 제각각이라, 탭을 옮길 때마다 무엇을 어디서 누르는지 다시
 * 익혀야 했다.
 *
 * **만드는 손잡이에는 만들어지는 것의 이름이 글자로 적힌다.** 그리고 자주 쓰는 것은 겉에,
 * 드물게 쓰는 구조 변경(분류)은 `⋯` 안에 둔다 — 아이콘 둘이 나란히 서서 어느 쪽이 무엇을
 * 만드는지 알 수 없던 자리가 여기였다.
 *
 * **분류는 접힌다.** 조직 트리와 같은 어법이다 — 한 앱 안에서 트리가 두 가지로 굴지 않는다.
 *
 * **검색이 들어 있다.** 자산 종류만 스물세 개고 앞으로 계속 는다 — 스크롤로 훑는 것이 유일한
 * 길이면 목록은 금세 못 쓰게 된다.
 */
export function CatalogList({
  title, groups, selectedId, onSelect, onAdd, addLabel, onAddGroup, addGroupLabel, emptyText,
}: CatalogListProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    /* 분류 이름이 걸리면 그 분류를 통째로 남긴다 — 「전원」 을 찾는 사람은 그 묶음 전체를
       보려는 것이다. */
    return groups
      .map((g) =>
        g.labelText?.toLowerCase().includes(q)
          ? g
          : { ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) },
      )
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  /* 거르는 중에는 접지 않는다 — 찾은 것이 접힌 분류 안에 있으면 「없다」로 읽힌다. */
  const searching = query.trim().length > 0;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
        <span className="flex-1 truncate text-xs font-medium text-content-muted">
          {title} <span className="text-content-faint tabular-nums">{total}</span>
        </span>
        {onAddGroup && (
          <OverflowMenu
            label={`${title} 목록 더 보기`}
            items={[{ label: addGroupLabel ?? '분류 추가', onSelect: onAddGroup }]}
          />
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-b border-line px-2 py-1.5">
        <Input
          aria-label={`${title} 검색`}
          size="sm"
          value={query}
          placeholder="이름으로 검색"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        {/* 자주 쓰는 일은 **늘 보이는 자리에 글자로**. 스크롤 밖으로 밀리지 않는다. */}
        {onAdd && (
          <Button variant="secondary" size="sm" className="w-full" leftIcon={<Plus size={14} />} onClick={onAdd}>
            {addLabel ?? `${title} 추가`}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-xs text-content-faint">
            {searching ? '검색 결과가 없습니다' : (emptyText ?? '없음')}
          </p>
        )}
        {filtered.map((g) => {
          const isCollapsed = !searching && collapsed.has(g.key);
          return (
            <div key={g.key}>
              {/* 분류 머리줄 — 분류가 없는 대장에서는 그리지 않는다(빈 줄만 남는다). */}
              {g.label != null && (
                <div className="group flex items-center gap-1 rounded px-1 py-1">
                  <button
                    type="button"
                    aria-label={`${g.labelText ?? ''} ${isCollapsed ? '펼치기' : '접기'}`}
                    aria-expanded={!isCollapsed}
                    className="shrink-0 rounded text-content-faint hover:text-content"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <span className="flex-1 truncate text-xs font-semibold text-content-muted">{g.label}</span>
                  <span className="shrink-0 text-xs text-content-faint tabular-nums">{g.items.length}</span>
                  {g.menu && g.menu.length > 0 && (
                    /* 목록 행의 구조 변경은 손이 닿을 때 드러낸다. 자리는 항상 차지하므로
                       호버해도 줄이 움직이지 않는다. */
                    <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <OverflowMenu label={`${g.labelText ?? ''} 분류 더 보기`} items={g.menu} />
                    </span>
                  )}
                </div>
              )}
              {!isCollapsed && (
                <ul>
                  {g.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          // 들여쓰기가 「이것은 위 분류에 속한다」를 말한다.
                          'flex w-full items-center gap-1.5 rounded py-1.5 pl-6 pr-2 text-left text-sm text-content',
                          SELECTABLE,
                          selectedId === item.id && SELECTED,
                        )}
                        onClick={() => onSelect(item.id)}
                      >
                        {item.dot && (
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: item.dot }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
