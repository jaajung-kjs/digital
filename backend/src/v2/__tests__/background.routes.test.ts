import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';
import { nextDb } from '../db.js';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dwg = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-sample.dwg'));

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };

// 스윕 prefix 규약: helpers.ts 의 nameStartsWith 에 't6-bg-' 를 추가해야 회수된다.
const PREFIX = 't6-bg-';
let floorId = '';

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${PREFIX}hq` } });
  const br = await nextDb.branch.create({ data: { name: `${PREFIX}br`, headquartersId: hq.id } });
  const ss = await nextDb.substation.create({ data: { name: `${PREFIX}ss`, branchId: br.id } });
  const fl = await nextDb.floor.create({ data: { name: `${PREFIX}1F`, substationId: ss.id } });
  floorId = fl.id;
});

afterAll(async () => {
  await sweepTestFixtures();
});

describe('POST /api/v2/floors/:id/background', () => {
  it('관리자가 DWG 를 올리면 파싱 결과가 층에 저장되고 갱신된 층이 반환된다', async () => {
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(200);

    expect(res.body.id).toBe(floorId);
    expect(res.body.backgroundDrawing).toBeTruthy();
    expect(res.body.backgroundDrawing.source.fileType).toBe('DWG');
    expect(res.body.backgroundDrawing.paths.length).toBeGreaterThan(0);

    // DB 에 실제로 저장되었는지 확인한다(응답만 맞고 저장이 빠지는 실수 방지).
    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    expect(row?.backgroundDrawing).toBeTruthy();
  });

  it('미지원 확장자는 400 UNSUPPORTED_FORMAT', async () => {
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'drawing.pdf' })
      .expect(400);
    expect(res.body.error).toBe('UNSUPPORTED_FORMAT');
    expect(res.body.message).toMatch(/DXF/);
  });

  it('없는 층은 404', async () => {
    const res = await request(app)
      .post('/api/v2/floors/00000000-0000-0000-0000-000000000000/background')
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('비관리자는 403', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(viewer)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(403);
  });

  it('미인증은 401', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(401);
  });
});

describe('DELETE /api/v2/floors/:id/background', () => {
  it('배경을 제거하면 null 이 되고 갱신된 층이 반환된다', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(200);

    const res = await request(app)
      .delete(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .expect(200);

    expect(res.body.backgroundDrawing).toBeNull();
    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    expect(row?.backgroundDrawing).toBeNull();
  });

  it('비관리자는 403', async () => {
    await request(app).delete(`/api/v2/floors/${floorId}/background`).set(viewer).expect(403);
  });
});
