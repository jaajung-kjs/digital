// 변전소 목록 아이템
export interface SubstationListItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floorCount: number;
  createdAt: string;
}

// 변전소 상세
export interface SubstationDetail {
  id: string;
  name: string;
  code: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floors: {
    id: string;
    name: string;
    floorNumber: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
}

// 변전소 생성 요청
export interface CreateSubstationRequest {
  name: string;
  code: string;
  address?: string;
  description?: string;
}

// 변전소 수정 요청
export interface UpdateSubstationRequest {
  name?: string;
  code?: string;
  address?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// 층 목록 아이템
export interface FloorListItem {
  id: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  hasFloorPlan: boolean;
  rackCount: number;
}

// 층 상세
export interface FloorDetail {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  hasFloorPlan: boolean;
  createdAt: string;
  updatedAt: string;
}

// 층 생성 요청
export interface CreateFloorRequest {
  name: string;
  floorNumber?: string;
  description?: string;
}

// 층 수정 요청
export interface UpdateFloorRequest {
  name?: string;
  floorNumber?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// API 응답 타입
export interface SubstationListResponse {
  substations: SubstationListItem[];
}

export interface FloorListResponse {
  floors: FloorListItem[];
}
