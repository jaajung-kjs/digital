/**
 * catalog.crud.test.ts — Stage 6 카탈로그 CRUD 통합 테스트
 * 기존 v2 통합테스트(org.test.ts 등)의 셋업 관례를 그대로 따른다.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-cat-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };

/** 테스트에서 생성한 카탈로그 항목 정리용 키 접두사 */
const KEY_PREFIX = `TEST_${Date.now()}`;

/**
 * 유효한 typeUpsert payload 생성 헬퍼.
 * 기본값은 ports 없음 (단순 배치형 타입).
 */
function makeTypeBody(categoryId: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    key: `${KEY_PREFIX}_TYPE`,
    name: '테스트 타입',
    categoryId,
    sortOrder: 999,
        defaultWidth: 60,
    defaultHeight: 80,
    laborCode: null,
    installManDays: 0,
    removeManDays: 0,
    relocateManDays: 0,
    ports: [],
    ...extra,
  };
}

/**
 * 포트 2그룹 + 링크 조합 (validSpec 기준):
 * - fiberIn(IN, count=2) / fiberOut(OUT, count=2)
 * - link: fiberIn → fiberOut byIndex
 * namePattern 에 {n} 필수 (count > 1)
 */
const VALID_PORTS = [
  { group: 'fiberIn', count: 2, direction: 'IN' as const, medium: 'fiber', namePattern: '입력 {n}' },
  { group: 'fiberOut', count: 2, direction: 'OUT' as const, medium: 'fiber', namePattern: '출력 {n}' },
];

/** 다심 포트 왕복용 — trunk 하나가 코어 24가닥을 나르는 인입 포트. */
const MULTI_CORE_PORTS = [
  { group: 'core', count: 24, direction: 'BI' as const, medium: 'fiber', namePattern: '광 {n}' },
  { group: 'trunk', count: 1, direction: 'BI' as const, medium: 'fiber', namePattern: 'OPGW', positions: 24 },
];

