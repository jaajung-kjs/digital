# Phase 3 — P3-5a: 엔티티 이름 resolver (useAssetRefs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `POST /api/assets/refs { ids }` + 클라 `useAssetRefs(ids)` 를 만든다 — 임의 자산 id 의 `{name, substationId, substationName}` 를 resident-first(워킹카피) + 서버 fetch(캐시)로 해소하는 로드맵 Primitive 1(`get(id)`). 소비처 이전(5b)·연결 page-in 제거(5c)는 후속.

**Architecture:** 백엔드는 by-ids findMany(P3-1 search 와 동형 DTO). 클라 훅은 resident(effectiveAssets)면 즉시, miss id 만 batch fetch 후 merge → `Map<id, AssetRef>`. 이 plan 은 인프라만(소비처 변경 0, UX 변화 0 — 아무도 아직 안 씀).

**Tech Stack:** Express+Prisma+zod, React+react-query, Vitest(+supertest).

## Global Constraints
- 스펙: `docs/superpowers/specs/2026-06-30-phase3-p5-entity-resolver-design.md` §3·§6 (P3-5a).
- `validate(schema)` 는 `req.body` 직접 파싱(`{body}` 래핑 금지 — trace.schema 동형).
- `AssetRef` 는 기존 `frontend/src/features/assets/useSearchAssets.ts` export 재사용(`{id,name,substationId:string|null,substationName:string|null}`).
- `frontend/vite.config.js` stage/touch 금지. 커밋 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 백엔드 vitest `--no-file-parallelism`(p0Enums 플래키 회피).

## File Structure
- Modify `backend/src/services/asset.service.ts` — `refsByIds(ids)`.
- Create `backend/src/schemas/assetRefs.schema.ts` — zod.
- Modify `backend/src/controllers/asset.controller.ts` — `refs` 핸들러.
- Modify `backend/src/routes/assets.routes.ts` — `POST /refs`.
- Create `backend/tests/assetRefs.integration.test.ts`.
- Create `frontend/src/features/assets/useAssetRefs.ts` — 훅.
- Create `frontend/src/features/assets/useAssetRefs.test.tsx`.

---

## Task 1: 백엔드 `POST /api/assets/refs`

**Files:** asset.service.ts, assetRefs.schema.ts, asset.controller.ts, assets.routes.ts, assetRefs.integration.test.ts

**Interfaces:**
- Produces: `assetService.refsByIds(ids: string[]): Promise<AssetSearchResult[]>` (AssetSearchResult = `{id,name,substationId,substationName}` from `./assetSearch.js`, P3-1). Route `POST /api/assets/refs`.

- [ ] **Step 1: integration test (failing)**

`backend/tests/assetRefs.integration.test.ts` — `assetSearch.integration.test.ts` 패턴(express app + login + org/asset 생성 + afterAll) 차용. 핵심:
```ts
it('주어진 ids 의 AssetRef 반환(name/substationName 포함), 없는 id 는 제외', async () => {
  const res = await request(app).post('/api/assets/refs').set('Authorization', `Bearer ${token}`)
    .send({ ids: [assetId, 'nonexistent-id'] });
  expect(res.status).toBe(200);
  const byId = Object.fromEntries(res.body.data.map((r: { id: string }) => [r.id, r]));
  expect(byId[assetId]).toMatchObject({ id: assetId, name: expect.any(String), substationId: subId });
  expect(byId['nonexistent-id']).toBeUndefined();
});
it('비인증 401', async () => {
  const res = await request(app).post('/api/assets/refs').send({ ids: [] });
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: run → fail** (`cd backend && npx vitest run tests/assetRefs.integration.test.ts`) — route 미배선.

- [ ] **Step 3: service**

`asset.service.ts` — import `type AssetSearchResult` from `./assetSearch.js`(이미 search 가 import). 메서드 추가:
```ts
  async refsByIds(ids: string[]): Promise<AssetSearchResult[]> {
    if (!ids.length) return [];
    const rows = await prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, substationId: true, substation: { select: { name: true } } },
    });
    return rows.map((a) => ({ id: a.id, name: a.name, substationId: a.substationId, substationName: a.substation?.name ?? null }));
  },
```

- [ ] **Step 4: zod**

`backend/src/schemas/assetRefs.schema.ts`:
```ts
import { z } from 'zod';
export const assetRefsSchema = z.object({ ids: z.array(z.string()) });
```

- [ ] **Step 5: controller + route**

`asset.controller.ts` 에 추가:
```ts
  async refs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await assetService.refsByIds(req.body.ids) }); } catch (e) { next(e); }
  },
