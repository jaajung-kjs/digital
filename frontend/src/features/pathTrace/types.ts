import type { CableType } from '../../types/connection';

export interface TraceNode {
  equipmentId: string;
  equipmentName: string;
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
  sourceEquipmentId: string;
  targetEquipmentId: string;
  type: 'cable' | 'fiberPath';
  cableType?: CableType;
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

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
  segments: PathSegment[];
}

/** A node in a path segment with its incoming edge (ID references) */
export interface SegmentNode {
  nodeId: string;
  /** Edge ID connecting from previous node in this segment (null for segment start) */
  edgeId: string | null;
}

/**
 * A linear segment of directly connected nodes.
 * Branch segments reference the node they fork from.
 */
export interface PathSegment {
  nodes: SegmentNode[];
  /** equipmentId of the node this branch forks from (null for main segment) */
  branchPointId: string | null;
}
