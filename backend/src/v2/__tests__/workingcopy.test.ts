import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures, ensureTestTypes } from './helpers.js';

const app = makeApp();
const uniq = `t2a-wc-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, floorId: string, assetId: string;

beforeAll(async () => {
  await sweepTestFixtures();
  await ensureTestTypes();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const rackType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
  const asset = await nextDb.asset.create({
    data: { name: `${uniq}-rack`, typeId: rackType.id, substationId: sub.id, floorId: floor.id, x: 10, y: 20, width: 60, height: 80 },
  });
  assetId = asset.id;
  await nextDb.maintenanceLog.create({ data: { assetId: asset.id, occurredAt: new Date('2026-07-01'), content: '테스트 고장' } });
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('GET /api/v2/substations/:id/workingcopy', () => {
  it('컬렉션 전체를 평탄하게 반환한다', async () => {
    const res = await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200);
    expect(res.body.substation.id).toBe(subId);
    expect(res.body.floors.map((f: { id: string }) => f.id)).toEqual([floorId]);
    const asset = res.body.assets.find((a: { id: string }) => a.id === assetId);
    expect(asset).toMatchObject({ floorId, x: 10, y: 20 });
    expect(typeof asset.updatedAt).toBe('string');
    expect(res.body.maintenanceLogs).toHaveLength(1);
    expect(res.body.inspectionLogs).toEqual([]);
  });

  it('없는 변전소 → 404', async () => {
    await request(app)
      .get('/api/v2/substations/00000000-0000-0000-0000-000000000000/workingcopy')
      .set(admin)
      .expect(404);
  });
});

/**
 * 구간 케이블은 **두 국에 걸친다**.
 *
 * `Cable.substationId` 로만 가져오면 커밋한 쪽에서만 보이고, 상대 국에서는 제 OPGW 가 어디로
 * 가는지 알 수 없다 — 선번장의 대국 자리가 `—` 로 비었다(실제로 그랬다).
 */
describe('GET /workingcopy — 구간 케이블', () => {
  it('상대 변전소에서도 같은 케이블이 보인다', async () => {
    const other = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss-remote`,
        branch: { create: { name: `${uniq}-br-remote`, headquarters: { create: { name: `${uniq}-hq-remote` } } } },
      },
    });
    const type = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
    const mk = async (subId: string, name: string) => {
      const a = await nextDb.asset.create({ data: { name, typeId: type.id, substationId: subId } });
      return nextDb.port.create({
        data: { assetId: a.id, group: 'TRUNK', index: 1, name: 'OPGW', direction: 'BI', medium: 'fiber', positions: 24 },
      });
    };
    const near = await mk(subId, `${uniq}-near`);
    const far = await mk(other.id, `${uniq}-far`);
    const cat = await nextDb.cableCategory.findFirstOrThrow({ where: { name: 'OPGW(광복합가공지선)' } });
    // 커밋은 한쪽 국에서 한다 — 케이블의 substationId 는 그 국이 된다.
    await nextDb.cable.create({
      data: { aPortId: near.id, bPortId: far.id, categoryId: cat.id, substationId: subId },
    });

    for (const [id, label] of [[subId, '커밋한 국'], [other.id, '상대 국']] as const) {
      const res = await request(app).get(`/api/v2/substations/${id}/workingcopy`).set(admin).expect(200);
      const found = res.body.cables.filter((c: { aPortId: string }) => c.aPortId === near.id);
      expect(found, label).toHaveLength(1);
      // 양쪽 끝의 국 이름이 실려 와야 대국이 「… (판암변전소)」로 읽힌다.
      expect(found[0].aRef.substationName).toBeTruthy();
      expect(found[0].bRef.substationName).toBeTruthy();
    }
  });
});
