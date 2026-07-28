import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t5-rc-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subAId: string, subBId: string, slotAId: string, slotBId: string, fiberCatId: string;

const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, group: 'A', index } })).id;

beforeAll(async () => {
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
  await nextDb.cable.deleteMany({ where: { substationId: { in: [subAId, subBId] } } });
  await nextDb.asset.deleteMany({ where: { substationId: { in: [subAId, subBId] } } });
  await nextDb.substation.deleteMany({ where: { id: { in: [subAId, subBId] } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
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
    expect(c.aRef).toMatchObject({ assetName: `${uniq}-슬롯A`, substationName: `${uniq}-국사A`, portGroup: 'A', portIndex: 1 });
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
  it('포트 목록 + occupied', async () => {
    const ports = (await request(app).get(`/api/v2/assets/${slotBId}/ports`).set(admin).expect(200)).body;
    const p1 = ports.find((p: { group: string; index: number }) => p.group === 'A' && p.index === 1);
    expect(p1.occupied).toBe(true);
    const p5 = ports.find((p: { group: string; index: number }) => p.group === 'A' && p.index === 5);
    expect(p5.occupied).toBe(false);
  });
  it('미존재 자산 포트 → 404', async () => {
    await request(app).get(`/api/v2/assets/${randomUUID()}/ports`).set(admin).expect(404);
  });
});
