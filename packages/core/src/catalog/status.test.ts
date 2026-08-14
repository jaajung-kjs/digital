import { describe, expect, it } from 'vitest';
import { ASSET_STATUSES, assetStatusLabel, worstAssetStatus } from './status.js';

describe('ASSET_STATUSES', () => {
  it('3종 어휘와 라벨', () => {
    expect(ASSET_STATUSES.map((s) => s.value)).toEqual(['normal', 'standby', 'fault']);
    expect(assetStatusLabel('fault')).toBe('고장');
  });
  it('미지 값은 원문 반환', () => {
    expect(assetStatusLabel('unknown-x')).toBe('unknown-x');
  });
});

describe('worstAssetStatus', () => {
  it('나쁜 쪽이 이긴다 — 하나라도 고장이면 고장', () => {
    expect(worstAssetStatus(['normal', 'normal', 'fault'])).toBe('fault');
    expect(worstAssetStatus(['normal', 'standby'])).toBe('standby');
    expect(worstAssetStatus(['normal', 'normal'])).toBe('normal');
  });
  it('심각도는 어휘 선언 순서를 그대로 따른다', () => {
    const worst = ASSET_STATUSES[ASSET_STATUSES.length - 1]!.value;
    expect(worstAssetStatus(ASSET_STATUSES.map((s) => s.value))).toBe(worst);
  });
  it('빈 목록은 null', () => {
    expect(worstAssetStatus([])).toBeNull();
  });
  it('어휘에 없는 값은 겨루지 않는다 — 다 모르면 첫 값 그대로', () => {
    expect(worstAssetStatus(['unknown-x', 'normal'])).toBe('normal');
    expect(worstAssetStatus(['unknown-x', 'unknown-y'])).toBe('unknown-x');
  });
});
