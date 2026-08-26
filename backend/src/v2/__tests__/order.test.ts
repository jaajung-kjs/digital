/**
 * 순서 저장 — **조직과 대장이 같은 문을 쓴다**.
 *
 * 예전에는 조직만 순서를 바꿀 수 있었고(줄마다 PATCH), 같은 트리 판을 쓰는 대장들은 길이
 * 아예 없었다. 종류마다 길을 내면 그렇게 갈린다.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-ord-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let hqId: string, s1: string, s2: string, s3: string, brId: string;

const order = (body: unknown) => request(app).patch('/api/v2/order').set(admin).send(body as object);

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  hqId = hq.id;
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  brId = br.id;
  const mk = async (name: string, sortOrder: number) =>
    (await nextDb.substation.create({ data: { name: `${uniq}-${name}`, branchId: br.id, sortOrder } })).id;
  s1 = await mk('a', 0);
  s2 = await mk('b', 1);
  s3 = await mk('c', 2);
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('PATCH /api/v2/order', () => {
  it('받은 차례대로 0,1,2… 로 다시 매긴다 — 화면이 본 순서가 곧 서버의 순서다', async () => {
    await order({ kind: 'substations', ids: [s3, s1, s2] }).expect(204);

    const rows = await nextDb.substation.findMany({ where: { branchId: brId }, orderBy: { sortOrder: 'asc' } });
    expect(rows.map((r) => r.id)).toEqual([s3, s1, s2]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it('대장도 같은 문을 쓴다 — 분류의 순서', async () => {
    const ids = (await nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } })).map((c) => c.id);
    const flipped = [...ids].reverse();

    await order({ kind: 'categories', ids: flipped }).expect(204);

    const after = (await nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } })).map((c) => c.id);
    expect(after).toEqual(flipped);

    await order({ kind: 'categories', ids }).expect(204); // 원래대로
  });

  it('없는 id 가 섞이면 **전부 되돌아간다** — 절반만 매겨진 순서는 목록을 뒤섞는다', async () => {
    const before = await nextDb.substation.findMany({ where: { branchId: brId }, orderBy: { sortOrder: 'asc' } });

    await order({ kind: 'substations', ids: [s1, randomUUID(), s2] }).expect(404);

    const after = await nextDb.substation.findMany({ where: { branchId: brId }, orderBy: { sortOrder: 'asc' } });
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  });

  it('모르는 종류는 400', async () => {
    await order({ kind: 'floors', ids: [s1] }).expect(400);
  });

  it('viewer 는 순서를 바꿀 수 없다', async () => {
    await request(app)
      .patch('/api/v2/order')
      .set({ Authorization: authHeader('viewer') })
      .send({ kind: 'substations', ids: [s1] })
      .expect(403);
  });

  it('본부·지사도 같은 문이다', async () => {
    await order({ kind: 'headquarters', ids: [hqId] }).expect(204);
    await order({ kind: 'branches', ids: [brId] }).expect(204);
    expect((await nextDb.headquarters.findUniqueOrThrow({ where: { id: hqId } })).sortOrder).toBe(0);
  });
});
