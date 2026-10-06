import { describe, expect, it } from 'vitest';
import { rowsFromWorkingCopy, rowsFromNode } from '../statusRows';

const catalog = {
  categories: [{ id: 'c1', key: 'k', name: '통신', sortOrder: 1 }],
  equipmentTypes: [{ id: 'et1', key: 'k1', name: 'L3 스위치', categoryId: 'c1', sortOrder: 1 }],
  rackTypes: [], cableTypes: [],
} as never;

const s = {
  saved: {
    substations: { S1: { id: 'S1', name: '북춘천S/S' } },
    racks: [{ id: 'r1', substationId: 'S1', name: '통신랙' }],
    equipment: [
      { id: 'e1', substationId: 'S1', rackId: 'r1', name: 'L3 #1', typeId: 'et1', status: 'normal', model: 'X', maker: 'Y', installDate: '2024-03-11' },
      { id: 'e2', substationId: 'S2', rackId: 'r9', name: '남의 국', typeId: 'et1', status: 'normal' },
    ],
    inspections: [{ id: 'i1', equipmentId: 'e1', inspectedAt: '2026-01-02T00:00:00.000Z' }],
    floors: [], circuits: [], fiberLines: [], cores: [], coreMeasurements: [], links: [], farLinks: [], refEquipment: [], maintenance: [], photos: [],
  },
  overlays: { racks: { creates: {}, updates: {}, deletes: [] }, equipment: { creates: {}, updates: {}, deletes: [] }, inspections: { creates: {}, updates: {}, deletes: [] } },
} as never;

describe('현황 행', () => {
  it('국 범위는 그 국의 설비만, 랙 이름·품목·분야·마지막 점검을 붙인다', () => {
    const rows = rowsFromWorkingCopy(s, 'S1', catalog);
    expect(rows).toEqual([expect.objectContaining({
      id: 'e1', rackName: '통신랙', typeName: 'L3 스위치', categoryName: '통신', substationName: '북춘천S/S',
      model: 'X', installDate: '2024-03-11', lastInspectedAt: '2026-01-02T00:00:00.000Z',
    })]);
  });

  it('노드 범위는 서버 행을 그대로 옮긴다', () => {
    const rows = rowsFromNode([{ id: 'e1', name: 'a', status: 'normal', updatedAt: '', substationId: 'S1', substationName: 'S', rackId: 'r', rackName: 'R', typeId: 't', typeName: 'T', categoryName: 'C', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, lastInspectedAt: null }]);
    expect(rows[0]).toMatchObject({ rackName: 'R', typeName: 'T', categoryName: 'C' });
  });
});
