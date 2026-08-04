import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-org-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };

describe('org CRUD + tree', () => {
  let hqId: string, brId: string, subId: string, floorId: string;

  beforeAll(async () => {
    await sweepTestFixtures();
  });

  afterAll(async () => {
    await sweepTestFixtures();
    await nextDb.$disconnect();
  });

  it('계층 생성 → 트리 반영', async () => {
    hqId = (await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: `${uniq}-hq` }).expect(201)).body.id;
    brId = (await request(app).post('/api/v2/org/branches').set(admin).send({ headquartersId: hqId, name: `${uniq}-br` }).expect(201)).body.id;
    subId = (await request(app).post('/api/v2/org/substations').set(admin).send({ branchId: brId, name: `${uniq}-ss` }).expect(201)).body.id;
    floorId = (await request(app).post('/api/v2/org/floors').set(admin).send({ substationId: subId, name: `${uniq}-1층` }).expect(201)).body.id;

    const tree = (await request(app).get('/api/v2/org-tree').set(admin).expect(200)).body;
    const hq = tree.headquarters.find((h: { id: string }) => h.id === hqId);
    expect(hq.branches[0].substations[0].floors[0].id).toBe(floorId);
    // 층당 190~835KB 인 backgroundDrawing 을 org-tree 가 실어 나르면 안 된다
    // (앱 진입 시 로드 + staleTime 30s 로 반복 재조회되는 경로) — select 로 제외돼야 한다.
    expect(hq.branches[0].substations[0].floors[0]).not.toHaveProperty('backgroundDrawing');
  });

  it('VIEWER 쓰기 → 403', async () => {
    await request(app)
      .post('/api/v2/org/headquarters')
      .set('Authorization', authHeader('viewer'))
      .send({ name: `${uniq}-x` })
      .expect(403);
  });

  it('이름 변경 PATCH', async () => {
    await request(app).patch(`/api/v2/org/substations/${subId}`).set(admin).send({ name: `${uniq}-ss2` }).expect(200);
    const row = await nextDb.substation.findUnique({ where: { id: subId } });
    expect(row!.name).toBe(`${uniq}-ss2`);
  });

  it('PATCH 비-UUID id → 400', async () => {
    await request(app).patch('/api/v2/org/substations/not-a-uuid').set(admin).send({ name: `${uniq}-x` }).expect(400);
  });

  it('PATCH 빈 객체 → 400', async () => {
    await request(app).patch(`/api/v2/org/substations/${subId}`).set(admin).send({}).expect(400);
  });

  it('자식 있는 노드 삭제 → 409, 리프 삭제 → 204', async () => {
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(409);
    await request(app).delete(`/api/v2/org/floors/${floorId}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(204);
  });

  it('빈 이름 → 400', async () => {
    await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: '' }).expect(400);
  });
});

// 862fa5f4에서 본부/지점/변전소/층 4종의 PATCH·DELETE가 단일 orgKinds 테이블(delegate·childCount
// 함수)로 파라미터화됐다 — 이 describe는 그 테이블 값이 kind별로 실제로 맞는지(델리게이트가 뒤섞이지
// 않았는지, HAS_CHILDREN/NOT_FOUND 코드가 4종 전부에서 살아있는지) HTTP 레벨로 고정하는 회귀 핀이다.
// 기존 describe는 substations/floors만 커버해 headquarters/branches PATCH·DELETE가 무커버였다.
describe('org PATCH/DELETE 4종 테이블 회귀 고정핀', () => {
  const uniq2 = `t2a-org2-${Date.now()}`;
  const NONEXISTENT = '00000000-0000-0000-0000-000000000000'; // 형식은 유효하나 존재하지 않는 UUID

  let hqId2: string, brId2: string, subId2: string, floorId2: string;

  beforeAll(async () => {
    hqId2 = (await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: `${uniq2}-hq` }).expect(201)).body.id;
    brId2 = (await request(app).post('/api/v2/org/branches').set(admin).send({ headquartersId: hqId2, name: `${uniq2}-br` }).expect(201)).body.id;
    subId2 = (await request(app).post('/api/v2/org/substations').set(admin).send({ branchId: brId2, name: `${uniq2}-ss` }).expect(201)).body.id;
    floorId2 = (await request(app).post('/api/v2/org/floors').set(admin).send({ substationId: subId2, name: `${uniq2}-fl` }).expect(201)).body.id;
  });

  // orgKinds 테이블(org.routes.ts)과 같은 모양: kind → 델리게이트 · id getter.
  // 델리게이트는 findUnique 만 좁혀 선언 — org.routes.ts 의 OrgKindEntry 와 동일한 이유(4종 델리게이트
  // 유니온을 그대로 배열 원소 타입에 흘리면 구조적 호출 시그니처 충돌이 남).
  type OrgReadDelegate = {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; name: string } | null>;
  };
  const kindTable: { path: 'headquarters' | 'branches' | 'substations' | 'floors'; delegate: OrgReadDelegate; getId: () => string }[] = [
    { path: 'headquarters', delegate: nextDb.headquarters, getId: () => hqId2 },
    { path: 'branches', delegate: nextDb.branch, getId: () => brId2 },
    { path: 'substations', delegate: nextDb.substation, getId: () => subId2 },
    { path: 'floors', delegate: nextDb.floor, getId: () => floorId2 },
  ];

  for (const { path, delegate, getId } of kindTable) {
    it(`${path} PATCH 이름변경 → 200 + 영속 반영`, async () => {
      const id = getId();
      const newName = `${uniq2}-${path}-renamed`;
      await request(app).patch(`/api/v2/org/${path}/${id}`).set(admin).send({ name: newName }).expect(200);
      const row = await delegate.findUnique({ where: { id } });
      expect(row!.name).toBe(newName);
    });

    it(`${path} PATCH 존재하지 않는 UUID → 404 NOT_FOUND`, async () => {
      const res = await request(app)
        .patch(`/api/v2/org/${path}/${NONEXISTENT}`)
        .set(admin)
        .send({ name: `${uniq2}-ghost` })
        .expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it(`${path} DELETE 존재하지 않는 UUID → 404 NOT_FOUND`, async () => {
      const res = await request(app).delete(`/api/v2/org/${path}/${NONEXISTENT}`).set(admin).expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  }

  it('본부/지점/변전소 — 자식 있는데 DELETE → 409 HAS_CHILDREN (3종 전부)', async () => {
    const hqRes = await request(app).delete(`/api/v2/org/headquarters/${hqId2}`).set(admin).expect(409);
    expect(hqRes.body.error).toBe('HAS_CHILDREN');

    const brRes = await request(app).delete(`/api/v2/org/branches/${brId2}`).set(admin).expect(409);
    expect(brRes.body.error).toBe('HAS_CHILDREN');

    const subRes = await request(app).delete(`/api/v2/org/substations/${subId2}`).set(admin).expect(409);
    expect(subRes.body.error).toBe('HAS_CHILDREN');
  });

  it('리프→상위 순차 삭제 → 4종 전부 204, 가드 해제 확인', async () => {
    await request(app).delete(`/api/v2/org/floors/${floorId2}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/org/substations/${subId2}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/org/branches/${brId2}`).set(admin).expect(204);
    await request(app).delete(`/api/v2/org/headquarters/${hqId2}`).set(admin).expect(204);
  });
});

describe('조직 이름 중복 (DUPLICATE_NAME)', () => {
  // Headquarters.name 은 전역 @unique 다. P2002 를 잡지 않으면 500 INTERNAL_SERVER_ERROR
  // 로 나가 사용자에게 "서버 오류"로 보인다 — 실제로 그랬다(UI/UX 감사에서 발견).
  const NAME = 't7-dup-본부';

  afterAll(async () => {
    await nextDb.headquarters.deleteMany({ where: { name: { startsWith: 't7-dup-' } } });
  });

  it('같은 이름으로 생성하면 500 이 아니라 409 DUPLICATE_NAME', async () => {
    await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: NAME }).expect(201);
    const res = await request(app)
      .post('/api/v2/org/headquarters')
      .set(admin)
      .send({ name: NAME })
      .expect(409);
    expect(res.body.error).toBe('DUPLICATE_NAME');
  });

  it('같은 이름으로 변경(PATCH)해도 409 DUPLICATE_NAME', async () => {
    const other = await request(app)
      .post('/api/v2/org/headquarters')
      .set(admin)
      .send({ name: `${NAME}-2` })
      .expect(201);
    const res = await request(app)
      .patch(`/api/v2/org/headquarters/${other.body.id}`)
      .set(admin)
      .send({ name: NAME })
      .expect(409);
    expect(res.body.error).toBe('DUPLICATE_NAME');
  });
});
