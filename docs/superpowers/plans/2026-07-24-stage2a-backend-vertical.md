# Stage 2A: v2 백엔드 수직 슬라이스 (워킹카피 read + 커밋) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 스키마(digital_next) 위에 v2 백엔드 API — 카탈로그/조직/워킹카피 read + capability 검증 기반 원자 커밋(OCC 포함) — 를 세우고 통합테스트로 검증한다. (Stage 2B 프론트 현황 뷰가 이 API를 소비한다.)

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-24-capability-metamodel-rebuild-design.md`의 2단계 전반부. v2 코드는 `backend/src/v2/`에 자립적으로 격리(Stage 7에서 구코드 삭제가 깔끔하도록), 판정 로직은 전부 `@twin/core` 호출(단순화 서약 §6-4). 기존 무상태 JWT 미들웨어(`authenticate`/`adminOnly`)는 재사용 — 로그인은 당분간 구 `/api/auth`가 담당(토큰 검증은 DB 무관이므로 v2에서 그대로 유효, Stage 7에서 이관). 조직(본부/지사/변전소/층)은 즉시 CRUD(구 시스템과 동일 결정), 자산·이력은 워킹카피 + 단일 커밋.

**Tech Stack:** Express 4 + zod + Prisma next-client(digital_next), vitest + supertest 통합테스트(실 DB), @twin/core.

## Global Constraints

- 개발 DB는 docker-compose.dev.yml로만. **docker compose build 금지** (CLAUDE.md). dev postgres는 이미 기동 중.
- 구 소스 수정 허용 범위: `backend/src/index.ts`의 v2 라우터 마운트 1줄, `backend/package.json`(deps/scripts), 루트 `package.json`(scripts), `packages/core/package.json`+빌드설정. **그 외 구 백엔드/프론트 소스·구 스키마·구 시드는 무접촉.**
- v2 로직에 자산 타입명/역할 문자열 분기 금지 (`'RACK'`, `'OFD-SLOT'` 등 리터럴은 테스트 픽스처에서만 허용) — Task 7 가드레일 테스트가 강제.
- 판정(수용/슬롯/포트 인스턴스화)은 `@twin/core` 함수만 사용 — v2에 복제 구현 금지.
- 통합테스트는 `DATABASE_URL_NEXT`(digital_next, 일회용 스테이징 DB) 대상. 각 테스트 파일은 자기 픽스처를 만들고 afterAll에서 정리한다. 시드 카탈로그(타입 26종)는 존재를 전제한다(사전 `db:next:seed`).
- 테스트 픽스처 이름은 `t2a-` 접두사 + 고유 suffix로 충돌 방지.
- 커밋은 태스크마다. 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: @twin/core 빌드 산출물화 + Stage 1 이월 chores

**Files:**
- Create: `packages/core/tsconfig.build.json`
- Modify: `packages/core/package.json` (main/types → dist, build 스크립트)
- Modify: `package.json` (루트 — build 순서, dev에 core watch 추가)
- Modify: `backend/package.json` (`@twin/core` 의존성, `db:next:migrate:prod` 스크립트)
- Modify: `backend/prisma/next/seed.ts` (트랜잭션 래핑)

**Interfaces:**
- Consumes: Stage 1 산출물 전체
- Produces: `@twin/core`가 빌드 아티팩트(dist)로 백엔드 런타임(node dist)에서 import 가능. `nextDb` 소비 준비 완료. 이후 모든 태스크가 `import { ... } from '@twin/core'` 사용.

- [ ] **Step 1: core 빌드 설정**

`packages/core/tsconfig.build.json` 생성:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["src/**/*.test.ts", "src/purity.guardrail.test.ts"]
}
```

`packages/core/package.json` 수정 — main/types를 dist로, 스크립트 추가:

```json
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:watch": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 2: 루트 배선 + 백엔드 의존성/스크립트**

루트 `package.json` scripts 수정:

```json
    "dev": "concurrently \"npm run build:watch -w @twin/core\" \"npm run dev:backend\" \"npm run dev:frontend\"",
    "build": "npm run build -w @twin/core && npm run build --workspace=frontend && npm run build --workspace=backend",
```

`backend/package.json`:
- dependencies에 추가: `"@twin/core": "*"`
- scripts에 추가: `"db:next:migrate:prod": "prisma migrate deploy --schema prisma/next/schema.prisma"`

Run: `npm install` (루트)

- [ ] **Step 3: 시드 트랜잭션 래핑**

`backend/prisma/next/seed.ts`의 `main()` 본문 전체를 `nextDb.$transaction`으로 감싼다 — 기존 로직의 `prisma.` 호출을 트랜잭션 클라이언트 `tx.`로 치환:

```ts
async function main() {
  const counts = await prisma.$transaction(async (tx) => {
    // ...기존 본문 그대로, 모든 prisma.xxx 를 tx.xxx 로 치환...
    return {
      categories: await tx.assetCategory.count(),
      types: await tx.assetType.count(),
      containerSpecs: await tx.assetContainerSpec.count(),
      portTemplates: await tx.assetPortTemplate.count(),
      linkRules: await tx.assetLinkRule.count(),
      cableGroups: await tx.cableGroup.count(),
      cableCategories: await tx.cableCategory.count(),
    };
  });
  console.log('[seed:next]', JSON.stringify(counts));
}
```

- [ ] **Step 4: 검증**

Run:
```bash
npm run build -w @twin/core        # dist 생성 확인
node -e "import('@twin/core').then(m => console.log(typeof m.instantiatePorts))"   # → function
npm test -w @twin/core             # 36/36 유지
npm run db:next:seed -w backend    # 2회 실행, counts 동일 (cableCategories:17 포함)
npm run db:next:seed -w backend
npm run build                      # 루트 전체 EXIT 0
```
Expected: 전부 성공. `node -e` 출력 `function`.

- [ ] **Step 5: Commit**

```bash
git add packages/core package.json package-lock.json backend/package.json backend/prisma/next/seed.ts
git commit -m "chore(core,backend): @twin/core 빌드 산출물화 + seed 트랜잭션 + migrate:prod 스크립트 (Stage1 이월)"
```

---

### Task 2: v2 스캐폴드 + 테스트 하네스 + 카탈로그 read

**Files:**
- Create: `backend/src/v2/db.ts`, `backend/src/v2/errors.ts`, `backend/src/v2/router.ts`, `backend/src/v2/catalog.routes.ts`
- Create: `backend/src/v2/__tests__/helpers.ts`
- Create: `backend/vitest.config.ts`
- Modify: `backend/src/index.ts` (마운트 1줄 ×2: import + app.use)
- Test: `backend/src/v2/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: 생성된 next-client(`backend/src/generated/next-client`), 구 `authenticate`/`adminOnly`/`generateAccessToken`(무상태 재사용), 구 `errorHandler`(전역 최후단)
- Produces: `nextDb` 싱글턴, `HttpError(status, code, message, details?)`, `v2Router`(하위 태스크가 서브라우터 추가), `makeApp()`/`authHeader(role?)` 테스트 헬퍼, `GET /api/v2/catalog` 응답 형태(아래 명시 — Stage 2B가 그대로 소비)

