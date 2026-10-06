/**
 * 기준정보 라우트 — 올리면 **전원에게 적용**되고, 카탈로그의 직종 값이 코드로 승격된다.
 *
 * 승격이 이 테스트의 핵심이다: 시드가 넣은 「통신내선공」이 1086 이 되어야, 나중에 직종
 * 이름이 바뀌어도 카탈로그가 그대로 이어진다.
 */
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestMaster, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };
const hwp = join(__dirname, 'fixtures', 'wage-2026H1.hwp');

describe('기준정보 — 노임단가', () => {
  let created: string[] = [];
  /* 이 테스트는 「적용 중」을 갈아 끼운다 — 끝나면 원래대로 돌려놓는다. 개발 DB 를 공유하므로
     테스트를 돌렸다고 화면의 기준정보가 내려가 있으면 안 된다. */
  let wasActive: string[] = [];

  beforeAll(async () => {
    await sweepTestFixtures();
    wasActive = (await nextDb.laborStandard.findMany({ where: { active: true }, select: { id: true } })).map((r) => r.id);
  });

  afterAll(async () => {
    if (created.length) await nextDb.laborStandard.deleteMany({ where: { id: { in: created } } });
    if (wasActive.length) {
      await nextDb.laborStandard.updateMany({ where: { id: { in: wasActive } }, data: { active: true } });
    }
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
      values: expect.arrayContaining([{ date: '2026.1.1', wage: 284880 }]),
    });
    // 한 파일이 회차를 여럿 담는다 — 값이 있는 칸만 쌓인다.
    expect(res.body.cellCount).toBeGreaterThan(res.body.rows.length);
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
    const cat = await nextDb.cableType.findUniqueOrThrow({ where: { id: (await ensureTestMaster()).powerCableId } });
    const before = cat.laborCode;
    await nextDb.cableType.update({ where: { id: cat.id }, data: { laborCode: '통신외선공' } });

    const res = await request(app).post('/api/v2/standards/wage').set(admin).attach('file', hwp).expect(201);
    created.push(res.body.id);
    expect(res.body.effective).toBe('2026년도 상반기');
    expect(res.body.promoted).toBeGreaterThan(0);

    const after = await nextDb.cableType.findUniqueOrThrow({ where: { id: cat.id } });
    expect(after.laborCode).toBe('1088'); // 통신외선공
    await nextDb.cableType.update({ where: { id: cat.id }, data: { laborCode: before } });
  });

  /* 각주는 **그 행**이 들고 있다 — 판에서 읽으면 옛 회차 값에 새 판의 설명이 붙는다. */
  it('각주는 값과 같은 회차의 문장이다', async () => {
    const wages = (await request(app).get('/api/v2/standards/wages').set(admin).expect(200)).body;
    const row = wages.rows.find((r: { code: string }) => r.code === '1032');
    expect(row.marker).toBe('**');
    expect(row.markerNote).toContain('조사되지 않은 직종');
    // 최신 회차 직종은 각주가 없다.
    const normal = wages.rows.find((r: { code: string }) => r.code === '1086');
    expect(normal.marker).toBe('');
    expect(normal.markerNote).toBeNull();
  });

  /* 노임은 판을 갈아 끼우지 않는다 — 눌러도 안 바뀌는 버튼을 만들지 않기 위해 서버가 막는다. */
  it('노임 임포트 기록은 「적용」할 수 없다', async () => {
    const list = (await request(app).get('/api/v2/standards').set(admin).expect(200)).body;
    const wageLog = list.find((r: { kind: string }) => r.kind === 'wage');
    expect(wageLog.active).toBe(false);
    await request(app)
      .post(`/api/v2/standards/${wageLog.id}/activate`)
      .set(admin)
      .expect(409)
      .then((r) => expect(r.body.error).toBe('NOT_VERSIONED'));
  });

  it('같은 파일을 다시 올려도 값이 늘지 않는다 — (직종, 기준일) 하나에 값 하나', async () => {
    const before = await nextDb.laborRate.count();
    const res = await request(app).post('/api/v2/standards/wage').set(admin).attach('file', hwp).expect(201);
    created.push(res.body.id);
    expect(await nextDb.laborRate.count()).toBe(before);
  });

  /* 임포트한 것을 **볼 수 있어야** 한다 — 카드가 「직종 123개」라고만 말하면 확인할 길이 없다. */
  it('직종 노임을 회차별로 펼쳐 돌려준다', async () => {
    const body = (await request(app).get('/api/v2/standards/wages').set(admin).expect(200)).body;
    expect(body.dates[0]).toBe('2026.1.1');
    expect(body.dates).toHaveLength(4);

    const t = body.rows.find((r: { code: string }) => r.code === '1086');
    expect(t.name).toBe('통신내선공');
    expect(t.wages['2026.1.1']).toBe(284880);
    expect(t.wages['2024.9.1']).toBe(275107);

    /* 그 회차에 조사되지 않았으면 **키가 없다** — 0 이 아니다. */
    const missing = body.rows.find((r: { code: string }) => r.code === '1032');
    expect(missing.wages['2026.1.1']).toBeUndefined();
    expect(missing.wages['2025.9.1']).toBe(210772);
    expect(missing.markerNote).toContain('조사되지 않은 직종');
  });

  it('제비율은 표를 펼쳐 저장한다', async () => {
    const xlsx = join(__dirname, 'fixtures', 'overhead-2026.xlsx');
    await request(app)
      .post('/api/v2/standards/overhead')
      .set(viewer)
      .attach('file', xlsx)
      .expect(403);

    const pre = (
      await request(app).post('/api/v2/standards/overhead/preview').set(admin).attach('file', xlsx).expect(200)
    ).body;
    expect(pre.kind).toBe('전기통신소방전문');
    expect(pre.bySize.이윤['10억미만']).toBeCloseTo(0.15, 5);

    const res = await request(app).post('/api/v2/standards/overhead').set(admin).attach('file', xlsx).expect(201);
    created.push(res.body.id);

    /* 카탈로그 API 를 통해 적용 중인 기준정보를 읽는다 — 화면이 사용하는 유일한 통로다. */
    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const overheadStandard = catalog.overheadStandard as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(overheadStandard).not.toBeNull();
    /* 요율은 **구간마다 다르다** — 이 값이 상수로 굳으면 공사가 커질 때 조용히 틀린다. */
    expect(overheadStandard.byDuration.간접노무비['10억미만']['183']).toBeCloseTo(0.191, 5);
    expect(overheadStandard.bySize.일반관리비['1000억이상']).toBeCloseTo(0.045, 5);
    expect(overheadStandard.sanan['5-50억'].base).toBe(3_300_000);

    // 노임과 제비율은 서로를 밀어내지 않는다 — 종류마다 「적용 중」이 하나씩이다.
    expect(catalog.wageStandard).not.toBeNull();
  });

  it('제비율 자리에 엉뚱한 파일을 올리면 422', async () => {
    await request(app)
      .post('/api/v2/standards/overhead')
      .set(admin)
      .attach('file', Buffer.from('그냥 글자'), 'wrong.xlsx')
      .expect(422)
      .then((r) => expect(r.body.error).toBe('BAD_FORMAT'));
  });

  it('제비율은 새 판을 올리면 이전 판이 내려가고 목록에는 남는다', async () => {
    const xlsx = join(__dirname, 'fixtures', 'overhead-2026.xlsx');
    const res = await request(app).post('/api/v2/standards/overhead').set(admin).attach('file', xlsx).expect(201);
    created.push(res.body.id);

    const list = (await request(app).get('/api/v2/standards').set(admin).expect(200)).body;
    const rows = list.filter((r: { kind: string }) => r.kind === 'overhead');
    /* 「적용 중」은 하나이고, 그것이 방금 올린 판이다. 목록 **차례**로 확인하지 않는다 —
       같은 초에 올린 두 판은 순서가 정해지지 않는다. */
    const active = rows.filter((r: { active: boolean }) => r.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(res.body.id);
    expect(rows.length).toBeGreaterThan(1); // 이전 판은 남는다

    /* 이전 판으로 되돌릴 수 있다 — 지난 설계서를 그때 요율로 다시 보려면 필요하다. */
    const older = rows.find((r: { id: string; active: boolean }) => !r.active);
    if (older) {
      await request(app).post(`/api/v2/standards/${older.id}/activate`).set(admin).expect(204);
      const again = (await request(app).get('/api/v2/standards').set(admin).expect(200)).body;
      const act = again.filter((r: { kind: string; active: boolean }) => r.kind === 'overhead' && r.active);
      expect(act).toHaveLength(1);
      expect(act[0].id).toBe(older.id);
    }
  });
});
