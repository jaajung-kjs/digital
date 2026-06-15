import type { ReactNode } from 'react';
import type { Asset } from '../../../types/asset';
import type { TraceGraph } from '../../trace/traceGraph';

export interface RegisterCtx {
  assets: Asset[];
  cables: unknown[]; // effective Cable rows (descriptor가 좁혀 읽음)
  graph: TraceGraph | null;
}
export interface RegisterColumn<Row> { label: string; width?: string; cell(row: Row): ReactNode }
export interface RegisterSection<Row> { key: string; title: string; usedLabel: string; rows: Row[] }

export interface RegisterDescriptor<Row> {
  emptyMessage: string;
  /** 컨테이너 자산(OFD / 분전반) 선택. */
  selectContainers(assets: Asset[], substationId: string): Asset[];
  /** 자식(섹션) = parentAssetId===container && assetType.connectionKind===childKind. */
  childKind: 'conduit' | 'distributor';
  /** 컨테이너 헤더(분전반명 등). 없으면 컨테이너 헤더 미표시. */
  containerHeader?(container: Asset, ctx: RegisterCtx): string | null;
  buildSection(child: Asset, ctx: RegisterCtx): RegisterSection<Row>;
  columns: RegisterColumn<Row>[];
  /** React key. */
  rowKey(row: Row): string | number;
  /** 행 클릭 시 선택할 assetId(null=무시). */
  onRowClick(row: Row, child: Asset): string | null;
  /** 이 행이 활성 하이라이트면 그 trace 시드 cableId(없으면 미정의 → 비활성). */
  rowTraceCableId?(row: Row): string | null;
}
