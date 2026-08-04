import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

  it('DGN 을 올리면 파싱 결과가 층에 저장된다', async () => {
    const dgnBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'test_dgnv8.dgn'));
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dgnBytes, { filename: 'test_dgnv8.dgn' })
      .expect(200);
    expect(res.body.backgroundDrawing.source.fileType).toBe('DGN');
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

describe('POST /api/v2/floors/:id/background — 한글 파일명 mojibake 복구 (M-1)', () => {
  it('한글 파일명이 source.fileName 에 정확히 복원되어 저장된다', async () => {
    // supertest 의 .attach 는 실제 브라우저처럼 UTF-8 바이트를 multipart 파일명에
    // 싣는다 — busboy(멀터 내부)가 이를 latin1 로 잘못 디코드하는 실제 경로를
    // 그대로 재현한다(직접 확인함: 우회 없이 라우트 코드 경로를 그대로 탄다).
    const koreanName = 'A08평면도B1.dwg';
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: koreanName })
      .expect(200);

    expect(res.body.backgroundDrawing.source.fileName).toBe(koreanName);

    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    const saved = row?.backgroundDrawing as { source?: { fileName?: string } } | null;
    expect(saved?.source?.fileName).toBe(koreanName);
  });
});

describe('층 경합 삭제 시 404 (M-3)', () => {
  // findUnique 로 존재를 확인한 뒤 update 하는 사이에 층이 삭제되면 Prisma 가
  // P2025 를 던진다. 진짜 동시 요청으로 그 타이밍 창을 재현하는 건 비결정적이므로,
  // update 호출만 P2025 로 실패하도록 스텁해 "findUnique 는 통과했지만 update 시점엔
  // 없다"는 경합 상황을 결정적으로 재현한다.
  //
  // nextDb.floor 는 Prisma 가 만드는 Proxy 라 own-property 값이 없다
  // (Object.getOwnPropertyDescriptor(nextDb.floor, 'update').value === undefined) —
  // vi.spyOn 은 원래 값을 그 디스크립터로 읽으려다 "Received undefined" 로 실패한다.
  // 대신 메서드를 직접 재할당(Proxy 의 set 트랩은 일반 대입을 허용함)하고
  // afterEach 에서 원본으로 되돌린다.
  const P2025 = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
  const originalUpdate = nextDb.floor.update;

  afterEach(() => {
    nextDb.floor.update = originalUpdate;
  });

  it('POST 중 층이 삭제되면 500 이 아니라 404 NOT_FOUND', async () => {
    nextDb.floor.update = (async () => {
      throw P2025;
    }) as typeof nextDb.floor.update;

    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('DELETE 중 층이 삭제되면 500 이 아니라 404 NOT_FOUND', async () => {
    nextDb.floor.update = (async () => {
      throw P2025;
    }) as typeof nextDb.floor.update;

    const res = await request(app)
      .delete(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .expect(404);
    expect(res.body.error).toBe('NOT_FOUND');
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

    // Prisma 의 일반 조회는 SQL NULL 과 JSON null 리터럴을 구분하지 않고 둘 다 JS null 로
    // 돌려준다. 여기서는 raw 로 실제 컬럼 값을 확인해, 삭제가 "새로 만든 층"과 같은
    // 표현(SQL NULL, Prisma.DbNull)을 쓰는지 검증한다 — JSON null 리터럴(Prisma.JsonNull)
    // 이었다면 이 단언이 실패한다.
    const [raw] = await nextDb.$queryRaw<{ is_sql_null: boolean }[]>`
      SELECT "backgroundDrawing" IS NULL AS is_sql_null FROM "Floor" WHERE id = ${floorId}
    `;
    expect(raw.is_sql_null).toBe(true);
  });

  it('비관리자는 403', async () => {
    await request(app).delete(`/api/v2/floors/${floorId}/background`).set(viewer).expect(403);
  });
});
