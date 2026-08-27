import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t5-rc-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subAId: string, subBId: string, slotAId: string, slotBId: string, fiberCatId: string;

const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, group: 'CORE', index } })).id;

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sA = await nextDb.substation.create({ data: { name: `${uniq}-국사A`, branchId: br.id } });
  const sB = await nextDb.substation.create({ data: { name: `${uniq}-국사B`, branchId: br.id } });
  subAId = sA.id;
  subBId = sB.id;
  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
  slotAId = randomUUID();
  slotBId = randomUUID();
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
    .send({ assets: { creates: [{ id: slotAId, name: `${uniq}-슬롯A`, typeId: slotType.id }] } }).expect(200);
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin)
    .send({ assets: { creates: [{ id: slotBId, name: `${uniq}-슬롯B`, typeId: slotType.id }] } }).expect(200);
  const g = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  fiberCatId = g.categories[0]!.id;
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('대국 케이블', () => {
  it('A국사 커밋으로 B국사 포트와 연결 — 소유=A', async () => {
    const cid = randomUUID();
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
      cables: { creates: [{ id: cid, aPortId: await portOf(slotAId, 1), bPortId: await portOf(slotBId, 1), categoryId: fiberCatId }] },
    }).expect(200);
    const cable = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    expect(cable.substationId).toBe(subAId);
  });

  it('양끝 모두 타 변전소 → 422 INVALID_PORT', async () => {
    const res = await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(slotBId, 2), bPortId: await portOf(slotBId, 3), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_PORT');
  });

  it('워킹카피 refs: 대국 끝점의 자산·변전소명 포함', async () => {
    const wc = (await request(app).get(`/api/v2/substations/${subAId}/workingcopy`).set(admin).expect(200)).body;
    const c = wc.cables[0];
    expect(c.aRef).toMatchObject({ assetName: `${uniq}-슬롯A`, substationName: `${uniq}-국사A`, portGroup: 'CORE', portIndex: 1 });
    expect(c.bRef).toMatchObject({ assetName: `${uniq}-슬롯B`, substationName: `${uniq}-국사B` });
  });

  it('비소유 변전소(국사B) 커밋으로 대국 케이블 delete 시도 → 422 INVALID_CABLE', async () => {
    // 이미 생성된 케이블(substationId=A)을 B국사 커밋으로 삭제 시도
    // baseVersions 에 케이블 updatedAt 포함 → OCC 통과 후 소유 스코프에서 걸림
    const cables = await nextDb.cable.findMany({ where: { substationId: subAId } });
    const cable = cables[0];
    if (!cable) throw new Error('테스트 전제: 케이블이 없음');
    const res = await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
      cables: { deletes: [cable.id] },
      baseVersions: { [cable.id]: cable.updatedAt.toISOString() },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_CABLE');
  });

  it('반대편(B국사)에서 끝점 자산 삭제 → 409 CABLE_ATTACHED + 소유 변전소명', async () => {
    const b = await nextDb.asset.findUniqueOrThrow({ where: { id: slotBId } });
    const res = await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
      assets: { deletes: [slotBId] },
      baseVersions: { [slotBId]: b.updatedAt.toISOString() },
    }).expect(409);
    expect(res.body.error).toBe('CABLE_ATTACHED');
    expect(res.body.details.ownerSubstationNames).toContain(`${uniq}-국사A`);
  });
});

describe('검색/포트 API', () => {
  it('자산 이름 검색 — 전 변전소, 변전소명 포함', async () => {
    const rows = (await request(app).get(`/api/v2/search/assets?q=${encodeURIComponent(`${uniq}-슬롯`)}`).set(admin).expect(200)).body;
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveProperty('substationName');
  });
  it('빈 q → 400', async () => {
    await request(app).get('/api/v2/search/assets?q=%20').set(admin).expect(400);
  });
  it('q 미제공 → 400', async () => {
    await request(app).get('/api/v2/search/assets').set(admin).expect(400);
  });
  it('포트 목록은 **심선 수까지** 준다 — 없으면 24심 인입이 1심으로 읽힌다', async () => {
    const trunk = (await request(app).get(`/api/v2/assets/${slotAId}/ports`).set(admin).expect(200)).body
      .find((p: { group: string }) => p.group === 'TRUNK');
    /* 이 값이 빠져 대국 검색에서 OPGW 를 고르면 「심선 수가 다름」으로 막혔다. */
    expect(trunk.positions).toBeGreaterThan(1);
  });

  it('포트 목록 + occupied', async () => {
    const ports = (await request(app).get(`/api/v2/assets/${slotBId}/ports`).set(admin).expect(200)).body;
    const p1 = ports.find((p: { group: string; index: number }) => p.group === 'CORE' && p.index === 1);
    expect(p1.occupied).toBe(true);
    const p5 = ports.find((p: { group: string; index: number }) => p.group === 'CORE' && p.index === 5);
    expect(p5.occupied).toBe(false);
  });
  it('미존재 자산 포트 → 404', async () => {
    await request(app).get(`/api/v2/assets/${randomUUID()}/ports`).set(admin).expect(404);
  });

});

