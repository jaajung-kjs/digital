import { describe, expect, it } from 'vitest';
import { assemblyToPlacement } from '../placeAssembly';
import { buildCommitPayload } from '../store/buildCommitPayload';
import type { V2Assembly, V2AssetType } from '../types';

const type: V2AssetType = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'OFD-SLOT', name: '광슬롯', categoryId: 'c1', sortOrder: 0,
  fields: [],
  /* 배선을 풀려면 포트가 있어야 한다 — 놓을 때 이 선언에서 펴진다. */
  portTemplates: [
    { id: 'pt-in', group: 'DC-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', sortOrder: 1, positions: 1, variant: 'DC' },
    { id: 'pt-out', group: 'DC-OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', sortOrder: 2, positions: 1, variant: 'DC' },
  ],
} as unknown as V2AssetType;

const assembly: V2Assembly = {
  id: '22222222-2222-4222-8222-222222222222',
  key: 'OFD', name: 'OFD', categoryId: 'c1', sortOrder: 0,
  items: [
    { id: 'item-1', typeId: type.id, name: '슬롯 1', col: 0, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 0 },
    { id: 'item-2', typeId: type.id, name: '슬롯 2', col: 1, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 1 },
  ],
  links: [
    { id: 'link-1', aItemId: 'item-1', aGroup: 'DC-OUT', aIndex: 1, bItemId: 'item-2', bGroup: 'DC-IN', bIndex: 1, categoryId: 'cat-1', specParams: { sizeSq: 38 }, sortOrder: 0 },
  ],
} as unknown as V2Assembly;

const place = () =>
  assemblyToPlacement({
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
    const [equipment, ...parts] = place().assets;
    expect(equipment!.assemblyId).toBe(assembly.id);
    /* 설비 자신은 항목에서 나온 것이 아니다 — 항목을 가진 쪽이다. */
    expect(equipment!.assemblyItemId).toBeUndefined();
    expect(parts.map((p) => p.assemblyItemId)).toEqual(['item-1', 'item-2']);
  });

  /**
   * **내부 배선도 함께 선다.**
   *
   * 랙 한 대짜리 설비의 안쪽 배선은 어느 국에 놓든 같다. 예전에는 자산과 포트만 만들어서,
   * 같은 결선을 설비를 놓을 때마다 손으로 다시 이어야 했다.
   */
  it('설비 품목의 배선이 케이블로 함께 선다 — 양끝은 그 자리에서 만든 포트다', () => {
    const { assets, cables } = place();
    const [, part1, part2] = assets;
    expect(cables).toHaveLength(1);
    const cable = cables[0]!;
    expect(cable.aPortId).toBe(part1!.ports.find((p) => p.group === 'DC-OUT')!.id);
    expect(cable.bPortId).toBe(part2!.ports.find((p) => p.group === 'DC-IN')!.id);
    /* 종류와 값도 프리셋이 들고 온다 — 놓자마자 산출 내역에 잡힌다. */
    expect(cable.categoryId).toBe('cat-1');
    expect(cable.specParams).toEqual({ sizeSq: 38 });
  });

  /* 품목을 고치면서 포트 번호가 사라질 수 있다(이미 놓인 설비는 스냅샷이다) — 그때
     설비 전체를 못 놓게 하는 것은 과하다. 그 줄만 거르고 나머지는 그대로 선다. */
  it('가리키는 포트가 없는 줄은 그것만 거른다 — 설비는 그대로 선다', () => {
    const broken = { ...assembly, links: [{ ...assembly.links[0]!, bIndex: 9 }] } as V2Assembly;
    const { assets, cables } = assemblyToPlacement({
      assembly: broken, substationId: 's1', name: '통신랙 A', floorId: 'f1',
      rect: { x: 0, y: 0, width: 4, height: 2 }, typesById: new Map([[type.id, type]]),
    });
    expect(assets).toHaveLength(3);
    expect(cables).toEqual([]);
  });

  it('저장에 함께 실린다 — 서버까지 가지 않으면 없는 고리다', () => {
    const { assets } = place();
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
