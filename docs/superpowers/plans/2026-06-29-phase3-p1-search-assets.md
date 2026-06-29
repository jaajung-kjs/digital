# Phase 3 — P3-1: 자산 검색 프리미티브 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 자산 검색 엔드포인트 `POST /api/assets/search`(committed ⊕ overlay 서버 머지) + 클라 `useSearchAssets` 훅을 만든다 — 데이터 스코프 로드맵의 단일 `searchAssets(params)` 프리미티브(§110).

**Architecture:** 백엔드는 Prisma `findMany`(role/q/substationId 필터)로 committed 를 뽑고, **순수 함수** `mergeSearchOverlay`로 클라 staged delta(creates/updates/deletes)를 머지한다(트레이스 `POST /api/trace`의 overlay-동봉→서버머지 패턴 동형). 클라 `useSearchAssets`는 워킹카피 overlay를 검색용 shape로 직렬화해 동봉하고 결과를 그대로 쓴다(ad-hoc 머지 0).

**Tech Stack:** Express + Prisma + zod (backend), React + @tanstack/react-query (frontend), Vitest(양쪽) + supertest(backend integration).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-06-29-phase3-demand-paging-design.md`. 이 plan 은 그 §4b·§6(P3-1)만 구현. page-in·OFD피커 전환·피드 끄기는 후속 plan(P3-2~4).
- `read = base ⊕ overlay` 단일 규칙: 서버 base(검색) → **overlay 동봉 → 서버 머지**(클라 ad-hoc 머지 금지). 트레이스와 동일 패턴.
- 소비처별 전용 읽기 헬퍼 금지(§111) — 이 엔드포인트는 단일 `searchAssets(params)`, 인자만 달리해 모든 피커가 공유.
- `frontend/vite.config.js` 는 무관 미커밋 — 절대 stage/touch 금지. 각 커밋은 변경 파일만 명시 `git add`.
- 백엔드 tsc/vitest 는 `cd backend`, 프론트는 `cd frontend`. `git add`/`commit` 은 repo 루트 `/Users/jsk/1210/digital`.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 백엔드 vitest 는 실제 Prisma DB 사용(통합 테스트). 순수 로직은 DB 없이 단위 테스트(`toSlimAsset.test.ts` 패턴).

---

## File Structure

- **Create** `backend/src/services/assetSearch.ts` — 순수 타입(`AssetSearchResult`/`AssetSearchParams`/`AssetSearchOverlay`) + `matchesSearch` + `mergeSearchOverlay`. DB 무관.
- **Create** `backend/tests/assetSearch.test.ts` — `mergeSearchOverlay`/`matchesSearch` 순수 단위.
- **Modify** `backend/src/services/asset.service.ts` — `search(params, overlay?)` 추가(Prisma 필터 + `mergeSearchOverlay`).
- **Create** `backend/src/schemas/assetSearch.schema.ts` — zod 요청 스키마.
- **Modify** `backend/src/controllers/asset.controller.ts` — `search` 핸들러.
- **Modify** `backend/src/routes/assets.routes.ts` — `POST /search`.
- **Create** `backend/tests/assetSearch.integration.test.ts` — 엔드포인트 통합(필터·overlay·401).
- **Create** `frontend/src/features/assets/searchOverlay.ts` — 순수 `buildSearchOverlay(assetsOverlay, orgNames)` + `hashSearchOverlay`.
- **Create** `frontend/src/features/assets/searchOverlay.test.ts` — 순수 단위.
- **Create** `frontend/src/features/assets/useSearchAssets.ts` — 훅.
- **Create** `frontend/src/features/assets/useSearchAssets.test.tsx` — 훅 단위(api mock).

---

## Task 1: 백엔드 순수 머지 — `mergeSearchOverlay`

**Files:**
- Create: `backend/src/services/assetSearch.ts`
- Create: `backend/tests/assetSearch.test.ts`

**Interfaces:**
- Produces:
  - `interface AssetSearchResult { id: string; name: string; substationId: string; substationName: string | null }`
  - `interface AssetSearchParams { role?: string; q?: string; substationId?: string }`
  - `interface AssetSearchCreate { id: string; name: string; role: string | null; substationId: string; substationName: string | null }`
  - `interface AssetSearchOverlay { creates: AssetSearchCreate[]; updates: { id: string; name?: string; substationName?: string }[]; deletes: string[] }`
  - `matchesSearch(row: { name: string; substationId: string; role: string | null }, params: AssetSearchParams): boolean`
  - `mergeSearchOverlay(committed: AssetSearchResult[], overlay: AssetSearchOverlay | undefined, params: AssetSearchParams): AssetSearchResult[]`

- [ ] **Step 1: Write the failing test**

`backend/tests/assetSearch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { matchesSearch, mergeSearchOverlay } from '../src/services/assetSearch.js';

