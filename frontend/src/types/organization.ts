export type NodeType = 'headquarters' | 'branch' | 'substation' | 'floor' | 'room';

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

export interface RoomItem {
  id: string;
  floorId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
