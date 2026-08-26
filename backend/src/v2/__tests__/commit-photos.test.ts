import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { assetPhotoDir } from '../photoFiles.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-ph-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, a1Id: string, otherAssetId: string;

const commit = (payload: unknown) =>
  request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * 사진이 실린 저장 — **파일과 저장 내용이 한 요청**이다.
 *
 * 칸 이름이 곧 그 사진의 id 다. 경로는 보내지 않는다 — 서버가 지어 준다.
 */
function commitWithPhotos(
  payload: unknown,
  files: { id: string; body?: Buffer; filename?: string; contentType?: string }[],
) {
  let req = request(app)
    .put(`/api/v2/substations/${subId}/commit`)
    .set(admin)
    .field('payload', JSON.stringify(payload));
  for (const f of files) {
    req = req.attach(f.id, f.body ?? onePixelPng, {
      filename: f.filename ?? 'a.png',
      contentType: f.contentType ?? 'image/png',
    });
  }
  return req;
}

const onDisk = (filePath: string) => fs.existsSync(path.join(assetPhotoDir(), path.basename(filePath)));
const diskNames = () => new Set(fs.readdirSync(assetPhotoDir()));

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
  /* 시험이 만든 사진 파일도 남기지 않는다 — 픽스처를 DB 에서 직접 쓸어내면 파일은 안 지워진다. */
  const rows = await nextDb.assetPhoto.findMany({ where: { asset: { substation: { name: { startsWith: uniq } } } } });
  for (const r of rows) fs.rmSync(path.join(assetPhotoDir(), path.basename(r.filePath)), { force: true });
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('records.photos in commit', () => {
  it('creates → 파일이 함께 오고, 경로는 서버가 짓는다', async () => {
    const photoId = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: a1Id, caption: '설치 전경' }] } } },
      [{ id: photoId }],
    ).expect(200);
    const row = await nextDb.assetPhoto.findUniqueOrThrow({ where: { id: photoId } });
    expect(row.assetId).toBe(a1Id);
    expect(row.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    expect(row.caption).toBe('설치 전경');
    /* 줄만 생기고 파일이 없으면 볼 수 없는 사진이 된다. */
    expect(onDisk(row.filePath)).toBe(true);
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

  it('deletes → 행이 사라지면 **파일도 사라진다**', async () => {
    const photo = await nextDb.assetPhoto.findFirstOrThrow({ where: { assetId: a1Id } });
    expect(onDisk(photo.filePath)).toBe(true);

    await commit({ records: { photos: { deletes: [photo.id] } } }).expect(200);

    expect(await nextDb.assetPhoto.count({ where: { id: photo.id } })).toBe(0);
    /* 줄만 지우고 파일을 두면 아무도 볼 수 없는 파일이 영원히 남는다. */
    expect(onDisk(photo.filePath)).toBe(false);
  });

  it('타 변전소 자산에 사진 create → 422, **방금 쓴 파일도 지운다**', async () => {
    const before = diskNames();
    const photoId = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: otherAssetId }] } } },
      [{ id: photoId }],
    ).expect(422);
    expect(await nextDb.assetPhoto.count({ where: { assetId: otherAssetId } })).toBe(0);
    /* 커밋이 튕겼으면 디스크도 그 전 그대로여야 한다 — 「나중에 청소」할 것이 생기지 않는다. */
    expect(diskNames()).toEqual(before);
  });

  it('자산 삭제 시 사진 행 cascade 삭제', async () => {
    const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
    const asset = await nextDb.asset.create({ data: { name: `${uniq}-a3`, typeId: t.id, substationId: subId } });
    const photoId = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: asset.id }] } } },
      [{ id: photoId }],
    ).expect(200);
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(1);

    const { filePath } = await nextDb.assetPhoto.findUniqueOrThrow({ where: { id: photoId } });
    const fresh = await nextDb.asset.findUniqueOrThrow({ where: { id: asset.id } });
    await commit({
      assets: { deletes: [asset.id] },
      baseVersions: { [asset.id]: fresh.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(0);
    /* 설비를 걷어내면 그 사진 파일도 함께 걷힌다 — 지운 사람은 남은 것이 있는 줄 모른다. */
    expect(onDisk(filePath)).toBe(false);
  });

  it('GET 워킹카피 응답에 photos 포함(createdAt asc)', async () => {
    const p1 = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: p1, assetId: a1Id, caption: '첫번째' }] } } },
      [{ id: p1 }],
    ).expect(200);
    const p2 = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: p2, assetId: a1Id, caption: '두번째' }] } } },
      [{ id: p2 }],
    ).expect(200);

    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    const ids = (wc.photos as Array<{ id: string }>).map((p) => p.id);
    expect(ids.indexOf(p1)).toBeLessThan(ids.indexOf(p2));
    expect(wc.photos.find((p: { id: string }) => p.id === p1)).toMatchObject({ assetId: a1Id, caption: '첫번째' });
  });

  it('파일 없이 사진 create → 400 (볼 수 없는 사진 줄을 만들지 않는다)', async () => {
    const photoId = randomUUID();
    const res = await commit({ records: { photos: { creates: [{ id: photoId, assetId: a1Id }] } } }).expect(400);
    expect(res.body.error).toBe('INVALID_UPLOAD');
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(0);
  });

  it('이미지가 아니면 400 INVALID_IMAGE — 아무것도 저장되지 않는다', async () => {
    const before = diskNames();
    const photoId = randomUUID();
    const res = await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: a1Id }] } } },
      [{ id: photoId, body: Buffer.from('not an image'), filename: 'a.txt', contentType: 'text/plain' }],
    ).expect(400);
    expect(res.body.error).toBe('INVALID_IMAGE');
    expect(await nextDb.assetPhoto.count({ where: { id: photoId } })).toBe(0);
    expect(diskNames()).toEqual(before);
  });

  it('5MB 초과 → 413 FILE_TOO_LARGE', async () => {
    const photoId = randomUUID();
    const res = await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: a1Id }] } } },
      [{ id: photoId, body: Buffer.alloc(5 * 1024 * 1024 + 1024) }],
    ).expect(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it('확장자는 클라이언트 파일명이 아니라 검증된 MIME 에서 파생된다', async () => {
    const photoId = randomUUID();
    await commitWithPhotos(
      { records: { photos: { creates: [{ id: photoId, assetId: a1Id }] } } },
      [{ id: photoId, filename: 'evil.php' }],
    ).expect(200);
    const row = await nextDb.assetPhoto.findUniqueOrThrow({ where: { id: photoId } });
    expect(row.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/); // .php 아님
  });
});
