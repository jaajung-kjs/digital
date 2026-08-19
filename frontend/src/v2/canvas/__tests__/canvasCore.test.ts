import { describe, expect, it } from 'vitest';
import { snapToGrid, screenToWorld } from '../transform';
import { findAssetAt, hitTestAsset } from '../hitTest';
import { createDragSession, dragDelta, inWindow, isThresholdMet } from '../drag';

const rect = { left: 100, top: 50 } as DOMRect;
const a = (id: string, x: number, y: number, w = 60, h = 80) => ({ id, name: id, x, y, width: w, height: h });

describe('transform', () => {
  it('snapToGrid: 10 단위 반올림, disabled면 원값', () => {
    expect(snapToGrid(14, 26, 10)).toEqual({ x: 10, y: 30 });
    expect(snapToGrid(14, 26, 10, false)).toEqual({ x: 14, y: 26 });
  });
  it('screenToWorld: pan/zoom 역변환', () => {
    // zoom 200%, pan(20,10): world = (client-rect-pan)/2
    expect(screenToWorld(160, 100, rect, 20, 10, 200)).toEqual({ x: 20, y: 20 });
  });
});

describe('hitTest', () => {
  it('AABB 내부/경계 포함, 외부 제외', () => {
    expect(hitTestAsset(10, 10, a('r', 0, 0))).toBe(true);
    expect(hitTestAsset(60, 80, a('r', 0, 0))).toBe(true);
    expect(hitTestAsset(61, 10, a('r', 0, 0))).toBe(false);
  });
  it('findAssetAt: 겹치면 나중 그려진(배열 뒤) 것 우선', () => {
    const list = [a('아래', 0, 0), a('위', 10, 10)];
    expect(findAssetAt(20, 20, list)!.id).toBe('위');
    expect(findAssetAt(5, 5, list)!.id).toBe('아래');
    expect(findAssetAt(999, 999, list)).toBeNull();
  });
});

describe('drag', () => {
  it('threshold 3 미만은 미충족', () => {
    const s = createDragSession(a('r', 100, 100), { x: 10, y: 10 });
    expect(isThresholdMet(s, { x: 12, y: 10 })).toBe(false);
    expect(isThresholdMet(s, { x: 14, y: 10 })).toBe(true);
  });
  it('dragDelta: initial+delta에 snap 적용', () => {
    const s = createDragSession(a('r', 100, 100), { x: 10, y: 10 });
    const snap = (x: number, y: number) => snapToGrid(x, y, 10);
    expect(dragDelta(s, { x: 33, y: 17 }, (p) => snap(p.x, p.y))).toEqual({ x: 120, y: 110 });
  });
});

/* 단추를 누른 채로는 창을 벗어나도 좌표가 계속 온다. 그 좌표로 끝맺으면 **손을 뗀 적 없는
   자리**에 놓인다 — 판을 벗어났다 돌아오면 물건이 엉뚱한 데 가 있는 것이 그것이다. */
describe('inWindow', () => {
  it('창 안이면 놓을 자리다', () => {
    expect(inWindow({ clientX: 10, clientY: 10 })).toBe(true);
    expect(inWindow({ clientX: 0, clientY: 0 })).toBe(true);
    expect(inWindow({ clientX: window.innerWidth, clientY: window.innerHeight })).toBe(true);
  });

  it('창 밖이면 놓을 자리가 아니다', () => {
    expect(inWindow({ clientX: -1, clientY: 10 })).toBe(false);
    expect(inWindow({ clientX: 10, clientY: -1 })).toBe(false);
    expect(inWindow({ clientX: window.innerWidth + 1, clientY: 10 })).toBe(false);
    expect(inWindow({ clientX: 10, clientY: window.innerHeight + 1 })).toBe(false);
  });
});
