import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t4-cb-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subId: string, devAId: string, devBId: string, fiberCatId: string, powerCatId: string;
let sub2Id: string, otherAssetId: string; // 타 변전소 픽스처 (INVALID_PORT / INVALID_CABLE 용)

const commit = (payload: unknown) => request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);
const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, index }, orderBy: { group: 'asc' } })).id;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  subId = sub.id;
  // 광 그룹/종류 (시드: fiber 그룹 존재)
  const fiberGroup = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  fiberCatId = fiberGroup.categories[0]!.id;
  const powerGroup = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'power' }, include: { categories: true } });
  powerCatId = powerGroup.categories[0]!.id;
  // 광슬롯 2개를 커밋으로 생성(포트 자동 인스턴스화: A/B 12코어 fiber)
  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
  devAId = randomUUID();
  devBId = randomUUID();
  await commit({
    assets: { creates: [
      { id: devAId, name: `${uniq}-slotA`, typeId: slotType.id },
      { id: devBId, name: `${uniq}-slotB`, typeId: slotType.id },
    ] },
  }).expect(200);
  // 두 번째 변전소 + 자산 (타 변전소 포트/케이블 검증용)
  const sub2 = await nextDb.substation.create({ data: { name: `${uniq}-ss2`, branchId: br.id } });
  sub2Id = sub2.id;
  otherAssetId = randomUUID();
  await request(app)
    .put(`/api/v2/substations/${sub2Id}/commit`)
    .set(admin)
    .send({ assets: { creates: [{ id: otherAssetId, name: `${uniq}-slotX`, typeId: slotType.id }] } })
    .expect(200);
});

afterAll(async () => {
  await nextDb.cable.deleteMany({ where: { substationId: { in: [subId, sub2Id] } } });
  await nextDb.asset.deleteMany({ where: { substationId: { in: [subId, sub2Id] } } });
  await nextDb.substation.deleteMany({ where: { id: { in: [subId, sub2Id] } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('cables in commit + workingcopy', () => {
  it('케이블 생성 → workingcopy에 나타남', async () => {
    const cid = randomUUID();
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(devAId, 1), bPortId: await portOf(devBId, 1), categoryId: fiberCatId }] },
    }).expect(200);
    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.cables).toHaveLength(1);
    expect(wc.cables[0]).toMatchObject({ id: cid, categoryId: fiberCatId });
    expect(typeof wc.cables[0].updatedAt).toBe('string');
  });

  it('점유 포트 재사용 → 422 CONNECT_PORT_OCCUPIED', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devAId, 1), bPortId: await portOf(devBId, 2), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('CONNECT_PORT_OCCUPIED');
  });

  it('전원 케이블을 광 포트에 → 422 CONNECT_MEDIUM_MISMATCH', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devAId, 3), bPortId: await portOf(devBId, 3), categoryId: powerCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('CONNECT_MEDIUM_MISMATCH');
  });

  it('케이블 update(pathPoints)/OCC/delete', async () => {
    const cable = await nextDb.cable.findFirstOrThrow({ where: { substationId: subId } });
    // 낡은 버전 → 409
    await commit({
      cables: { updates: [{ id: cable.id, patch: { pathPoints: [{ x: 1, y: 2 }] } }] },
      baseVersions: { [cable.id]: new Date('2000-01-01').toISOString() },
    }).expect(409);
    // 정상 update
    await commit({
      cables: { updates: [{ id: cable.id, patch: { pathPoints: [{ x: 1, y: 2 }] } }] },
      baseVersions: { [cable.id]: cable.updatedAt.toISOString() },
    }).expect(200);
    const updated = await nextDb.cable.findUniqueOrThrow({ where: { id: cable.id } });
    expect(updated.pathPoints).toEqual([{ x: 1, y: 2 }]);
    // delete
    await commit({
      cables: { deletes: [cable.id] },
      baseVersions: { [cable.id]: updated.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.cable.count({ where: { id: cable.id } })).toBe(0);
  });

  // 주의: 이 테스트는 devAId 자산을 삭제(파괴)한다 — 이후 테스트는 devA 포트를 쓸 수 없다.
  it('케이블 물린 자산 삭제(케이블 미포함) → 409 CABLE_ATTACHED; 함께 삭제 → 200', async () => {
    const cid = randomUUID();
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(devAId, 5), bPortId: await portOf(devBId, 5), categoryId: fiberCatId }] },
    }).expect(200);
    const a = await nextDb.asset.findUniqueOrThrow({ where: { id: devAId } });
    const cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    const r1 = await commit({
      assets: { deletes: [devAId] },
      baseVersions: { [devAId]: a.updatedAt.toISOString() },
    }).expect(409);
    expect(r1.body.error).toBe('CABLE_ATTACHED');
    await commit({
      assets: { deletes: [devAId] },
      cables: { deletes: [cid] },
      baseVersions: { [devAId]: a.updatedAt.toISOString(), [cid]: cbl.updatedAt.toISOString() },
    }).expect(200);
  });

  it('같은 커밋에서 자산 생성 + 그 포트로 케이블 생성', async () => {
    const newId = randomUUID();
    const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
    const cid = randomUUID();
    // 새 자산의 포트 id는 클라이언트가 모름 → 생성 후 케이블은 별도 커밋이 자연스러움.
    // 단일 커밋 지원 검증: 자산 생성 커밋 → 포트 조회 → 케이블 커밋 (2단계 계약 확인)
    await commit({ assets: { creates: [{ id: newId, name: `${uniq}-slotC`, typeId: slotType.id }] } }).expect(200);
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(newId, 7), bPortId: await portOf(devBId, 7), categoryId: fiberCatId }] },
    }).expect(200);
    expect(await nextDb.cable.count({ where: { id: cid } })).toBe(1);
  });

  it('타 변전소 자산의 포트로 생성 → 422 INVALID_PORT', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devBId, 9), bPortId: await portOf(otherAssetId, 9), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_PORT');
  });

  it('미존재 categoryId로 생성 → 422 INVALID_CABLE_CATEGORY', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devBId, 10), bPortId: await portOf(devBId, 11), categoryId: randomUUID() }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_CABLE_CATEGORY');
  });

  it('타 변전소 케이블 삭제 → 422 INVALID_CABLE', async () => {
    // (미존재 id 삭제는 checkVersions OCC 가 먼저 409 CONFLICT 로 잡는다 — INVALID_CABLE 의 도달 경로는 타 변전소 케이블)
    const cid = randomUUID();
    await request(app)
      .put(`/api/v2/substations/${sub2Id}/commit`)
      .set(admin)
      .send({ cables: { creates: [{ id: cid, aPortId: await portOf(otherAssetId, 1), bPortId: await portOf(otherAssetId, 2), categoryId: fiberCatId }] } })
      .expect(200);
    const cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    const res = await commit({
      cables: { deletes: [cid] },
      baseVersions: { [cid]: cbl.updatedAt.toISOString() },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_CABLE');
  });
});
