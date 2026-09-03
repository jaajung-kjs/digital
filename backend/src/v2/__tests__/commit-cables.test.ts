import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures, ensureTestTypes } from './helpers.js';

const app = makeApp();
const uniq = `t4-cb-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, devAId: string, devBId: string, fiberCatId: string, powerCatId: string;
let sub2Id: string, otherAssetId: string; // 타 변전소 픽스처 (INVALID_PORT / INVALID_CABLE 용)

const commit = (payload: unknown) => request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);
const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, index }, orderBy: { group: 'asc' } })).id;

beforeAll(async () => {
  await sweepTestFixtures();
  await ensureTestTypes();
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
  await sweepTestFixtures();
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

  it('양끝 모두 타 변전소 자산의 포트로 생성 → 422 INVALID_PORT', async () => {
    // OR 완화: 최소 한쪽 끝점이 커밋 변전소여야 함 — 양쪽 모두 타 변전소면 INVALID_PORT
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(otherAssetId, 9), bPortId: await portOf(otherAssetId, 10), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_PORT');
  });

  it('미존재 categoryId로 생성 → 422 INVALID_CABLE_CATEGORY', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devBId, 10), bPortId: await portOf(devBId, 11), categoryId: randomUUID() }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_CABLE_CATEGORY');
  });

  it('같은 케이블 id 중복 create → 2번째 409 CONFLICT details[0].reason==="exists"', async () => {
    const cid = randomUUID();
    // DB에 직접 삽입해 id를 선점 (commit의 포트 점유 검사를 우회해 P2002 경로 유도)
    const occupyAPortId = await portOf(devBId, 4);
    const occupyBPortId = await portOf(devBId, 6);
    await nextDb.cable.create({
      data: { id: cid, substationId: subId, aPortId: occupyAPortId, bPortId: occupyBPortId, pathPoints: [], specParams: {} },
    });
    // commit으로 같은 id, 다른 자유 포트로 재생성 시도 → P2002 → 409 CONFLICT
    const freeAPortId = await portOf(devBId, 8);
    const freeBPortId = await portOf(devBId, 10);
    const res = await commit({ cables: { creates: [{ id: cid, aPortId: freeAPortId, bPortId: freeBPortId, categoryId: fiberCatId }] } }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0]).toMatchObject({ id: cid, reason: 'exists' });
    // 정리
    await nextDb.cable.delete({ where: { id: cid } });
  });

  it('광 케이블 update: 전원 categoryId → 422 CONNECT_MEDIUM_MISMATCH; 유효 광 categoryId → 200', async () => {
    // 픽스처: devBId 포트 11, 12 로 광 케이블 생성 (이전 테스트에서 미사용 자유 포트)
    const cid = randomUUID();
    const aPortId = await portOf(devBId, 11);
    const bPortId = await portOf(devBId, 12);
    await commit({ cables: { creates: [{ id: cid, aPortId, bPortId, categoryId: fiberCatId }] } }).expect(200);
    let cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    // 전원 카테고리로 patch → 422 CONNECT_MEDIUM_MISMATCH
    const res = await commit({
      cables: { updates: [{ id: cid, patch: { categoryId: powerCatId } }] },
      baseVersions: { [cid]: cbl.updatedAt.toISOString() },
    }).expect(422);
    expect(res.body.error).toBe('CONNECT_MEDIUM_MISMATCH');
    // 유효 광 카테고리로 patch → 200
    cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    await commit({
      cables: { updates: [{ id: cid, patch: { categoryId: fiberCatId } }] },
      baseVersions: { [cid]: cbl.updatedAt.toISOString() },
    }).expect(200);
    // 정리
    cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    await commit({ cables: { deletes: [cid] }, baseVersions: { [cid]: cbl.updatedAt.toISOString() } }).expect(200);
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

/**
 * **교류와 직류는 잇지 않는다 — 서버가 막는다.**
 *
 * 갈래를 넣고 브라우저로 시험해 보니 화면은 막는데 **서버는 통과**시켰다: 검증에 넘기는 포트
 * 형상에서 심선 수와 갈래가 빠져 있었다(두 자리가 그 매핑을 각자 적고 있었고 둘 다 빠뜨렸다).
 * 화면만 막는 규칙은 규칙이 아니다 — API 로 부르면 그대로 들어온다.
 */
describe('전원의 갈래 — 서버가 막는다', () => {
  it('교류 출력에 직류 입력을 물리면 422', async () => {
    const chargerType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'CHARGER' } });
    const acPanel = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'PWR-AC' } });
    const a = randomUUID(); const b = randomUUID();
    await commit({ assets: { creates: [
      { id: a, name: `${uniq}-충전기`, typeId: chargerType.id },
      { id: b, name: `${uniq}-AC반`, typeId: acPanel.id },
    ] } }).expect(200);

    /* 충전기는 **직류를 내보내고**, AC 분전반은 **교류를 받는다** — 그 둘은 못 잇는다. */
    const dcOut = await nextDb.port.findFirstOrThrow({ where: { assetId: a, direction: 'OUT', variant: 'DC' } });
    const acIn = await nextDb.port.findFirstOrThrow({ where: { assetId: b, direction: 'IN', variant: 'AC' } });
    const res = await commit({ cables: { creates: [{ id: randomUUID(), aPortId: dcOut.id, bPortId: acIn.id, categoryId: powerCatId }] } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CONNECT_VARIANT_MISMATCH');
  });

  it('같은 갈래끼리는 이어진다', async () => {
    const dcPanel = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'PWR-DC' } });
    const chargerType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'CHARGER' } });
    const a = randomUUID(); const b = randomUUID();
    await commit({ assets: { creates: [
      { id: a, name: `${uniq}-충전기2`, typeId: chargerType.id },
      { id: b, name: `${uniq}-DC반`, typeId: dcPanel.id },
    ] } }).expect(200);

    const dcOut = await nextDb.port.findFirstOrThrow({ where: { assetId: a, direction: 'OUT', variant: 'DC' } });
    const dcIn = await nextDb.port.findFirstOrThrow({ where: { assetId: b, direction: 'IN', variant: 'DC' } });
    await commit({ cables: { creates: [{ id: randomUUID(), aPortId: dcOut.id, bPortId: dcIn.id, categoryId: powerCatId }] } }).expect(200);
  });
});
