import type { ReactNode } from 'react';
import type { Asset } from '../../../types/asset';
import type { TraceGraph } from '../../trace/traceGraph';
import type { SortType } from '../../../components/grid/useGridSort';

export interface RegisterCtx {
  assets: Asset[];
  cables: unknown[]; // effective Cable rows (descriptor가 좁혀 읽음)
  graph: TraceGraph | null;
  isLoading: boolean;
  /** 대국 자산 이름 해소 맵 — graph.nameById miss 시 폴백(useAssetRefs 결과). */
  refs?: Map<string, { name: string }>;
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
  /**
   * descriptor 가 알고 있는 대국 자산 id 목록 반환 — grid 가 useAssetRefs 호출용으로 수집.
   * 구현하지 않으면 grid 가 useAssetRefs 를 빈 배열로 호출(no-op).
   * fiber 만 구현, power 는 미구현.
   */
  collectRemoteIds?(assets: Asset[], cables: unknown[], graph: TraceGraph | null): string[];
  columns: RegisterColumn<Row>[];
  /** React key. */
  rowKey(row: Row): string | number;
  /** 행 클릭 시 선택할 assetId(null=무시). */
  onRowClick(row: Row, child: Asset): string | null;
  /** 행이 대응하는 코어 번호(없으면 미정의 → 코어 무관 선택). */
  rowCore?(row: Row): number | null;
}
