// 평면도 요소 타입.
// 사용자가 직접 그리는 툴은 EditorTool에서 좁혀져 있지만 (text/conduit/tray/pullbox만),
// ElementType 자체는 넓게 유지한다 — DWG에서 promote될 line/rect 같은 케이스를 위해.
export type ElementType = 'line' | 'rect' | 'circle' | 'door' | 'window' | 'text' | 'conduit' | 'tray' | 'pullbox';

// 선 속성 (기존 WallProperties 대체)
export interface LineProperties {
  points: [number, number][];
  strokeWidth: number;        // 1-20, 기본 2
  strokeColor: string;        // 기본 '#1a1a1a'
  strokeStyle: 'solid' | 'dashed' | 'dotted';  // 기본 'solid'
}

// 사각형 속성 (기존 ColumnProperties 대체)
export interface RectProperties {
  x: number;
  y: number;
  width: number;              // 최소 10
  height: number;             // 최소 10
  rotation: number;           // 0-360
  flipH: boolean;             // 수평 반전
  flipV: boolean;             // 수직 반전
  fillColor: string;          // 기본 'transparent'
  strokeColor: string;        // 기본 '#1a1a1a'
  strokeWidth: number;        // 기본 2
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  cornerRadius: number;       // 둥근 모서리, 기본 0
  height3d?: number;          // 3D 높이
  elevation3d?: number;       // 3D 높이 오프셋
}

// 원 속성 (신규)
export interface CircleProperties {
  cx: number;                 // 중심 X
  cy: number;                 // 중심 Y
  radius: number;             // 반지름, 최소 5
  fillColor: string;          // 기본 'transparent'
  strokeColor: string;        // 기본 '#1a1a1a'
  strokeWidth: number;        // 기본 2
  strokeStyle: 'solid' | 'dashed' | 'dotted';
}

// 문 속성 (확장)
export interface DoorProperties {
  x: number;
  y: number;
  width: number;              // 40-200, 기본 60
  height: number;             // 문 두께, 6-20, 기본 10
  rotation: number;           // 0, 90, 180, 270
  flipH: boolean;             // 수평 반전 (힌지 위치)
  flipV: boolean;             // 수직 반전 (열림 방향)
  openDirection: 'inside' | 'outside';
  strokeWidth: number;        // 기본 2
  strokeColor: string;        // 기본 '#d97706'
  wallId?: string;            // 레거시 호환
  height3d?: number;          // 3D 높이
  elevation3d?: number;       // 3D 높이 오프셋
}

// 창문 속성 (확장)
export interface WindowProperties {
  x: number;
  y: number;
  width: number;              // 40-300, 기본 80
  height: number;             // 창문 두께, 4-16, 기본 8
  rotation: number;           // 0, 90, 180, 270
  flipH: boolean;             // 수평 반전
  flipV: boolean;             // 수직 반전
  strokeWidth: number;        // 기본 2
  strokeColor: string;        // 기본 '#0284c7'
  wallId?: string;            // 레거시 호환
  height3d?: number;          // 3D 높이
  elevation3d?: number;       // 3D 높이 오프셋
}

// 텍스트 속성 (신규)
export interface TextProperties {
  x: number;
  y: number;
  text: string;
  fontSize: number;           // 10-72, 기본 14
  fontWeight: 'normal' | 'bold';  // 기본 'normal'
  color: string;              // 기본 '#1a1a1a'
  rotation: number;           // 0-360
  textAlign: 'left' | 'center' | 'right';  // 기본 'left'
}

export type ElementProperties =
  | LineProperties
  | RectProperties
  | CircleProperties
  | DoorProperties
  | WindowProperties
  | TextProperties;

export interface FloorPlanElement {
  id: string;
  elementType: ElementType;
  properties: ElementProperties;
  zIndex: number;
  isVisible: boolean;
  materialCategoryId?: string | null;
  specParams?: Record<string, unknown> | null;
  pathLength?: number | null;
}

// 평면도 장비 타입 (Rack 통합)
export interface FloorPlanEquipment {
  id: string;
  name: string;
  category: string;
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
  parentEquipmentId?: string | null;  // ID of parent EQP-RACK equipment (rack containment)
  startU?: number | null;             // U-slot position in rack
  heightU?: number | null;            // Height in U units
}

// 평면도 타입
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
  scaleRatio?: number | null; // 1px = ?mm
  backgroundDrawing?: BackgroundDrawing | null;
  backgroundOpacity?: number;
  elements: FloorPlanElement[];
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

// API 요청 타입
export interface UpdateFloorPlanRequest {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  scaleRatio?: number | null;
  elements?: {
    id?: string | null;
    elementType: ElementType;
    properties: ElementProperties;
    zIndex?: number;
    isVisible?: boolean;
    materialCategoryId?: string | null;
    specParams?: Record<string, unknown> | null;
    pathLength?: number | null;
  }[];
  equipment?: {
    id?: string | null;
    tempId?: string;
    name: string;
    category?: string;
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
    specParams?: Record<string, unknown> | null;
    parentEquipmentId?: string | null;
    startU?: number | null;
    heightU?: number | null;
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

export interface CreateFloorPlanEquipmentRequest {
  name: string;
  category?: string;
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
  rotation?: number;
  description?: string;
}

export interface UpdateFloorPlanEquipmentRequest {
  name?: string;
  category?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  description?: string;
}


// 평면도 위 장비 아이템
export interface EquipmentItem {
  id: string;
  name: string;
  model?: string;
  manufacturer?: string;
  category: string;
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
}

// 에디터 도구 타입
// DWG 임포트가 도면 윤곽을 담당하므로 line/rect/circle/door/window 도구는 제거.
// 랙은 별도 도구 없이 설비(equipment) 도구로 EQP-RACK 카테고리 선택 시 자동 생성.
export type EditorTool = 'select' | 'equipment' | 'text' | 'cable' | 'conduit' | 'tray' | 'pullbox' | 'delete';


// 선 스타일 옵션
export const LINE_STYLES = {
  solid: [],
  dashed: [8, 4],
  dotted: [2, 2],
};

// 색상 프리셋
export const COLOR_PRESETS = [
  '#1a1a1a', '#374151', '#6b7280',  // 회색 계열
  '#dc2626', '#ea580c', '#d97706',  // 따뜻한 색
  '#16a34a', '#0d9488', '#0284c7',  // 차가운 색
  '#2563eb', '#7c3aed', '#c026d3',  // 보라/분홍
  'transparent',                     // 투명
];
