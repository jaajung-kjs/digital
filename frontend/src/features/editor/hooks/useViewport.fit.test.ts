import { describe, it, expect } from 'vitest';
import { calculateFitToContent } from './useViewport';
import type { BackgroundDrawing } from '../../../types/floorPlan';
import type { Asset } from '../../../types/asset';

// "화면 맞춤"(에디터 #3): 배경 도면(DWG)을 제외하고 실제로 배치한 설비 bounds 로 fit.
// 설비가 하나도 없을 때만 배경/캔버스로 폴백한다.

const CANVAS_W = 800;
const CANVAS_H = 600;

// calculateFitToContent 은 positionX/Y/width2d/height2d 만 읽는다 — 그 4개만 채운다.
function eq(partial: { positionX: number; positionY: number; width: number; height: number }): Asset {
  return {
    id: 'e',
    name: '',
    positionX: partial.positionX,
    positionY: partial.positionY,
    width2d: partial.width,
    height2d: partial.height,
  } as Asset;
}

// 설비 중심을 역산해 fit 의 center 가 실제로 어디에 맞춰졌는지 검증한다.
// panX = canvasWidth/2 - centerX * scale  →  centerX = (canvasWidth/2 - panX) / scale
function centerFromFit(
  fit: { zoom: number; panX: number; panY: number },
): { cx: number; cy: number } {
  const scale = fit.zoom / 100;
  return {
    cx: (CANVAS_W / 2 - fit.panX) / scale,
    cy: (CANVAS_H / 2 - fit.panY) / scale,
  };
}

describe('calculateFitToContent — 화면 맞춤 bounds 소스', () => {
  it('설비가 있으면 배경 도면을 제외하고 설비 bounds 로 fit 한다', () => {
    const assets: Asset[] = [eq({ positionX: 1000, positionY: 1000, width: 100, height: 100 })];
    // 배경 도면은 설비에서 멀리 떨어진 거대한 영역. 이게 포함되면 center 가 설비에서 벗어난다.
    const background = {
      bounds: { minX: -50000, minY: -50000, maxX: 50000, maxY: 50000 },
    } as unknown as BackgroundDrawing;

    const withBg = calculateFitToContent(assets, background, null, CANVAS_W, CANVAS_H);
    const withoutBg = calculateFitToContent(assets, null, null, CANVAS_W, CANVAS_H);

    // 배경 유무와 무관하게 동일한 fit — 배경은 프레이밍에서 제외됐다.
    expect(withBg).toEqual(withoutBg);

    // center 는 설비 bbox 중심(1050, 1050) 근방.
    const { cx, cy } = centerFromFit(withBg);
    expect(Math.abs(cx - 1050)).toBeLessThan(100);
    expect(Math.abs(cy - 1050)).toBeLessThan(100);
  });

  it('설비가 없으면(빈 평면도) 배경 도면 bounds 로 폴백한다', () => {
    const background = {
      bounds: { minX: 2000, minY: 2000, maxX: 4000, maxY: 4000 },
    } as unknown as BackgroundDrawing;

    const fit = calculateFitToContent([], background, null, CANVAS_W, CANVAS_H);
    const { cx, cy } = centerFromFit(fit);
    // 배경 bbox 중심(3000, 3000) 근방 — zoom 정수 반올림 오차 허용(±100).
    expect(Math.abs(cx - 3000)).toBeLessThan(100);
    expect(Math.abs(cy - 3000)).toBeLessThan(100);
  });

  it('설비·배경 모두 없으면 floor 캔버스 영역으로 폴백한다', () => {
    const fit = calculateFitToContent([], null, { width: 5000, height: 4000 }, CANVAS_W, CANVAS_H);
    const { cx, cy } = centerFromFit(fit);
    // 캔버스(0,0)-(5000,4000) 중심 근방 — zoom 정수 반올림 오차 허용(±100).
    expect(Math.abs(cx - 2500)).toBeLessThan(100);
    expect(Math.abs(cy - 2000)).toBeLessThan(100);
  });

  it('설비·배경·캔버스 모두 없으면 좌상단 기본값을 반환한다(크래시 없음)', () => {
    const fit = calculateFitToContent([], null, null, CANVAS_W, CANVAS_H);
    expect(fit).toEqual({ zoom: 100, panX: 0, panY: 0 });
  });
});