describe('catalog CRUD', () => {
  // 테스트에서 생성한 카테고리/타입 ID
  let catId: string;
  let typeId: string;
  let cableGroupId: string;
  let cableCatId: string;
  /* 그룹은 통째로 PUT 한다 — 제 이름·색을 함께 실어 보내지 않으면 그것까지 바뀐다. */
  let groupName: string;
  let groupColor: string;

  beforeAll(async () => {
    await sweepTestFixtures();
    // 케이블그룹은 시드에서 이미 존재 — 첫 번째 것 사용
    const group = await nextDb.cableGroup.findFirst({ orderBy: { sortOrder: 'asc' } });
    if (!group) throw new Error('cableGroup not seeded');
    cableGroupId = group.id;
    groupName = group.name;
    groupColor = group.color;
  });

  afterAll(async () => {
    // 이 파일의 uniq('t2a-cat-')/KEY_PREFIX('TEST_') 는 공유 sweepTestFixtures 의
    // 안정 prefix 목록에 이미 포함되어 있다 — 파일별 사본을 두지 않고 공유 스윕만 호출.
    await sweepTestFixtures();
    await nextDb.$disconnect();
  });

  it('viewer 는 모든 쓰기 라우트에서 403', async () => {
    // 더미 UUID (존재하지 않아도 auth 체크가 먼저)
    const dummyId = randomUUID();

    await request(app).post('/api/v2/catalog/categories').set(viewer).send({ key: 'X', name: 'X', sortOrder: 0 }).expect(403);
    await request(app).patch(`/api/v2/catalog/categories/${dummyId}`).set(viewer).send({ name: 'X' }).expect(403);
    await request(app).delete(`/api/v2/catalog/categories/${dummyId}`).set(viewer).expect(403);

    await request(app).post('/api/v2/catalog/types').set(viewer).send({}).expect(403);
    await request(app).put(`/api/v2/catalog/types/${dummyId}`).set(viewer).send({}).expect(403);
    await request(app).delete(`/api/v2/catalog/types/${dummyId}`).set(viewer).expect(403);

    await request(app).put(`/api/v2/catalog/cable-groups/${dummyId}`).set(viewer).send({ name: 'X', color: '#000000', categories: [] }).expect(403);
  });

  it('카테고리 생성→수정→삭제, 타입 존재 시 삭제 409 CATEGORY_IN_USE', async () => {
    // 생성
    const createRes = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT`, name: '테스트 분류', sortOrder: 999 })
      .expect(201);
    catId = createRes.body.id;
    expect(catId).toBeTruthy();

    // 수정
    await request(app)
      .patch(`/api/v2/catalog/categories/${catId}`)
      .set(admin)
      .send({ name: '테스트 분류 수정' })
      .expect(200);
    const row = await nextDb.assetCategory.findUnique({ where: { id: catId } });
    expect(row!.name).toBe('테스트 분류 수정');

    // 타입 생성 후 삭제 시도 → 409
    const tRes = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(catId))
      .expect(201);
    const tmpTypeId = tRes.body.id;

    await request(app)
      .delete(`/api/v2/catalog/categories/${catId}`)
      .set(admin)
      .expect(409)
      .then((r) => expect(r.body.error).toBe('CATEGORY_IN_USE'));

    // 타입 삭제 후 카테고리 삭제
    await request(app).delete(`/api/v2/catalog/types/${tmpTypeId}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/catalog/categories/${catId}`).set(admin).expect(204);

    // 재생성 (이후 테스트용)
    const c2 = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT2`, name: '테스트 분류2', sortOrder: 999 })
      .expect(201);
    catId = c2.body.id;
  });

  it('타입 생성: 유효 payload 201 + GET 재조회 시 포트 명세 왕복 일치', async () => {
    const body = makeTypeBody(catId, {
      key: `${KEY_PREFIX}_TYPE_A`,
      ports: VALID_PORTS,
    });

    const res = await request(app).post('/api/v2/catalog/types').set(admin).send(body).expect(201);
    typeId = res.body.id;
    expect(typeId).toBeTruthy();

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const found = catalog.types.find((t: { id: string }) => t.id === typeId);
    expect(found).toBeTruthy();
    expect(found.portTemplates).toHaveLength(2);
    expect(found.portTemplates[0]).toMatchObject({ group: 'fiberIn', count: 2, direction: 'IN', medium: 'fiber', namePattern: '입력 {n}' });
  });

  it('타입 생성: medium 이 케이블그룹에 없으면 400 INVALID_TYPE_SPEC + details 에 ports[i].medium', async () => {
    const body = makeTypeBody(catId, {
      key: `${KEY_PREFIX}_TYPE_INVALID`,
      ports: [{ group: 'x', count: 1, direction: 'BI', medium: 'NO_SUCH_MEDIUM', namePattern: 'X' }],
    });

    const res = await request(app).post('/api/v2/catalog/types').set(admin).send(body).expect(400);
    expect(res.body.error).toBe('INVALID_TYPE_SPEC');
    expect(Array.isArray(res.body.details)).toBe(true);
    const paths = res.body.details.map((d: { path: string }) => d.path) as string[];
    expect(paths.some((p) => p.includes('medium') || p.includes('ports'))).toBe(true);
  });

  it('타입 생성: key 중복이면 409 DUPLICATE_KEY', async () => {
    // typeId 는 이미 생성된 TYPE_A
    const body = makeTypeBody(catId, { key: `${KEY_PREFIX}_TYPE_A` }); // 같은 key
    const res = await request(app).post('/api/v2/catalog/types').set(admin).send(body).expect(409);
    expect(res.body.error).toBe('DUPLICATE_KEY');
  });

  it('타입 생성: 동시 요청 시에도 정확히 1개만 201, 나머지 409 DUPLICATE_KEY (P2002 폴백)', async () => {
    // 사전 findUnique 는 TOCTOU — 동시 요청은 둘 다 통과 가능하므로 DB @unique(P2002) 폴백이 409 로 변환해야 한다.
    // 어느 경로(사전체크/P2002)로든 계약은 동일: 정확히 1개 201, 나머지 409 DUPLICATE_KEY (500 금지).
    const key = `${KEY_PREFIX}_TYPE_RACE`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app).post('/api/v2/catalog/types').set(admin).send(makeTypeBody(catId, { key })),
      ),
    );
    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(3);
    for (const c of conflicts) expect(c.body.error).toBe('DUPLICATE_KEY');
    // 정리
    await request(app).delete(`/api/v2/catalog/types/${created[0].body.id}`).set(admin).expect(204);
  });

  it('PUT: 비구조 필드(이름/공량/배치)는 인스턴스가 있어도 수정된다', async () => {
    // typeId(TYPE_A)에 asset 인스턴스 직접 생성
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss`,
        branch: { create: { name: `${uniq}-br`, headquarters: { create: { name: `${uniq}-hq` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset`, typeId, substationId: sub.id },
    });

    // 기존 구조와 동일하게 유지, 비구조 필드만 변경
    const body = makeTypeBody(catId, {
      name: '수정된 이름',
      installManDays: 3,
      ports: VALID_PORTS,
    });

    await request(app).put(`/api/v2/catalog/types/${typeId}`).set(admin).send(body).expect(200);
    const updated = await nextDb.assetType.findUnique({ where: { id: typeId } });
    expect(updated!.name).toBe('수정된 이름');
    expect(updated!.installManDays).toBe(3);

    // 정리
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  /* 예전에는 자산이 하나라도 있으면 포트를 **한 개도 더할 수 없었다** — 종류를 잘못 등록하면
     할 수 있는 일이 「자산을 다 지우고 다시 만들기」뿐이었다. 지금은 세는 것과 뜻이 갈린다:
     늘리는 것은 아무에게도 해가 없으므로 허용하고, 이미 있는 포트가 **다른 물건이 되는 것**만
     막는다. */
  it('PUT: 인스턴스가 있어도 포트를 늘리는 것은 200 — 그 자산에도 달린다', async () => {
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss2`,
        branch: { create: { name: `${uniq}-br2`, headquarters: { create: { name: `${uniq}-hq2` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset2`, typeId, substationId: sub.id },
    });
    const before = await nextDb.port.count({ where: { assetId: asset.id } });

    // 개수만 늘린다 (2 → 4)
    const more = [
      { group: 'fiberIn', count: 4, direction: 'IN' as const, medium: 'fiber', namePattern: '입력 {n}' },
      { group: 'fiberOut', count: 4, direction: 'OUT' as const, medium: 'fiber', namePattern: '출력 {n}' },
    ];
    await request(app)
      .put(`/api/v2/catalog/types/${typeId}`)
      .set(admin)
      .send(makeTypeBody(catId, { name: '수정된 이름', ports: more }))
      .expect(200);

    // 선언만 고치고 말면 정작 그 자산은 그대로다 — 이미 놓인 자산에도 달려야 한다.
    expect(await nextDb.port.count({ where: { assetId: asset.id } })).toBe(before + 4);

    // 정리
    await nextDb.port.deleteMany({ where: { assetId: asset.id } });
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br2` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq2` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  it('PUT: 인스턴스가 있으면 이미 있는 포트의 **뜻**을 바꿀 수 없다 — 409 TYPE_IN_USE', async () => {
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss2b`,
        branch: { create: { name: `${uniq}-br2b`, headquarters: { create: { name: `${uniq}-hq2b` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset2b`, typeId, substationId: sub.id },
    });

    // 같은 구획·같은 개수인데 이름 규칙이 달라진다 — 개수 문제가 아니라 이미 있는 포트가
    // 다른 물건이 되는 일이다(앞 시험이 개수를 4로 늘려 두었으므로 개수는 그대로 4).
    const redefined = [
      { group: 'fiberIn', count: 4, direction: 'IN' as const, medium: 'fiber', namePattern: 'IN {n}' },
      { group: 'fiberOut', count: 4, direction: 'OUT' as const, medium: 'fiber', namePattern: 'OUT {n}' },
    ];
    const res = await request(app)
      .put(`/api/v2/catalog/types/${typeId}`)
      .set(admin)
      .send(makeTypeBody(catId, { name: '수정된 이름', ports: redefined }))
      .expect(409);
    expect(res.body.error).toBe('TYPE_IN_USE');

    // 정리
    await nextDb.port.deleteMany({ where: { assetId: asset.id } });
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br2b` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq2b` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  it('PUT: 인스턴스 존재라도 구조가 기존과 동일하면 200 (동일성 비교는 id 제외 정렬 후)', async () => {
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss3`,
        branch: { create: { name: `${uniq}-br3`, headquarters: { create: { name: `${uniq}-hq3` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset3`, typeId, substationId: sub.id },
    });

    // 기존 구조와 동일 (VALID_PORTS/LINKS/CONTAINERS)
    const body = makeTypeBody(catId, {
      name: '같은 구조 다른 이름',
      ports: VALID_PORTS,
    });

    await request(app).put(`/api/v2/catalog/types/${typeId}`).set(admin).send(body).expect(200);

    // 정리
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br3` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq3` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  it('DELETE: 인스턴스 존재 시 409 TYPE_IN_USE, 없으면 204 후 GET 에서 사라짐', async () => {
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss4`,
        branch: { create: { name: `${uniq}-br4`, headquarters: { create: { name: `${uniq}-hq4` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset4`, typeId, substationId: sub.id },
    });

    await request(app).delete(`/api/v2/catalog/types/${typeId}`).set(admin).expect(409)
      .then((r) => expect(r.body.error).toBe('TYPE_IN_USE'));

    // 인스턴스 삭제 후 타입 삭제
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br4` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq4` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });

    await request(app).delete(`/api/v2/catalog/types/${typeId}`).set(admin).expect(204);
    typeId = ''; // 정리 완료

    // GET 에서 사라짐 확인
    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    expect(catalog.types.find((t: { key: string }) => t.key === `${KEY_PREFIX}_TYPE_A`)).toBeUndefined();
  });

  it('그룹 PUT — 이름·색과 종류 목록이 한 저장에, 케이블이 물린 것은 409', async () => {
    const put = (categories: unknown[]) =>
      request(app).put(`/api/v2/catalog/cable-groups/${cableGroupId}`).set(admin).send({ name: groupName, color: groupColor, categories });


    /* 목록을 **통째로** 보내는 API 다 — 시드 종류를 함께 실어 보내지 않으면 지워진다.
       이 테스트가 지켜야 하는 계약이기도 하다. */
    const seeded = (
      await nextDb.cableCategory.findMany({ where: { groupId: cableGroupId }, orderBy: { sortOrder: 'asc' } })
    ).map((c) => ({
      id: c.id,
      name: c.name,
      laborCode: c.laborCode,
      installManDays: c.installManDays,
      removeManDays: c.removeManDays,
    }));
    expect(seeded.length).toBeGreaterThan(0);

    /* 그룹 자신(이름·색)도 같은 저장에서 간다 — 대장에서 고치는 값이다. */
    const recolored = (
      await request(app)
        .put(`/api/v2/catalog/cable-groups/${cableGroupId}`)
        .set(admin)
        .send({ name: `${groupName} `, color: '#123456', categories: seeded })
        .expect(200)
    ).body;
    expect(recolored.color).toBe('#123456');
    expect(recolored.name).toBe(groupName); // 앞뒤 공백은 다듬는다
    await put(seeded).expect(200); // 원래 색으로 되돌린다

    // 추가 — id 없는 줄은 새로 생긴다(품셈까지 함께).
    const draft = { name: `${uniq}-ccat`, laborCode: '통신외선공', installManDays: 0.06, removeManDays: 0.03 };
    const created = (await put([...seeded, draft]).expect(200)).body;
    const added = created.categories.find((c: { name: string }) => c.name === draft.name);
    expect(added.installManDays).toBeCloseTo(0.06);
    cableCatId = added.id;

    // 수정 — 이름과 품셈이 **같은 저장**에서 함께 간다
    const edited = (
      await put([...seeded, { ...draft, id: cableCatId, name: `${uniq}-ccat-edited`, installManDays: 0.07 }]).expect(200)
    ).body;
    const row = edited.categories.find((c: { id: string }) => c.id === cableCatId);
    expect(row.name).toBe(`${uniq}-ccat-edited`);
    // 품셈은 종류에서 고친다 — 설계서 공량의 근거가 여기다.
    expect(row.installManDays).toBeCloseTo(0.07);

    // 같은 그룹 안에서 이름이 겹치면 422 — DB 제약(P2002)이 아니라 무엇이 겹쳤는지 말한다
    await put([...seeded, { ...draft, id: cableCatId, name: seeded[0]!.name }])
      .expect(422)
      .then((r) => expect(r.body.error).toBe('DUPLICATE_NAME'));

    // 남의 그룹 종류를 끌어올 수 없다
    const foreign = await nextDb.cableCategory.findFirst({ where: { groupId: { not: cableGroupId } } });
    if (foreign) {
      await put([...seeded, { ...draft, id: foreign.id }])
        .expect(422)
        .then((r) => expect(r.body.error).toBe('INVALID_PARENT'));
    }

    // 케이블이 참조하는 경우 목록에서 빼면 → 409
    // 먼저 케이블을 위한 서브스테이션, 자산, 포트 셋업
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss5`,
        branch: { create: { name: `${uniq}-br5`, headquarters: { create: { name: `${uniq}-hq5` } } } },
      },
    });
    const rackType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
    const assetA = await nextDb.asset.create({ data: { name: `${uniq}-assetA`, typeId: rackType.id, substationId: sub.id } });
    const assetB = await nextDb.asset.create({ data: { name: `${uniq}-assetB`, typeId: rackType.id, substationId: sub.id } });
    // 접지는 포트 없음 — 직접 포트 생성
    const portA = await nextDb.port.create({ data: { assetId: assetA.id, group: 'g', index: 0, name: 'PA', direction: 'BI', medium: 'TEST' } });
    const portB = await nextDb.port.create({ data: { assetId: assetB.id, group: 'g', index: 0, name: 'PB', direction: 'BI', medium: 'TEST' } });
    const cable = await nextDb.cable.create({
      data: { aPortId: portA.id, bPortId: portB.id, categoryId: cableCatId, substationId: sub.id },
    });

    /* 지우는 것은 「목록에서 뺀다」이다 — 한 저장에 여러 줄이 나가므로 **어느 종류가 몇 개**
       걸려 있는지 문구가 짚어야 한다. */
    await put(seeded)
      .expect(409)
      .then((r) => {
        expect(r.body.error).toBe('CABLE_CATEGORY_IN_USE');
        expect(r.body.message).toContain(`${uniq}-ccat-edited`);
      });
    // 거부됐으면 아무것도 바뀌지 않았어야 한다
    expect(await nextDb.cableCategory.count({ where: { id: cableCatId } })).toBe(1);

    // 케이블 삭제 후 다시 빼면 지워진다
    await nextDb.cable.delete({ where: { id: cable.id } });
    const after = (await put(seeded).expect(200)).body;
    expect(after.categories.map((c: { id: string }) => c.id)).toEqual(seeded.map((c) => c.id));
    cableCatId = '';

    // 정리
    await nextDb.port.delete({ where: { id: portA.id } });
    await nextDb.port.delete({ where: { id: portB.id } });
    await nextDb.asset.deleteMany({ where: { substationId: sub.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br5` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq5` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  /* 스키마를 넓혀 놓고 **쓰는 곳을 빼먹는** 결함이 세 번 났다(케이블 품셈, 설비 자재단가).
     세 담체가 같은 다섯 칸을 쓰므로, 한 번에 왕복으로 잠근다. */
  it('공량·단가 다섯 칸이 세 담체 모두에서 저장·조회된다', async () => {
    const spec = { laborCode: '1086', unitPrice: 12345, installManDays: 1.5, removeManDays: 0.5, relocateManDays: 2.5 };

    // 장비 품목
    const t = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(catId, { key: `${KEY_PREFIX}_SPEC`, ...spec }))
      .expect(201);
    // 설비 품목
    const a = await request(app)
      .post('/api/v2/catalog/assemblies')
      .set(admin)
      .send({ name: `${uniq}-asm-spec`, categoryId: catId, sortOrder: 999, items: [], ...spec })
      .expect(201);

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    for (const row of [
      catalog.types.find((x: { id: string }) => x.id === t.body.id),
      catalog.assemblies.find((x: { id: string }) => x.id === a.body.id),
    ]) {
      expect(row).toMatchObject(spec);
    }

    // 케이블 품목 — 그룹 통째 PUT 으로 간다
    const seeded = await nextDb.cableCategory.findMany({ where: { groupId: cableGroupId }, orderBy: { sortOrder: 'asc' } });
    const body = {
      name: groupName,
      color: groupColor,
      categories: [
        ...seeded.map((c) => ({
          id: c.id, name: c.name, laborCode: c.laborCode, unitPrice: c.unitPrice,
          installManDays: c.installManDays, removeManDays: c.removeManDays, relocateManDays: c.relocateManDays,
        })),
        { name: `${uniq}-spec`, ...spec },
      ],
    };
    const g = (await request(app).put(`/api/v2/catalog/cable-groups/${cableGroupId}`).set(admin).send(body).expect(200)).body;
    expect(g.categories.find((c: { name: string }) => c.name === `${uniq}-spec`)).toMatchObject(spec);

    // 정리
    await request(app).put(`/api/v2/catalog/cable-groups/${cableGroupId}`).set(admin)
      .send({ ...body, categories: body.categories.slice(0, -1) }).expect(200);
    await request(app).delete(`/api/v2/catalog/assemblies/${a.body.id}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/catalog/types/${t.body.id}`).set(admin).expect(204);
  });

  /* 이름은 그룹 안에서 유니크하다 — 한 줄씩 고치면 맞바꾸는 순간 중간 상태가 제약에 걸린다. */
  it('종류 이름을 서로 맞바꿔도 저장된다', async () => {
    const seeded = await nextDb.cableCategory.findMany({ where: { groupId: cableGroupId }, orderBy: { sortOrder: 'asc' } });
    const base = seeded.map((c) => ({
      id: c.id,
      name: c.name,
      laborCode: c.laborCode,
      installManDays: c.installManDays,
      removeManDays: c.removeManDays,
    }));
    const put = (categories: unknown[]) =>
      request(app).put(`/api/v2/catalog/cable-groups/${cableGroupId}`).set(admin).send({ name: groupName, color: groupColor, categories });

    const a = { name: `${uniq}-swapA`, laborCode: null, installManDays: 0.1, removeManDays: 0.05 };
    const b = { name: `${uniq}-swapB`, laborCode: null, installManDays: 0.2, removeManDays: 0.06 };
    const made = (await put([...base, a, b]).expect(200)).body.categories as { id: string; name: string }[];
    const idA = made.find((c) => c.name === a.name)!.id;
    const idB = made.find((c) => c.name === b.name)!.id;

    const swapped = (await put([...base, { ...a, id: idA, name: b.name }, { ...b, id: idB, name: a.name }]).expect(200))
      .body.categories as { id: string; name: string }[];
    expect(swapped.find((c) => c.id === idA)!.name).toBe(b.name);
    expect(swapped.find((c) => c.id === idB)!.name).toBe(a.name);

    await put(base).expect(200);
  });

  it('GET /v2/catalog 의 types[].assetCount 가 인스턴스 수를 반영한다', async () => {
    // 새 타입 생성
    const c = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT3`, name: '분류3', sortOrder: 998 })
      .expect(201);
    const cId = c.body.id;

    const t = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(cId, { key: `${KEY_PREFIX}_TYPE_COUNT` }))
      .expect(201);
    const tId = t.body.id;

    // 인스턴스 없을 때 assetCount = 0
    let catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    let found = catalog.types.find((ty: { id: string }) => ty.id === tId);
    expect(found.assetCount).toBe(0);

    // 인스턴스 2개 생성
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss6`,
        branch: { create: { name: `${uniq}-br6`, headquarters: { create: { name: `${uniq}-hq6` } } } },
      },
    });
    await nextDb.asset.create({ data: { name: `${uniq}-a1`, typeId: tId, substationId: sub.id } });
    await nextDb.asset.create({ data: { name: `${uniq}-a2`, typeId: tId, substationId: sub.id } });

    catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    found = catalog.types.find((ty: { id: string }) => ty.id === tId);
    expect(found.assetCount).toBe(2);

    // 정리
    await nextDb.asset.deleteMany({ where: { substationId: sub.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br6` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq6` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
    await nextDb.assetType.delete({ where: { id: tId } });
    await nextDb.assetCategory.delete({ where: { id: cId } });
  });

  // ── 다심 포트(positions) 왕복 테스트 ────────────────────────────────────────

  it('다심 포트 포함 타입 생성 → GET에서 positions 왕복', async () => {
    const catRes = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT_MC`, name: '분류_MC', sortOrder: 996 })
      .expect(201);
    const mcCatId = catRes.body.id;

    const typeRes = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(mcCatId, {
        key: `${KEY_PREFIX}_TYPE_MC`,
        ports: MULTI_CORE_PORTS,
      }))
      .expect(201);
    const mcTypeId = typeRes.body.id;

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const found = catalog.types.find((t: { id: string }) => t.id === mcTypeId);
    expect(found).toBeTruthy();
    const trunk = found.portTemplates.find((p: { group: string }) => p.group === 'trunk');
    const core = found.portTemplates.find((p: { group: string }) => p.group === 'core');
    // 인입은 **포트 1개**가 코어 24를 나른다 — 코어 수만큼 포트를 펴지 않는다.
    expect([trunk.count, trunk.positions]).toEqual([1, 24]);
    expect([core.count, core.positions]).toEqual([24, 1]); // 안 적으면 1

    await nextDb.assetPortTemplate.deleteMany({ where: { typeId: mcTypeId } });
    await nextDb.assetType.delete({ where: { id: mcTypeId } });
    await nextDb.assetCategory.delete({ where: { id: mcCatId } });
  });

  it('다심 아닌 종류에 positions>1 → POST 400 INVALID_TYPE_SPEC (validateTypeSpec 위반)', async () => {
    const catRes = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT_MC2`, name: '분류_MC2', sortOrder: 995 })
      .expect(201);
    const mc2CatId = catRes.body.id;

    /* 다심을 **가질 수 있는지**는 종류가 정한다 — 아무 포트에나 코어 수를 적을 수 있으면
       어휘가 뜻을 잃는다. 광에는 다심이 있고(성단), 전원에는 없다. */
    const badPorts = [
      { group: 'pwrIn', count: 2, direction: 'IN' as const, medium: 'power', namePattern: '전원 입력 {n}', positions: 24 },
      { group: 'pwrOut', count: 2, direction: 'OUT' as const, medium: 'power', namePattern: '전원 출력 {n}' },
    ];

    const res = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(mc2CatId, { key: `${KEY_PREFIX}_TYPE_MC2`, ports: badPorts }))
      .expect(400);
    expect(res.body.error).toBe('INVALID_TYPE_SPEC');
    const paths = res.body.details.map((d: { path: string }) => d.path) as string[];
    expect(paths.some((p) => p.includes('positions'))).toBe(true);

    await nextDb.assetCategory.delete({ where: { id: mc2CatId } });
  });

  it('positions 변경은 구조 변경 — 인스턴스 있는 타입의 코어 수 변경 → 409 TYPE_IN_USE', async () => {
    const catRes = await request(app)
      .post('/api/v2/catalog/categories')
      .set(admin)
      .send({ key: `${KEY_PREFIX}_CAT_MC3`, name: '분류_MC3', sortOrder: 994 })
      .expect(201);
    const mc3CatId = catRes.body.id;

    const typeRes = await request(app)
      .post('/api/v2/catalog/types')
      .set(admin)
      .send(makeTypeBody(mc3CatId, {
        key: `${KEY_PREFIX}_TYPE_MC3`,
        ports: MULTI_CORE_PORTS,
      }))
      .expect(201);
    const mc3TypeId = typeRes.body.id;

    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss-mc3`,
        branch: { create: { name: `${uniq}-br-mc3`, headquarters: { create: { name: `${uniq}-hq-mc3` } } } },
      },
    });
    const asset = await nextDb.asset.create({ data: { name: `${uniq}-asset-mc3`, typeId: mc3TypeId, substationId: sub.id } });

    // 24심 → 12심 은 심선이 12가닥 사라지는 것이라 구조 변경이다.
    const shrunkPorts = MULTI_CORE_PORTS.map((p) => (p.group === 'trunk' ? { ...p, positions: 12 } : p));
    const res = await request(app)
      .put(`/api/v2/catalog/types/${mc3TypeId}`)
      .set(admin)
      .send(makeTypeBody(mc3CatId, { key: `${KEY_PREFIX}_TYPE_MC3`, ports: shrunkPorts }))
      .expect(409);
    expect(res.body.error).toBe('TYPE_IN_USE');

    // 정리
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br-mc3` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq-mc3` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
    await nextDb.assetPortTemplate.deleteMany({ where: { typeId: mc3TypeId } });
    await nextDb.assetType.delete({ where: { id: mc3TypeId } });
    await nextDb.assetCategory.delete({ where: { id: mc3CatId } });
  });

  /**
   * **선로 관리는 종류가 선언한다** — 화면이 이름으로 「OPGW」를 찾지 않게.
   *
   * 이름은 본부마다 다르고 바뀐다. 선언이라 그 종류의 케이블에만 선로 대장 값이 서고,
   * 이름을 무엇으로 고치든 그 사실은 따라다닌다.
   */
  it('종류에 「광 선로」 선언을 켜고 끈다', async () => {
    const seeded = await nextDb.cableCategory.findMany({ where: { groupId: cableGroupId }, orderBy: { sortOrder: 'asc' } });
    const group = await nextDb.cableGroup.findUniqueOrThrow({ where: { id: cableGroupId } });
    const put = (managesFiberLine: boolean) =>
      request(app)
        .put(`/api/v2/catalog/cable-groups/${cableGroupId}`)
        .set(admin)
        .send({
          name: group.name,
          color: group.color,
          categories: seeded.map((c, i) => ({
            id: c.id, name: c.name, laborCode: c.laborCode, unitPrice: c.unitPrice,
            installManDays: c.installManDays, removeManDays: c.removeManDays, relocateManDays: c.relocateManDays,
            ...(i === 0 ? { managesFiberLine } : {}),
          })),
        })
        .expect(200);

    const on = (await put(true)).body;
    expect(on.categories[0].managesFiberLine).toBe(true);
    /* 나머지 종류는 켜지지 않는다 — 같은 광이어도 점퍼코드에 선로 번호를 적을 일은 없다. */
    expect(on.categories.slice(1).every((c: { managesFiberLine: boolean }) => !c.managesFiberLine)).toBe(true);

    const off = (await put(false)).body;
    expect(off.categories[0].managesFiberLine).toBe(false);
  });
});
