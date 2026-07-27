/**
 * resize.ts — 리사이즈 핸들 수학 (순수 함수, TDD)
 *
 * 8핸들 정의:
 *   fx/fy 는 핸들이 사각형의 어느 비율 위치에 있는지 (0=좌/상, 0.5=중간, 1=우/하)
 *   - 드래그 시 fx=0 이면 좌변 이동 (우변=고정), fx=1 이면 우변 이동 (좌변=고정)
 *   - fy=0 이면 상변 이동 (하변=고정), fy=1 이면 하변 이동 (상변=고정)
 *   - fx=0.5 이면 x축 변화 없음 (상/하 엣지 핸들), fy=0.5 이면 y축 변화 없음
 */

export type HandleKey = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';

export interface Handle {
  key: HandleKey;
  fx: 0 | 0.5 | 1;
  fy: 0 | 0.5 | 1;
}

export const HANDLES: Handle[] = [
  { key: 'tl', fx: 0, fy: 0 },
  { key: 't',  fx: 0.5, fy: 0 },
  { key: 'tr', fx: 1, fy: 0 },
  { key: 'r',  fx: 1, fy: 0.5 },
  { key: 'br', fx: 1, fy: 1 },
  { key: 'b',  fx: 0.5, fy: 1 },
  { key: 'bl', fx: 0, fy: 1 },
  { key: 'l',  fx: 0, fy: 0.5 },
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 핸들 드래그를 월드 델타에 적용해 새 rect 를 반환.
 *
 * 반대변 고정 원칙:
 *   - fx=0 → 좌변이 이동, 우변(x+width) 고정
 *   - fx=1 → 우변이 이동, 좌변(x) 고정
 *   - fx=0.5 → x 축 변화 없음
 *   - fy 동일 원칙
 *
 * minSize 클램프: width/height 이 minSize 미만이 되면 clamp.
 *   - 좌변/상변 이동 시 clamp된 크기에 맞춰 x/y 를 재계산 (반대변 유지).
 *
 * @param rect 현재 사각형
 * @param handleKey 드래그 중인 핸들 키
 * @param worldDelta 월드 좌표 델타 {x, y}
 * @param minSize 최소 크기 (기본 20)
 * @param snapFn 선택적 스냅 함수 (결과 rect 의 x/y/width/height 에 적용)
 */
export function applyResize(
  rect: Rect,
  handleKey: HandleKey,
  worldDelta: { x: number; y: number },
  minSize: number = 20,
  snapFn?: (val: number) => number,
): Rect {
  const handle = HANDLES.find((h) => h.key === handleKey);
  if (!handle) return rect;

  const snap = snapFn ?? ((v: number) => v);

  // 현재 고정 엣지 (월드 좌표)
  const fixedRight = rect.x + rect.width;   // fx=0 (좌변 이동) 시 우변 고정
  const fixedBottom = rect.y + rect.height; // fy=0 (상변 이동) 시 하변 고정

  let newX = rect.x;
  let newY = rect.y;
  let newWidth = rect.width;
  let newHeight = rect.height;

  // X 축 처리
  if (handle.fx === 0) {
    // 좌변 이동, 우변 고정
    const rawNewX = snap(rect.x + worldDelta.x);
    const clampedX = Math.min(rawNewX, fixedRight - minSize);
    newX = clampedX;
    newWidth = fixedRight - clampedX;
  } else if (handle.fx === 1) {
    // 우변 이동, 좌변 고정
    const rawNewRight = snap(fixedRight + worldDelta.x);
    const clampedRight = Math.max(rawNewRight, rect.x + minSize);
    newWidth = clampedRight - rect.x;
  }
  // fx === 0.5: x 축 변화 없음

  // Y 축 처리
  if (handle.fy === 0) {
    // 상변 이동, 하변 고정
    const rawNewY = snap(rect.y + worldDelta.y);
    const clampedY = Math.min(rawNewY, fixedBottom - minSize);
    newY = clampedY;
    newHeight = fixedBottom - clampedY;
  } else if (handle.fy === 1) {
    // 하변 이동, 상변 고정
    const rawNewBottom = snap(fixedBottom + worldDelta.y);
    const clampedBottom = Math.max(rawNewBottom, rect.y + minSize);
    newHeight = clampedBottom - rect.y;
  }
  // fy === 0.5: y 축 변화 없음

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}
