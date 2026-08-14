import { describe, expect, it } from 'vitest';
import { ASSET_STATUSES, assetStatusLabel } from './status.js';

describe('ASSET_STATUSES', () => {
  it('3종 어휘와 라벨', () => {
    expect(ASSET_STATUSES.map((s) => s.value)).toEqual(['normal', 'standby', 'fault']);
    expect(assetStatusLabel('fault')).toBe('고장');
  });
  it('미지 값은 원문 반환', () => {
    expect(assetStatusLabel('unknown-x')).toBe('unknown-x');
  });
});