const committed = [
  { id: 'o1', name: '원주OFD', substationId: 's1', substationName: '원주' },
  { id: 'o2', name: '홍천OFD', substationId: 's2', substationName: '홍천' },
];

describe('matchesSearch', () => {
  it('role·q·substationId 필터(대소문자 무시)', () => {
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { role: 'ofd' })).toBe(true);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { role: 'slot' })).toBe(false);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { q: '원주' })).toBe(true);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { substationId: 's2' })).toBe(false);
  });
});

describe('mergeSearchOverlay', () => {
  it('overlay 없으면 committed 그대로', () => {
    expect(mergeSearchOverlay(committed, undefined, { role: 'ofd' })).toEqual(committed);
  });
  it('deletes 제거', () => {
    const r = mergeSearchOverlay(committed, { creates: [], updates: [], deletes: ['o1'] }, { role: 'ofd' });
    expect(r.map((x) => x.id)).toEqual(['o2']);
  });
  it('filter 일치 creates 추가(미일치 제외, 중복 제외)', () => {
    const overlay = {
      creates: [
        { id: 'o3', name: '신규OFD', role: 'ofd', substationId: 's3', substationName: '신규' },
        { id: 'x9', name: '슬롯', role: 'slot', substationId: 's3', substationName: '신규' }, // role 미일치
        { id: 'o1', name: '원주OFD', role: 'ofd', substationId: 's1', substationName: '원주' }, // 중복(committed)
      ],
      updates: [], deletes: [],
    };
    const r = mergeSearchOverlay(committed, overlay, { role: 'ofd' });
    expect(r.map((x) => x.id).sort()).toEqual(['o1', 'o2', 'o3']); // x9 제외, o1 중복 아님
  });
  it('updates 는 present row 의 표시 필드만 패치', () => {
    const r = mergeSearchOverlay(committed, { creates: [], updates: [{ id: 'o1', name: '원주개명' }], deletes: [] }, { role: 'ofd' });
    expect(r.find((x) => x.id === 'o1')!.name).toBe('원주개명');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/assetSearch.test.ts`
Expected: FAIL — `Failed to resolve import '../src/services/assetSearch.js'`.

- [ ] **Step 3: Write the pure module**

`backend/src/services/assetSearch.ts`:
```ts
export interface AssetSearchResult {
  id: string;
  name: string;
  substationId: string;
  substationName: string | null;
}

export interface AssetSearchParams {
  role?: string;
  q?: string;
  substationId?: string;
}

export interface AssetSearchCreate {
  id: string;
  name: string;
  role: string | null;
  substationId: string;
  substationName: string | null;
}

/** 검색용 overlay(staged delta). creates 는 필터 재평가용 role 보유, updates 는 표시 필드만. */
export interface AssetSearchOverlay {
  creates: AssetSearchCreate[];
  updates: { id: string; name?: string; substationName?: string }[];
  deletes: string[];
}

export function matchesSearch(
  row: { name: string; substationId: string; role: string | null },
  params: AssetSearchParams,
): boolean {
  if (params.role && row.role !== params.role) return false;
  if (params.q && !row.name.toLowerCase().includes(params.q.toLowerCase())) return false;
  if (params.substationId && row.substationId !== params.substationId) return false;
  return true;
}

/**
 * committed(이미 Prisma 필터됨) ⊕ overlay 머지. deletes 제거 → updates 표시필드 패치(present row 만)
 * → filter 일치 creates 추가(중복 제외). updates 는 멤버십 변경 안 함(role 재타입 등은 P3-1 비범위).
 */
export function mergeSearchOverlay(
  committed: AssetSearchResult[],
  overlay: AssetSearchOverlay | undefined,
  params: AssetSearchParams,
): AssetSearchResult[] {
  if (!overlay) return committed;
  const deleted = new Set(overlay.deletes);
  const byId = new Map<string, AssetSearchResult>();
  for (const r of committed) if (!deleted.has(r.id)) byId.set(r.id, r);

  for (const u of overlay.updates) {
    const ex = byId.get(u.id);
    if (!ex) continue;
    byId.set(u.id, {
      ...ex,
      ...(u.name !== undefined ? { name: u.name } : {}),
      ...(u.substationName !== undefined ? { substationName: u.substationName } : {}),
    });
  }

  for (const c of overlay.creates) {
    if (deleted.has(c.id) || byId.has(c.id)) continue;
    if (!matchesSearch(c, params)) continue;
    byId.set(c.id, { id: c.id, name: c.name, substationId: c.substationId, substationName: c.substationName });
  }

  return [...byId.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/assetSearch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add backend/src/services/assetSearch.ts backend/tests/assetSearch.test.ts
git commit -m "feat(search): mergeSearchOverlay 순수 머지 — committed⊕overlay 자산 검색

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 백엔드 엔드포인트 — `POST /api/assets/search`

**Files:**
- Modify: `backend/src/services/asset.service.ts`
- Create: `backend/src/schemas/assetSearch.schema.ts`
- Modify: `backend/src/controllers/asset.controller.ts`
- Modify: `backend/src/routes/assets.routes.ts`
- Create: `backend/tests/assetSearch.integration.test.ts`

**Interfaces:**
- Consumes: `AssetSearchResult/Params/Overlay`, `mergeSearchOverlay` (Task 1).
- Produces: `assetService.search(params: AssetSearchParams, overlay?: AssetSearchOverlay): Promise<AssetSearchResult[]>`; route `POST /api/assets/search`.

- [ ] **Step 1: Add `search` to asset.service.ts**

`backend/src/services/asset.service.ts` — 상단 import 추가:
```ts
import { mergeSearchOverlay, type AssetSearchParams, type AssetSearchOverlay, type AssetSearchResult } from './assetSearch.js';
```
`assetService` 객체 안에 메서드 추가(`listAllSlim` 옆):
```ts
  async search(params: AssetSearchParams, overlay?: AssetSearchOverlay): Promise<AssetSearchResult[]> {
    const rows = await prisma.asset.findMany({
      where: {
        ...(params.role ? { assetType: { role: params.role } } : {}),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' as const } } : {}),
        ...(params.substationId ? { substationId: params.substationId } : {}),
      },
      select: { id: true, name: true, substationId: true, substation: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const committed: AssetSearchResult[] = rows.map((a) => ({
      id: a.id, name: a.name, substationId: a.substationId, substationName: a.substation?.name ?? null,
    }));
    return mergeSearchOverlay(committed, overlay, params);
  },
```

- [ ] **Step 2: zod 스키마**

`backend/src/schemas/assetSearch.schema.ts`:
```ts
import { z } from 'zod';

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  substationId: z.string(),
  substationName: z.string().nullable(),
});

// validate(schema) 는 req.body 를 직접 파싱한다(`{ body: ... }` 래핑 없음 — trace.schema 와 동일).
export const assetSearchSchema = z.object({
  role: z.string().optional(),
  q: z.string().optional(),
  substationId: z.string().optional(),
  overlay: z
    .object({
      creates: z.array(createSchema),
      updates: z.array(z.object({ id: z.string(), name: z.string().optional(), substationName: z.string().nullable().optional() })),
      deletes: z.array(z.string()),
    })
    .optional(),
});
```
(확인됨: `middleware/validate.ts` 의 `validate(schema, source='body')` 가 `req.body` 를 직접 `schema.parse` 한다. `traceRequestSchema` 도 body 모양 그대로(래핑 없음). 위 스키마도 동일하게 body 직접.)

- [ ] **Step 3: 컨트롤러 핸들러**

`backend/src/controllers/asset.controller.ts` — `assetController` 객체에 추가:
```ts
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, q, substationId, overlay } = req.body;
      res.json({ data: await assetService.search({ role, q, substationId }, overlay) });
    } catch (e) { next(e); }
  },
```

- [ ] **Step 4: 라우트**

`backend/src/routes/assets.routes.ts` — import 에 `validate` + 스키마 추가(trace.routes.ts 의 validate import 경로와 동일하게), 그리고 `/` 위(또는 `/:id` 와 무관하므로 자유 위치)에:
```ts
router.post('/search', authenticate, validate(assetSearchSchema), assetController.search);
```

- [ ] **Step 5: 통합 테스트 (failing first)**

`backend/tests/assetSearch.integration.test.ts` — `trace.integration.test.ts` 의 셋업 패턴(express 앱 + auth + 라우터 + beforeAll 로 org/asset 생성, afterAll 정리)을 따른다. 최소 검증:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('POST /api/assets/search', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, ofdTypeId: string, ofdId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/assets', assetsRouter);
    app.use(errorHandler);
    // 로그인(trace.integration.test 와 동일 방식으로 token 획득)
    // ... 동일 헬퍼: 회원 생성/로그인 → token
    // org 트리 + ofd assetType + ofd 자산 1개 생성, id 보관(hqId/brId/subId/ofdTypeId/ofdId)
  });
  afterAll(async () => {
    // 생성한 자산/타입/org/유저 정리(역순 delete)
    await prisma.$disconnect();
  });

  it('role 필터로 committed OFD 반환', async () => {
    const res = await request(app).post('/api/assets/search').set('Authorization', `Bearer ${token}`).send({ role: 'ofd' });
    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { id: string }) => a.id === ofdId)).toBe(true);
  });

  it('overlay.creates 가 결과에 머지(미저장 OFD)', async () => {
    const res = await request(app).post('/api/assets/search').set('Authorization', `Bearer ${token}`)
      .send({ role: 'ofd', overlay: { creates: [{ id: 'tmp-ofd', name: '미저장OFD', role: 'ofd', substationId: subId, substationName: '테스트변전소' }], updates: [], deletes: [] } });
    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { id: string }) => a.id === 'tmp-ofd')).toBe(true);
  });

  it('비인증 401', async () => {
    const res = await request(app).post('/api/assets/search').send({ role: 'ofd' });
    expect(res.status).toBe(401);
  });
});
```
(구체 org/asset 생성·login 헬퍼는 `trace.integration.test.ts` 의 `beforeAll` 을 그대로 차용. assetType role 'ofd' 시드가 있으면 그걸 조회해 사용, 없으면 생성.)

- [ ] **Step 6: Run integration test**

Run: `cd backend && npx vitest run tests/assetSearch.integration.test.ts`
Expected: PASS (role 필터·overlay 머지·401). 처음엔 라우트 미배선으로 FAIL → 구현 후 PASS.

- [ ] **Step 7: tsc + commit**

Run: `cd backend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/asset.service.ts backend/src/schemas/assetSearch.schema.ts backend/src/controllers/asset.controller.ts backend/src/routes/assets.routes.ts backend/tests/assetSearch.integration.test.ts
git commit -m "feat(search): POST /api/assets/search — committed⊕overlay 서버 머지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 프론트 순수 직렬화 — `buildSearchOverlay`

