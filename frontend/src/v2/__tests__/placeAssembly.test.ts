import { describe, expect, it } from 'vitest';
import { assemblyToAssets } from '../placeAssembly';
import { buildCommitPayload } from '../store/buildCommitPayload';
import type { V2Assembly, V2AssetType } from '../types';

const type: V2AssetType = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'OFD-SLOT', name: '광슬롯', categoryId: 'c1', sortOrder: 0,
  fields: [], portTemplates: [],
} as unknown as V2AssetType;

const assembly: V2Assembly = {
  id: '22222222-2222-4222-8222-222222222222',
  key: 'OFD', name: 'OFD', categoryId: 'c1', sortOrder: 0,
  items: [
    { id: 'item-1', typeId: type.id, name: '슬롯 1', col: 0, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 0 },
    { id: 'item-2', typeId: type.id, name: '슬롯 2', col: 1, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 1 },
  ],
} as unknown as V2Assembly;

const place = () =>
  assemblyToAssets({
    assembly,
    substationId: 's1',
    name: '통신랙 A',
    floorId: 'f1',
    rect: { x: 0, y: 0, width: 4, height: 2 },
    typesById: new Map([[type.id, type]]),
  });

/**
 * 놓인 부품은 **구성의 어느 항목에서 나왔는지**를 들고 간다.
 *
 * 서버는 선로가 끊길 때 이 고리로 원래 이름을 되찾는다. 예전에는 같은 종류의 형제를
 * 자리순으로 세워 그 차례로 짝지었는데, 격자에서 자리를 옮기거나 형제 하나를 지우면
 * 어긋났다 — 실제 데이터에서 한 국은 슬롯을 가로로, 다른 국은 세로로 놓아 두었다.
 */
describe('설비 품목 배치', () => {
  it('부품마다 제 구성 항목을 가리킨다', () => {
    const [equipment, ...parts] = place();
    expect(equipment!.assemblyId).toBe(assembly.id);
    /* 설비 자신은 항목에서 나온 것이 아니다 — 항목을 가진 쪽이다. */
    expect(equipment!.assemblyItemId).toBeUndefined();
    expect(parts.map((p) => p.assemblyItemId)).toEqual(['item-1', 'item-2']);
  });

  it('저장에 함께 실린다 — 서버까지 가지 않으면 없는 고리다', () => {
    const assets = place();
    const empty = { creates: {}, updates: {}, deletes: [] as string[] };
    const payload = buildCommitPayload(
      {
        floors: empty,
        assets: { creates: Object.fromEntries(assets.map((a) => [a.id, a])), updates: {}, deletes: [] },
        maintenance: empty,
        inspections: empty,
        cables: empty,
        photos: empty,
      } as never,
      {},
    );
    const sent = payload.assets!.creates!.filter((c) => c.parentAssetId);
    expect(sent.map((c) => c.assemblyItemId)).toEqual(['item-1', 'item-2']);
  });
});
