import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();

describe('GET /api/v2/catalog', () => {
  it('무인증 → 401', async () => {
    await request(app).get('/api/v2/catalog').expect(401);
  });

  it('시드 카탈로그 전체를 반환한다', async () => {
    const res = await request(app).get('/api/v2/catalog').set('Authorization', authHeader()).expect(200);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(4);
    expect(res.body.types.length).toBeGreaterThanOrEqual(23);
    /* 자리는 설비 종류의 것이다 — 랙이라는 타입은 없어졌고 OFD 는 경로슬롯을 담은 설비 종류다.
       격자 크기는 더 이상 종류마다 갖지 않는다(`ASSEMBLY_GRID` 하나) — 그래서 여기서 세지 않는다. */
    const ofd = res.body.assemblies.find((a: { key: string }) => a.key === 'OFD');
    expect(ofd.items).toHaveLength(4);
    const groups = res.body.cableGroups;
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups.flatMap((g: { categories: unknown[] }) => g.categories).length).toBeGreaterThanOrEqual(17);
  });

  it('v2 health', async () => {
    const res = await request(app).get('/api/v2/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', model: 'v2' });
  });
});
