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

// ── 평면(flat) 조직 타입 — GET /organizations/tree 응답. 워킹카피 컬렉션의 행 타입.
//    WC descriptor 가 idOf/versionOf 만 요구하므로 id + updatedAt 이 필수.
export interface OrgHeadquarters {
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: string;
}
export interface OrgBranch {
  id: string;
  name: string;
  headquartersId: string;
  sortOrder: number;
  updatedAt: string;
}
export interface OrgSubstation {
  id: string;
  name: string;
  branchId: string | null;
  address: string | null;
  sortOrder: number;
  updatedAt: string;
}
export interface OrgFloor {
  id: string;
  name: string;
  substationId: string;
  floorNumber: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface OrgTree {
  headquarters: OrgHeadquarters[];
  branches: OrgBranch[];
  substations: OrgSubstation[];
  floors: OrgFloor[];
}
