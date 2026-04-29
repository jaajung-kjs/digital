// ============================================
// 평면도 (Floor Plan) 타입
// ============================================
// 사용자는 설비(Equipment) 배치와 케이블(Cable) 연결만 한다.
// 도면 윤곽은 임포트한 backgroundDrawing(DWG)이 담당한다.

// 평면도 장비 — EQP-RACK 카테고리는 totalU(슬롯 수)를 가지며,
// 자식 설비는 parentEquipmentId + startU + heightU로 부모 랙에 장착됨.
//
// NOTE: Equipment 자체에는 더 이상 `category` 필드가 없다. 그루핑/식별은
// `materialCategoryCode` (예: 'EQP-OFD', 'EQP-RACK') 로 한다.
export interface FloorPlanEquipment {
  id: string;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  description?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  manager?: string | null;
  height3d?: number;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  displayColor?: string | null;
  materialId?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  parentEquipmentId?: string | null; // 부모 EQP-RACK equipment ID (랙 장착 슬롯용)
  startU?: number | null;
  heightU?: number | null;
  totalU?: number | null; // EQP-RACK 설비의 슬롯 수
}

// 평면도 케이블
export interface FloorPlanCable {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: string;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  displayColor?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  totalLength?: number | null;
  label?: string | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
}

export interface FloorPlanFiberPath {
  id: string;
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string | null;
}

export interface FloorPlanDetail {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  scaleRatio?: number | null;
  backgroundDrawing?: BackgroundDrawing | null;
  backgroundOpacity?: number;
  equipment: FloorPlanEquipment[];
  cables: FloorPlanCable[];
  fiberPaths: FloorPlanFiberPath[];
  version: number;
  updatedAt: string;
}

// ============================================
// 임포트된 배경 도면 (DWG/DXF에서 추출)
// ============================================

export interface BackgroundOutline {
  /** 각 폴리라인은 [x1,y1,x2,y2,...] flat 배열 */
  polylines: number[][];
  color: string;
  strokeWidth: number;
}

export interface BackgroundLabel {
  x: number;
  y: number;
  text: string;
  size: number;
}

export interface BackgroundDrawing {
  source: { fileName: string; importedAt: string; fileType: 'DWG' | 'DXF' };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  scaleMmPerUnit: number;
  outline: BackgroundOutline | null;
  labels: BackgroundLabel[];
  outlineLayers: string[];
  labelLayers: string[];
}

export interface DwgLayerInfo {
  name: string;
  entityCount: number;
  byType: Record<string, number>;
  polylineRatio: number;
  hasText: boolean;
  outlineScore: number;
}

export interface DwgImportResult {
  backgroundDrawing: BackgroundDrawing;
  availableLayers: DwgLayerInfo[];
  smartChoice: { outline: string[]; labels: string[] };
  committed: boolean;
}

// ============================================
// API 요청 타입
// ============================================

export interface UpdateFloorPlanRequest {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  scaleRatio?: number | null;
  backgroundOpacity?: number;
  equipment?: {
    id?: string | null;
    tempId?: string;
    name: string;
    positionX: number;
    positionY: number;
    width?: number;
    height?: number;
    rotation?: number;
    description?: string;
    model?: string;
    manufacturer?: string;
    manager?: string;
    materialCategoryId?: string | null;
    materialCategoryCode?: string | null;
    specParams?: Record<string, unknown> | null;
    parentEquipmentId?: string | null;
    startU?: number | null;
    heightU?: number | null;
    totalU?: number | null;
  }[];
  cables?: {
    id?: string | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
    materialCategoryId?: string | null;
    materialCategoryCode?: string | null;
    specParams?: Record<string, unknown> | null;
    pathPoints?: [number, number][] | null;
    pathLength?: number | null;
    bufferLength?: number;
    totalLength?: number | null;
    fiberPathId?: string | null;
    fiberPortNumber?: number | null;
    description?: string | null;
  }[];
  fiberPaths?: {
    id: string;
    ofdAId: string;
    ofdBId: string;
    portCount: number;
    description?: string;
  }[];
  deletedFiberPathIds?: string[];
}

// 평면도 위 장비 아이템 (테이블/요약 표시용)
export interface EquipmentItem {
  id: string;
  name: string;
  model?: string;
  manufacturer?: string;
  floorId: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation: number;
  height3d?: number;
  frontImageUrl?: string;
  rearImageUrl?: string;
  manager?: string;
  description?: string;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
}

// 에디터 도구
export type EditorTool = 'select' | 'equipment' | 'cable';
