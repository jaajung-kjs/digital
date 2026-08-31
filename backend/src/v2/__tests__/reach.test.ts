import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

/**
 * `/reach` — 이 포트에서 케이블로 이어진 것 **전부**를 국 경계 없이.
 *
 * 워킹카피는 한 국만 든다. 그래서 추적이 대국을 못 본다 — 토폴로지가 그리려는 것이 정확히
 * 그 바깥이므로, 자료를 따로 받아 와야 한다.
 */
const app = makeApp();
const uniq = `t7-rh-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };

let subAId: string, subBId: string, subCId: string;
let slotAId: string, slotBId: string, loneId: string;

const trunkOf = (assetId: string) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'FIBER-TRUNK' } }).then((p) => p.id);
const coreOf = (assetId: string, index: number) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'FIBER', index } }).then((p) => p.id);

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const [a, b, c] = await Promise.all([
    nextDb.substation.create({ data: { name: `${uniq}-A`, branchId: br.id } }),
    nextDb.substation.create({ data: { name: `${uniq}-B`, branchId: br.id } }),
    nextDb.substation.create({ data: { name: `${uniq}-C`, branchId: br.id } }),
  ]);
  subAId = a.id; subBId = b.id; subCId = c.id;

  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });

  /* A국사 슬롯은 **설비 품목(OFD)** 아래 자식으로 놓는다 — 조상까지 함께 실리는지 보려면
     부모가 있어야 한다. 커밋 라우트는 자산에 typeId 나 assemblyId 둘 중 하나를 요구하므로
     (`INVALID_ASSET`), OFD 자신은 설비 품목으로 놓고 구성이 선언한 자식(슬롯 4개)을 함께
     만든다 — remote-cables.test.ts 의 placeSlot 과 같은 어법이다. */
  const assembly = await nextDb.assembly.findUniqueOrThrow({
    where: { key: 'OFD' },
    include: { items: { orderBy: { col: 'asc' } } },
  });
  const ofdAId = randomUUID();
  const itemIds = assembly.items.map(() => randomUUID());
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
    assets: {
      creates: [
        { id: ofdAId, name: `${uniq}-OFD`, typeId: null, assemblyId: assembly.id },
        ...assembly.items.map((item, i) => ({
          id: itemIds[i],
          name: item.name,
          typeId: item.typeId,
          parentAssetId: ofdAId,
          assemblyItemId: item.id,
          col: item.col, row: item.row, colSpan: 1, rowSpan: 1,
        })),
      ],
    },
  }).expect(200);
  slotAId = itemIds[0]!;

  slotBId = randomUUID();
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
    assets: { creates: [{ id: slotBId, name: `${uniq}-슬롯B`, typeId: slotType.id }] },
  }).expect(200);
  loneId = randomUUID();
  await request(app).put(`/api/v2/substations/${subCId}/commit`).set(admin).send({
    assets: { creates: [{ id: loneId, name: `${uniq}-외딴슬롯`, typeId: slotType.id }] },
  }).expect(200);

  const g = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
    cables: {
      creates: [{
        id: randomUUID(), aPortId: await trunkOf(slotAId), bPortId: await trunkOf(slotBId),
        categoryId: g.categories[0]!.id,
      }],
    },
  }).expect(200);
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('POST /api/v2/reach', () => {
  it('국을 넘어 이어진 자산을 모은다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    const ids = res.body.assets.map((a: { id: string }) => a.id);
    expect(ids).toContain(slotAId);
    expect(ids).toContain(slotBId);
    expect(res.body.substations.map((s: { id: string }) => s.id).sort())
      .toEqual([subAId, subBId].sort());
  });

  it('따로 노는 망은 안 섞인다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    expect(res.body.assets.map((a: { id: string }) => a.id)).not.toContain(loneId);
  });

  /* 끝점을 `설비 - 장비` 로 부르려면 부모가 있어야 한다 — 케이블은 부모에 안 닿는다. */
  it('조상(설비)까지 함께 싣는다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    const slot = res.body.assets.find((a: { id: string }) => a.id === slotAId);
    expect(res.body.assets.map((a: { id: string }) => a.id)).toContain(slot.parentAssetId);
  });

  it('그 국의 층도 싣는다 — 마디 안에 층 이름을 적으려면 필요하다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    expect(Array.isArray(res.body.floors)).toBe(true);
  });

  it('케이블이 하나도 없는 포트도 제 자산만 담아 돌려준다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(loneId, 1) }).expect(200);
    expect(res.body.assets.map((a: { id: string }) => a.id)).toEqual([loneId]);
    expect(res.body.cables).toEqual([]);
    expect(res.body.truncated).toBe(false);
  });

  it('없는 포트는 404', async () => {
    await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: randomUUID() }).expect(404);
  });

  it('portId 가 없으면 400', async () => {
    await request(app).post('/api/v2/reach').set(admin).send({}).expect(400);
  });

  it('로그인 없이는 401', async () => {
    await request(app).post('/api/v2/reach').send({ portId: randomUUID() }).expect(401);
  });
});
