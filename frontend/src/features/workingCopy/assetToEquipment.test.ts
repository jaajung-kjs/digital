import { describe, it, expect } from 'vitest';
import { assetToEquipment } from './assetToEquipment';

const asset = {
  id: 'a1', name: '랙1',
  assetType: { placementKind: 'RACK' },
  positionX: 10, positionY: 20, width2d: 100, height2d: 200, rotation: 0, totalU: 42,
  manager: '홍길동', installDate: '2024-01-01', description: '설명', attributes: { x: 1 },
} as any;

describe('assetToEquipment', () => {
  it('Asset(배치) → FloorPlanEquipment', () => {
    const e = assetToEquipment(asset);
    expect(e).toMatchObject({
      id: 'a1', name: '랙1', kind: 'RACK',
      positionX: 10, positionY: 20, width: 100, height: 200, rotation: 0, totalU: 42,
    });
  });
  it('placementKind 없으면 안전하게 처리(throw 안 함)', () => {
    expect(() => assetToEquipment({ id: 'x', name: 'n', assetType: {}, } as any)).not.toThrow();
  });
  it("DB 약어 'DIST' → 'DISTRIBUTION' 정규화", () => {
    const e = assetToEquipment({ id: 'd', name: '분전반', assetType: { placementKind: 'DIST' } } as any);
    expect(e.kind).toBe('DISTRIBUTION');
  });
});
