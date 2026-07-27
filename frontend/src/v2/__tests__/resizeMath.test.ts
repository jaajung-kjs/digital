import { describe, expect, it } from 'vitest';
import { applyResize } from '../canvas/resize';

const rect = { x: 100, y: 100, width: 60, height: 80 };
describe('applyResize', () => {
  it('br: 우하단 확장', () => {
    expect(applyResize(rect, 'br', { x: 10, y: 20 })).toEqual({ x: 100, y: 100, width: 70, height: 100 });
  });
  it('tl: 좌상단 이동 + 크기 감소, 반대변 고정', () => {
    expect(applyResize(rect, 'tl', { x: 10, y: 10 })).toEqual({ x: 110, y: 110, width: 50, height: 70 });
  });
  it('min 20 클램프: 고정변 유지', () => {
    expect(applyResize(rect, 'r', { x: -100, y: 0 })).toEqual({ x: 100, y: 100, width: 20, height: 80 });
    expect(applyResize(rect, 'l', { x: 100, y: 0 })).toEqual({ x: 140, y: 100, width: 20, height: 80 });
  });
  it('엣지 핸들은 한 축만', () => {
    expect(applyResize(rect, 't', { x: 50, y: -10 })).toEqual({ x: 100, y: 90, width: 60, height: 90 });
  });
});
