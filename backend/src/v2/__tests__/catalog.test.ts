import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();

describe('GET /api/v2/catalog', () => {
  it('무인증 → 401', async () => {
    await request(app).get('/api/v2/catalog').expect(401);
  });

  /**
   * 시드가 채우는 것 — **고정 어휘와 광분배함뿐**이다.
   *
   * 예전에는 「장비 품목 23종 이상」을 못 박았다. 그런데 그 스물셋은 재구축 초기의 임시값이라
   * 실물을 보고 카탈로그를 다시 짜면서 지웠고, 그 순간 이 시험이 무너졌다 — 지키던 것이
   * 「시드에 무엇이 들었나」였기 때문이다. 그건 시험이 지킬 사실이 아니다(운영이 정한다).
   *
   * 남은 것만 센다: **고정 어휘**(분류·케이블 그룹·종류)는 사용자가 늘리거나 지울 수 없고,
   * **광분배함**은 강원 직할 12국이 그것으로 서 있어 시드가 계속 만들어야 한다.
   */
  it('시드는 고정 어휘와 광분배함을 채운다', async () => {
    const res = await request(app).get('/api/v2/catalog').set('Authorization', authHeader()).expect(200);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(4);
    const groups = res.body.cableGroups;
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups.flatMap((g: { categories: unknown[] }) => g.categories).length).toBeGreaterThanOrEqual(17);

    /* 판은 **가로로 꽂히는 카드** 여덟 자리다 — 강원 12국의 OFD 가 이 모양으로 서 있다. */
    const ofd = res.body.assemblies.find((a: { key: string }) => a.key === 'OFD');
    expect(ofd.items).toHaveLength(8);
    expect(res.body.types.some((t: { key: string }) => t.key === 'OFD-SLOT')).toBe(true);
  });

  it('v2 health', async () => {
    const res = await request(app).get('/api/v2/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', model: 'v2' });
  });
});
