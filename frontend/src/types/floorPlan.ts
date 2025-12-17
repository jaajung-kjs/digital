// 평면도 요소 타입 (v2 - CAD 스타일)
// 기존: 'wall' | 'door' | 'window' | 'column'
// 신규: 'line' | 'rect' | 'circle' | 'door' | 'window' | 'text'
export type ElementType = 'line' | 'rect' | 'circle' | 'door' | 'window' | 'text';

// 레거시 타입 (마이그레이션용)
export type LegacyElementType = 'wall' | 'door' | 'window' | 'column';

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

// 레거시 속성 타입 (마이그레이션용)
export interface LegacyWallProperties {
  points: [number, number][];
  thickness: number;
  color: string;
}

export interface LegacyColumnProperties {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rect' | 'circle';
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
  isLocked: boolean;          // 신규: 잠금 상태
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
  majorGridSize: number;
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
  majorGridSize?: number;
}

export interface UpdateFloorPlanRequest {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  elements?: {
    id?: string | null;
    elementType: ElementType;
    properties: ElementProperties;
    zIndex?: number;
    isVisible?: boolean;
    isLocked?: boolean;
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

// 에디터 도구 타입 (v2 - CAD 스타일)
// 기존: 'select' | 'wall' | 'door' | 'window' | 'column' | 'rack' | 'cable' | 'delete'
// 신규: 'select' | 'line' | 'rect' | 'circle' | 'door' | 'window' | 'rack' | 'text' | 'delete'
export type EditorTool = 'select' | 'line' | 'rect' | 'circle' | 'door' | 'window' | 'rack' | 'text' | 'delete';

// 에디터 상태 타입
export interface EditorState {
  tool: EditorTool;
  selectedIds: string[];
  zoom: number;
  panX: number;
  panY: number;
  gridSnap: boolean;
  gridSize: number;
  majorGridSize: number;
  showGrid: boolean;
}

// 카메라 시스템 (무한 캔버스)
export interface Camera {
  x: number;          // 팬 X (월드 좌표, 음수 가능)
  y: number;          // 팬 Y (월드 좌표, 음수 가능)
  zoom: number;       // 줌 레벨 (0.1 ~ 10.0, 즉 10% ~ 1000%)
}

// 선택 시스템
export interface SelectionState {
  selectedIds: string[];
  selectionBox: SelectionBox | null;
  activeGrip: Grip | null;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  mode: 'contain' | 'intersect';
}

// Grip 시스템
export type GripType =
  | 'corner-nw' | 'corner-ne' | 'corner-se' | 'corner-sw'
  | 'edge-n' | 'edge-e' | 'edge-s' | 'edge-w'
  | 'rotation'
  | 'endpoint-start' | 'endpoint-end';

export interface Grip {
  type: GripType;
  position: { x: number; y: number };
  cursor: string;
  elementId: string;
}

// 클립보드 데이터
export interface ClipboardData {
  type: 'floorplan-clipboard';
  version: 1;
  timestamp: number;
  elements: FloorPlanElement[];
  racks: RackItem[];
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

// ============================================
// 데이터 마이그레이션 유틸리티
// ============================================

/**
 * 레거시 요소를 새 형식으로 마이그레이션
 * wall → line, column → rect
 */
export function migrateElement(element: {
  id: string;
  elementType: string;
  properties: Record<string, unknown>;
  zIndex: number;
  isVisible: boolean;
  isLocked?: boolean;
}): FloorPlanElement {
  const baseElement = {
    id: element.id,
    zIndex: element.zIndex,
    isVisible: element.isVisible,
    isLocked: element.isLocked ?? false,
  };

  switch (element.elementType) {
    case 'wall': {
      // wall → line
      const props = element.properties as unknown as LegacyWallProperties;
      return {
        ...baseElement,
        elementType: 'line',
        properties: {
          points: props.points,
          strokeWidth: props.thickness || 2,
          strokeColor: props.color || '#1a1a1a',
          strokeStyle: 'solid',
        } as LineProperties,
      };
    }

    case 'column': {
      // column → rect (또는 circle)
      const props = element.properties as unknown as LegacyColumnProperties;

      if (props.shape === 'circle') {
        // 원형 기둥은 circle로 변환
        return {
          ...baseElement,
          elementType: 'circle',
          properties: {
            cx: props.x + props.width / 2,
            cy: props.y + props.height / 2,
            radius: Math.min(props.width, props.height) / 2,
            fillColor: '#6b7280',
            strokeColor: '#374151',
            strokeWidth: 2,
            strokeStyle: 'solid',
          } as CircleProperties,
        };
      } else {
        // 사각형 기둥은 rect로 변환
        return {
          ...baseElement,
          elementType: 'rect',
          properties: {
            x: props.x,
            y: props.y,
            width: props.width,
            height: props.height,
            rotation: 0,
            flipH: false,
            flipV: false,
            fillColor: '#6b7280',
            strokeColor: '#374151',
            strokeWidth: 2,
            strokeStyle: 'solid',
            cornerRadius: 0,
          } as RectProperties,
        };
      }
    }

    case 'door': {
      // door 확장
      const props = element.properties as Record<string, unknown>;
      return {
        ...baseElement,
        elementType: 'door',
        properties: {
          x: (props.x as number) || 0,
          y: (props.y as number) || 0,
          width: (props.width as number) || 60,
          height: (props.height as number) || 10,
          rotation: (props.rotation as number) || 0,
          flipH: (props.flipH as boolean) || false,
          flipV: (props.flipV as boolean) || false,
          openDirection: (props.openDirection as 'inside' | 'outside') || 'inside',
          strokeWidth: (props.strokeWidth as number) || 2,
          strokeColor: (props.strokeColor as string) || '#d97706',
          wallId: props.wallId as string | undefined,
        } as DoorProperties,
      };
    }

    case 'window': {
      // window 확장
      const props = element.properties as Record<string, unknown>;
      return {
        ...baseElement,
        elementType: 'window',
        properties: {
          x: (props.x as number) || 0,
          y: (props.y as number) || 0,
          width: (props.width as number) || 80,
          height: (props.height as number) || 8,
          rotation: (props.rotation as number) || 0,
          flipH: (props.flipH as boolean) || false,
          flipV: (props.flipV as boolean) || false,
          strokeWidth: (props.strokeWidth as number) || 2,
          strokeColor: (props.strokeColor as string) || '#0284c7',
          wallId: props.wallId as string | undefined,
        } as WindowProperties,
      };
    }

    case 'line': {
      // 이미 line 타입인 경우
      const props = element.properties as unknown as LineProperties;
      return {
        ...baseElement,
        elementType: 'line',
        properties: {
          points: props.points,
          strokeWidth: props.strokeWidth || 2,
          strokeColor: props.strokeColor || '#1a1a1a',
          strokeStyle: props.strokeStyle || 'solid',
        },
      };
    }

    case 'rect': {
      // 이미 rect 타입인 경우
      const props = element.properties as unknown as RectProperties;
      return {
        ...baseElement,
        elementType: 'rect',
        properties: {
          x: props.x,
          y: props.y,
          width: props.width,
          height: props.height,
          rotation: props.rotation || 0,
          flipH: props.flipH || false,
          flipV: props.flipV || false,
          fillColor: props.fillColor || 'transparent',
          strokeColor: props.strokeColor || '#1a1a1a',
          strokeWidth: props.strokeWidth || 2,
          strokeStyle: props.strokeStyle || 'solid',
          cornerRadius: props.cornerRadius || 0,
        },
      };
    }

    case 'circle': {
      // 이미 circle 타입인 경우
      const props = element.properties as unknown as CircleProperties;
      return {
        ...baseElement,
        elementType: 'circle',
        properties: {
          cx: props.cx,
          cy: props.cy,
          radius: props.radius,
          fillColor: props.fillColor || 'transparent',
          strokeColor: props.strokeColor || '#1a1a1a',
          strokeWidth: props.strokeWidth || 2,
          strokeStyle: props.strokeStyle || 'solid',
        },
      };
    }

    case 'text': {
      // 이미 text 타입인 경우
      const props = element.properties as unknown as TextProperties;
      return {
        ...baseElement,
        elementType: 'text',
        properties: {
          x: props.x,
          y: props.y,
          text: props.text || '',
          fontSize: props.fontSize || 14,
          fontWeight: props.fontWeight || 'normal',
          color: props.color || '#1a1a1a',
          rotation: props.rotation || 0,
          textAlign: props.textAlign || 'left',
        },
      };
    }

    default:
      // 알 수 없는 타입은 line으로 기본 처리
      console.warn(`Unknown element type: ${element.elementType}, converting to line`);
      return {
        ...baseElement,
        elementType: 'line',
        properties: {
          points: [[0, 0], [100, 100]],
          strokeWidth: 2,
          strokeColor: '#1a1a1a',
          strokeStyle: 'solid',
        } as LineProperties,
      };
  }
}

/**
 * 전체 평면도 데이터 마이그레이션
 */
export function migrateFloorPlanElements(elements: Array<{
  id: string;
  elementType: string;
  properties: Record<string, unknown>;
  zIndex: number;
  isVisible: boolean;
  isLocked?: boolean;
}>): FloorPlanElement[] {
  return elements.map(migrateElement);
}

/**
 * 레거시 타입인지 확인
 */
export function isLegacyElementType(type: string): boolean {
  return type === 'wall' || type === 'column';
}

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