/**
 * **선로가 슬롯 이름을 짓는다** — 「제 국 - 상대 국 - 순번」.
 *
 * 두 국의 판은 서로를 가리키는데 이름은 각자 적어 왔다(둘 다 「슬롯 1」이라 화면에서 제자리를
 * 가리키는 것처럼 읽혔다). 대상은 이름이 아니라 **선언**이 고른다(다심 인입 포트를 가진 자산).
 */
describe('선로가 짓는 슬롯 이름', () => {
  const trunkOf = async (assetId: string) =>
    (await nextDb.port.findFirstOrThrow({ where: { assetId, positions: { gt: 1 } } })).id;
  const nameOf = async (id: string) => (await nextDb.asset.findUniqueOrThrow({ where: { id } })).name;

  /** 설비 품목(OFD)으로 놓은 슬롯 — 도면에 놓이는 것은 설비뿐이라 실제로 늘 이 모습이다. */
  async function placeSlot(substationId: string, label: string): Promise<string> {
    const assembly = await nextDb.assembly.findFirstOrThrow({
      where: { items: { some: { type: { key: 'OFD-SLOT' } } } },
      include: { items: { orderBy: { col: 'asc' } } },
    });
    const item = assembly.items[0]!;
    const ofdId = randomUUID();
    const slotId = randomUUID();
    await request(app).put(`/api/v2/substations/${substationId}/commit`).set(admin).send({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-${label}-OFD`, typeId: null, assemblyId: assembly.id },
          { id: slotId, name: item.name, typeId: item.typeId, parentAssetId: ofdId, col: item.col, row: item.row, colSpan: 1, rowSpan: 1 },
        ],
      },
    }).expect(200);
    return slotId;
  }

  it('이으면 **양쪽 다** 「제 국 - 상대 국 - 1」이 되고, 끊으면 양쪽 다 되돌아간다', async () => {
    const a = await placeSlot(subAId, 'A');
    const b = await placeSlot(subBId, 'B');
    const before = { a: await nameOf(a), b: await nameOf(b) };
    expect(before.a).toBe('슬롯 1'); // 설비 품목의 구성이 준 이름

    const cableId = randomUUID();
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
      .send({ cables: { creates: [{ id: cableId, aPortId: await trunkOf(a), bPortId: await trunkOf(b), categoryId: fiberCatId }] } })
      .expect(200);

    expect(await nameOf(a)).toBe(`${uniq}-국사A - ${uniq}-국사B - 1`);
    /* 상대 국의 판도 함께 — 그쪽 워킹 카피에는 이 자산이 없으므로 서버만 할 수 있는 일이다. */
    expect(await nameOf(b)).toBe(`${uniq}-국사B - ${uniq}-국사A - 1`);

    /* 지울 때는 본 것이 그대로인지 함께 낸다(낙관적 동시성) — 화면도 그렇게 보낸다. */
    const cable = await nextDb.cable.findUniqueOrThrow({ where: { id: cableId } });
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
      .send({ cables: { deletes: [cableId] }, baseVersions: { [cableId]: cable.updatedAt.toISOString() } })
      .expect(200);

    /* 끊으면 **양쪽 다** 끊긴다 — 한쪽만 되돌아가면 이름이 거짓말을 한다. 되돌릴 이름은
       기억해 둔 것이 아니라 그 설비 품목의 구성에서 다시 읽은 것이다. */
    expect(await nameOf(a)).toBe(before.a);
    expect(await nameOf(b)).toBe(before.b);
  });

  it('같은 두 국 사이가 하나 더 생기면 **-2** 다', async () => {
    const a1 = await placeSlot(subAId, 'A2');
    const b1 = await placeSlot(subBId, 'B2');
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
      .send({ cables: { creates: [{ id: randomUUID(), aPortId: await trunkOf(a1), bPortId: await trunkOf(b1), categoryId: fiberCatId }] } })
      .expect(200);

    const a2 = await placeSlot(subAId, 'A3');
    const b2 = await placeSlot(subBId, 'B3');
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
      .send({ cables: { creates: [{ id: randomUUID(), aPortId: await trunkOf(a2), bPortId: await trunkOf(b2), categoryId: fiberCatId }] } })
      .expect(200);

    /* 순번은 **만든 순서**다 — 하나를 지워도 남은 것의 번호가 흔들리지 않는다. */
    expect(await nameOf(a1)).toBe(`${uniq}-국사A - ${uniq}-국사B - 1`);
    expect(await nameOf(a2)).toBe(`${uniq}-국사A - ${uniq}-국사B - 2`);
    expect(await nameOf(b2)).toBe(`${uniq}-국사B - ${uniq}-국사A - 2`);
  });
});