- [ ] **Step 1: 인프라 파일 작성**

`backend/src/v2/db.ts`:

```ts
import { PrismaClient } from '../generated/next-client/index.js';

/** v2 전용 next-client 싱글턴 (digital_next). */
export const nextDb = new PrismaClient();
```

`backend/src/v2/errors.ts`:

```ts
/** v2 자립 에러 — 구 utils/errors 에 의존하지 않는다 (Stage 7 삭제 격리). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
```

`backend/src/v2/router.ts`:

```ts
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './errors.js';
import { catalogRouter } from './catalog.routes.js';

export const v2Router = Router();

v2Router.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: 'v2' });
});

v2Router.use('/catalog', catalogRouter);

// v2 에러 매핑 (HttpError/Zod). 그 외는 전역 errorHandler 로 위임.
v2Router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details ?? null });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'BAD_REQUEST', message: '요청 형식이 잘못되었습니다', details: err.issues });
    return;
  }
  next(err);
});
```

`backend/src/v2/catalog.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';

export const catalogRouter = Router();

/** 카탈로그 전체 read (Stage 6 이전까지 read-only). */
catalogRouter.get('/', authenticate, async (_req, res, next) => {
  try {
    const [categories, types, cableGroups] = await Promise.all([
      nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      nextDb.assetType.findMany({
        include: {
          containerSpecs: { orderBy: { sortOrder: 'asc' } },
          portTemplates: { orderBy: { sortOrder: 'asc' } },
          linkRules: true,
        },
        orderBy: { sortOrder: 'asc' },
      }),
      nextDb.cableGroup.findMany({
        include: { categories: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    res.json({ categories, types, cableGroups });
  } catch (e) {
    next(e);
  }
});
```

`backend/src/index.ts` — 기존 라우터 마운트들 아래에 2줄 추가 (다른 줄 무수정):

```ts
import { v2Router } from './v2/router.js';
// ... 기존 app.use 나열 마지막에:
app.use('/api/v2', v2Router);
```

- [ ] **Step 2: 테스트 하네스**

`backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['dotenv/config'],
    fileParallelism: false, // 실 DB 공유 — 파일 순차 실행
    include: ['src/**/*.test.ts'],
  },
});
```

`backend/src/v2/__tests__/helpers.ts`:

```ts
import express from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { v2Router } from '../router.js';

export function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', v2Router);
  app.use(errorHandler);
  return app;
}

export function authHeader(role: 'ADMIN' | 'VIEWER' = 'ADMIN'): string {
  return `Bearer ${generateAccessToken({ userId: 'test-user', username: 'tester', role })}`;
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/src/v2/__tests__/catalog.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();

describe('GET /api/v2/catalog', () => {
  it('무인증 → 401', async () => {
    await request(app).get('/api/v2/catalog').expect(401);
  });

  it('시드 카탈로그 전체를 반환한다', async () => {
    const res = await request(app).get('/api/v2/catalog').set('Authorization', authHeader()).expect(200);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(4);
    expect(res.body.types.length).toBeGreaterThanOrEqual(26);
    const rack = res.body.types.find((t: { key: string }) => t.key === 'RACK');
    expect(rack.containerSpecs[0]).toMatchObject({ slotCount: 12, allowSpan: true });
    const groups = res.body.cableGroups;
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups.flatMap((g: { categories: unknown[] }) => g.categories).length).toBeGreaterThanOrEqual(17);
  });

  it('v2 health', async () => {
    const res = await request(app).get('/api/v2/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', model: 'v2' });
  });
});
```

- [ ] **Step 4: 실패 확인 → 구현 완료 → 통과 확인**

Run: `npm test -w backend` (Step 1 파일들을 아직 안 만들었으면 먼저 RED 확인 후 작성; 이미 작성했다면 테스트만 RED→GREEN 사이클 기록)
Expected 최종: 3 passed. `npm run build` EXIT 0 (index.ts 2줄 추가가 기존 빌드를 깨지 않음).

- [ ] **Step 5: Commit**

```bash
git add backend/src/v2 backend/vitest.config.ts backend/src/index.ts
git commit -m "feat(v2): v2 라우터 스캐폴드 + 통합테스트 하네스 + 카탈로그 read"
```

---

### Task 3: 조직 CRUD + org-tree read

**Files:**
- Create: `backend/src/v2/org.routes.ts`, `backend/src/v2/schemas.ts`
- Modify: `backend/src/v2/router.ts` (서브라우터 마운트)
- Test: `backend/src/v2/__tests__/org.test.ts`

**Interfaces:**
- Consumes: `nextDb`, `HttpError`, `authenticate`/`adminOnly`, `makeApp`/`authHeader`
- Produces:
  - `GET /api/v2/org-tree` → `{ headquarters: [{ id, name, sortOrder, branches: [{ id, name, sortOrder, substations: [{ id, name, sortOrder, floors: [{ id, name, sortOrder }] }] }] }] }`
  - `POST /api/v2/org/headquarters {name}` · `POST /api/v2/org/branches {headquartersId, name}` · `POST /api/v2/org/substations {branchId, name}` · `POST /api/v2/org/floors {substationId, name}` (adminOnly, sortOrder 자동 = max+1, 201 + 생성행)
  - `PATCH /api/v2/org/:kind/:id {name?, sortOrder?}` (kind ∈ headquarters|branches|substations|floors)
  - `DELETE /api/v2/org/:kind/:id` — 자식 존재 시 409 `HAS_CHILDREN`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/v2/__tests__/org.test.ts`:

```ts
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-org-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };

describe('org CRUD + tree', () => {
  let hqId: string, brId: string, subId: string, floorId: string;

  afterAll(async () => {
    // 자식부터 정리 (실패해도 무시 — 테스트 중 이미 삭제된 경우)
    await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
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
  });

  it('VIEWER 쓰기 → 403', async () => {
    await request(app)
      .post('/api/v2/org/headquarters')
      .set('Authorization', authHeader('VIEWER'))
      .send({ name: `${uniq}-x` })
      .expect(403);
  });

  it('이름 변경 PATCH', async () => {
    await request(app).patch(`/api/v2/org/substations/${subId}`).set(admin).send({ name: `${uniq}-ss2` }).expect(200);
    const row = await nextDb.substation.findUnique({ where: { id: subId } });
    expect(row!.name).toBe(`${uniq}-ss2`);
  });

  it('자식 있는 노드 삭제 → 409, 리프 삭제 → 200', async () => {
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(409);
    await request(app).delete(`/api/v2/org/floors/${floorId}`).set(admin).expect(200);
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(200);
  });

  it('빈 이름 → 400', async () => {
    await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: '' }).expect(400);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w backend`
Expected: org.test.ts FAIL (라우트 없음 → 404).

- [ ] **Step 3: 구현**

`backend/src/v2/schemas.ts` (시작 — 이후 태스크가 추가):

```ts
import { z } from 'zod';

export const orgNameSchema = z.object({ name: z.string().trim().min(1) });
export const orgPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
});
export const branchCreateSchema = orgNameSchema.extend({ headquartersId: z.string().uuid() });
export const substationCreateSchema = orgNameSchema.extend({ branchId: z.string().uuid() });
export const floorCreateSchema = orgNameSchema.extend({ substationId: z.string().uuid() });
```

`backend/src/v2/org.routes.ts` — 핵심 구조 (4종을 설정 테이블로 일반화하지 말 것 — 4개 명시 라우트가 더 단순):

```ts
import { Router } from 'express';
import { adminOnly, authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { branchCreateSchema, floorCreateSchema, orgNameSchema, orgPatchSchema, substationCreateSchema } from './schemas.js';

export const orgRouter = Router();
orgRouter.use(authenticate);

orgRouter.get('/org-tree', async (_req, res, next) => {
  try {
    const headquarters = await nextDb.headquarters.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        branches: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            substations: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: { floors: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
            },
          },
        },
      },
    });
    res.json({ headquarters });
  } catch (e) {
    next(e);
  }
});

