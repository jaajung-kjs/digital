/**
 * FloorPlan 통합 렌더러
 * 모든 Element/Rack 렌더링 함수를 단일 파일로 통합
 */

import type {
  FloorPlanElement,
  RackItem,
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  TextProperties,
} from '../../types/floorPlan';
import { LINE_STYLES } from '../../types/floorPlan';
import { SELECTION_STYLES, ELEMENT_COLORS } from '../canvas/canvasDrawing';
import { roundRect } from '../canvas/canvasTransform';

// ============================================
// 변환 유틸리티
// ============================================

interface TransformParams {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

/**
 * 표준 변환 적용 (translate → rotate → flip)
 */
function applyStandardTransform(
  ctx: CanvasRenderingContext2D,
  params: TransformParams
): void {
  const { x, y, width, height, rotation = 0, flipH = false, flipV = false } = params;

  ctx.translate(x, y);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (flipH || flipV) {
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.translate(-centerX, -centerY);
  }
}

// ============================================
// Line 렌더러
// ============================================

export function renderLine(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as LineProperties;
  if (!props.points || props.points.length < 2) return;

  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : (props.strokeColor || '#1a1a1a');
  ctx.lineWidth = props.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(LINE_STYLES[props.strokeStyle || 'solid']);

  ctx.beginPath();
  ctx.moveTo(props.points[0][0], props.points[0][1]);
  for (let i = 1; i < props.points.length; i++) {
    ctx.lineTo(props.points[i][0], props.points[i][1]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (isSelected) {
    ctx.fillStyle = SELECTION_STYLES.point;
    for (const point of props.points) {
      ctx.beginPath();
      ctx.arc(point[0], point[1], SELECTION_STYLES.pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function renderLinePreview(
  ctx: CanvasRenderingContext2D,
  startPoint: [number, number],
  endPoint: [number, number] | null
): void {
  ctx.fillStyle = SELECTION_STYLES.point;
  ctx.beginPath();
  ctx.arc(startPoint[0], startPoint[1], SELECTION_STYLES.pointRadius, 0, Math.PI * 2);
  ctx.fill();

  if (endPoint) {
    ctx.strokeStyle = SELECTION_STYLES.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(startPoint[0], startPoint[1]);
    ctx.lineTo(endPoint[0], endPoint[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(endPoint[0], endPoint[1], SELECTION_STYLES.pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================
// Rect 렌더러
// ============================================

export function renderRect(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as RectProperties;

  ctx.save();
  applyStandardTransform(ctx, {
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
    rotation: props.rotation,
    flipH: props.flipH,
    flipV: props.flipV,
  });

  if (props.fillColor && props.fillColor !== 'transparent') {
    ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : props.fillColor;
    if (props.cornerRadius > 0) {
      roundRect(ctx, 0, 0, props.width, props.height, props.cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, props.width, props.height);
    }
  }

  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : (props.strokeColor || '#1a1a1a');
  ctx.lineWidth = props.strokeWidth || 2;
  ctx.setLineDash(LINE_STYLES[props.strokeStyle || 'solid']);

  if (props.cornerRadius > 0) {
    roundRect(ctx, 0, 0, props.width, props.height, props.cornerRadius);
    ctx.stroke();
  } else {
    ctx.strokeRect(0, 0, props.width, props.height);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function renderRectPreview(
  ctx: CanvasRenderingContext2D,
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number } | null
): void {
  ctx.fillStyle = SELECTION_STYLES.point;
  ctx.beginPath();
  ctx.arc(startPoint.x, startPoint.y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (endPoint) {
    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);

    ctx.strokeStyle = SELECTION_STYLES.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    ctx.fillStyle = SELECTION_STYLES.stroke;
    ctx.font = '12px sans-serif';
    ctx.fillText(`${Math.round(width)} x ${Math.round(height)}`, x + width / 2 - 30, y - 8);
  }
}

// ============================================
// Circle 렌더러
// ============================================

export function renderCircle(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as CircleProperties;

  if (props.fillColor && props.fillColor !== 'transparent') {
    ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : props.fillColor;
    ctx.beginPath();
    ctx.arc(props.cx, props.cy, props.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : (props.strokeColor || '#1a1a1a');
  ctx.lineWidth = props.strokeWidth || 2;
  ctx.setLineDash(LINE_STYLES[props.strokeStyle || 'solid']);
  ctx.beginPath();
  ctx.arc(props.cx, props.cy, props.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (isSelected) {
    ctx.fillStyle = SELECTION_STYLES.point;
    ctx.beginPath();
    ctx.arc(props.cx, props.cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderCirclePreview(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number
): void {
  ctx.fillStyle = SELECTION_STYLES.point;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (radius > 0) {
    ctx.strokeStyle = SELECTION_STYLES.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ============================================
// Door 렌더러
// ============================================

export function renderDoor(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as DoorProperties;
  const doorHeight = props.height || 10;

  ctx.save();
  applyStandardTransform(ctx, {
    x: props.x,
    y: props.y,
    width: props.width,
    height: doorHeight,
    rotation: props.rotation,
    flipH: props.flipH,
    flipV: props.flipV,
  });

  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.door.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : (props.strokeColor || ELEMENT_COLORS.door.stroke);
  ctx.lineWidth = props.strokeWidth || 2;
  ctx.fillRect(0, 0, props.width, doorHeight);
  ctx.strokeRect(0, 0, props.width, doorHeight);

  // 문 열림 방향 호
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.arc(0, doorHeight, props.width, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

export function renderDoorPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  rotation: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;
  applyStandardTransform(ctx, {
    x: position.x,
    y: position.y,
    width: 60,
    height: 10,
    rotation: rotation,
  });

  ctx.fillStyle = ELEMENT_COLORS.door.fill;
  ctx.strokeStyle = ELEMENT_COLORS.door.stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(0, 0, 60, 10);
  ctx.strokeRect(0, 0, 60, 10);

  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.arc(0, 10, 60, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ============================================
// Window 렌더러
// ============================================

export function renderWindow(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as WindowProperties;
  const windowHeight = props.height || 8;

  ctx.save();
  applyStandardTransform(ctx, {
    x: props.x,
    y: props.y,
    width: props.width,
    height: windowHeight,
    rotation: props.rotation,
    flipH: props.flipH,
    flipV: props.flipV,
  });

  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.window.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : (props.strokeColor || ELEMENT_COLORS.window.stroke);
  ctx.lineWidth = props.strokeWidth || 2;
  ctx.fillRect(0, 0, props.width, windowHeight);
  ctx.strokeRect(0, 0, props.width, windowHeight);

  // 가운데 선
  ctx.beginPath();
  ctx.moveTo(props.width / 2, 0);
  ctx.lineTo(props.width / 2, windowHeight);
  ctx.stroke();

  ctx.restore();
}

export function renderWindowPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  rotation: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;
  applyStandardTransform(ctx, {
    x: position.x,
    y: position.y,
    width: 80,
    height: 8,
    rotation: rotation,
  });

  ctx.fillStyle = ELEMENT_COLORS.window.fill;
  ctx.strokeStyle = ELEMENT_COLORS.window.stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(0, 0, 80, 8);
  ctx.strokeRect(0, 0, 80, 8);

  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(40, 8);
  ctx.stroke();

  ctx.restore();
}

// ============================================
// Text 렌더러
// ============================================

export function renderText(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  const props = element.properties as TextProperties;

  ctx.save();
  ctx.translate(props.x, props.y);
  if (props.rotation) {
    ctx.rotate((props.rotation * Math.PI) / 180);
  }

  ctx.font = `${props.fontWeight || 'normal'} ${props.fontSize || 14}px sans-serif`;
  ctx.fillStyle = isSelected ? SELECTION_STYLES.stroke : (props.color || '#1a1a1a');
  ctx.textAlign = props.textAlign || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(props.text, 0, 0);

  if (isSelected) {
    const textMetrics = ctx.measureText(props.text);
    ctx.strokeStyle = SELECTION_STYLES.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const offsetX = props.textAlign === 'center' ? -textMetrics.width / 2 :
                   props.textAlign === 'right' ? -textMetrics.width : 0;
    ctx.moveTo(offsetX, (props.fontSize || 14) + 2);
    ctx.lineTo(offsetX + textMetrics.width, (props.fontSize || 14) + 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderTextPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number }
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#1a1a1a';
  ctx.textBaseline = 'top';
  ctx.fillText('텍스트', position.x, position.y);
  ctx.restore();
}

// ============================================
// Rack 렌더러
// ============================================

export function renderRack(
  ctx: CanvasRenderingContext2D,
  rack: RackItem,
  isSelected: boolean
): void {
  ctx.save();
  ctx.translate(rack.positionX + rack.width / 2, rack.positionY + rack.height / 2);
  ctx.rotate((rack.rotation * Math.PI) / 180);
  ctx.translate(-rack.width / 2, -rack.height / 2);

  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.fillRect(0, 0, rack.width, rack.height);
  ctx.strokeRect(0, 0, rack.width, rack.height);

  ctx.fillStyle = ELEMENT_COLORS.rack.text;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rack.name, rack.width / 2, rack.height / 2);

  ctx.restore();
}

export function renderRackPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number }
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;

  ctx.fillStyle = ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = 1;
  ctx.fillRect(position.x, position.y, 60, 100);
  ctx.strokeRect(position.x, position.y, 60, 100);

  ctx.fillStyle = ELEMENT_COLORS.rack.text;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('새 랙', position.x + 30, position.y + 50);

  ctx.restore();
}

// ============================================
// 통합 렌더링 함수
// ============================================

/**
 * Element 타입에 따라 렌더러 호출
 */
export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: FloorPlanElement,
  isSelected: boolean
): void {
  if (!element.isVisible) return;

  switch (element.elementType) {
    case 'line': renderLine(ctx, element, isSelected); break;
    case 'rect': renderRect(ctx, element, isSelected); break;
    case 'circle': renderCircle(ctx, element, isSelected); break;
    case 'door': renderDoor(ctx, element, isSelected); break;
    case 'window': renderWindow(ctx, element, isSelected); break;
    case 'text': renderText(ctx, element, isSelected); break;
  }
}

/**
 * 여러 Element를 zIndex 순서로 렌더링
 */
export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: FloorPlanElement[],
  selectedIds: string[]
): void {
  const sorted = [...elements].sort((a, b) => {
    if (a.elementType === 'text' && b.elementType !== 'text') return 1;
    if (a.elementType !== 'text' && b.elementType === 'text') return -1;
    return a.zIndex - b.zIndex;
  });

  sorted.forEach(element => {
    renderElement(ctx, element, selectedIds.includes(element.id));
  });
}

/**
 * 여러 Rack을 렌더링
 */
export function renderRacks(
  ctx: CanvasRenderingContext2D,
  racks: RackItem[],
  selectedIds: string[]
): void {
  racks.forEach(rack => {
    renderRack(ctx, rack, selectedIds.includes(rack.id));
  });
}

// ============================================
// 미리보기 렌더링
// ============================================

export type DrawingToolType = 'line' | 'rect' | 'circle' | 'door' | 'window' | 'rack' | 'text';

/**
 * 오브젝트 배치 미리보기 (패턴 B: 시작점만)
 */
export function renderPlacementPreview(
  ctx: CanvasRenderingContext2D,
  tool: DrawingToolType,
  position: { x: number; y: number },
  _rotation: number = 0
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;

  switch (tool) {
    case 'door': renderDoorPreview(ctx, position, 0); break;
    case 'window': renderWindowPreview(ctx, position, 0); break;
    case 'rack': renderRackPreview(ctx, position); break;
    case 'text': renderTextPreview(ctx, position); break;
  }

  ctx.restore();
}
