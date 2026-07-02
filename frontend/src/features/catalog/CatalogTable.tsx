import { Fragment, useRef } from 'react';
import type { ReactNode, JSX } from 'react';
import { SortableHeaderCell } from '../../components/grid/SortableHeaderCell';
import { rowClass } from '../../components/grid/rowClasses';
import { SectionEmpty } from '../assets/components/detail/SectionShell';
import { Button } from '../../components/ui';

export interface CatalogColumn<Row> {
  label: string;
  width?: string;
  cell: (row: Row) => ReactNode;
}

export interface CatalogGroup<Row> {
  id: string;
  /** 그룹헤더행 좌측 콘텐츠 (색상·이름·속성 등 — 상위 세그먼트가 구성) */
  header: ReactNode;
  rows: Row[];
  addLabel: string;
  onAdd: () => void;
  /** 있으면 헤더 우측에 '삭제' 버튼 노출 */
  onDelete?: () => void;
  /** false 이면 드래그 비활성(sentinel 그룹용). 기본 true */
  draggable?: boolean;
}

/** 첫 셀 pl-4 pr-2 / 마지막 px-2 pr-4 / 중간 px-2 + 공통 text-sm align-middle whitespace-nowrap */
const cellPad = (first: boolean, last: boolean) =>
  `${first ? 'pl-4 pr-2' : last ? 'px-2 pr-4' : 'px-2'} text-sm align-middle whitespace-nowrap`;

/**
 * 자산마스터 카탈로그 제네릭 테이블 셸.
 * - 그룹 헤더 행 + 데이터 행 (tbody 내 혼합)
 * - 검색 필터: rowMatch 기반, 그룹 내 0건 이면 그룹 숨김, 전체 0건 이면 빈 상태
 * - 드래그 재정렬: 그룹 간(draggable 그룹만) / 그룹 내 행 간
 */
export function CatalogTable<Row>(props: {
  columns: CatalogColumn<Row>[];
  groups: CatalogGroup<Row>[];
  rowKey: (row: Row) => string;
  rowMatch: (row: Row, q: string) => boolean;
  query: string;
  onReorderGroups: (orderedGroupIds: string[]) => void;
  onReorderRows: (groupId: string, orderedRowIds: string[]) => void;
  onAddGroup: () => void;
  addGroupLabel: string;
}): JSX.Element {
  const {
    columns, groups, rowKey, rowMatch, query,
    onReorderGroups, onReorderRows, onAddGroup, addGroupLabel,
  } = props;

  const drag = useRef<{ kind: 'group' | 'row'; groupId: string | null; id: string } | null>(null);

  // 검색 필터
  const q = query.trim();
  const visibleGroups = q
    ? groups
        .map((g) => ({ ...g, visibleRows: g.rows.filter((r) => rowMatch(r, q)) }))
        .filter((g) => g.visibleRows.length > 0)
    : groups.map((g) => ({ ...g, visibleRows: g.rows }));

  const isEmpty = q.length > 0 && visibleGroups.length === 0;

  const lastCol = columns.length - 1;

  // 드래그 그룹 재정렬: draggable 그룹 id 목록 안에서만 splice → onReorderGroups
  const handleGroupDrop = (overId: string) => {
    const d = drag.current;
    if (!d || d.kind !== 'group' || d.id === overId) return;
    const draggableIds = groups.filter((g) => g.draggable !== false).map((g) => g.id);
    const from = draggableIds.indexOf(d.id);
    const to = draggableIds.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...draggableIds];
    next.splice(from, 1);
    next.splice(to, 0, d.id);
    onReorderGroups(next);
  };

  // 드래그 행 재정렬: 동일 groupId 내 행 ids splice → onReorderRows
  const handleRowDrop = (groupId: string, overId: string) => {
    const d = drag.current;
    if (!d || d.kind !== 'row' || d.groupId !== groupId || d.id === overId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const rowIds = group.rows.map((r) => rowKey(r));
    const from = rowIds.indexOf(d.id);
    const to = rowIds.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...rowIds];
    next.splice(from, 1);
    next.splice(to, 0, d.id);
    onReorderRows(groupId, next);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        {isEmpty ? (
          <SectionEmpty>결과가 없습니다.</SectionEmpty>
        ) : (
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="text-left bg-surface-2 border-b border-line-strong">
                {columns.map((c, i) => (
                  <SortableHeaderCell
                    key={i}
                    label={c.label}
                    width={c.width}
                    first={i === 0}
                    last={i === lastCol}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => {
                const isDraggable = g.draggable !== false;
                return (
                  <Fragment key={g.id}>
                    {/* 그룹 헤더 행 */}
                    <tr className="bg-surface-2">
                      <td colSpan={columns.length} className="px-2 py-1">
                        <div
                          className="flex items-center gap-2"
                          draggable={isDraggable || undefined}
                          onDragStart={isDraggable
                            ? () => { drag.current = { kind: 'group', groupId: null, id: g.id }; }
                            : undefined}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={isDraggable ? () => handleGroupDrop(g.id) : undefined}
                        >
                          {g.header}
                          <span className="ml-auto flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={g.onAdd}>
                              {g.addLabel}
                            </Button>
                            {g.onDelete && (
                              <button
                                type="button"
                                onClick={g.onDelete}
                                className="text-xs text-danger hover:opacity-80"
                              >
                                삭제
                              </button>
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* 데이터 행들 */}
                    {g.visibleRows.map((row) => (
                      <tr
                        key={rowKey(row)}
                        className={rowClass(false)}
                        draggable
                        onDragStart={() => { drag.current = { kind: 'row', groupId: g.id, id: rowKey(row) }; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleRowDrop(g.id, rowKey(row))}
                      >
                        {columns.map((c, ci) => (
                          <td key={ci} className={cellPad(ci === 0, ci === lastCol)}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="p-2">
        <Button variant="secondary" size="sm" onClick={onAddGroup}>
          {addGroupLabel}
        </Button>
      </div>
    </div>
  );
}