orgRouter.post('/org/headquarters', adminOnly, async (req, res, next) => {
  try {
    const { name } = orgNameSchema.parse(req.body);
    const max = await nextDb.headquarters.aggregate({ _max: { sortOrder: true } });
    const row = await nextDb.headquarters.create({ data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// branches / substations / floors POST 도 동일 패턴 (부모 존재 검증: findUnique 없으면
// throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다'); sortOrder는 부모 범위 max+1)

// PATCH: 4개 명시 라우트. 예 — substations:
orgRouter.patch('/org/substations/:id', adminOnly, async (req, res, next) => {
  try {
    const patch = orgPatchSchema.parse(req.body);
    const row = await nextDb.substation.update({ where: { id: req.params.id }, data: patch });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

// DELETE: 자식 카운트 검사 후 삭제. 예 — substations:
orgRouter.delete('/org/substations/:id', adminOnly, async (req, res, next) => {
  try {
    const children = (await nextDb.floor.count({ where: { substationId: req.params.id } }))
      + (await nextDb.asset.count({ where: { substationId: req.params.id } }));
    if (children > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
    await nextDb.substation.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
// headquarters(자식=branches)/branches(자식=substations)/floors(자식=asset.floorId) 동일 패턴.
```

`router.ts`에 `v2Router.use('/', orgRouter);` 추가 (catalog 마운트 아래, 에러 미들웨어 위).

주의: Prisma `update`의 not-found(P2025)는 v2 에러 미들웨어에 안 잡히므로, PATCH/DELETE 앞에 존재 검증 `findUnique` → 없으면 `throw new HttpError(404, 'NOT_FOUND', ...)`를 넣는다 (4종 공통).

- [ ] **Step 4: 통과 확인**

Run: `npm test -w backend`
Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/v2
git commit -m "feat(v2): 조직 CRUD + org-tree read"
```

---

### Task 4: 워킹카피 read

**Files:**
- Create: `backend/src/v2/workingcopy.routes.ts`
- Modify: `backend/src/v2/router.ts`
- Test: `backend/src/v2/__tests__/workingcopy.test.ts`

**Interfaces:**
- Consumes: `nextDb`, org 엔드포인트(픽스처), 카탈로그 시드
- Produces: `GET /api/v2/substations/:id/workingcopy` →
  ```
  {
    substation: { id, name, branchId, sortOrder },
    floors: [{ id, name, sortOrder, backgroundDrawing, backgroundOpacity }],
    assets: [{ id, name, typeId, status, floorId, x, y, width, height,
               parentAssetId, containerKey, slotIndex, slotSpan, fieldValues, updatedAt,
               ports: [{ id, group, index, name, direction, medium }] }],
    maintenanceLogs: [{ id, assetId, occurredAt, content, action, updatedAt }],
    inspectionLogs: [{ id, assetId, inspectedAt, content, result, updatedAt }]
  }
  ```
  (updatedAt = OCC baseVersion. Stage 2B 스토어가 이 형태를 그대로 컬렉션으로 적재.)

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/v2/__tests__/workingcopy.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-wc-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subId: string, floorId: string, assetId: string;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const rackType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'RACK' } });
  const asset = await nextDb.asset.create({
    data: { name: `${uniq}-rack`, typeId: rackType.id, substationId: sub.id, floorId: floor.id, x: 10, y: 20, width: 60, height: 80 },
  });
  assetId = asset.id;
  await nextDb.maintenanceLog.create({ data: { assetId: asset.id, occurredAt: new Date('2026-07-01'), content: '테스트 고장' } });
});

afterAll(async () => {
  await nextDb.asset.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('GET /api/v2/substations/:id/workingcopy', () => {
  it('컬렉션 전체를 평탄하게 반환한다', async () => {
    const res = await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200);
    expect(res.body.substation.id).toBe(subId);
    expect(res.body.floors.map((f: { id: string }) => f.id)).toEqual([floorId]);
    const asset = res.body.assets.find((a: { id: string }) => a.id === assetId);
    expect(asset).toMatchObject({ floorId, x: 10, y: 20 });
    expect(typeof asset.updatedAt).toBe('string');
    expect(res.body.maintenanceLogs).toHaveLength(1);
    expect(res.body.inspectionLogs).toEqual([]);
  });

  it('없는 변전소 → 404', async () => {
    await request(app)
      .get('/api/v2/substations/00000000-0000-0000-0000-000000000000/workingcopy')
      .set(admin)
      .expect(404);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w backend` — workingcopy.test.ts FAIL(404 라우트 없음).

- [ ] **Step 3: 구현**

`backend/src/v2/workingcopy.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();

workingcopyRouter.get('/substations/:id/workingcopy', authenticate, async (req, res, next) => {
  try {
    const substation = await nextDb.substation.findUnique({ where: { id: req.params.id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, assets, maintenanceLogs, inspectionLogs] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: substation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.asset.findMany({
        where: { substationId: substation.id },
        include: { ports: { orderBy: [{ group: 'asc' }, { index: 'asc' }] } },
        orderBy: { name: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { inspectedAt: 'desc' } }),
    ]);

    res.json({ substation, floors, assets, maintenanceLogs, inspectionLogs });
  } catch (e) {
    next(e);
  }
});
```

`router.ts`에 `v2Router.use('/', workingcopyRouter);` 추가.

- [ ] **Step 4: 통과 확인 → Commit**

Run: `npm test -w backend` — 전부 PASS.

```bash
git add backend/src/v2
git commit -m "feat(v2): 변전소 워킹카피 벌크 read"
```

---

### Task 5: 커밋 서비스 — 자산 (검증·포트 인스턴스화·OCC)

**Files:**
- Create: `backend/src/v2/spec.ts`, `backend/src/v2/commit.service.ts`, `backend/src/v2/commit.routes.ts`
- Modify: `backend/src/v2/schemas.ts`, `backend/src/v2/router.ts`
- Test: `backend/src/v2/__tests__/commit-assets.test.ts`

**Interfaces:**
- Consumes: `@twin/core` — `instantiatePorts`, `validateSlotPlacement`, `AssetTypeSpec`, `AcceptRule`, `FieldDef`, `Direction`; `nextDb`; `HttpError`
- Produces:
  - `typeRowToSpec(row: TypeRow): AssetTypeSpec` — DB 타입행 → 코어 spec 투영 (v2에서 유일한 매핑 지점)
  - `PUT /api/v2/substations/:id/commit` (adminOnly) — payload:
    ```
    { assets?: { creates?: AssetCreateInput[], updates?: {id, patch}[], deletes?: string[] },
      baseVersions?: Record<assetId, updatedAtISO> }
    ```
    `AssetCreateInput = { id(uuid, 클라이언트 생성), name, typeId, status?, floorId?, x?, y?, width?, height?, parentAssetId?, containerKey?, slotIndex?, slotSpan?, fieldValues?, portCounts? }`
    응답 200 `{ committedAt }`. 충돌 409 `{ error:'CONFLICT', details:[{id, reason:'modified'|'deleted', serverUpdatedAt?}] }`. 검증실패 422 `{ error:'PLACEMENT_*'|'INVALID_*'|... }`.
  - patch 의미론: `undefined`=유지, `null`=해제(예: floorId null = 평면도 배치 해제). fieldValues는 통째 교체.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/v2/__tests__/commit-assets.test.ts` — 케이스가 이 태스크의 본질이다. 전부 구현할 것:

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-cm-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subId: string, floorId: string;
let rackTypeId: string, pitrTypeId: string, slotTypeId: string, ofdTypeId: string, groundingTypeId: string;

const commit = (payload: unknown) =>
  request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload);

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const key = (k: string) => nextDb.assetType.findUniqueOrThrow({ where: { key: k } });
  rackTypeId = (await key('RACK')).id;
  pitrTypeId = (await key('PITR-5000')).id;
  slotTypeId = (await key('OFD-SLOT')).id;
  ofdTypeId = (await key('OFD')).id;
  groundingTypeId = (await key('GROUNDING')).id;
});

afterAll(async () => {
  await nextDb.asset.deleteMany({ where: { substationId: subId, parentAssetId: { not: null } } });
  await nextDb.asset.deleteMany({ where: { substationId: subId } });
  await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('PUT /commit — assets', () => {
  it('랙+모듈 2개를 한 커밋으로 생성(부모가 같은 커밋의 create), 포트 자동 인스턴스화', async () => {
    const rackId = randomUUID();
    const m1 = randomUUID(), m2 = randomUUID();
    await commit({
      assets: {
        creates: [
          // 자식을 먼저 배열에 넣어 위상정렬을 강제 검증
          { id: m1, name: `${uniq}-m1`, typeId: pitrTypeId, parentAssetId: rackId, containerKey: 'main', slotIndex: 0, slotSpan: 2 },
          { id: rackId, name: `${uniq}-rack`, typeId: rackTypeId, floorId, x: 0, y: 0, width: 60, height: 80 },
          { id: m2, name: `${uniq}-m2`, typeId: pitrTypeId, parentAssetId: rackId, containerKey: 'main', slotIndex: 2, slotSpan: 1 },
        ],
      },
    }).expect(200);
    const m1Ports = await nextDb.port.findMany({ where: { assetId: m1 } });
    expect(m1Ports.length).toBe(2); // device 기본 포트 템플릿 (network 2)
  });

  it('슬롯 겹침 → 422 PLACEMENT_OVERLAP', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-ov`, typeId: pitrTypeId, parentAssetId: await rackIdByName(), containerKey: 'main', slotIndex: 1, slotSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_OVERLAP');
  });

  it('수용 불가 타입(GROUNDING, 구조 카테고리) → 422 PLACEMENT_NOT_ACCEPTED', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-na`, typeId: groundingTypeId, parentAssetId: await rackIdByName(), containerKey: 'main', slotIndex: 5, slotSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_NOT_ACCEPTED');
  });

  it('portCounts 오버라이드: OFD 슬롯 24C → 포트 48개', async () => {
    const ofdId = randomUUID(), slotId = randomUUID();
    await commit({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-ofd`, typeId: ofdTypeId, floorId, x: 100, y: 0, width: 40, height: 40 },
          { id: slotId, name: `${uniq}-slot24`, typeId: slotTypeId, parentAssetId: ofdId, containerKey: 'main', portCounts: { A: 24, B: 24 } },
        ],
      },
    }).expect(200);
    expect(await nextDb.port.count({ where: { assetId: slotId } })).toBe(48);
  });

  it('OCC: 낡은 baseVersion 으로 update → 409 + conflicts', async () => {
    const rackId = await rackIdByName();
    const res = await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack2` } }] },
      baseVersions: { [rackId]: new Date('2000-01-01').toISOString() },
    }).expect(409);
    expect(res.body.details[0]).toMatchObject({ id: rackId, reason: 'modified' });
  });

  it('올바른 baseVersion 으로 update → 200, updatedAt 갱신', async () => {
    const rackId = await rackIdByName();
    const before = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack-renamed` } }] },
      baseVersions: { [rackId]: before.updatedAt.toISOString() },
    }).expect(200);
    const after = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    expect(after.name).toBe(`${uniq}-rack-renamed`);
  });

  it('자식 있는 자산만 삭제 → 409 HAS_CHILDREN; 자식+부모 동시 삭제 → 200', async () => {
    const rackId = await rackIdByName(`${uniq}-rack-renamed`);
    const children = await nextDb.asset.findMany({ where: { parentAssetId: rackId }, select: { id: true, updatedAt: true } });
    const rack = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    const bv = Object.fromEntries([[rackId, rack.updatedAt.toISOString()], ...children.map((c) => [c.id, c.updatedAt.toISOString()])]);
    const r1 = await commit({ assets: { deletes: [rackId] }, baseVersions: bv }).expect(409);
    expect(r1.body.error).toBe('HAS_CHILDREN');
    await commit({ assets: { deletes: [rackId, ...children.map((c) => c.id)] }, baseVersions: bv }).expect(200);
    expect(await nextDb.asset.count({ where: { id: rackId } })).toBe(0);
  });

  it('VIEWER 커밋 → 403', async () => {
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set('Authorization', authHeader('VIEWER'))
      .send({ assets: {} })
      .expect(403);
  });
});

async function rackIdByName(name = `${uniq}-rack`): Promise<string> {
  const rack = await nextDb.asset.findFirstOrThrow({ where: { substationId: subId, name } });
  return rack.id;
}
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w backend` — commit-assets FAIL(라우트 없음).

- [ ] **Step 3: 구현**

`backend/src/v2/spec.ts`:

```ts
import type { AcceptRule, AssetTypeSpec, Direction, FieldDef } from '@twin/core';
import type { AssetCategory, AssetContainerSpec, AssetLinkRule, AssetPortTemplate, AssetType } from '../generated/next-client/index.js';

export type TypeRow = AssetType & {
  category: AssetCategory;
  containerSpecs: AssetContainerSpec[];
  portTemplates: AssetPortTemplate[];
  linkRules: AssetLinkRule[];
};

export const TYPE_INCLUDE = {
  category: true,
  containerSpecs: true,
  portTemplates: true,
  linkRules: true,
} as const;

/** DB 타입행 → 코어 spec. v2에서 이 매핑의 유일한 지점. */
export function typeRowToSpec(row: TypeRow): AssetTypeSpec {
  return {
    key: row.key,
    name: row.name,
    categoryKey: row.category.key,
    sortOrder: row.sortOrder,
    placement: {
      placeable: row.placeable,
      ...(row.defaultWidth !== null ? { defaultWidth: row.defaultWidth } : {}),
      ...(row.defaultHeight !== null ? { defaultHeight: row.defaultHeight } : {}),
    },
    labor: {
      laborType: row.laborType,
      installHours: row.installHours,
      removeHours: row.removeHours,
      relocateHours: row.relocateHours,
    },
    fields: row.fieldDefs as unknown as FieldDef[],
    containers: [...row.containerSpecs]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts as unknown as AcceptRule })),
    ports: [...row.portTemplates]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction as Direction, medium: p.medium, namePattern: p.namePattern })),
    links: row.linkRules.map((l) => ({ fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping as 'byIndex' | 'all' })),
  };
}
```

`backend/src/v2/schemas.ts`에 추가:

```ts
export const assetCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  typeId: z.string().uuid(),
  status: z.string().optional(),
  floorId: z.string().uuid().nullish(),
  x: z.number().nullish(),
  y: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  parentAssetId: z.string().uuid().nullish(),
  containerKey: z.string().nullish(),
  slotIndex: z.number().int().nullish(),
  slotSpan: z.number().int().min(1).nullish(),
  fieldValues: z.record(z.unknown()).optional(),
  portCounts: z.record(z.number().int().min(1)).optional(),
});

export const assetPatchSchema = assetCreateSchema
  .omit({ id: true, typeId: true, portCounts: true })
  .partial();

export const commitPayloadSchema = z.object({
  assets: z
    .object({
      creates: z.array(assetCreateSchema).optional(),
      updates: z.array(z.object({ id: z.string().uuid(), patch: assetPatchSchema })).optional(),
      deletes: z.array(z.string().uuid()).optional(),
    })
    .optional(),
  baseVersions: z.record(z.string()).optional(),
});
export type CommitPayload = z.infer<typeof commitPayloadSchema>;
```

`backend/src/v2/commit.service.ts` — 전문:

```ts
import { instantiatePorts, validateSlotPlacement } from '@twin/core';
import type { Prisma } from '../generated/next-client/index.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { TYPE_INCLUDE, typeRowToSpec } from './spec.js';
import type { CommitPayload } from './schemas.js';

type Tx = Prisma.TransactionClient;
type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];
type AssetUpdate = NonNullable<NonNullable<CommitPayload['assets']>['updates']>[number];

const PLACEMENT_KEYS = ['floorId', 'x', 'y', 'width', 'height', 'parentAssetId', 'containerKey', 'slotIndex', 'slotSpan'] as const;

export async function commitSubstation(substationId: string, payload: CommitPayload): Promise<{ committedAt: string }> {
  return nextDb.$transaction(async (tx) => {
    const substation = await tx.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    await checkVersions(tx, payload);

    const assets = payload.assets ?? {};
    await applyDeletes(tx, substationId, assets.deletes ?? []);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c);

    return { committedAt: new Date().toISOString() };
  });
}

async function checkVersions(tx: Tx, payload: CommitPayload): Promise<void> {
  const base = payload.baseVersions ?? {};
  const ids = [...(payload.assets?.updates ?? []).map((u) => u.id), ...(payload.assets?.deletes ?? [])];
  if (ids.length === 0) return;
  const rows = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } });
  const server = new Map(rows.map((r) => [r.id, r.updatedAt.toISOString()]));
  const conflicts = ids.flatMap((id) => {
    const now = server.get(id);
    if (!now) return [{ id, reason: 'deleted' as const }];
    if (base[id] !== now) return [{ id, reason: 'modified' as const, serverUpdatedAt: now }];
    return [];
  });
  if (conflicts.length > 0) {
    throw new HttpError(409, 'CONFLICT', '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.', conflicts);
  }
}

/** 같은 커밋 내 부모(create)가 자식보다 먼저 삽입되도록 위상정렬. */
function orderCreates(creates: AssetCreate[]): AssetCreate[] {
  const byId = new Set(creates.map((c) => c.id));
  const done = new Set<string>();
  const ordered: AssetCreate[] = [];
  let remaining = [...creates];
  while (remaining.length > 0) {
    const ready = remaining.filter((c) => !c.parentAssetId || !byId.has(c.parentAssetId) || done.has(c.parentAssetId));
    if (ready.length === 0) throw new HttpError(422, 'CREATE_CYCLE', '생성 자산의 부모 관계에 순환이 있습니다');
    for (const c of ready) {
      ordered.push(c);
      done.add(c.id);
    }
    remaining = remaining.filter((c) => !done.has(c.id));
  }
  return ordered;
}

type Placement = 'floor' | 'container' | 'none';

function resolvePlacement(p: { floorId?: string | null; parentAssetId?: string | null }): Placement {
  const onFloor = p.floorId != null;
  const inContainer = p.parentAssetId != null;
  if (onFloor && inContainer) throw new HttpError(422, 'INVALID_PLACEMENT', '평면도 배치와 컨테이너 수용은 동시에 지정할 수 없습니다');
  return onFloor ? 'floor' : inContainer ? 'container' : 'none';
}

async function loadTypeSpec(tx: Tx, typeId: string) {
  const row = await tx.assetType.findUnique({ where: { id: typeId }, include: TYPE_INCLUDE });
  if (!row || !row.isActive) throw new HttpError(422, 'INVALID_TYPE', '유효하지 않은 자산 타입입니다');
  return { row, spec: typeRowToSpec(row) };
}

async function validateContainerPlacement(
  tx: Tx,
  substationId: string,
  args: { parentAssetId: string; containerKey: string | null | undefined; slotIndex: number | null | undefined; slotSpan: number | null | undefined },
  child: { typeKey: string; categoryKey: string },
  excludeAssetId: string | null,
): Promise<void> {
  const parent = await tx.asset.findUnique({ where: { id: args.parentAssetId }, include: { type: { include: TYPE_INCLUDE } } });
  if (!parent || parent.substationId !== substationId) throw new HttpError(422, 'INVALID_PARENT', '부모 자산이 유효하지 않습니다');
  if (!args.containerKey) throw new HttpError(422, 'INVALID_PLACEMENT', 'containerKey 가 필요합니다');
  const siblings = await tx.asset.findMany({
    where: { parentAssetId: parent.id, containerKey: args.containerKey, ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}) },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  const err = validateSlotPlacement({
    parentType: typeRowToSpec(parent.type),
    containerKey: args.containerKey,
    child,
    slotIndex: args.slotIndex ?? null,
    slotSpan: args.slotSpan ?? 1,
    occupants: siblings
      .filter((s) => s.slotIndex !== null)
      .map((s) => ({ assetId: s.id, slotIndex: s.slotIndex as number, slotSpan: s.slotSpan ?? 1 })),
  });
  if (err) throw new HttpError(422, `PLACEMENT_${err.toUpperCase().replace(/-/g, '_')}`, `배치할 수 없습니다: ${err}`);
}

async function applyCreate(tx: Tx, substationId: string, input: AssetCreate): Promise<void> {
  const { row, spec } = await loadTypeSpec(tx, input.typeId);
  const placement = resolvePlacement(input);
  if (placement === 'floor') {
    if (!spec.placement.placeable) throw new HttpError(422, 'NOT_PLACEABLE', '평면도에 배치할 수 없는 타입입니다');
    const floor = await tx.floor.findUnique({ where: { id: input.floorId as string } });
    if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
  }
  if (placement === 'container') {
    await validateContainerPlacement(
      tx,
      substationId,
      { parentAssetId: input.parentAssetId as string, containerKey: input.containerKey, slotIndex: input.slotIndex, slotSpan: input.slotSpan },
      { typeKey: row.key, categoryKey: spec.categoryKey },
      null,
    );
  }
  await tx.asset.create({
    data: {
      id: input.id,
      name: input.name,
      typeId: input.typeId,
      substationId,
      status: input.status ?? 'normal',
      floorId: input.floorId ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      parentAssetId: input.parentAssetId ?? null,
      containerKey: input.containerKey ?? null,
      slotIndex: input.slotIndex ?? null,
      slotSpan: input.slotSpan ?? null,
      fieldValues: (input.fieldValues ?? {}) as Prisma.InputJsonValue,
    },
  });
  const ports = instantiatePorts(spec, input.id, input.portCounts);
  if (ports.length > 0) await tx.port.createMany({ data: ports });
}

async function applyUpdate(tx: Tx, substationId: string, u: AssetUpdate): Promise<void> {
  const existing = await tx.asset.findUnique({ where: { id: u.id }, include: { type: { include: TYPE_INCLUDE } } });
  if (!existing || existing.substationId !== substationId) throw new HttpError(422, 'INVALID_ASSET', '수정 대상 자산이 유효하지 않습니다');

  const p = u.patch;
  const touchesPlacement = PLACEMENT_KEYS.some((k) => k in p);
  if (touchesPlacement) {
    const merged = {
      floorId: p.floorId !== undefined ? p.floorId : existing.floorId,
      parentAssetId: p.parentAssetId !== undefined ? p.parentAssetId : existing.parentAssetId,
      containerKey: p.containerKey !== undefined ? p.containerKey : existing.containerKey,
      slotIndex: p.slotIndex !== undefined ? p.slotIndex : existing.slotIndex,
      slotSpan: p.slotSpan !== undefined ? p.slotSpan : existing.slotSpan,
    };
    const placement = resolvePlacement(merged);
    if (placement === 'floor') {
      const spec = typeRowToSpec(existing.type);
      if (!spec.placement.placeable) throw new HttpError(422, 'NOT_PLACEABLE', '평면도에 배치할 수 없는 타입입니다');
      const floor = await tx.floor.findUnique({ where: { id: merged.floorId as string } });
      if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
    }
    if (placement === 'container') {
      await validateContainerPlacement(
        tx,
        substationId,
        { parentAssetId: merged.parentAssetId as string, containerKey: merged.containerKey, slotIndex: merged.slotIndex, slotSpan: merged.slotSpan },
        { typeKey: existing.type.key, categoryKey: existing.type.category.key },
        existing.id,
      );
    }
  }

  await tx.asset.update({
    where: { id: u.id },
    data: {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.floorId !== undefined ? { floorId: p.floorId } : {}),
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.height !== undefined ? { height: p.height } : {}),
      ...(p.parentAssetId !== undefined ? { parentAssetId: p.parentAssetId } : {}),
      ...(p.containerKey !== undefined ? { containerKey: p.containerKey } : {}),
      ...(p.slotIndex !== undefined ? { slotIndex: p.slotIndex } : {}),
      ...(p.slotSpan !== undefined ? { slotSpan: p.slotSpan } : {}),
      ...(p.fieldValues !== undefined ? { fieldValues: p.fieldValues as Prisma.InputJsonValue } : {}),
    },
  });
}

async function applyDeletes(tx: Tx, substationId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, substationId: true } });
  if (rows.length !== ids.length || rows.some((r) => r.substationId !== substationId)) {
    throw new HttpError(422, 'INVALID_DELETE', '삭제 대상이 유효하지 않습니다');
  }
  const remaining = new Set(ids);
  while (remaining.size > 0) {
    let progressed = false;
    for (const id of [...remaining]) {
      const childCount = await tx.asset.count({ where: { parentAssetId: id } });
      if (childCount > 0) continue;
      await tx.asset.delete({ where: { id } }); // ports 는 DB cascade
      remaining.delete(id);
      progressed = true;
    }
    if (!progressed) {
      throw new HttpError(409, 'HAS_CHILDREN', '자식이 있는 자산은 자식과 함께 삭제해야 합니다', { ids: [...remaining] });
    }
  }
}
```

`backend/src/v2/commit.routes.ts`:

```ts
import { Router } from 'express';
import { adminOnly, authenticate } from '../middleware/auth.js';
import { commitSubstation } from './commit.service.js';
import { commitPayloadSchema } from './schemas.js';

export const commitRouter = Router();

commitRouter.put('/substations/:id/commit', authenticate, adminOnly, async (req, res, next) => {
  try {
    const payload = commitPayloadSchema.parse(req.body);
    res.json(await commitSubstation(req.params.id, payload));
  } catch (e) {
    next(e);
  }
});
```

`router.ts`에 `v2Router.use('/', commitRouter);` 추가.

- [ ] **Step 4: 통과 확인 → Commit**

Run: `npm test -w backend` — 전부 PASS. `npm run typecheck` 상당( `npm run build -w backend`) EXIT 0.

```bash
git add backend/src/v2
git commit -m "feat(v2): 자산 커밋 서비스 — capability 검증·포트 인스턴스화·위상정렬·OCC"
```

---

### Task 6: 커밋 — 이력 레코드 + 현황 노드 피드

**Files:**
- Create: `backend/src/v2/nodes.routes.ts`
- Modify: `backend/src/v2/commit.service.ts`, `backend/src/v2/schemas.ts`, `backend/src/v2/router.ts`
- Test: `backend/src/v2/__tests__/records-nodes.test.ts`

**Interfaces:**
- Consumes: Task 5 커밋 서비스, `nextDb`
- Produces:
  - 커밋 payload 확장: `records?: { maintenance?: RecordOps, inspections?: RecordOps }` — `RecordOps = { creates?: [{id, assetId, ...fields}], updates?: [{id, patch}], deletes?: [id] }`. maintenance fields: `{occurredAt(ISO), content, action?}`; inspections: `{inspectedAt(ISO), content, result?}`. 레코드는 OCC 미적용(결정: 충돌 빈도 낮음 — 자산 OCC 만 유지). 자산 적용 **후** 레코드 적용(같은 커밋의 신규 자산 참조 허용). assetId 소속 검증.
  - `GET /api/v2/nodes/:id/assets` — id가 변전소/지사/본부 중 무엇인지 서버가 판별, 스코프 내 자산 행 반환:
    `[{ id, name, status, updatedAt, substationId, substationName, typeKey, typeName, categoryName, parentAssetId, parentName, floorId }]` (변전소명·이름 순 정렬). 미존재 id → 404.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/v2/__tests__/records-nodes.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-rn-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let hqId: string, subId: string, sub2Id: string, assetId: string;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  hqId = hq.id;
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const s1 = await nextDb.substation.create({ data: { name: `${uniq}-ss1`, branchId: br.id } });
  const s2 = await nextDb.substation.create({ data: { name: `${uniq}-ss2`, branchId: br.id } });
  subId = s1.id;
  sub2Id = s2.id;
  const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
  assetId = (await nextDb.asset.create({ data: { name: `${uniq}-a1`, typeId: t.id, substationId: s1.id } })).id;
  await nextDb.asset.create({ data: { name: `${uniq}-a2`, typeId: t.id, substationId: s2.id } });
});

afterAll(async () => {
  await nextDb.asset.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('records in commit', () => {
  it('신규 자산 + 그 자산의 이력을 한 커밋으로', async () => {
    const newAssetId = randomUUID();
    const logId = randomUUID();
    const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'HVAC' } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        assets: { creates: [{ id: newAssetId, name: `${uniq}-hvac`, typeId: t.id }] },
        records: {
          maintenance: { creates: [{ id: logId, assetId: newAssetId, occurredAt: '2026-07-10T00:00:00.000Z', content: '설치 점검' }] },
        },
      })
      .expect(200);
    expect(await nextDb.maintenanceLog.count({ where: { assetId: newAssetId } })).toBe(1);
  });

  it('타 변전소 자산에 레코드 → 422', async () => {
    const other = await nextDb.asset.findFirstOrThrow({ where: { substationId: sub2Id } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        records: { maintenance: { creates: [{ id: randomUUID(), assetId: other.id, occurredAt: '2026-07-10T00:00:00.000Z', content: 'x' }] } },
      })
      .expect(422);
  });

  it('레코드 update/delete', async () => {
    const log = await nextDb.maintenanceLog.findFirstOrThrow({ where: { asset: { substationId: subId } } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { maintenance: { updates: [{ id: log.id, patch: { content: '수정됨' } }] } } })
      .expect(200);
    expect((await nextDb.maintenanceLog.findUniqueOrThrow({ where: { id: log.id } })).content).toBe('수정됨');
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { maintenance: { deletes: [log.id] } } })
      .expect(200);
    expect(await nextDb.maintenanceLog.count({ where: { id: log.id } })).toBe(0);
  });
});

describe('GET /api/v2/nodes/:id/assets', () => {
  it('본부 스코프: 두 변전소 자산 모두', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${hqId}/assets`).set(admin).expect(200)).body;
    const names = rows.map((r: { name: string }) => r.name);
    expect(names).toContain(`${uniq}-a1`);
    expect(names).toContain(`${uniq}-a2`);
    expect(rows[0]).toHaveProperty('substationName');
    expect(rows[0]).toHaveProperty('typeName');
  });

  it('변전소 스코프: 해당 변전소만', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${sub2Id}/assets`).set(admin).expect(200)).body;
    expect(rows.every((r: { substationId: string }) => r.substationId === sub2Id)).toBe(true);
  });

  it('미존재 노드 → 404', async () => {
    await request(app).get(`/api/v2/nodes/${randomUUID()}/assets`).set(admin).expect(404);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w backend` — records-nodes FAIL.

- [ ] **Step 3: 구현**

`schemas.ts` 확장:

```ts
const recordOps = <T extends z.ZodRawShape>(createShape: T) =>
  z.object({
    creates: z.array(z.object({ id: z.string().uuid(), assetId: z.string().uuid() }).extend(createShape)).optional(),
    updates: z.array(z.object({ id: z.string().uuid(), patch: z.object(createShape).partial() })).optional(),
    deletes: z.array(z.string().uuid()).optional(),
  });

export const commitPayloadSchema = z.object({
  assets: /* 기존 그대로 */,
  records: z
    .object({
      maintenance: recordOps({ occurredAt: z.string().datetime(), content: z.string().min(1), action: z.string().nullish() }).optional(),
      inspections: recordOps({ inspectedAt: z.string().datetime(), content: z.string().min(1), result: z.string().nullish() }).optional(),
    })
    .optional(),
  baseVersions: z.record(z.string()).optional(),
});
```

`commit.service.ts`의 트랜잭션 본문, 자산 적용 뒤에 추가:

```ts
    await applyRecords(tx, substationId, payload.records);
```

```ts
async function assertAssetInSubstation(tx: Tx, substationId: string, assetId: string): Promise<void> {
  const a = await tx.asset.findUnique({ where: { id: assetId }, select: { substationId: true } });
  if (!a || a.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD_ASSET', '레코드 대상 자산이 이 변전소에 없습니다');
}

async function applyRecords(tx: Tx, substationId: string, records: CommitPayload['records']): Promise<void> {
  if (!records) return;
  const m = records.maintenance;
  if (m) {
    for (const id of m.deletes ?? []) await tx.maintenanceLog.deleteMany({ where: { id, asset: { substationId } } });
    for (const u of m.updates ?? []) {
      const row = await tx.maintenanceLog.findUnique({ where: { id: u.id }, include: { asset: { select: { substationId: true } } } });
      if (!row || row.asset.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD', '수정 대상 이력이 유효하지 않습니다');
      await tx.maintenanceLog.update({
        where: { id: u.id },
        data: {
          ...(u.patch.occurredAt !== undefined ? { occurredAt: new Date(u.patch.occurredAt) } : {}),
          ...(u.patch.content !== undefined ? { content: u.patch.content } : {}),
          ...(u.patch.action !== undefined ? { action: u.patch.action } : {}),
        },
      });
    }
    for (const c of m.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.maintenanceLog.create({
        data: { id: c.id, assetId: c.assetId, occurredAt: new Date(c.occurredAt), content: c.content, action: c.action ?? null },
      });
    }
  }
  const i = records.inspections;
  if (i) {
    // maintenance 와 동일 패턴 — inspectedAt/result 필드로 치환하여 구현
  }
}
```

(inspections 블록은 maintenance와 동일 구조로 **전체 구현**한다 — 복붙 후 필드 치환. 두 레코드는 필드 구조가 달라 제네릭화하지 않는다: 단순화 서약 YAGNI.)

`backend/src/v2/nodes.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const nodesRouter = Router();

nodesRouter.get('/nodes/:id/assets', authenticate, async (req, res, next) => {
  try {
    const id = req.params.id;
    let substationIds: string[] | null = null;
    if (await nextDb.substation.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = [id];
    } else if (await nextDb.branch.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = (await nextDb.substation.findMany({ where: { branchId: id }, select: { id: true } })).map((s) => s.id);
    } else if (await nextDb.headquarters.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = (
        await nextDb.substation.findMany({ where: { branch: { headquartersId: id } }, select: { id: true } })
      ).map((s) => s.id);
    }
    if (!substationIds) throw new HttpError(404, 'NOT_FOUND', '노드를 찾을 수 없습니다');

    const assets = await nextDb.asset.findMany({
      where: { substationId: { in: substationIds } },
      include: {
        type: { include: { category: true } },
        substation: { select: { name: true } },
        parentAsset: { select: { name: true } },
      },
      orderBy: [{ substation: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(
      assets.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        updatedAt: a.updatedAt,
        substationId: a.substationId,
        substationName: a.substation.name,
        typeKey: a.type.key,
        typeName: a.type.name,
        categoryName: a.type.category.name,
        parentAssetId: a.parentAssetId,
        parentName: a.parentAsset?.name ?? null,
        floorId: a.floorId,
      })),
    );
  } catch (e) {
    next(e);
  }
});
```

`router.ts`에 `v2Router.use('/', nodesRouter);` 추가.

- [ ] **Step 4: 통과 확인 → Commit**

Run: `npm test -w backend` — 전부 PASS.

```bash
git add backend/src/v2
git commit -m "feat(v2): 커밋 레코드(고장/점검 이력) + 현황 노드 피드"
```

---

### Task 7: 전체 흐름 스모크 + v2 가드레일 + 마무리 검증

**Files:**
- Test: `backend/src/v2/__tests__/smoke.test.ts`
- Test: `backend/src/v2/__tests__/guardrail.test.ts`

**Interfaces:**
- Consumes: Task 2~6 전체
- Produces: Stage 2B가 신뢰할 수 있는 "전체 시나리오 그린" 상태 + 타입명 분기 금지 정적 가드레일

- [ ] **Step 1: 스모크 테스트 작성**

`backend/src/v2/__tests__/smoke.test.ts` — API만으로 전 흐름 (org 생성 → 카탈로그 → 랙+모듈+이력 커밋 → 워킹카피 확인 → 노드 피드 확인 → 전체 삭제 커밋):

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-smoke-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };

afterAll(async () => {
  await nextDb.asset.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('v2 전체 흐름 스모크', () => {
  it('조직 생성 → 커밋 → 워킹카피 → 노드 피드 → 삭제', async () => {
    const hqId = (await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: `${uniq}-hq` }).expect(201)).body.id;
    const brId = (await request(app).post('/api/v2/org/branches').set(admin).send({ headquartersId: hqId, name: `${uniq}-br` }).expect(201)).body.id;
    const subId = (await request(app).post('/api/v2/org/substations').set(admin).send({ branchId: brId, name: `${uniq}-ss` }).expect(201)).body.id;
    const floorId = (await request(app).post('/api/v2/org/floors').set(admin).send({ substationId: subId, name: `${uniq}-1층` }).expect(201)).body.id;

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const typeId = (key: string) => catalog.types.find((t: { key: string }) => t.key === key).id;

    const rackId = randomUUID();
    const moduleId = randomUUID();
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        assets: {
          creates: [
            { id: rackId, name: `${uniq}-rack`, typeId: typeId('RACK'), floorId, x: 0, y: 0, width: 60, height: 80 },
            { id: moduleId, name: `${uniq}-pitr`, typeId: typeId('PITR-5000'), parentAssetId: rackId, containerKey: 'main', slotIndex: 0, slotSpan: 2 },
          ],
        },
        records: {
          maintenance: { creates: [{ id: randomUUID(), assetId: moduleId, occurredAt: '2026-07-20T00:00:00.000Z', content: '신설' }] },
        },
      })
      .expect(200);

    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.assets).toHaveLength(2);
    expect(wc.maintenanceLogs).toHaveLength(1);
    const mod = wc.assets.find((a: { id: string }) => a.id === moduleId);
    expect(mod.ports.length).toBeGreaterThan(0);

    const feed = (await request(app).get(`/api/v2/nodes/${hqId}/assets`).set(admin).expect(200)).body;
    expect(feed.map((r: { id: string }) => r.id).sort()).toEqual([rackId, moduleId].sort());

    const bv = Object.fromEntries(wc.assets.map((a: { id: string; updatedAt: string }) => [a.id, a.updatedAt]));
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ assets: { deletes: [rackId, moduleId] }, baseVersions: bv })
      .expect(200);
    expect((await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body.assets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 가드레일 테스트 작성**

`backend/src/v2/__tests__/guardrail.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('v2 가드레일 — 타입명/역할 분기 금지', () => {
  it('v2 소스(테스트 제외)에 자산 타입 키 리터럴·role 비교가 없다', () => {
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    const files = walk(v2dir).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));
    const forbidden = /'(RACK|OFD|OFD-SLOT|DIST|FEEDER|GROUNDING|HVAC|PITR-2000|PITR-5000)'|\brole\s*===/;
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });
});
```

- [ ] **Step 3: 전체 검증**

Run:
```bash
npm test -w backend      # v2 전체 그린
npm test -w @twin/core   # 36/36 유지
npm run build            # 루트 EXIT 0
npm run db:next:seed -w backend   # 멱등 재확인
```
Expected: 전부 성공.

- [ ] **Step 4: Commit**

```bash
git add backend/src/v2/__tests__
git commit -m "test(v2): 전체 흐름 스모크 + 타입명 분기 금지 가드레일"
```

---

## 완료 기준 (Stage 2A Definition of Done)

1. `npm test -w backend` 전체 PASS (catalog/org/workingcopy/commit-assets/records-nodes/smoke/guardrail).
2. `npm test -w @twin/core` 36/36 유지, `npm run build` 루트 EXIT 0.
3. 시드 멱등 유지.
4. main 머지.

## 명시적 비목표 (Stage 2A)

- 프론트엔드 (Stage 2B 별도 계획: 현황 뷰 + 워킹카피 스토어 배선)
- 사진 업로드(파일) — 2B 이후 별도 태스크 (구 uploads 라우터는 구 시스템용으로 유지)
- 케이블/추적/검색 API — Stage 4
- 카탈로그 쓰기(타입 정의 편집) — Stage 6
- v2 로그인/사용자 관리 — Stage 7 컷오버 시 이관 (그때까지 구 /api/auth 토큰 사용)
- 조직 working-copy 스테이징 — 즉시 CRUD로 결정 (변경 빈도 낮음)
