import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeApp, authHeader } from './helpers.js';
import { assetPhotoDir } from '../photos.routes.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const created: string[] = [];

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

afterAll(() => {
  for (const f of created) fs.rmSync(path.join(assetPhotoDir(), f), { force: true });
});

describe('POST /api/v2/photos', () => {
  it('이미지 업로드 → 201 + assets/<uuid>.png 형식 filePath + 실제 파일 생성', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    const name = res.body.filePath.split('/')[1];
    created.push(name);
    expect(fs.existsSync(path.join(assetPhotoDir(), name))).toBe(true);
  });

  it('비이미지 MIME → 400 INVALID_IMAGE', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', Buffer.from('not an image'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    expect(res.body.error).toBe('INVALID_IMAGE');
  });

  it('5MB 초과 → 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it('viewer → 403', async () => {
    await request(app)
      .post('/api/v2/photos')
      .set({ Authorization: authHeader('viewer') })
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(403);
  });
});

describe('GET /api/v2/photos/:filename', () => {
  it('업로드한 파일을 인증 없이 받는다 (Content-Type/캐시 헤더)', async () => {
    const up = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const name = up.body.filePath.split('/')[1];
    created.push(name);

    const res = await request(app).get(`/api/v2/photos/${name}`).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('경로 탈출 시도 → 400 INVALID_FILENAME', async () => {
    const res = await request(app).get('/api/v2/photos/..%2F..%2Fpackage.json').expect(400);
    expect(res.body.error).toBe('INVALID_FILENAME');
  });

  it('없는 파일 → 404', async () => {
    await request(app)
      .get('/api/v2/photos/00000000-0000-4000-8000-000000000000.png')
      .expect(404);
  });
});

// ── 리뷰發 하드닝 회귀핀 ────────────────────────────────────────────────────
describe('업로드 하드닝', () => {
  it('확장자는 클라이언트 파일명이 아니라 검증된 MIME 에서 파생된다', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', onePixelPng, { filename: 'evil.php', contentType: 'image/png' })
      .expect(201);
    expect(res.body.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/); // .php 아님
    created.push(res.body.filePath.split('/')[1]);
  });

  it('잘못된 필드명 업로드 → 500 이 아니라 400', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('wrongField', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(400);
    expect(res.body.error).toBe('INVALID_UPLOAD');
  });
});
