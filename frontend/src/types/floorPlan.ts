// 평면도 요소 타입
export type ElementType = 'wall' | 'door' | 'window' | 'column';

export interface WallProperties {
  points: [number, number][];
  thickness: number;
  color: string;
}

export interface DoorProperties {
  x: number;
  y: number;
  width: number;
  wallId?: string;
  openDirection: 'inside' | 'outside';
}

export interface WindowProperties {
  x: number;
  y: number;
  width: number;
  wallId?: string;
}

export interface ColumnProperties {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rect' | 'circle';
}

export type ElementProperties = WallProperties | DoorProperties | WindowProperties | ColumnProperties;

export interface FloorPlanElement {
  id: string;
  elementType: ElementType;
  properties: ElementProperties;
  zIndex: number;
  isVisible: boolean;
}

// 랙 타입
export interface RackItem {
  id: string;
  name: string;
  code: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  totalU: number;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  description: string | null;
  equipmentCount?: number;
  usedU?: number;
}

// 평면도 타입
export interface FloorPlanDetail {
  id: string;
  floorId: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  backgroundColor: string;
  elements: FloorPlanElement[];
  racks: RackItem[];
  version: number;
  updatedAt: string;
}

// API 요청 타입
export interface CreateFloorPlanRequest {
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
}

export interface UpdateFloorPlanRequest {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  backgroundColor?: string;
  elements?: {
    id?: string | null;
    elementType: ElementType;
    properties: ElementProperties;
    zIndex?: number;
    isVisible?: boolean;
  }[];
  racks?: {
    id?: string | null;
    name: string;
    code?: string;
    positionX: number;
    positionY: number;
    width?: number;
    height?: number;
    rotation?: number;
    totalU?: number;
    description?: string;
  }[];
  deletedElementIds?: string[];
  deletedRackIds?: string[];
}

export interface CreateRackRequest {
  name: string;
  code?: string;
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
  rotation?: number;
  totalU?: number;
  description?: string;
}

export interface UpdateRackRequest {
  name?: string;
  code?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  totalU?: number;
  description?: string;
  sortOrder?: number;
}

// 에디터 도구 타입
export type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'column' | 'rack' | 'cable' | 'delete';

// 에디터 상태 타입
export interface EditorState {
  tool: EditorTool;
  selectedIds: string[];
  zoom: number;
  panX: number;
  panY: number;
  gridSnap: boolean;
  gridSize: number;
  showGrid: boolean;
}
