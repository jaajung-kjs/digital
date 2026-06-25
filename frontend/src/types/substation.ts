// 층 목록 아이템
export interface FloorListItem {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
}

// 층 상세
export interface FloorDetail {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

