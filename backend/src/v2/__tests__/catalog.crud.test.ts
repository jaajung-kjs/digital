/**
 * catalog.crud.test.ts — Stage 6 카탈로그 CRUD 통합 테스트
 * 기존 v2 통합테스트(org.test.ts 등)의 셋업 관례를 그대로 따른다.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-cat-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
const viewer = { Authorization: authHeader('VIEWER') };

/** 테스트에서 생성한 카탈로그 항목 정리용 키 접두사 */
const KEY_PREFIX = `TEST_${Date.now()}`;

/**
 * 유효한 typeUpsert payload 생성 헬퍼.
 * 기본값은 ports/links/containers 없음 (단순 배치형 타입).
 */
function makeTypeBody(categoryId: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    key: `${KEY_PREFIX}_TYPE`,
    name: '테스트 타입',
    categoryId,
    sortOrder: 999,
    isActive: true,
    placeable: true,
    defaultWidth: 60,
    defaultHeight: 80,
    laborType: null,
    installHours: 0,
    removeHours: 0,
    relocateHours: 0,
    fieldDefs: [],
    containers: [],
    ports: [],
    links: [],
    ...extra,
  };
}

/**
 * 포트 2그룹 + 링크 조합 (validSpec 기준):
 * - fiberIn(IN, count=2) / fiberOut(OUT, count=2)
 * - link: fiberIn → fiberOut byIndex
 * - container: shelf (slotCount=8)
 * namePattern 에 {n} 필수 (count > 1)
 */
const VALID_PORTS = [
  { group: 'fiberIn', count: 2, direction: 'IN' as const, medium: 'fiber', namePattern: '입력 {n}' },
  { group: 'fiberOut', count: 2, direction: 'OUT' as const, medium: 'fiber', namePattern: '출력 {n}' },
];
const VALID_LINKS = [{ fromGroup: 'fiberIn', toGroup: 'fiberOut', mapping: 'byIndex' as const }];
const VALID_CONTAINERS = [{ key: 'shelf', name: '선반', slotCount: 8, allowSpan: false, accepts: {} }];

