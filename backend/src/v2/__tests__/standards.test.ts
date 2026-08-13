/**
 * 기준자료 라우트 — 올리면 **전원에게 적용**되고, 카탈로그의 직종 값이 코드로 승격된다.
 *
 * 승격이 이 테스트의 핵심이다: 시드가 넣은 「통신내선공」이 1086 이 되어야, 나중에 직종
 * 이름이 바뀌어도 카탈로그가 그대로 이어진다.
 */
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };
const hwp = join(__dirname, 'fixtures', 'wage-2026H1.hwp');

describe('기준자료 — 노임단가', () => {
  let created: string[] = [];

  beforeAll(async () => {
    await sweepTestFixtures();
  });

  afterAll(async () => {
    if (created.length) await nextDb.laborStandard.deleteMany({ where: { id: { in: created } } });
    await nextDb.$disconnect();
  });

  it('viewer 는 올리지 못한다', async () => {
    await request(app).post('/api/v2/standards/wage/preview').set(viewer).attach('file', hwp).expect(403);
    await request(app).post('/api/v2/standards/wage').set(viewer).attach('file', hwp).expect(403);
  });

  it('미리보기는 적용시기·직종과 함께 **지금 카탈로그에 미치는 영향**을 알려준다', async () => {
    const res = await request(app)
      .post('/api/v2/standards/wage/preview')
      .set(admin)
      .attach('file', hwp)
      .expect(200);

    expect(res.body.effective).toBe('2026년도 상반기');
    expect(res.body.rows.length).toBeGreaterThan(50);
    expect(res.body.rows.find((r: { name: string }) => r.name === '통신내선공')).toMatchObject({
      code: '1086',
      wage: 284880,
    });
    // 승격 대상과 미아는 배열로 온다 — 화면이 그대로 짚어 준다.
    expect(Array.isArray(res.body.promote)).toBe(true);
    expect(Array.isArray(res.body.orphans)).toBe(true);
  });

  it('HWP 가 아니면 422 로 거절한다 — 저장되지 않는다', async () => {
    const before = await nextDb.laborStandard.count();
    await request(app)
      .post('/api/v2/standards/wage')
      .set(admin)
      .attach('file', Buffer.from('그냥 글자'), 'wrong.hwp')
      .expect(422)
      .then((r) => expect(r.body.error).toBe('BAD_FORMAT'));
    expect(await nextDb.laborStandard.count()).toBe(before);
  });

  it('등록하면 적용 중이 되고, 이름으로 있던 직종이 코드로 승격된다', async () => {
    /* 승격 대상을 하나 심는다 — 시드 상태에 기대지 않는다(이미 승격됐을 수 있다). */
    const cat = await nextDb.cableCategory.findFirstOrThrow();
    const before = cat.laborCode;
    await nextDb.cableCategory.update({ where: { id: cat.id }, data: { laborCode: '통신외선공' } });

    const res = await request(app).post('/api/v2/standards/wage').set(admin).attach('file', hwp).expect(201);
    created.push(res.body.id);
    expect(res.body.effective).toBe('2026년도 상반기');
    expect(res.body.promoted).toBeGreaterThan(0);

    const after = await nextDb.cableCategory.findUniqueOrThrow({ where: { id: cat.id } });
    expect(after.laborCode).toBe('1088'); // 통신외선공
    await nextDb.cableCategory.update({ where: { id: cat.id }, data: { laborCode: before } });

    // 적용 중인 판은 카탈로그에 실려 온다 — 드롭다운과 설계서가 같은 판을 본다.
    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    expect(catalog.wageStandard.effective).toBe('2026년도 상반기');
    expect(catalog.wageStandard.rows.length).toBeGreaterThan(50);
  });

  it('두 번째 판을 올리면 이전 판은 내려가고 목록에는 남는다', async () => {
    const res = await request(app).post('/api/v2/standards/wage').set(admin).attach('file', hwp).expect(201);
    created.push(res.body.id);

    const list = (await request(app).get('/api/v2/standards').set(admin).expect(200)).body;
    const wages = list.filter((r: { kind: string }) => r.kind === 'wage');
    expect(wages.filter((r: { active: boolean }) => r.active)).toHaveLength(1);
    expect(wages[0].id).toBe(res.body.id); // 최신이 위

    /* 이전 판으로 되돌릴 수 있다 — 지난 설계서를 그때 값으로 다시 보려면 필요하다. */
    const older = wages.find((r: { id: string }) => r.id === created[0]);
    if (older) {
      await request(app).post(`/api/v2/standards/${older.id}/activate`).set(admin).expect(204);
      const again = (await request(app).get('/api/v2/standards').set(admin).expect(200)).body;
      const act = again.filter((r: { kind: string; active: boolean }) => r.kind === 'wage' && r.active);
      expect(act).toHaveLength(1);
      expect(act[0].id).toBe(older.id);
    }
  });
});
