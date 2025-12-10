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
import { distance } from '../geometry/geometryUtils';

// ============================================
// 길이 표시 유틸리티
// ============================================

/**
 * 선분 중간에 길이(픽셀) 표시
 * @param zoom 현재 줌 레벨 (100 = 100%)
 */
export function renderLengthLabel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zoom: number = 100,
  color: string = '#1a1a1a',
  backgroundColor: string = 'rgba(255, 255, 255, 0.9)'
): void {
  const length = Math.round(distance(x1, y1, x2, y2));
  if (length < 10) return; // 너무 짧으면 표시 안함

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // 줌에 반비례하는 폰트 크기 (줌이 작을수록 글씨가 커짐)
  const baseFontSize = 12;
  const fontSize = Math.max(10, Math.min(16, baseFontSize * (100 / zoom)));

  const text = `${length}px`;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(text);
  const padding = 3;
  const bgWidth = textMetrics.width + padding * 2;
  const bgHeight = fontSize + padding * 2;

  // 배경
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight);

  // 텍스트
  ctx.fillStyle = color;
  ctx.fillText(text, midX, midY);
  ctx.restore();
}

/**
 * 미리보기용 길이 표시 (반투명 배경)
 */
function renderPreviewLengthLabel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  const length = Math.round(distance(x1, y1, x2, y2));
  if (length < 5) return;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const text = `${length}px`;
  const fontSize = 12;

  ctx.save();
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(text);
  const padding = 4;
  const bgWidth = textMetrics.width + padding * 2;
  const bgHeight = fontSize + padding * 2;

  // 배경
  ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
  ctx.fillRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight);

  // 텍스트
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, midX, midY);
  ctx.restore();
}

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

    // 선분 길이 표시
    renderPreviewLengthLabel(ctx, startPoint[0], startPoint[1], endPoint[0], endPoint[1]);
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
  radius: number,
  endPoint?: { x: number; y: number }
): void {
  ctx.fillStyle = SELECTION_STYLES.point;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (radius > 0) {
    // 원 미리보기
    ctx.strokeStyle = SELECTION_STYLES.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 반지름 선분 미리보기 (중심 → 끝점)
    if (endPoint) {
      ctx.strokeStyle = SELECTION_STYLES.stroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 끝점 표시
      ctx.fillStyle = SELECTION_STYLES.point;
      ctx.beginPath();
      ctx.arc(endPoint.x, endPoint.y, SELECTION_STYLES.pointRadius, 0, Math.PI * 2);
      ctx.fill();

      // 반지름 길이 표시
      renderPreviewLengthLabel(ctx, center.x, center.y, endPoint.x, endPoint.y);
    }
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

// ============================================
// 픽셀 길이 표시 (토글 기능)
// ============================================

/**
 * 모든 Element의 선분 길이 표시
 * Line: 각 선분의 길이
 * Circle: 반지름 길이
 * Rect: 가로/세로 길이
 */
export function renderElementLengths(
  ctx: CanvasRenderingContext2D,
  elements: FloorPlanElement[],
  zoom: number = 100
): void {
  elements.forEach(element => {
    if (!element.isVisible) return;

    if (element.elementType === 'line') {
      const props = element.properties as LineProperties;
      if (!props.points || props.points.length < 2) return;

      // 각 선분에 길이 표시
      for (let i = 0; i < props.points.length - 1; i++) {
        const [x1, y1] = props.points[i];
        const [x2, y2] = props.points[i + 1];
        renderLengthLabel(ctx, x1, y1, x2, y2, zoom);
      }
    } else if (element.elementType === 'circle') {
      const props = element.properties as CircleProperties;
      // 반지름 선분 (중심 → 오른쪽)
      const endX = props.cx + props.radius;
      const endY = props.cy;

      // 반지름 선 그리기
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(props.cx, props.cy);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      renderLengthLabel(ctx, props.cx, props.cy, endX, endY, zoom);
    } else if (element.elementType === 'rect') {
      const props = element.properties as RectProperties;
      // 상단 변
      renderLengthLabel(ctx, props.x, props.y, props.x + props.width, props.y, zoom);
      // 하단 변
      renderLengthLabel(ctx, props.x, props.y + props.height, props.x + props.width, props.y + props.height, zoom);
      // 좌측 변
      renderLengthLabel(ctx, props.x, props.y, props.x, props.y + props.height, zoom);
      // 우측 변
      renderLengthLabel(ctx, props.x + props.width, props.y, props.x + props.width, props.y + props.height, zoom);
    }
  });
}

/**
 * 모든 Rack의 가로/세로 길이 표시
 */
export function renderRackLengths(
  ctx: CanvasRenderingContext2D,
  racks: RackItem[],
  zoom: number = 100
): void {
  racks.forEach(rack => {
    // 가로 (상단 변)
    renderLengthLabel(ctx, rack.positionX, rack.positionY, rack.positionX + rack.width, rack.positionY, zoom);
    // 세로 (좌측 변)
    renderLengthLabel(ctx, rack.positionX, rack.positionY, rack.positionX, rack.positionY + rack.height, zoom);
  });
}
