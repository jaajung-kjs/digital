import { useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { IconButton, Input, cn, SELECTABLE } from '../../../components/ui';

/** 목록에 서는 것 하나. */
export interface CatalogListItem {
  id: string;
  name: string;
  /** 이름 뒤 흐린 숫자 — 설비 종류면 구성 개수, 자산 종류면 쓰이는 자산 수. */
  hint?: string;
}

/** 분류로 묶인 한 덩이. 분류가 없는 대장(케이블 그룹)은 묶음 하나에 이름 없이 담는다. */
export interface CatalogListGroup {
  key: string;
  /** 분류 이름. null 이면 머리줄을 그리지 않는다(분류가 없는 대장). 편집 상자를 넣을 수도 있다. */
  label: ReactNode;
  /** 검색이 훑는 분류 이름 — `label` 이 상자일 수 있으므로 글자는 따로 받는다. */
  labelText?: string;
  items: CatalogListItem[];
  /** 분류 자체를 다루는 것(이름 변경·삭제·그 분류에 추가) — 있으면 호버에서 드러난다. */
  actions?: ReactNode;
}

export interface CatalogListProps {
  /** 목록 머리의 이름 — 「설비 종류」·「자산 종류」·「케이블 그룹」. */
  title: string;
  groups: CatalogListGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 새로 만들기 — 없으면 `+` 를 달지 않는다(케이블 그룹은 늘리지 않는다). */
  onAdd?: () => void;
  addLabel?: string;
  /** 머리줄 오른쪽 끝 — 분류 추가처럼 목록 전체에 걸리는 것. */
  headerActions?: ReactNode;
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
 * **검색이 들어 있다.** 자산 종류만 스물세 개고 앞으로 계속 는다 — 스크롤로 훑는 것이 유일한
 * 길이면 목록은 금세 못 쓰게 된다. 「단종」(목록에서 숨김) 딱지를 걷어낼 수 있었던 것도
 * 검색이 그 일을 대신하기 때문이다.
 */
export function CatalogList({
  title, groups, selectedId, onSelect, onAdd, addLabel, headerActions, emptyText,
}: CatalogListProps) {
  const [query, setQuery] = useState('');

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

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
        <span className="flex-1 truncate text-xs font-medium text-content-muted">
          {title} <span className="text-content-faint tabular-nums">{total}</span>
        </span>
        {headerActions}
        {onAdd && (
          <IconButton aria-label={addLabel ?? `${title} 추가`} onClick={onAdd}>
            <Plus size={14} />
          </IconButton>
        )}
      </div>

      <div className="shrink-0 border-b border-line px-2 py-1.5">
        <Input
          aria-label={`${title} 검색`}
          size="sm"
          value={query}
          placeholder="이름으로 검색"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-xs text-content-faint">
            {query.trim() ? '검색 결과가 없습니다' : (emptyText ?? '없음')}
          </p>
        )}
        {filtered.map((g) => (
          <div key={g.key}>
            {/* 분류 머리줄 — 분류가 없는 대장에서는 그리지 않는다(빈 줄만 남는다). */}
            {g.label != null && (
              <div className="group flex items-center gap-1 px-2 pb-0.5 pt-2">
                <span className="flex-1 truncate text-xs font-medium text-content-muted">{g.label}</span>
                {g.actions && (
                  /* 목록 행의 액션은 호버에서 드러낸다(조직 트리와 같은 규칙).
                     자리는 항상 차지하므로 호버해도 줄이 움직이지 않는다. */
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {g.actions}
                  </span>
                )}
              </div>
            )}
            <ul>
              {g.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-content',
                      SELECTABLE,
                      selectedId === item.id && 'bg-info-bg font-medium text-primary hover:bg-info-bg',
                    )}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.hint && (
                      <span className="shrink-0 text-xs text-content-faint tabular-nums">{item.hint}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
