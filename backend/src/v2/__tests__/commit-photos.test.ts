import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-ph-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, a1Id: string, otherAssetId: string;

const commit = (payload: unknown) =>
  request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const s1 = await nextDb.substation.create({ data: { name: `${uniq}-ss1`, branchId: br.id } });
  const s2 = await nextDb.substation.create({ data: { name: `${uniq}-ss2`, branchId: br.id } });
  subId = s1.id;
  const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
  a1Id = (await nextDb.asset.create({ data: { name: `${uniq}-a1`, typeId: t.id, substationId: s1.id } })).id;
  otherAssetId = (await nextDb.asset.create({ data: { name: `${uniq}-a2`, typeId: t.id, substationId: s2.id } })).id;
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('records.photos in commit', () => {
  it('creates → DB 행 생성, filePath/caption 일치', async () => {
    const photoId = randomUUID();
    await commit({
      records: {
        photos: { creates: [{ id: photoId, assetId: a1Id, filePath: `assets/${randomUUID()}.png`, caption: '설치 전경' }] },
      },
    }).expect(200);
    const row = await nextDb.assetPhoto.findUniqueOrThrow({ where: { id: photoId } });
    expect(row.assetId).toBe(a1Id);
    expect(row.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    expect(row.caption).toBe('설치 전경');
  });

  it('updates → 캡션만 변경, filePath 불변', async () => {
    const photo = await nextDb.assetPhoto.findFirstOrThrow({ where: { assetId: a1Id } });
    await commit({
      records: { photos: { updates: [{ id: photo.id, patch: { caption: '수정된 캡션' } }] } },
    }).expect(200);
    const after = await nextDb.assetPhoto.findUniqueOrThrow({ where: { id: photo.id } });
    expect(after.caption).toBe('수정된 캡션');
    expect(after.filePath).toBe(photo.filePath);
  });

  it('deletes → 행 삭제', async () => {
    const photo = await nextDb.assetPhoto.findFirstOrThrow({ where: { assetId: a1Id } });
    await commit({ records: { photos: { deletes: [photo.id] } } }).expect(200);
    expect(await nextDb.assetPhoto.count({ where: { id: photo.id } })).toBe(0);
  });

  it('타 변전소 자산에 사진 create → 422', async () => {
    await commit({
      records: {
        photos: { creates: [{ id: randomUUID(), assetId: otherAssetId, filePath: `assets/${randomUUID()}.png` }] },
      },
    }).expect(422);
    expect(await nextDb.assetPhoto.count({ where: { assetId: otherAssetId } })).toBe(0);
  });

  it('자산 삭제 시 사진 행 cascade 삭제', async () => {
    const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
    const asset = await nextDb.asset.create({ data: { name: `${uniq}-a3`, typeId: t.id, substationId: subId } });
    const photoId = randomUUID();
    await commit({
      records: { photos: { creates: [{ id: photoId, assetId: asset.id, filePath: `assets/${randomUUID()}.png` }] } },
    }).expect(200);
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(1);

    const fresh = await nextDb.asset.findUniqueOrThrow({ where: { id: asset.id } });
    await commit({
      assets: { deletes: [asset.id] },
      baseVersions: { [asset.id]: fresh.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(0);
  });

  it('GET 워킹카피 응답에 photos 포함(createdAt asc)', async () => {
    const p1 = randomUUID();
    await commit({
      records: { photos: { creates: [{ id: p1, assetId: a1Id, filePath: `assets/${randomUUID()}.png`, caption: '첫번째' }] } },
    }).expect(200);
    const p2 = randomUUID();
    await commit({
      records: { photos: { creates: [{ id: p2, assetId: a1Id, filePath: `assets/${randomUUID()}.png`, caption: '두번째' }] } },
    }).expect(200);

    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    const ids = (wc.photos as Array<{ id: string }>).map((p) => p.id);
    expect(ids.indexOf(p1)).toBeLessThan(ids.indexOf(p2));
    expect(wc.photos.find((p: { id: string }) => p.id === p1)).toMatchObject({ assetId: a1Id, caption: '첫번째' });
  });
});
