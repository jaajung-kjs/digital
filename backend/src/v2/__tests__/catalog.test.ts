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
    expect(res.body.types.length).toBeGreaterThanOrEqual(26);
    const rack = res.body.types.find((t: { key: string }) => t.key === 'RACK');
    expect(rack.containerSpecs[0]).toMatchObject({ slotCount: 12, allowSpan: true });
    const groups = res.body.cableGroups;
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups.flatMap((g: { categories: unknown[] }) => g.categories).length).toBeGreaterThanOrEqual(17);
  });

  it('v2 health', async () => {
    const res = await request(app).get('/api/v2/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', model: 'v2' });
  });
});