**Files:**
- Create: `frontend/src/features/assets/searchOverlay.ts`
- Create: `frontend/src/features/assets/searchOverlay.test.ts`

**Interfaces:**
- Consumes: `AssetsOverlay`(=`Overlay<Asset>`, `{ creates: Record<id,Asset>; updates: Record<id,Partial<Asset>>; deletes: string[] }`) from `../workingCopy/substationStore`.
- Produces:
  - `interface SearchOverlay { creates: { id; name; role: string|null; substationId; substationName: string|null }[]; updates: { id; name?; substationName?: string|null }[]; deletes: string[] }` (백엔드 `AssetSearchOverlay` 와 동형 — request 바디)
  - `buildSearchOverlay(assets: AssetsOverlay, orgNames: Map<string, string>): SearchOverlay`
  - `hashSearchOverlay(o: SearchOverlay): string` (순서 안정)

- [ ] **Step 1: Write the failing test**

`frontend/src/features/assets/searchOverlay.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSearchOverlay, hashSearchOverlay } from './searchOverlay';

const orgNames = new Map([['s1', '원주'], ['s3', '신규']]);
const assetsOverlay = {
  creates: { 'tmp1': { id: 'tmp1', name: '신규OFD', substationId: 's3', assetType: { role: 'ofd' } } },
  updates: { 'o1': { name: '개명' } },
  deletes: ['o2'],
} as never;

describe('buildSearchOverlay', () => {
  it('creates 는 role·substationName 포함, updates 는 표시필드, deletes 통과', () => {
    const o = buildSearchOverlay(assetsOverlay, orgNames);
    expect(o.creates).toEqual([{ id: 'tmp1', name: '신규OFD', role: 'ofd', substationId: 's3', substationName: '신규' }]);
    expect(o.updates).toEqual([{ id: 'o1', name: '개명' }]);
    expect(o.deletes).toEqual(['o2']);
  });
  it('hash 는 키 순서에 안정', () => {
    const a = buildSearchOverlay(assetsOverlay, orgNames);
    expect(hashSearchOverlay(a)).toBe(hashSearchOverlay(buildSearchOverlay(assetsOverlay, orgNames)));
  });
  it('빈 overlay → 빈 해시', () => {
    expect(hashSearchOverlay({ creates: [], updates: [], deletes: [] })).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/assets/searchOverlay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/features/assets/searchOverlay.ts`:
```ts
import type { AssetsOverlay } from '../workingCopy/substationStore';

export interface SearchOverlay {
  creates: { id: string; name: string; role: string | null; substationId: string; substationName: string | null }[];
  updates: { id: string; name?: string; substationName?: string | null }[];
  deletes: string[];
}

/** 워킹카피 자산 overlay → 검색 request overlay. orgNames: substationId → 변전소명. */
export function buildSearchOverlay(assets: AssetsOverlay, orgNames: Map<string, string>): SearchOverlay {
  const creates = Object.values(assets.creates).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.assetType?.role ?? null,
    substationId: a.substationId,
    substationName: orgNames.get(a.substationId) ?? null,
  }));
  const updates = Object.entries(assets.updates)
    .filter(([id]) => !Object.prototype.hasOwnProperty.call(assets.creates, id))
    .map(([id, p]) => {
      const patch: { id: string; name?: string; substationName?: string | null } = { id };
      if (p.name !== undefined) patch.name = p.name;
      if (p.substationId !== undefined) patch.substationName = orgNames.get(p.substationId) ?? null;
      return patch;
    });
  return { creates, updates, deletes: [...assets.deletes] };
}

/** 순서 안정 해시(React Query 키용). 빈 overlay → ''. */
export function hashSearchOverlay(o: SearchOverlay): string {
  if (!o.creates.length && !o.updates.length && !o.deletes.length) return '';
  const creates = [...o.creates].sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}:${c.name}:${c.role}:${c.substationId}:${c.substationName}`).join('|');
  const updates = [...o.updates].sort((a, b) => a.id.localeCompare(b.id))
    .map((u) => `${u.id}:${u.name ?? ''}:${u.substationName ?? ''}`).join('|');
  const deletes = [...o.deletes].sort().join('|');
  return `${creates}#${updates}#${deletes}`;
}
```
(주의: `a.name`/`a.substationId`/`a.assetType` 접근 — `Asset` 타입에 존재. `AssetsOverlay` 가 `Overlay<Asset>` 이므로 `creates` 값은 `Asset`.)

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/features/assets/searchOverlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/searchOverlay.ts frontend/src/features/assets/searchOverlay.test.ts
git commit -m "feat(search): buildSearchOverlay — 워킹카피 자산 overlay 직렬화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 프론트 훅 — `useSearchAssets`

**Files:**
- Create: `frontend/src/features/assets/useSearchAssets.ts`
- Create: `frontend/src/features/assets/useSearchAssets.test.tsx`

**Interfaces:**
- Consumes: `buildSearchOverlay`/`hashSearchOverlay`/`SearchOverlay` (Task 3); `AssetRef` shape `{ id, name, substationId, substationName }`; `api` (`../../utils/api`); `useSubstationWorkingCopy` overlays.assets; `useEffectiveOrgTree` + `collectNodeNames`(from `../trace/traceGraph`).
- Produces: `useSearchAssets(params: { role?: string; q?: string; substationId?: string }): { results: AssetRef[]; isLoading: boolean }`.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/assets/useSearchAssets.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../utils/api', () => ({ api: { post: postMock } }));
vi.mock('../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) =>
    sel({ overlays: { assets: { creates: {}, updates: {}, deletes: [] } } }),
}));
vi.mock('../workingCopy/hooks', () => ({ useEffectiveOrgTree: () => [] }));
vi.mock('../trace/traceGraph', () => ({ collectNodeNames: () => new Map() }));

import { useSearchAssets } from './useSearchAssets';

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
};

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: { data: [{ id: 'o1', name: '원주OFD', substationId: 's1', substationName: '원주' }] } });
});

describe('useSearchAssets', () => {
  it('POST /assets/search 로 role 동봉, 결과 반환', async () => {
    const { result } = renderHook(() => useSearchAssets({ role: 'ofd' }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.results.length).toBe(1));
    expect(postMock).toHaveBeenCalledWith('/assets/search', expect.objectContaining({ role: 'ofd' }));
    expect(result.current.results[0].id).toBe('o1');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/assets/useSearchAssets.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/features/assets/useSearchAssets.ts`:
