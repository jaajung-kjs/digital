/**
 * 사진 **서빙** 라우트.
 *
 * 올리는 길은 여기 없다 — 파일은 저장 요청에 함께 실려 간다(`commit-photos.test.ts`).
 * 그래서 이 시험은 파일을 디스크에 직접 두고, 내주는 쪽만 본다.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { authHeader, makeApp } from './helpers.js';
import { assetPhotoDir } from '../photoFiles.js';

const app = makeApp();
const created: string[] = [];

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function putOnDisk(): string {
  const name = `${randomUUID()}.png`;
  fs.writeFileSync(path.join(assetPhotoDir(), name), onePixelPng);
  created.push(name);
  return name;
}

afterAll(() => {
  for (const f of created) fs.rmSync(path.join(assetPhotoDir(), f), { force: true });
});

describe('GET /api/v2/photos/:filename', () => {
  it('사진을 인증 없이 받는다 (Content-Type/캐시 헤더) — <img> 는 헤더를 못 붙인다', async () => {
    const res = await request(app).get(`/api/v2/photos/${putOnDisk()}`).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('경로 탈출 시도 → 400 INVALID_FILENAME', async () => {
    const res = await request(app).get('/api/v2/photos/..%2F..%2Fpackage.json').expect(400);
    expect(res.body.error).toBe('INVALID_FILENAME');
  });

  it('없는 파일 → 404', async () => {
    await request(app).get('/api/v2/photos/00000000-0000-4000-8000-000000000000.png').expect(404);
  });

  it('올리는 길은 없다 — 관리자가 올려도 404', async () => {
    await request(app)
      .post('/api/v2/photos')
      .set({ Authorization: authHeader('admin') })
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(404);
  });
});
