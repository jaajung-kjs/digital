import { describe, it, expect } from 'vitest';
import { getHintMessage } from './EditorHintBar';

describe('getHintMessage', () => {
  it('설비 도구 + 종류 armed → 시작점 안내', () => {
    expect(
      getHintMessage({ tool: 'asset', isDrawingAsset: false, hasPreset: false, cablePhase: null }),
    ).toBe('설비 시작점을 클릭하세요 · ESC 취소');
  });

  it('설비 도구 + 프리셋 armed → 랙 배치 안내', () => {
    expect(
      getHintMessage({ tool: 'asset', isDrawingAsset: false, hasPreset: true, cablePhase: null }),
    ).toBe('클릭하면 랙이 배치됩니다 · ESC 취소');
  });

  it('설비 도구 + 그리는 중 → 끝점 안내', () => {
    expect(
      getHintMessage({ tool: 'asset', isDrawingAsset: true, hasPreset: false, cablePhase: null }),
    ).toBe('끝점을 클릭해 크기를 정하세요 · ESC 취소');
  });

  it('케이블 도구 + selectingSource → 출발 설비 안내', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingAsset: false, hasPreset: false, cablePhase: 'selectingSource' }),
    ).toBe('출발 설비를 클릭하세요 · ESC 취소');
  });

  it('케이블 도구 + drawingPath → 경유점/도착 안내', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingAsset: false, hasPreset: false, cablePhase: 'drawingPath' }),
    ).toBe('경유점을 클릭하거나 도착 설비를 클릭하세요 · Shift 직선 · Backspace 되돌리기 · ESC 취소');
  });

  it('케이블 모달 단계(selectingType)에서는 안내 없음', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingAsset: false, hasPreset: false, cablePhase: 'selectingType' }),
    ).toBeNull();
  });

  it('케이블 확정 단계(ready)에서는 안내 없음', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingAsset: false, hasPreset: false, cablePhase: 'ready' }),
    ).toBeNull();
  });

  it('선택 도구에서는 안내 없음', () => {
    expect(
      getHintMessage({ tool: 'select', isDrawingAsset: false, hasPreset: false, cablePhase: null }),
    ).toBeNull();
  });
});