```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { useEffectiveOrgTree } from '../workingCopy/hooks';
import { collectNodeNames } from '../trace/traceGraph';
import { buildSearchOverlay, hashSearchOverlay } from './searchOverlay';

export interface AssetRef {
  id: string;
  name: string;
  substationId: string | null;
  substationName: string | null;
}

export interface SearchParams {
  role?: string;
  q?: string;
  substationId?: string;
}

/**
 * 단일 자산 검색 프리미티브(§110). 워킹카피 overlay 동봉 → 서버가 committed⊕overlay 머지.
 * 결과는 그대로 사용(클라 ad-hoc 머지 0).
 */
export function useSearchAssets(params: SearchParams): { results: AssetRef[]; isLoading: boolean } {
  const assetsOverlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  const orgTree = useEffectiveOrgTree();
  const orgNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);
  const overlay = useMemo(() => buildSearchOverlay(assetsOverlay, orgNames), [assetsOverlay, orgNames]);
  const overlayHash = useMemo(() => hashSearchOverlay(overlay), [overlay]);
  const overlayParam = overlayHash === '' ? undefined : overlay;

  const { data, isLoading } = useQuery<AssetRef[]>({
    queryKey: ['asset-search', params.role ?? '', params.q ?? '', params.substationId ?? '', overlayHash],
    queryFn: async () => {
      const res = await api.post<{ data: AssetRef[] }>('/assets/search', {
        ...(params.role ? { role: params.role } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.substationId ? { substationId: params.substationId } : {}),
        ...(overlayParam ? { overlay: overlayParam } : {}),
      });
      return res.data.data;
    },
  });

  return { results: data ?? [], isLoading };
}
```
(주의: `useEffectiveOrgTree` 가 `workingCopy/hooks` 에 export 되어 있는지 확인 — `useServerTrace.ts` 가 동일 import 사용. `collectNodeNames` 는 `traceGraph.ts` export.)

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/features/assets/useSearchAssets.test.tsx`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `cd frontend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/useSearchAssets.ts frontend/src/features/assets/useSearchAssets.test.tsx
git commit -m "feat(search): useSearchAssets 훅 — overlay 동봉 단일 검색 프리미티브

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 회귀

