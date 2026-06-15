import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useTraceGraph } from '../../trace/traceGraph';
import { useGridSort, sortRows, type GridSort } from '../../../components/grid/useGridSort';
import { SortableHeaderCell } from '../../../components/grid/SortableHeaderCell';
import { rowClass } from '../../../components/grid/rowClasses';
import type { Asset } from '../../../types/asset';
import type { RegisterColumn, RegisterDescriptor, RegisterSection } from './registerTypes';

const TD = 'px-2 text-[13px] align-middle whitespace-nowrap';

/** 컨테이너 자산 → connectionKind 자식(섹션) → 테이블 → 행클릭 선택. 도메인 로직은 descriptor. */
export function ConnectionRegisterGrid<Row>({ substationId, descriptor }: {
  substationId: string; descriptor: RegisterDescriptor<Row>;
}) {
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables();
  const { graph, isLoading } = useTraceGraph();
  const { sort, cycleSort } = useGridSort();

  // descriptor must be a module-level stable ref
  const groups = useMemo(() => {
    const ctx = { assets, cables: cables as unknown[], graph, isLoading };
    return descriptor.selectContainers(assets, substationId).map((container) => ({
      container,
      header: descriptor.containerHeader?.(container, ctx) ?? null,
      sections: assets
        .filter((a) => a.parentAssetId === container.id && a.assetType?.connectionKind === descriptor.childKind)
        .map((child) => ({ child, section: descriptor.buildSection(child, ctx) })),
    }));
  }, [assets, cables, graph, isLoading, substationId, descriptor]);

  if (!groups.length) return <p className="p-3 text-sm text-content-faint">{descriptor.emptyMessage}</p>;

  return (
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
              rowTraceCableId={descriptor.rowTraceCableId}
              rowSelectedId={(row) => descriptor.onRowClick(row, child)}
              sort={sort}
              cycleSort={cycleSort}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SectionView<Row>({ section, columns, rowKey, rowTraceCableId, rowSelectedId, sort, cycleSort }: {
  section: RegisterSection<Row>;
  columns: RegisterColumn<Row>[];
  rowKey: (row: Row) => string | number;
  rowTraceCableId?: (row: Row) => string | null;
  rowSelectedId: (row: Row) => string | null;
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

  return (
    <section>
      <header className="mb-1.5 flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold text-content">{section.title}</h3>
        <span className="ml-auto text-[12px] tabular-nums text-content-faint">{section.usedLabel}</span>
      </header>
      <table className="w-full border-collapse">
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
          {rows.map((row) => (
            <RowView
              key={rowKey(row)}
              row={row}
              columns={columns}
              traceCableId={rowTraceCableId?.(row) ?? null}
              selectedId={rowSelectedId(row)}
              onClick={() => {
                const id = rowSelectedId(row);
                if (id) useSelectionStore.getState().setSelectedAssetId(id);
              }}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RowView<Row>({ row, columns, traceCableId, selectedId, onClick }: {
  row: Row;
  columns: RegisterColumn<Row>[];
  traceCableId: string | null;
  selectedId: string | null;
  onClick: () => void;
}) {
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const highlighted =
    (!!traceCableId && tracingCableId === traceCableId) ||
    (!!selectedId && selectedAssetId === selectedId);
  return (
    <tr onClick={onClick} className={rowClass(highlighted)}>
      {columns.map((c, i) => <td key={i} className={TD}>{c.cell(row)}</td>)}
    </tr>
  );
}
