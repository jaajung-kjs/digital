import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useTraceGraph } from '../../trace/traceGraph';
import { useGridSort, sortRows, type GridSort } from '../../../components/grid/useGridSort';
import { SortableHeaderCell } from '../../../components/grid/SortableHeaderCell';
import { rowClass } from '../../../components/grid/rowClasses';
import type { Asset } from '../../../types/asset';
import type { RegisterColumn, RegisterDescriptor, RegisterSection } from './registerTypes';

const cellPad = (first: boolean, last: boolean) => (first ? 'pl-4 pr-2' : last ? 'px-2 pr-4' : 'px-2');
const TD_BASE = 'text-sm align-middle whitespace-nowrap';

/** 컨테이너 자산 → role 별 자식(섹션) → 테이블 → 행클릭 선택. 도메인 로직은 descriptor. */
export function ConnectionRegisterGrid<Row>({ substationId, descriptor }: {
  substationId: string; descriptor: RegisterDescriptor<Row>;
}) {
  const assets = useEffectiveAssets() as Asset[];
  const { graph, isLoading } = useTraceGraph();
  const { sort, cycleSort } = useGridSort();

  // descriptor must be a module-level stable ref
  const groups = useMemo(() => {
    const ctx = { assets, cables: (graph?.cables ?? []) as unknown[], graph, isLoading };
    return descriptor.selectContainers(assets, substationId).map((container) => ({
      container,
      header: descriptor.containerHeader?.(container, ctx) ?? null,
      sections: assets
        .filter((a) => a.parentAssetId === container.id && a.assetType?.role === descriptor.childRole)
        .map((child) => ({ child, section: descriptor.buildSection(child, ctx) })),
    }));
  }, [assets, graph, isLoading, substationId, descriptor]);

  if (!groups.length) return <p className="p-3 text-sm text-content-faint">{descriptor.emptyMessage}</p>;

  return (
    // 가용 폭을 채운다(사이드패널 닫히면 표도 확장). 컬럼이 많으면 minWidthClass 로 최소 폭을
    // 두고 그 미만에선 가로 스크롤(글씨 겹침 방지).
    <div className="space-y-6">
      {groups.map(({ container, header, sections }) => (
        <div key={container.id} className="space-y-4">
          {header && <h2 className="px-1 text-sm font-bold text-content">{header}</h2>}
          {sections.map(({ child, section }) => (
            <SectionView
              key={child.id}
              section={section}
              columns={descriptor.columns}
              rowKey={descriptor.rowKey}
              rowSelectedId={(row) => descriptor.onRowClick(row, child)}
              rowCore={(row) => descriptor.rowCore?.(row) ?? null}
              sort={sort}
              cycleSort={cycleSort}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// 컬럼당 최소 가독 폭(rem) — width 미지정 컬럼의 대체값.
const MIN_COL_REM = 6;
// Tailwind width 클래스(w-N = N×0.25rem) → rem. 표 minWidth 계산용(컬럼 폭 합).
const colRem = (w?: string): number => {
  const m = w?.match(/^w-(\d+(?:\.\d+)?)$/);
  return m ? parseFloat(m[1]) * 0.25 : MIN_COL_REM;
};

function SectionView<Row>({ section, columns, rowKey, rowSelectedId, rowCore, sort, cycleSort }: {
  section: RegisterSection<Row>;
  columns: RegisterColumn<Row>[];
  rowKey: (row: Row) => string | number;
  rowSelectedId: (row: Row) => string | null;
  rowCore: (row: Row) => number | null;
  sort: GridSort;
  cycleSort: (col: string) => void;
}) {
  const rows = useMemo(() => {
    if (!sort) return section.rows;
    const col = columns.find((c) => c.label === sort.col);
    if (!col?.sortKey) return section.rows;
    return sortRows(section.rows, col.sortKey, col.sortType ?? 'text', sort.dir);
  }, [section.rows, sort, columns]);

  const last = columns.length - 1;
  // 표 최소폭 = 실제 컬럼 width 합(컬럼수 추정이 아님). 사이드패널로 컨테이너가 이보다 좁아지면
  // overflow-x-auto 가로 스크롤 → table-fixed 가 컬럼을 짜부라뜨려 글씨 겹치는 것을 방지(모든 그리드 공통).
  const minWidthRem = columns.reduce((s, c) => s + colRem(c.width), 0);

  return (
    <section>
      <header className="mb-1.5 flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold text-content">{section.title}</h3>
        <span className="ml-auto text-xs tabular-nums text-content-faint">{section.usedLabel}</span>
      </header>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse table-fixed" style={{ minWidth: `${minWidthRem}rem` }}>
        <thead>
          <tr className="text-left bg-surface-2 border-b border-line-strong">
            {columns.map((c, i) => (
              <SortableHeaderCell
                key={i}
                label={c.label}
                width={c.width}
                first={i === 0}
                last={i === last}
                sortable={!!c.sortKey}
                active={sort?.col === c.label}
                dir={sort?.dir ?? 'asc'}
                onClick={c.sortKey ? () => cycleSort(c.label) : undefined}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const core = rowCore(row);
            return (
              <RowView
                key={rowKey(row)}
                row={row}
                columns={columns}
                selectedId={rowSelectedId(row)}
                rowCore={core}
                onClick={() => {
                  const id = rowSelectedId(row);
                  if (id) useSelectionStore.getState().setSelected(id, core);
                }}
              />
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function RowView<Row>({ row, columns, selectedId, rowCore, onClick }: {
  row: Row;
  columns: RegisterColumn<Row>[];
  selectedId: string | null;
  rowCore: number | null;
  onClick: () => void;
}) {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const selectedCore = useSelectionStore((s) => s.selectedCore);
  const highlighted = !!selectedId && selectedAssetId === selectedId && (rowCore ?? null) === (selectedCore ?? null);
  return (
    <tr onClick={onClick} className={rowClass(highlighted)}>
      {columns.map((c, i) => (
        <td key={i} className={`${TD_BASE} ${cellPad(i === 0, i === columns.length - 1)}`}>{c.cell(row)}</td>
      ))}
    </tr>
  );
}
