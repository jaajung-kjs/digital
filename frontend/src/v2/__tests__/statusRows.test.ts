import { describe, expect, it } from 'vitest';
import { buildStatusRows } from '../statusRows';

const types = new Map([
  ['t-rack', { id: 't-rack', name: '랙', categoryId: 'c-1' } as never],
]);
const categories = new Map([['c-1', '구조']]);

describe('buildStatusRows (변전소 스코프)', () => {
  const floors = [{ id: 'f-1', name: '1층', sortOrder: 1, substationId: 's' }];
  const rack = { id: 'a-1', name: '랙1', typeId: 't-rack', status: 'normal', floorId: 'f-1', parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: { installDate: '2026-01-01', manager: '홍길동' } };
  const mod = { id: 'a-2', name: '모듈', typeId: 't-rack', status: 'fault', floorId: null, parentAssetId: 'a-1', containerKey: 'main', slotIndex: 3, fieldValues: {} };
  const unplaced = { id: 'a-3', name: '미배치자산', typeId: 't-rack', status: 'standby', floorId: null, parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: {} };

  it('층 배치·컨테이너 배치·미배치 location + 필드·최근점검 계산', () => {
    const rows = buildStatusRows({
      assets: [rack, mod, unplaced] as never,
      floors: floors as never,
      typesById: types,
      categoryNameById: categories,
      inspectionsByAsset: new Map([['a-1', ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z']]]),
    });
    expect(rows[0]).toMatchObject({ id: 'a-1', typeName: '랙', location: '1층', installDate: '2026-01-01', manager: '홍길동', lastInspectedAt: '2026-07-01T00:00:00.000Z', status: 'normal' });
    expect(rows[1]).toMatchObject({ id: 'a-2', location: '랙1 · 슬롯 4', lastInspectedAt: null });
    expect(rows[2]).toMatchObject({ id: 'a-3', location: '미배치', status: 'standby', lastInspectedAt: null });
  });
});
