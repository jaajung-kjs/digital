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

/**
 * 도면 읽기는 **DB 를 건드리지 않는다** — 읽은 결과를 돌려줄 뿐이고, 층에 붙이는 일은 저장이 한다.
 *
 * 예전에는 이 라우트가 층 행을 바로 고쳤다. 그래서 배경만 「누르는 즉시」 반영돼 같은 화면의
 * 자산·케이블과 규칙이 갈렸다(되돌리기도 듣지 않았다). 이제는 사진과 같은 어법이다.
 */
describe('POST /api/v2/background/parse', () => {
  it('관리자가 DWG 를 올리면 읽은 도면이 돌아온다 — 저장하지는 않는다', async () => {
    const res = await request(app)
      .post('/api/v2/background/parse')
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(200);

    expect(res.body.source.fileType).toBe('DWG');
    expect(res.body.paths.length).toBeGreaterThan(0);

    /* 층은 그대로다 — 서버로 가는 것은 커밋이다(`commitPayloadSchema.floors`). */
    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    expect(row?.backgroundDrawing ?? null).toBeNull();
  });

  it('DGN 도 읽는다', async () => {
    const dgnBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'test_dgnv8.dgn'));
    const res = await request(app)
      .post('/api/v2/background/parse')
      .set(admin)
      .attach('file', dgnBytes, { filename: 'test_dgnv8.dgn' })
      .expect(200);
    expect(res.body.source.fileType).toBe('DGN');
  });

  it('미지원 확장자는 400 UNSUPPORTED_FORMAT', async () => {
    const res = await request(app)
      .post('/api/v2/background/parse')
      .set(admin)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'drawing.pdf' })
      .expect(400);
    expect(res.body.error).toBe('UNSUPPORTED_FORMAT');
    expect(res.body.message).toMatch(/DXF/);
  });

  // 권한 검사는 파싱 이전에 끝난다 — 실제 도면을 실을 이유가 없다. 197KB 본문을
  // 올리면 서버가 본문을 다 읽기 전에 거절해 클라이언트가 EPIPE 로 깨진다(산발적 실패).
  const tiny = Buffer.from('x');

  it('비관리자는 403', async () => {
    await request(app).post('/api/v2/background/parse').set(viewer).attach('file', tiny, { filename: 'plan-sample.dwg' }).expect(403);
  });

  it('미인증은 401', async () => {
    await request(app).post('/api/v2/background/parse').attach('file', tiny, { filename: 'plan-sample.dwg' }).expect(401);
  });
});

describe('POST /api/v2/background/parse — 한글 파일명 mojibake 복구 (M-1)', () => {
  it('한글 파일명이 source.fileName 에 정확히 복원된다', async () => {
    // supertest 의 .attach 는 실제 브라우저처럼 UTF-8 바이트를 multipart 파일명에
    // 싣는다 — busboy(멀터 내부)가 이를 latin1 로 잘못 디코드하는 실제 경로를
    // 그대로 재현한다(직접 확인함: 우회 없이 라우트 코드 경로를 그대로 탄다).
    const koreanName = 'A08평면도B1.dwg';
    const res = await request(app)
      .post('/api/v2/background/parse')
      .set(admin)
      .attach('file', dwg, { filename: koreanName })
      .expect(200);

    expect(res.body.source.fileName).toBe(koreanName);
  });
});
