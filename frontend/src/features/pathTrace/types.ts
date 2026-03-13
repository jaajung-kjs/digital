import type { CableType } from '../../types/connection';

export interface TraceNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  category: string;
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
  portCount?: number;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
}
