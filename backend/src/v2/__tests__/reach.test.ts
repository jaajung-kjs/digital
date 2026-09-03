import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { collectComponent } from '../reach.routes.js';
import { authHeader, makeApp, sweepTestFixtures, ensureTestTypes } from './helpers.js';

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
let slotAId: string, slotBId: string, slotB2Id: string, loneId: string;

const trunkOf = (assetId: string) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'FIBER-TRUNK' } }).then((p) => p.id);
const coreOf = (assetId: string, index: number) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'FIBER', index } }).then((p) => p.id);

beforeAll(async () => {
  await sweepTestFixtures();
  await ensureTestTypes();
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

  /* B국사에는 슬롯을 **둘** 놓는다 — truncation 시험이 「케이블 하나는 담기고 다음
     케이블에서 잘린다」는 사슬(슬롯A—슬롯B—슬롯B2)을 만들려면 한 걸음 더 갈 곳이 있어야
     한다. slotB2 는 slotB 와 자국 안 점퍼로만 잇는다 — 국 경계를 또 넘길 필요는 없다. */
  slotBId = randomUUID();
  slotB2Id = randomUUID();
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
    assets: {
      creates: [
        { id: slotBId, name: `${uniq}-슬롯B`, typeId: slotType.id },
        { id: slotB2Id, name: `${uniq}-슬롯B2`, typeId: slotType.id },
      ],
    },
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
  /* 자국 안 점퍼 — 슬롯B 의 단심 광 포트를 슬롯B2 의 단심 광 포트에 잇는다. 사슬을
     슬롯A(국A)—슬롯B(국B)—슬롯B2(국B) 로 한 걸음 늘려, truncation 시험이 「한 케이블은
     담기고 다음 케이블에서 잘린다」는 경로를 실제로 밟게 한다. */
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
    cables: {
      creates: [{
        id: randomUUID(), aPortId: await coreOf(slotBId, 1), bPortId: await coreOf(slotB2Id, 1),
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

  /* 응답은 스스로 아귀가 맞아야 한다 — 줄의 끝을 못 찾는 케이블이 있으면 화면이 마디를
     못 세운다. 잘리지 않은 보통 응답에서도 이 불변식은 지켜져야 한다. */
  it('모든 케이블의 끝점 자산이 assets 안에 있다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    const assetIds = new Set(res.body.assets.map((a: { id: string }) => a.id));
    const assetOfPort = new Map(res.body.ports.map((p: { id: string; assetId: string }) => [p.id, p.assetId]));
    for (const c of res.body.cables) {
      expect(assetIds.has(assetOfPort.get(c.aPortId))).toBe(true);
      expect(assetIds.has(assetOfPort.get(c.bPortId))).toBe(true);
    }
  });

  /* 한계에 걸려 잘려도 끊긴 케이블을 남기지 않는다 — 한쪽 끝을 못 실었으면 그 케이블도 뺀다.
     픽스처는 슬롯A(국A)—슬롯B(국B)—슬롯B2(국B) 사슬이다. 한계를 2로 두면:
     1걸음(슬롯A→슬롯B): 자산 1개 + 새 끝 1개 = 2 ≤ 2 → 담김.
     2걸음(슬롯B→슬롯B2): 자산 2개 + 새 끝 1개 = 3 > 2 → 통째로 잘림.
     그래서 cableIds 에 **하나는 실제로 담긴 채** truncated 가 선다 — 「담긴 케이블은 양끝이
     다 있다」검증이 빈 컬렉션을 도는 공허 참이 되지 않는다. 이전 버그는 이 경우 2번째
     케이블이 (반쪽만 실린 채) 담겨 cables 가 assets 에 없는 끝점(슬롯B2)을 가리켰다. */
  it('한계에 걸리면 truncated 이고, 담긴 케이블은 양끝이 다 실려 있다', async () => {
    const start = (await nextDb.port.findFirstOrThrow({ where: { id: await coreOf(slotAId, 1) } })).assetId;
    const r = await collectComponent(start, 2);
    expect(r.truncated).toBe(true);
    /* 이 시험의 요점은 「담긴 케이블은 양끝이 다 실려 있다」이다 — 담긴 케이블이 하나도
       없으면 아래 루프가 빈 집합을 돌아 아무것도 확인하지 않는다(공허 참). */
    expect(r.cableIds.size).toBeGreaterThan(0);
    for (const cid of r.cableIds) {
      const c = await nextDb.cable.findUniqueOrThrow({
        where: { id: cid },
        include: { aPort: { select: { assetId: true } }, bPort: { select: { assetId: true } } },
      });
      expect(r.assetIds.has(c.aPort.assetId)).toBe(true);
      expect(r.assetIds.has(c.bPort.assetId)).toBe(true);
    }
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
