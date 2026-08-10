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
  /**
   * **이 대장의 것을 새로 만든다** — 설비 종류·자산 종류. 세 탭이 같은 뜻으로 쓴다.
   *
   * 케이블 그룹은 늘리지 않으므로(매체라서 고정) 주지 않는다. 그래도 머리줄 높이는 같다 —
   * 버튼 유무로 줄 높이가 달라지면 탭을 옮길 때 화면이 덜컹거린다.
   */
  onAdd?: () => void;
  addLabel?: string;
  /** 분류를 새로 만든다 — 있으면 목록 맨 아래에 행으로 선다. */
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
 * **검색이 들어 있다.** 자산 종류만 스물세 개고 앞으로 계속 는다 — 스크롤로 훑는 것이 유일한
 * 길이면 목록은 금세 못 쓰게 된다. 「단종」(목록에서 숨김) 딱지를 걷어낼 수 있었던 것도
 * 검색이 그 일을 대신하기 때문이다.
 */
export function CatalogList({
  title, groups, selectedId, onSelect, onAdd, addLabel, onAddGroup, addGroupLabel, emptyText,
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
      {/* 머리줄 높이는 버튼 유무와 무관하게 같다 — `+` 가 없는 탭에서 줄이 얇아지면
          탭을 옮길 때마다 목록이 위아래로 덜컹거린다(케이블 탭이 그랬다). */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
        <span className="flex-1 truncate text-xs font-medium text-content-muted">
          {title} <span className="text-content-faint tabular-nums">{total}</span>
        </span>
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
            {/* 분류 머리줄 — 분류가 없는 대장에서는 그리지 않는다(빈 줄만 남는다).
                띠를 깔고 글자를 눌러 **항목과 확실히 가른다**: 예전에는 둘 다 왼쪽 같은
                자리에 서서 크기만 한 급 달랐고, 그래서 어디까지가 분류이고 어디부터가
                그 안의 것인지 읽히지 않았다. 항목은 들여쓴다. */}
            {g.label != null && (
              <div className="group flex items-center gap-1 rounded bg-surface-2 px-2 py-1">
                <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-content-faint">
                  {g.label}
                </span>
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
                      // 들여쓰기가 「이것은 위 분류에 속한다」를 말한다.
                      'flex w-full items-center gap-1.5 rounded py-1.5 pl-4 pr-2 text-left text-sm text-content',
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

        {/* 분류 추가는 목록 **맨 아래**에 — 드물게 쓰는 일이 머리줄의 `+` 를 차지하고 있으면
            자주 쓰는 「새로 만들기」가 갈 자리가 없다. 설비·자산 두 탭이 **같은 분류 체계**를
            쓰므로 어느 쪽에서 만들든 양쪽에 나타난다. */}
        {onAddGroup && (
          <button
            type="button"
            className={cn(
              'mt-2 flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-content-faint',
              SELECTABLE,
            )}
            onClick={onAddGroup}
          >
            <Plus size={12} />
            {addGroupLabel ?? '분류 추가'}
          </button>
        )}
      </div>
    </aside>
  );
}
