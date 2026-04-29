// Floor\uAC00 \uB3C4\uBA74(canvas) \uB2E8\uC704 \u2014 \uD2B8\uB9AC leaf
export type NodeType = 'headquarters' | 'branch' | 'substation' | 'floor';

export interface TreeNodeData {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  children: TreeNodeData[];
  childrenLoaded: boolean;
  expanded: boolean;
  meta?: Record<string, any>;
}

export interface HeadquartersItem {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  branchCount: number;
  createdAt: string;
}

export interface BranchItem {
  id: string;
  headquartersId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  substationCount: number;
  createdAt: string;
}

export interface BranchSubstationItem {
  id: string;
  name: string;
  address: string | null;
  floorCount: number;
}

export const NODE_ICONS: Record<NodeType, string> = {
  headquarters: '\uD83C\uDFE2',
  branch: '\uD83C\uDFEC',
  substation: '\u26A1',
  floor: '\uD83D\uDCD0',
};