```
`assets.routes.ts` — `validate` import 확인 후:
```ts
router.post('/refs', authenticate, validate(assetRefsSchema), assetController.refs);
```

- [ ] **Step 6: run → pass** (`cd backend && npx vitest run tests/assetRefs.integration.test.ts`) + `npx tsc --noEmit` 0.

- [ ] **Step 7: commit**
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/asset.service.ts backend/src/schemas/assetRefs.schema.ts backend/src/controllers/asset.controller.ts backend/src/routes/assets.routes.ts backend/tests/assetRefs.integration.test.ts
git commit -m "feat(assets): POST /api/assets/refs — by-ids AssetRef 해소(엔티티 resolver 백엔드)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 클라 `useAssetRefs` 훅

**Files:** useAssetRefs.ts, useAssetRefs.test.tsx

**Interfaces:**
- Consumes: `api.post('/assets/refs', {ids})`; `useEffectiveAssets()`(resident); `useEffectiveOrgTree`+`collectNodeNames`(substationId→name); `AssetRef`.
- Produces: `useAssetRefs(ids: string[]): Map<string, AssetRef>`.

- [ ] **Step 1: test (failing)**

`frontend/src/features/assets/useAssetRefs.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../utils/api', () => ({ api: { post: postMock } }));
vi.mock('../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [{ id: 'res1', name: '자국설비', substationId: 's1', assetType: { role: 'device' } }],
  useEffectiveOrgTree: () => [],
}));
vi.mock('../trace/traceGraph', () => ({ collectNodeNames: () => new Map([['s1', '원주']]) }));

import { useAssetRefs } from './useAssetRefs';

const wrap = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children); };

beforeEach(() => { postMock.mockReset(); postMock.mockResolvedValue({ data: { data: [{ id: 'rem1', name: '대국설비', substationId: 's2', substationName: '홍천' }] } }); });

describe('useAssetRefs', () => {
  it('resident id 는 즉시(fetch 없이), miss id 만 서버 fetch 후 merge', async () => {
    const { result } = renderHook(() => useAssetRefs(['res1', 'rem1']), { wrapper: wrap() });
    await waitFor(() => expect(result.current.get('rem1')).toBeDefined());
    expect(result.current.get('res1')).toMatchObject({ id: 'res1', name: '자국설비', substationName: '원주' }); // resident + orgName
    expect(result.current.get('rem1')).toMatchObject({ id: 'rem1', name: '대국설비', substationName: '홍천' }); // fetched
    expect(postMock).toHaveBeenCalledWith('/assets/refs', { ids: ['rem1'] }); // miss 만
  });
  it('전부 resident 면 fetch 안 함', async () => {
    renderHook(() => useAssetRefs(['res1']), { wrapper: wrap() });
    expect(postMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: run → fail** (module 없음).

- [ ] **Step 3: implement**

`frontend/src/features/assets/useAssetRefs.ts`:
```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useEffectiveAssets, useEffectiveOrgTree } from '../workingCopy/hooks';
import { collectNodeNames } from '../trace/traceGraph';
import type { AssetRef } from './useSearchAssets';

/**
 * 임의 자산 id → AssetRef 해소(로드맵 Primitive 1 get(id)). resident(워킹카피)면 즉시,
 * miss id 만 서버 batch fetch(캐시). 크로스변전소 이름을 예측 preload 없이 lazy 해소.
 */
export function useAssetRefs(ids: string[]): Map<string, AssetRef> {
  const assets = useEffectiveAssets();
  const orgTree = useEffectiveOrgTree();
  const orgNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);

  const residentById = useMemo(() => {
    const m = new Map<string, AssetRef>();
    for (const a of assets) m.set(a.id, {
      id: a.id, name: a.name, substationId: a.substationId,
      substationName: a.substationId ? (orgNames.get(a.substationId) ?? null) : null,
    });
    return m;
  }, [assets, orgNames]);

  const missing = useMemo(
    () => [...new Set(ids)].filter((id) => id && !residentById.has(id)).sort(),
    [ids, residentById],
  );
  const missKey = missing.join(',');

  const { data: fetched } = useQuery<AssetRef[]>({
    queryKey: ['asset-refs', missKey],
    queryFn: async () => (await api.post<{ data: AssetRef[] }>('/assets/refs', { ids: missing })).data.data,
    enabled: missing.length > 0,
  });

  return useMemo(() => {
    const m = new Map<string, AssetRef>();
    for (const id of ids) { const r = residentById.get(id); if (r) m.set(id, r); }
    for (const r of fetched ?? []) m.set(r.id, r);
    return m;
  }, [ids, residentById, fetched]);
}
```

- [ ] **Step 4: run → pass** + `cd frontend && npx tsc --noEmit` 0.

- [ ] **Step 5: commit**
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/useAssetRefs.ts frontend/src/features/assets/useAssetRefs.test.tsx
git commit -m "feat(assets): useAssetRefs — resident-first + 서버 fetch 엔티티 이름 resolver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 회귀
- [ ] `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism` → 전수 PASS(+refs 통합).
- [ ] `cd frontend && npx tsc --noEmit && npx vitest run` → 전수 PASS(+useAssetRefs). 소비처 미변경이라 기존 회귀 0.

## Self-Review
- 스펙 §3 D1(useAssetRefs resident-first+fetch)→T2, D2(POST /assets/refs)→T1. 소비처 이전(D3)·preload 제거(D4)는 5b/5c(범위 밖). ✓
- Placeholder 없음. zod body-직접(trace 동형). AssetRef 재사용(중복 타입 0). ✓
- 타입: refsByIds→AssetSearchResult(=AssetRef shape); 훅 반환 Map<string,AssetRef>; missKey 안정. ✓
