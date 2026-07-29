/**
 * v2 자립 인증 통합 테스트
 * - 실 DB (digital_next) 사용
 * - 테스트 계정은 각 suite 에서 직접 생성/삭제 (seed admin 과 충돌 방지)
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { makeApp } from './helpers.js';

const app = makeApp();

// ── 테스트 픽스처 ─────────────────────────────────────────────────────────────

const TEST_USERNAME = `test_auth_${Date.now()}`;
const TEST_PASSWORD = 'testPass123!';

beforeAll(async () => {
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  await nextDb.user.upsert({
    where: { username: TEST_USERNAME },
    update: {},
    create: { username: TEST_USERNAME, passwordHash: hash, role: 'admin' },
  });
});

afterAll(async () => {
  await nextDb.user.deleteMany({ where: { username: TEST_USERNAME } });
  await nextDb.$disconnect();
});

// ── POST /api/v2/auth/login ───────────────────────────────────────────────────

describe('POST /api/v2/auth/login', () => {
  it('올바른 자격증명으로 토큰 쌍 반환', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { username: TEST_USERNAME, role: 'admin' },
    });
  });

  it('잘못된 비밀번호 → 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: TEST_USERNAME, password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('존재하지 않는 사용자 → 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'no_such_user', password: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('body 누락 → 400 BAD_REQUEST', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v2/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v2/auth/refresh', () => {
  let refreshToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    refreshToken = res.body.refreshToken as string;
  });

  it('유효한 refresh token → 새 토큰 쌍 반환(rotate)', async () => {
    const res = await request(app)
      .post('/api/v2/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    // 새 토큰이 달라야 함 (rotate)
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('이미 사용된(rotate된) refresh token → 401 INVALID_REFRESH', async () => {
    // 위 테스트에서 rotate됐으므로 이전 토큰은 무효
    const res = await request(app)
      .post('/api/v2/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH');
  });

  it('쓰레기 token → 401 INVALID_REFRESH', async () => {
    const res = await request(app)
      .post('/api/v2/auth/refresh')
      .send({ refreshToken: 'garbage.token.value' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH');
  });
});

// ── POST /api/v2/auth/logout ──────────────────────────────────────────────────

describe('POST /api/v2/auth/logout', () => {
  it('유효한 refresh token으로 로그아웃 → 204', async () => {
    const loginRes = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    const rt = loginRes.body.refreshToken as string;

    const res = await request(app).post('/api/v2/auth/logout').send({ refreshToken: rt });
    expect(res.status).toBe(204);

    // 로그아웃 후 refresh 불가
    const refreshRes = await request(app)
      .post('/api/v2/auth/refresh')
      .send({ refreshToken: rt });
    expect(refreshRes.status).toBe(401);
  });

  it('존재하지 않는 token → 204 (멱등)', async () => {
    const res = await request(app)
      .post('/api/v2/auth/logout')
      .send({ refreshToken: 'nonexistent.token' });
    expect(res.status).toBe(204);
  });
});

// ── GET /api/v2/auth/me ───────────────────────────────────────────────────────

describe('GET /api/v2/auth/me', () => {
  let accessToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    accessToken = res.body.accessToken as string;
  });

  it('유효한 Bearer 토큰 → 사용자 정보 반환', async () => {
    const res = await request(app)
      .get('/api/v2/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: TEST_USERNAME, role: 'admin' });
    expect(res.body.id).toBeDefined();
  });

  it('토큰 없음 → 401', async () => {
    const res = await request(app).get('/api/v2/auth/me');
    expect(res.status).toBe(401);
  });

  it('잘못된 토큰 → 401', async () => {
    const res = await request(app)
      .get('/api/v2/auth/me')
      .set('Authorization', 'Bearer bad.token.value');
    expect(res.status).toBe(401);
  });
});

// ── adminOnly 미들웨어 — 403 검증 ─────────────────────────────────────────────

describe('adminOnly 미들웨어', () => {
  it('role=viewer 인 토큰으로 admin 전용 엔드포인트 → 403', async () => {
    // viewer 계정 생성
    const viewerName = `viewer_${Date.now()}`;
    const hash = await bcrypt.hash('pass', 10);
    await nextDb.user.create({
      data: { username: viewerName, passwordHash: hash, role: 'viewer' },
    });

    const loginRes = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: viewerName, password: 'pass' });
    const token = loginRes.body.accessToken as string;

    // catalog POST 는 adminOnly
    const res = await request(app)
      .post('/api/v2/catalog/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'test', name: '테스트', sortOrder: 0 });

    expect(res.status).toBe(403);

    // 정리
    await nextDb.user.deleteMany({ where: { username: viewerName } });
  });
});
