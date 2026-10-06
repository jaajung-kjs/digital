/**
 * v2 자립 인증 통합 테스트
 * - 실 DB (digital_next) 사용
 * - 테스트 계정은 각 suite 에서 직접 생성/삭제 (seed admin 과 충돌 방지)
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nextDb } from '../db.js';
import { makeApp, sweepTestFixtures } from './helpers.js';
import { MAX_FAILED_LOGINS } from '../auth.service.js';

const app = makeApp();

// ── 테스트 픽스처 ─────────────────────────────────────────────────────────────

const TEST_USERNAME = `test_auth_${Date.now()}`;
const TEST_PASSWORD = 'testPass123!';

beforeAll(async () => {
  await sweepTestFixtures(); // 과거 런 잔재 회수 — 정리는 공유 스윕 한 곳
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  await nextDb.user.upsert({
    where: { username: TEST_USERNAME },
    update: {},
    create: { username: TEST_USERNAME, passwordHash: hash, role: 'admin' },
  });
});

afterAll(async () => {
  await sweepTestFixtures();
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
    // 비밀번호 해시 노출 금지
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('passwordHash');
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

  it('존재하지 않는 사용자도 bcrypt 를 거친다 — 응답 시간으로 계정 열거 불가', async () => {
    // 사용자가 없을 때 즉시 반환하면 "없음"(2ms)과 "비밀번호 틀림"(56ms)의
    // 응답 시간이 24배 차이 나 계정 존재 여부가 드러난다(실측). 로그인 시도
    // 제한이 없는 현재 상태와 겹치면 열거 → 무제한 대입으로 이어진다.
    // 타이밍 자체는 CI 에서 불안정하므로, 더미 해시 비교가 실제로 일어나는지를 고정한다.
    const spy = vi.spyOn(bcrypt, 'compare');
    try {
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'definitely-no-such-user-xyz', password: 'whatever' })
        .expect(401);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
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
    // 비밀번호 해시 노출 금지
    expect(res.body).not.toHaveProperty('passwordHash');
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

    // 조직 POST 는 adminOnly (카탈로그 API 는 뒤 태스크에서 다시 선다)
    const res = await request(app)
      .post('/api/v2/org/headquarters')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 't3-auth-viewer-hq' });

    expect(res.status).toBe(403);

    // 정리
    await nextDb.user.deleteMany({ where: { username: viewerName } });
  });
});

describe('로그인 시도 제한', () => {
  const LOCK_USER = `test_lock_${Date.now()}`;
  const PW = 'lockPass123!';

  beforeAll(async () => {
    const hash = await bcrypt.hash(PW, 10);
    await nextDb.user.upsert({
      where: { username: LOCK_USER },
      update: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      create: { username: LOCK_USER, passwordHash: hash, role: 'viewer' },
    });
  });

  const login = (password: string) =>
    request(app).post('/api/v2/auth/login').send({ username: LOCK_USER, password });

  const reset = () =>
    nextDb.user.update({ where: { username: LOCK_USER }, data: { failedLoginCount: 0, lockedUntil: null } });

  it('연속 실패가 임계치에 닿으면 잠긴다 — 그 뒤엔 올바른 비밀번호도 거절', async () => {
    await reset();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login('wrong').expect(401);

    const res = await login(PW).expect(423);
    expect(res.body.error).toBe('ACCOUNT_LOCKED');

    const row = await nextDb.user.findUnique({ where: { username: LOCK_USER } });
    expect(row?.lockedUntil).not.toBeNull();
  });

  it('잠긴 계정에 **틀린** 비밀번호를 넣으면 잠김 사실을 알리지 않는다 — 계정 열거 방지', async () => {
    // 비밀번호를 맞힌 사람만 이유를 알 자격이 있다. 틀린 사람에게 "잠김" 이라고 하면
    // 그 계정이 존재한다는 것을 알려주는 셈이라, 더미 해시로 막아 둔 열거가 도로 열린다.
    const res = await login('wrong').expect(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('잠긴 동안의 실패는 잠금을 연장하지 않는다 — 남이 계속 틀려서 영구 잠금이 되지 않게', async () => {
    const before = await nextDb.user.findUnique({ where: { username: LOCK_USER } });
    await login('wrong').expect(401);
    const after = await nextDb.user.findUnique({ where: { username: LOCK_USER } });
    expect(after?.lockedUntil?.getTime()).toBe(before?.lockedUntil?.getTime());
  });

  it('잠금이 풀리면 정상 로그인되고 실패 기록도 지워진다', async () => {
    await nextDb.user.update({
      where: { username: LOCK_USER },
      data: { lockedUntil: new Date(Date.now() - 1000), failedLoginCount: 3 },
    });
    await login(PW).expect(200);
    const row = await nextDb.user.findUnique({ where: { username: LOCK_USER } });
    expect(row?.failedLoginCount).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it('임계치 미만에서 성공하면 카운터가 초기화된다', async () => {
    await reset();
    await login('wrong').expect(401);
    await login('wrong').expect(401);
    await login(PW).expect(200);
    const row = await nextDb.user.findUnique({ where: { username: LOCK_USER } });
    expect(row?.failedLoginCount).toBe(0);
  });

  it('없는 계정은 잠금 여부와 무관하게 항상 같은 401 — 존재 여부가 새지 않는다', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: `no_such_user_${Date.now()}`, password: 'whatever' })
      .expect(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});
