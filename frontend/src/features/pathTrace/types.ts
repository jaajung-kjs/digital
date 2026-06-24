export interface TraceNode {
  nodeId: string;
  nodeName: string;
  substationId: string;
  substationName: string;
  floorId: string | null;
  /** MaterialCategory.code (e.g. 'EQP-OFD'); replaces the legacy enum-based category. */
  materialCategoryCode?: string | null;
  isSource: boolean;
  isTarget: boolean;
}

export interface TraceEdge {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  type: 'cable' | 'fiberPath';
  label?: string;
  length?: number;
  fiberPathId?: string;
  fiberPathLabel?: string;
  portCount?: number;
  fiberPortNumber?: number;
  materialCategoryCode?: string;
  materialCategoryName?: string;
  displayColor?: string;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  /** 0 = fundamental (소링), 1 = composite (대링) */
  level: number;
  /** For composite rings: IDs of the fundamental rings inside */
  childRingIds: string[];
}
