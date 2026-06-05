import { describe, it, expect } from 'vitest';
import { floorPlanUrl, registerUrl } from './navUrls';

describe('navUrls', () => {
  it('floorPlanUrl: 층+장비 딥링크', () => {
    expect(floorPlanUrl('f1', 'a1')).toBe('/floors/f1/plan?equipmentId=a1');
  });
  it('registerUrl: 변전소+자산 딥링크', () => {
    expect(registerUrl('s1', 'a1')).toBe('/substations/s1/assets?assetId=a1');
  });
});