**Files:** 없음(검증 전용).

- [ ] **Step 1: 백엔드 tsc + 전수**

Run: `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: tsc 0; 전수 PASS(+신규 assetSearch 단위/통합). (`--no-file-parallelism` 로 기존 p0 enum 플래키 회피.)

- [ ] **Step 2: 프론트 tsc + 전수**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; 전수 PASS(+신규 searchOverlay/useSearchAssets).

- [ ] **Step 3: 게이트 확인**

- `POST /api/assets/search` 가 단일 프리미티브로 동작(role/q/substationId + overlay). 소비처 전환은 P3-2(OFD 피커). 이 plan 은 엔드포인트+훅만.

---

## Self-Review (작성자 점검)

**1. Spec coverage:** 스펙 §4b(search 엔드포인트, committed⊕overlay 서버머지) → T1(머지)+T2(엔드포인트). §6(useSearchAssets 훅, overlay 동봉) → T3(직렬화)+T4(훅). §D5(서버 base→overlay 동봉→서버머지) → T2 서버머지·T4 동봉. ✓ (OFD 피커 전환·page-in·피드끄기는 P3-2~4 — 이 plan 범위 밖, 스펙 §10 분해대로.)

**2. Placeholder scan:** 통합 테스트(T2 Step5)의 org/login 셋업은 "`trace.integration.test.ts` 패턴 차용"으로 위임 — 실코드는 그 파일에 존재(구현자가 복사). zod `{ body }` 래핑은 "trace.schema 와 동일 구조 확인"으로 명시. 그 외 TBD/모호 요구 없음.

**3. Type consistency:** `AssetSearchResult/Params/Overlay`(T1) ↔ T2 서비스 동일. 백엔드 `AssetSearchOverlay` ↔ 프론트 `SearchOverlay`(T3) 동형(creates role 보유, updates 표시필드, deletes ids). `AssetRef`(T4) = {id,name,substationId,substationName} — 기존 traceGraph `AssetRef` 와 동일 필드. `buildSearchOverlay(assets, orgNames)`(T3) ↔ T4 호출 일치. ✓
