import { describe, it, expect } from 'vitest';
import { zoomAtPoint, screenToWorld, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, type Viewport } from '../transform';

/**
 * 줌은 휠(커서 고정)과 버튼(중앙 고정)이 같은 계산을 쓴다.
 * "고정점 아래의 도면 위치가 그대로 남는다"가 이 함수의 전부이므로 그것을 단언한다.
 */
const at = (v: Viewport, x: number, y: number) =>
  screenToWorld(x, y, { left: 0, top: 0 } as DOMRect, v.panX, v.panY, v.zoom);

describe('zoomAtPoint', () => {
  const base: Viewport = { zoom: 100, panX: 0, panY: 0 };

  it('고정점 아래의 도면 좌표가 확대 전후로 같다', () => {
    const before = at(base, 300, 200);
    const after = zoomAtPoint(base, ZOOM_STEP, 300, 200);
    expect(at(after, 300, 200).x).toBeCloseTo(before.x, 6);
    expect(at(after, 300, 200).y).toBeCloseTo(before.y, 6);
  });

  it('팬이 걸린 상태에서도 고정점이 유지된다', () => {
    const panned: Viewport = { zoom: 250, panX: -120, panY: 80 };
    const before = at(panned, 640, 400);
    const after = zoomAtPoint(panned, 1 / ZOOM_STEP, 640, 400);
    expect(at(after, 640, 400).x).toBeCloseTo(before.x, 6);
    expect(at(after, 640, 400).y).toBeCloseTo(before.y, 6);
  });

  it('확대/축소가 서로의 역이다', () => {
    const inThenOut = zoomAtPoint(zoomAtPoint(base, ZOOM_STEP, 100, 100), 1 / ZOOM_STEP, 100, 100);
    expect(inThenOut.zoom).toBeCloseTo(base.zoom, 6);
    expect(inThenOut.panX).toBeCloseTo(base.panX, 6);
    expect(inThenOut.panY).toBeCloseTo(base.panY, 6);
  });

  it('한계를 넘지 않는다 — 버튼을 계속 눌러도 도면이 사라지지 않게', () => {
    let v = base;
    for (let i = 0; i < 100; i++) v = zoomAtPoint(v, ZOOM_STEP, 0, 0);
    expect(v.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 200; i++) v = zoomAtPoint(v, 1 / ZOOM_STEP, 0, 0);
    expect(v.zoom).toBe(MIN_ZOOM);
  });
});
