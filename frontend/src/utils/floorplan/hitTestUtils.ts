/**
 * Hit Test 유틸리티
 * Element 클릭/선택 감지 로직
 */

import type {
  FloorPlanElement,
  FloorPlanEquipment,
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  TextProperties,
} from '../../types/floorPlan';
import { distanceToLineSegment, rotatePointAroundOrigin } from '../geometry/geometryUtils';

// 클릭 여유 픽셀
const CLICK_TOLERANCE = 5;

/**
 * Line Element 히트 테스트
 */
export function hitTestLine(
  x: number,
  y: number,
  props: LineProperties
): boolean {
  if (!props.points || props.points.length < 2) return false;

  const thickness = (props.strokeWidth || 2) / 2 + CLICK_TOLERANCE;

  // 모든 선분에 대해 거리 검사
  for (let i = 0; i < props.points.length - 1; i++) {
    const [x1, y1] = props.points[i];
    const [x2, y2] = props.points[i + 1];
    const dist = distanceToLineSegment(x, y, x1, y1, x2, y2);
    if (dist <= thickness) return true;
  }
  return false;
}

/**
 * Rect Element 히트 테스트
 */
export function hitTestRect(
  x: number,
  y: number,
  props: RectProperties
): boolean {
  const rotation = props.rotation || 0;
  const cx = props.x + props.width / 2;
  const cy = props.y + props.height / 2;
  const rotated = rotatePointAroundOrigin(x, y, cx, cy, rotation);
  const strokeWidth = (props.strokeWidth || 2) / 2 + CLICK_TOLERANCE;
  const isTransparent = !props.fillColor || props.fillColor === 'transparent';

  if (isTransparent) {
    // 투명일 경우 테두리만 클릭 감지
    const inOuter = rotated.x >= props.x - strokeWidth && rotated.x <= props.x + props.width + strokeWidth &&
                   rotated.y >= props.y - strokeWidth && rotated.y <= props.y + props.height + strokeWidth;
    const inInner = rotated.x > props.x + strokeWidth && rotated.x < props.x + props.width - strokeWidth &&
                   rotated.y > props.y + strokeWidth && rotated.y < props.y + props.height - strokeWidth;
    return inOuter && !inInner;
  }

  return rotated.x >= props.x && rotated.x <= props.x + props.width &&
         rotated.y >= props.y && rotated.y <= props.y + props.height;
}

/**
 * Circle Element 히트 테스트
 */
export function hitTestCircle(
  x: number,
  y: number,
  props: CircleProperties
): boolean {
  const dx = x - props.cx;
  const dy = y - props.cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const strokeWidth = (props.strokeWidth || 2) / 2 + CLICK_TOLERANCE;
  const isTransparent = !props.fillColor || props.fillColor === 'transparent';

  if (isTransparent) {
    // 투명일 경우 테두리만 클릭 감지
    return distance >= props.radius - strokeWidth && distance <= props.radius + strokeWidth;
  }

  return distance <= props.radius + CLICK_TOLERANCE;
}

/**
 * Door Element 히트 테스트
 */
export function hitTestDoor(
  x: number,
  y: number,
  props: DoorProperties
): boolean {
  const doorWidth = props.width;
  const doorHeight = props.height || 10;
  const rotation = props.rotation || 0;
  const cx = props.x;
  const cy = props.y;
  const rotated = rotatePointAroundOrigin(x, y, cx, cy, rotation);

  return rotated.x >= props.x && rotated.x <= props.x + doorWidth &&
         rotated.y >= props.y && rotated.y <= props.y + doorHeight;
}

/**
 * Window Element 히트 테스트
 */
export function hitTestWindow(
  x: number,
  y: number,
  props: WindowProperties
): boolean {
  const windowWidth = props.width;
  const windowHeight = props.height || 8;
  const rotation = props.rotation || 0;
  const cx = props.x;
  const cy = props.y;
  const rotated = rotatePointAroundOrigin(x, y, cx, cy, rotation);

  return rotated.x >= props.x && rotated.x <= props.x + windowWidth &&
         rotated.y >= props.y && rotated.y <= props.y + windowHeight;
}

/**
 * Text Element 히트 테스트
 */
export function hitTestText(
  x: number,
  y: number,
  props: TextProperties
): boolean {
  const fontSize = props.fontSize || 14;
  const textWidth = props.text.length * fontSize * 0.6; // 대략적 너비
  const textHeight = fontSize;
  const rotation = props.rotation || 0;
  const rotated = rotatePointAroundOrigin(x, y, props.x, props.y, rotation);

  let offsetX = 0;
  if (props.textAlign === 'center') offsetX = -textWidth / 2;
  else if (props.textAlign === 'right') offsetX = -textWidth;

  return rotated.x >= props.x + offsetX && rotated.x <= props.x + offsetX + textWidth &&
         rotated.y >= props.y && rotated.y <= props.y + textHeight;
}

/**
 * Equipment 히트 테스트
 */
export function hitTestEquipment(
  x: number,
  y: number,
  item: FloorPlanEquipment
): boolean {
  return x >= item.positionX && x <= item.positionX + item.width &&
         y >= item.positionY && y <= item.positionY + item.height;
}

/**
 * Element 타입에 따라 적절한 히트 테스트 수행
 */
export function hitTestElement(
  x: number,
  y: number,
  element: FloorPlanElement
): boolean {
  if (!element.isVisible) return false;

  switch (element.elementType) {
    case 'line':
      return hitTestLine(x, y, element.properties as LineProperties);
    case 'rect':
      return hitTestRect(x, y, element.properties as RectProperties);
    case 'circle':
      return hitTestCircle(x, y, element.properties as CircleProperties);
    case 'door':
      return hitTestDoor(x, y, element.properties as DoorProperties);
    case 'window':
      return hitTestWindow(x, y, element.properties as WindowProperties);
    case 'text':
      return hitTestText(x, y, element.properties as TextProperties);
    default:
      return false;
  }
}

/**
 * 히트 테스트 결과 타입
 */
export type HitTestResult =
  | { type: 'equipment'; item: FloorPlanEquipment }
  | { type: 'element'; item: FloorPlanElement }
  | null;

/**
 * 특정 좌표에서 Element 또는 Equipment 찾기
 * @param x 월드 좌표 X
 * @param y 월드 좌표 Y
 * @param elements Element 배열
 * @param equipment Equipment 배열
 * @returns 찾은 아이템 또는 null
 */
export function findItemAt(
  x: number,
  y: number,
  elements: FloorPlanElement[],
  equipment: FloorPlanEquipment[]
): HitTestResult {
  // 장비 찾기
  const eq = equipment.find(item => hitTestEquipment(x, y, item));
  if (eq) return { type: 'equipment', item: eq };

  // 요소 찾기 (역순으로 검색하여 위에 있는 것 우선)
  const element = [...elements].reverse().find(e => hitTestElement(x, y, e));
  if (element) return { type: 'element', item: element };

  return null;
}
