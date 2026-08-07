import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-cm-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, floorId: string;
let rackTypeId: string, pitrTypeId: string, slotTypeId: string, ofdTypeId: string, groundingTypeId: string;

const commit = (payload: unknown) =>
  request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const key = (k: string) => nextDb.assetType.findUniqueOrThrow({ where: { key: k } });
  rackTypeId = (await key('RACK')).id;
  pitrTypeId = (await key('PITR-5000')).id;
  slotTypeId = (await key('OFD-SLOT')).id;
  ofdTypeId = (await key('OFD')).id;
  groundingTypeId = (await key('GROUNDING')).id;
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('PUT /commit — assets', () => {
  it('랙+모듈 2개를 한 커밋으로 생성(부모가 같은 커밋의 create), 포트 자동 인스턴스화', async () => {
    const rackId = randomUUID();
    const m1 = randomUUID(), m2 = randomUUID();
    await commit({
      assets: {
        creates: [
          // 자식을 먼저 배열에 넣어 위상정렬을 강제 검증
          { id: m1, name: `${uniq}-m1`, typeId: pitrTypeId, parentAssetId: rackId, containerKey: 'main', slotIndex: 0, slotSpan: 2 },
          { id: rackId, name: `${uniq}-rack`, typeId: rackTypeId, floorId, x: 0, y: 0, width: 60, height: 80 },
          { id: m2, name: `${uniq}-m2`, typeId: pitrTypeId, parentAssetId: rackId, containerKey: 'main', slotIndex: 2, slotSpan: 1 },
        ],
      },
    }).expect(200);
    const m1Ports = await nextDb.port.findMany({ where: { assetId: m1 } });
    expect(m1Ports.length).toBe(2); // device 기본 포트 템플릿 (network 2)
  });

  it('슬롯 겹침 → 422 PLACEMENT_OVERLAP', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-ov`, typeId: pitrTypeId, parentAssetId: await rackIdByName(), containerKey: 'main', slotIndex: 1, slotSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_OVERLAP');
  });

  it('수용 불가 타입(GROUNDING, 구조 카테고리) → 422 PLACEMENT_NOT_ACCEPTED', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-na`, typeId: groundingTypeId, parentAssetId: await rackIdByName(), containerKey: 'main', slotIndex: 5, slotSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_NOT_ACCEPTED');
  });

  /* 12심 판과 24심 판이 한 함체에 섞인다 — 성단은 개수가, 인입은 코어 수가 달라진다. */
  it('오버라이드: 12심 경로슬롯 → 성단 12 + 인입 1(코어 12)', async () => {
    const ofdId = randomUUID(), slotId = randomUUID();
    await commit({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-ofd`, typeId: ofdTypeId, floorId, x: 100, y: 0, width: 40, height: 40 },
          { id: slotId, name: `${uniq}-slot12`, typeId: slotTypeId, parentAssetId: ofdId, containerKey: 'main', portCounts: { CORE: 12 }, portPositions: { TRUNK: 12 } },
        ],
      },
    }).expect(200);
    const ports = await nextDb.port.findMany({ where: { assetId: slotId } });
    expect(ports.filter((p) => p.group === 'CORE')).toHaveLength(12);
    const trunk = ports.find((p) => p.group === 'TRUNK')!;
    // 인입은 언제나 포트 **하나** — 심선 수만큼 펴지 않는다.
    expect([ports.length, trunk.positions]).toEqual([13, 12]);
  });

  it('OCC: 낡은 baseVersion 으로 update → 409 + conflicts', async () => {
    const rackId = await rackIdByName();
    const res = await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack2` } }] },
      baseVersions: { [rackId]: new Date('2000-01-01').toISOString() },
    }).expect(409);
    expect(res.body.details[0]).toMatchObject({ id: rackId, reason: 'modified' });
  });

  it('올바른 baseVersion 으로 update → 200, updatedAt 갱신', async () => {
    const rackId = await rackIdByName();
    const before = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack-renamed` } }] },
      baseVersions: { [rackId]: before.updatedAt.toISOString() },
    }).expect(200);
    const after = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    expect(after.name).toBe(`${uniq}-rack-renamed`);
  });

  it('자식 있는 자산만 삭제 → 409 HAS_CHILDREN; 자식+부모 동시 삭제 → 200', async () => {
    const rackId = await rackIdByName(`${uniq}-rack-renamed`);
    const children = await nextDb.asset.findMany({ where: { parentAssetId: rackId }, select: { id: true, updatedAt: true } });
    const rack = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    const bv = Object.fromEntries([[rackId, rack.updatedAt.toISOString()], ...children.map((c) => [c.id, c.updatedAt.toISOString()])]);
    const r1 = await commit({ assets: { deletes: [rackId] }, baseVersions: bv }).expect(409);
    expect(r1.body.error).toBe('HAS_CHILDREN');
    await commit({ assets: { deletes: [rackId, ...children.map((c) => c.id)] }, baseVersions: bv }).expect(200);
    expect(await nextDb.asset.count({ where: { id: rackId } })).toBe(0);
  });

  it('VIEWER 커밋 → 403', async () => {
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set('Authorization', authHeader('viewer'))
      .send({ assets: {} })
      .expect(403);
  });

  it('동일 UUID create 재제출 → 409 CONFLICT (details[0].reason === "exists")', async () => {
    const assetId = randomUUID();
    const payload = {
      assets: {
        creates: [{ id: assetId, name: `${uniq}-grounding-dup`, typeId: groundingTypeId }],
      },
    };
    // 첫 번째 커밋은 성공
    await commit(payload).expect(200);
    // 동일 UUID 재제출 → 409
    const res = await commit(payload).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0]).toMatchObject({ id: assetId, reason: 'exists' });
  });
});

async function rackIdByName(name = `${uniq}-rack`): Promise<string> {
  const rack = await nextDb.asset.findFirstOrThrow({ where: { substationId: subId, name } });
  return rack.id;
}

describe('자산 상태 어휘', () => {
  // 상태 어휘는 core 의 ASSET_STATUSES 가 유일한 출처인데 커밋 스키마가 z.string() 이라
  // 사전에 없는 값이 그대로 저장됐다. 화면은 라벨 조회에 실패하면 값을 그대로 쓰므로
  // '점검필요' 같은 문자열이 상태처럼 보였다 — 저장 시점에 막는다.
  it('사전에 없는 상태는 거절한다', async () => {
    const res = await commit({
      baseVersions: {},
      assets: {
        creates: [
          { id: randomUUID(), name: `${uniq}-bad-status`, typeId: rackTypeId, status: '점검필요', floorId, x: 0, y: 0, width: 10, height: 10, fieldValues: {} },
        ],
      },
    }).expect(400);
    expect(res.body.error).toBe('BAD_REQUEST');
  });

  it('사전에 있는 상태는 통과한다', async () => {
    await commit({
      baseVersions: {},
      assets: {
        creates: [
          { id: randomUUID(), name: `${uniq}-ok-status`, typeId: rackTypeId, status: 'standby', floorId, x: 0, y: 0, width: 10, height: 10, fieldValues: {} },
        ],
      },
    }).expect(200);
  });
});
