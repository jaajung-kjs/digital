import type { ReactNode } from 'react';
import type { Asset } from '../../../types/asset';
import type { TraceGraph } from '../../trace/traceGraph';
import type { SortType } from '../../../components/grid/useGridSort';

export interface RegisterCtx {
  assets: Asset[];
  cables: unknown[]; // effective Cable rows (descriptor가 좁혀 읽음)
  graph: TraceGraph | null;
  isLoading: boolean;
}
export interface RegisterColumn<Row> {
  label: string;
  width?: string;
  cell(row: Row): ReactNode;
  /** 있으면 정렬 가능 헤더(없으면 정적). */
  sortKey?(row: Row): string | number | null;
  sortType?: SortType; // 기본 'text'
}
export interface RegisterSection<Row> { key: string; title: string; usedLabel: string; rows: Row[] }

export interface RegisterDescriptor<Row> {
  emptyMessage: string;
  /** 컨테이너 자산(OFD / 분전반) 선택. */
  selectContainers(assets: Asset[], substationId: string): Asset[];
  /** 자식(섹션) = parentAssetId===container && assetType.role===childRole. */
  childRole: 'slot' | 'feeder';
  /** 컨테이너 헤더(분전반명 등). 없으면 컨테이너 헤더 미표시. */
  containerHeader?(container: Asset, ctx: RegisterCtx): string | null;
  buildSection(child: Asset, ctx: RegisterCtx): RegisterSection<Row>;
  columns: RegisterColumn<Row>[];
  /** React key. */
  rowKey(row: Row): string | number;
  /** 행 클릭 시 선택할 assetId(null=무시). */
  onRowClick(row: Row, child: Asset): string | null;
  /** 행이 대응하는 코어 번호(없으면 미정의 → 코어 무관 선택). */
  rowCore?(row: Row): number | null;
}