describe('catalog CRUD', () => {
  // 테스트에서 생성한 카테고리/타입 ID
  let catId: string;
  let typeId: string;
  let cableGroupId: string;
  let cableCatId: string;

  beforeAll(async () => {
    // 케이블그룹은 시드에서 이미 존재 — 첫 번째 것 사용
    const group = await nextDb.cableGroup.findFirst({ orderBy: { sortOrder: 'asc' } });
    if (!group) throw new Error('cableGroup not seeded');
    cableGroupId = group.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (실패해도 무시)
    // 1. 케이블 (케이블카테고리 FK)
    try {
      await nextDb.cable.deleteMany({ where: { category: { name: { startsWith: uniq } } } });
    } catch { /* ignore */ }
    // 2. 자산 (타입 FK)
    try {
      await nextDb.asset.deleteMany({ where: { type: { key: { startsWith: KEY_PREFIX } } } });
    } catch { /* ignore */ }
    // 3. 자산 (uniq 이름으로 생성된 것 — 서브스테이션이 남은 경우 대비)
    try {
      await nextDb.asset.deleteMany({ where: { name: { startsWith: uniq } } });
    } catch { /* ignore */ }
    // 4. 포트 (uniq 자산에 직접 생성된 것)
    try {
      await nextDb.port.deleteMany({ where: { asset: { name: { startsWith: uniq } } } });
    } catch { /* ignore */ }
    // 5. 카탈로그 구조 (FK 순서: linkRule → portTemplate → containerSpec → type → category)
    try {
      await nextDb.assetLinkRule.deleteMany({ where: { type: { key: { startsWith: KEY_PREFIX } } } });
    } catch { /* ignore */ }
    try {
      await nextDb.assetPortTemplate.deleteMany({ where: { type: { key: { startsWith: KEY_PREFIX } } } });
    } catch { /* ignore */ }
    try {
      await nextDb.assetContainerSpec.deleteMany({ where: { type: { key: { startsWith: KEY_PREFIX } } } });
    } catch { /* ignore */ }
    try {
      await nextDb.assetType.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
    } catch { /* ignore */ }
    try {
      await nextDb.assetCategory.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
    } catch { /* ignore */ }
    // 6. 케이블 카테고리
    try {
      await nextDb.cableCategory.deleteMany({ where: { name: { startsWith: uniq } } });
    } catch { /* ignore */ }
    // 7. 조직 노드 — 각 it()에서 생성한 substation/branch/headquarters 잔여분 일괄 정리
    //    (각 it() 에서 이미 개별 정리하지만, 테스트 실패 시 누락될 수 있으므로 afterAll 에서도 정리)
    //    삭제 순서: 포트(port) → 자산(asset) → 서브스테이션(substation) → 지사(branch) → 본사(headquarters)
    try {
      const substations = await nextDb.substation.findMany({ where: { name: { startsWith: uniq } } });
      const subIds = substations.map((s) => s.id);
      if (subIds.length > 0) {
        await nextDb.port.deleteMany({ where: { asset: { substationId: { in: subIds } } } });
        await nextDb.asset.deleteMany({ where: { substationId: { in: subIds } } });
        await nextDb.substation.deleteMany({ where: { id: { in: subIds } } });
      }
    } catch { /* ignore */ }
    try {
      await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
    } catch { /* ignore */ }
    try {
      await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
    } catch { /* ignore */ }
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

    await request(app).patch(`/api/v2/catalog/cable-groups/${dummyId}`).set(viewer).send({}).expect(403);
    await request(app).post('/api/v2/catalog/cable-categories').set(viewer).send({}).expect(403);
    await request(app).patch(`/api/v2/catalog/cable-categories/${dummyId}`).set(viewer).send({}).expect(403);
    await request(app).delete(`/api/v2/catalog/cable-categories/${dummyId}`).set(viewer).expect(403);
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

  it('타입 생성: 유효 payload 201 + GET 재조회 시 명세(containers/ports/links) 왕복 일치', async () => {
    const body = makeTypeBody(catId, {
      key: `${KEY_PREFIX}_TYPE_A`,
      ports: VALID_PORTS,
      links: VALID_LINKS,
      containers: VALID_CONTAINERS,
    });

    const res = await request(app).post('/api/v2/catalog/types').set(admin).send(body).expect(201);
    typeId = res.body.id;
    expect(typeId).toBeTruthy();

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const found = catalog.types.find((t: { id: string }) => t.id === typeId);
    expect(found).toBeTruthy();
    expect(found.portTemplates).toHaveLength(2);
    expect(found.portTemplates[0]).toMatchObject({ group: 'fiberIn', count: 2, direction: 'IN', medium: 'fiber', namePattern: '입력 {n}' });
    expect(found.linkRules).toHaveLength(1);
    expect(found.linkRules[0]).toMatchObject({ fromGroup: 'fiberIn', toGroup: 'fiberOut', mapping: 'byIndex' });
    expect(found.containerSpecs).toHaveLength(1);
    expect(found.containerSpecs[0]).toMatchObject({ key: 'shelf', name: '선반', slotCount: 8, allowSpan: false });
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

  it('PUT: 비구조 필드(이름/공량/fieldDefs/배치)는 인스턴스가 있어도 수정된다', async () => {
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
      installHours: 3,
      ports: VALID_PORTS,
      links: VALID_LINKS,
      containers: VALID_CONTAINERS,
    });

    await request(app).put(`/api/v2/catalog/types/${typeId}`).set(admin).send(body).expect(200);
    const updated = await nextDb.assetType.findUnique({ where: { id: typeId } });
    expect(updated!.name).toBe('수정된 이름');
    expect(updated!.installHours).toBe(3);

    // 정리
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq` } });
    if (hq) await nextDb.headquarters.delete({ where: { id: hq.id } });
  });

  it('PUT: 인스턴스 존재 + 구조(ports) 변경이면 409 TYPE_IN_USE', async () => {
    // 다시 인스턴스 생성
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss2`,
        branch: { create: { name: `${uniq}-br2`, headquarters: { create: { name: `${uniq}-hq2` } } } },
      },
    });
    const asset = await nextDb.asset.create({
      data: { name: `${uniq}-asset2`, typeId, substationId: sub.id },
    });

    // 포트 구조 변경 (count 변경: 2 → 4)
    const changedPorts = [
      { group: 'fiberIn', count: 4, direction: 'IN' as const, medium: 'fiber', namePattern: '입력 {n}' },
      { group: 'fiberOut', count: 4, direction: 'OUT' as const, medium: 'fiber', namePattern: '출력 {n}' },
    ];
    const body = makeTypeBody(catId, {
      name: '수정된 이름',
      ports: changedPorts,
      links: VALID_LINKS,
      containers: VALID_CONTAINERS,
    });

    const res = await request(app).put(`/api/v2/catalog/types/${typeId}`).set(admin).send(body).expect(409);
    expect(res.body.error).toBe('TYPE_IN_USE');

    // 정리
    await nextDb.asset.delete({ where: { id: asset.id } });
    await nextDb.substation.delete({ where: { id: sub.id } });
    const branch = await nextDb.branch.findFirst({ where: { name: `${uniq}-br2` } });
    if (branch) await nextDb.branch.delete({ where: { id: branch.id } });
    const hq = await nextDb.headquarters.findFirst({ where: { name: `${uniq}-hq2` } });
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
      links: VALID_LINKS,
      containers: VALID_CONTAINERS,
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

  it('케이블 그룹 PATCH 공량 수정 + 케이블 카테고리 CRUD, 케이블 참조 시 삭제 409', async () => {
    // 케이블 그룹 PATCH
    await request(app)
      .patch(`/api/v2/catalog/cable-groups/${cableGroupId}`)
      .set(admin)
      .send({ installHoursPerM: 0.25, removeHoursPerM: 0.1 })
      .expect(200)
      .then((r) => {
        expect(r.body.installHoursPerM).toBeCloseTo(0.25);
        expect(r.body.removeHoursPerM).toBeCloseTo(0.1);
      });

    // 케이블 카테고리 생성
    const ccRes = await request(app)
      .post('/api/v2/catalog/cable-categories')
      .set(admin)
      .send({ groupId: cableGroupId, name: `${uniq}-ccat`, sortOrder: 999 })
      .expect(201);
    cableCatId = ccRes.body.id;
    expect(cableCatId).toBeTruthy();

    // 케이블 카테고리 수정
    await request(app)
      .patch(`/api/v2/catalog/cable-categories/${cableCatId}`)
      .set(admin)
      .send({ name: `${uniq}-ccat-edited` })
      .expect(200);
    const ccRow = await nextDb.cableCategory.findUnique({ where: { id: cableCatId } });
    expect(ccRow!.name).toBe(`${uniq}-ccat-edited`);

    // 케이블이 참조하는 경우 삭제 → 409
    // 먼저 케이블을 위한 서브스테이션, 자산, 포트 셋업
    const sub = await nextDb.substation.create({
      data: {
        name: `${uniq}-ss5`,
        branch: { create: { name: `${uniq}-br5`, headquarters: { create: { name: `${uniq}-hq5` } } } },
      },
    });
    const rackType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'RACK' } });
    const assetA = await nextDb.asset.create({ data: { name: `${uniq}-assetA`, typeId: rackType.id, substationId: sub.id } });
    const assetB = await nextDb.asset.create({ data: { name: `${uniq}-assetB`, typeId: rackType.id, substationId: sub.id } });
    // RACK 은 포트 없음 — 직접 포트 생성
    const portA = await nextDb.port.create({ data: { assetId: assetA.id, group: 'g', index: 0, name: 'PA', direction: 'BI', medium: 'TEST' } });
    const portB = await nextDb.port.create({ data: { assetId: assetB.id, group: 'g', index: 0, name: 'PB', direction: 'BI', medium: 'TEST' } });
    const cable = await nextDb.cable.create({
      data: { aPortId: portA.id, bPortId: portB.id, categoryId: cableCatId, substationId: sub.id },
    });

    await request(app).delete(`/api/v2/catalog/cable-categories/${cableCatId}`).set(admin).expect(409)
      .then((r) => expect(r.body.error).toBe('CABLE_CATEGORY_IN_USE'));

    // 케이블 삭제 후 카테고리 삭제
    await nextDb.cable.delete({ where: { id: cable.id } });
    await request(app).delete(`/api/v2/catalog/cable-categories/${cableCatId}`).set(admin).expect(204);
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
});
