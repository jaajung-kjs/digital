# Lv1 워킹카피 엔진 + OCC — 구현 계획 (1부: 엔진·백엔드·레지스터·충돌 UX)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 제네릭 Unit-of-Work 워킹카피 엔진(순수 함수) + 낙관적 동시성(OCC) 백엔드 + 레지스터를 그 엔진 위에서 스테이징/커밋하도록 전환하고, 충돌 UX를 붙인다.

**Architecture:** 순수 함수 엔진(`features/workingCopy/`: overlay 리듀서·effective 머지·delta 빌더 — 컬렉션 descriptor 로 제네릭) + 변전소 단위 Zustand 인스턴스(레지스터). 백엔드는 OCC 헬퍼(`collectConflicts`) + 자산 배치 커밋 엔드포인트(`updatedAt` 토큰, 충돌 시 409 `details=conflicts`). 기존 `AppError(…, details)` + `errorHandler` 가 409 를 그대로 반환하므로 errorHandler 변경 없음.

**Tech Stack:** Express+Prisma+Zod+Vitest(+supertest) / React+Zustand+React Query+Vitest. dev DB: `docker compose -f docker-compose.dev.yml up -d`.

**설계 근거:** `docs/superpowers/specs/2026-06-05-unified-workingcopy-concurrency-design.md`

**범위:** spec §11 의 **단계 1~4**(엔진 코어 → 백엔드 OCC → 레지스터 인스턴스 → 충돌 UX). **단계 5(에디터 마이그레이션)는 별도 후속 계획** — 이 계획만으로 "레지스터가 엔진 위에서 동시안전하게 staged 커밋" 이 완성된다(독립 동작·테스트 가능). 에디터는 이 계획 동안 기존 working-copy 그대로 동작(엔진 공존).

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경 존재. 각 commit 스텝은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조

**엔진(순수, 신규)**
- `frontend/src/features/workingCopy/descriptor.ts` — CollectionDescriptor 타입
- `frontend/src/features/workingCopy/overlay.ts` — Overlay 타입 + 순수 리듀서 (+test)
- `frontend/src/features/workingCopy/effective.ts` — mergeEffective (+test)
- `frontend/src/features/workingCopy/delta.ts` — buildDelta (+test)

**백엔드(OCC)**
- `backend/src/services/concurrency.ts` — collectConflicts(+test) + VersionConflictError
- `backend/src/services/assetCommit.service.ts` — 자산 배치 커밋 + 충돌검사
- `backend/src/controllers/assetCommit.controller.ts`, `backend/src/routes/assetCommit.routes.ts` (또는 assets.routes 에 추가) + index.ts 등록
- `backend/tests/assetCommit.integration.test.ts`

**레지스터 인스턴스**
- `frontend/src/features/assets/registerStore.ts` — Zustand overlay 인스턴스(assets + photo/log 큐)
- `frontend/src/features/assets/commit.ts` — commitRegister(델타 조립→POST→409/idMap/캐시)
- 수정: `SubstationAssetGrid.tsx`/`AssetDetailPanel.tsx`/`AssetPhotoSection.tsx`/`AssetMaintenanceSection.tsx`(즉시→stage), `assetApi.ts`(commit 호출)

**충돌 UX**
- `frontend/src/features/workingCopy/ConflictDialog.tsx` — 공용 충돌 모달

---

# Phase 1 — 엔진 코어 (순수, TDD)

## Task 1: descriptor + effective 머지

**Files:** Create `frontend/src/features/workingCopy/descriptor.ts`, `frontend/src/features/workingCopy/effective.ts`, `frontend/src/features/workingCopy/effective.test.ts`

- [ ] **Step 1: descriptor 타입**

Create `frontend/src/features/workingCopy/descriptor.ts`:
```typescript
export interface CollectionDescriptor<T, Patch = Partial<T>> {
  name: string;
  idOf: (t: T) => string;
  versionOf?: (t: T) => string | null;            // OCC 토큰(updatedAt). 큐 컬렉션은 없음
  isTemp: (id: string) => boolean;
  applyIdMap?: (t: T, idMap: Record<string, string>) => T;  // tempId 참조 해석
}
```

- [ ] **Step 2: 실패 테스트**

Create `frontend/src/features/workingCopy/effective.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mergeEffective } from './effective';
import { emptyOverlay, stageUpdate, stageDelete, stageCreate } from './overlay';
import type { CollectionDescriptor } from './descriptor';

interface Row { id: string; name: string; v: string }
const d: CollectionDescriptor<Row> = {
  name: 'rows', idOf: (r) => r.id, versionOf: (r) => r.v, isTemp: (id) => id.startsWith('temp-'),
};
const saved: Row[] = [{ id: 'a', name: 'A', v: '1' }, { id: 'b', name: 'B', v: '1' }];

describe('mergeEffective', () => {
  it('빈 overlay 면 saved 그대로', () => {
    expect(mergeEffective(saved, emptyOverlay<Row>(), d)).toEqual(saved);
  });
  it('update 패치가 덮인다', () => {
    const o = stageUpdate(emptyOverlay<Row>(), 'a', { name: 'A2' });
    expect(mergeEffective(saved, o, d).find((r) => r.id === 'a')!.name).toBe('A2');
  });
  it('delete 는 제외', () => {
    const o = stageDelete(emptyOverlay<Row>(), 'b');
    expect(mergeEffective(saved, o, d).map((r) => r.id)).toEqual(['a']);
  });
  it('create 는 뒤에 추가', () => {
    const o = stageCreate(emptyOverlay<Row>(), 'temp-x', { id: 'temp-x', name: 'X', v: '' });
    const out = mergeEffective(saved, o, d);
    expect(out).toHaveLength(3);
    expect(out[2].id).toBe('temp-x');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/effective.test.ts`
Expected: FAIL (cannot resolve './effective' or './overlay').

- [ ] **Step 4: effective 구현**

Create `frontend/src/features/workingCopy/effective.ts`:
```typescript
import type { CollectionDescriptor } from './descriptor';
import type { Overlay } from './overlay';

/** saved + overlay → effective. 모든 컬렉션 공통(제네릭). */
export function mergeEffective<T, P>(
  saved: T[],
  overlay: Overlay<T, P>,
  d: CollectionDescriptor<T, P>,
): T[] {
  const deleted = new Set(overlay.deletes);
  const result: T[] = [];
  for (const s of saved) {
    const id = d.idOf(s);
    if (deleted.has(id)) continue;
    const patch = overlay.updates[id];
    result.push(patch ? ({ ...s, ...patch } as T) : s);
  }
  for (const id of Object.keys(overlay.creates)) result.push(overlay.creates[id]);
  return result;
}
```
(overlay.ts 는 Task 2 에서 — 이 테스트는 Task 2 구현 후 통과. 순서상 Task 2 의 overlay 를 먼저 만들어도 됨. 아래 Task 2 를 먼저 구현하고 이 테스트를 함께 통과시킨다.)

- [ ] **Step 5: (Task 2 후) 통과 + commit** — Task 2 완료 후 `npx vitest run src/features/workingCopy/effective.test.ts` PASS 확인하고 함께 커밋.

---

## Task 2: overlay 순수 리듀서

**Files:** Create `frontend/src/features/workingCopy/overlay.ts`, `frontend/src/features/workingCopy/overlay.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `frontend/src/features/workingCopy/overlay.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete, overlayDirtyCount, snapshotBaseVersions } from './overlay';

interface Row { id: string; name: string; v: string }

describe('overlay reducers', () => {
  it('emptyOverlay 는 비어있고 dirty 0', () => {
    const o = emptyOverlay<Row>();
    expect(overlayDirtyCount(o)).toBe(0);
  });
  it('stageUpdate 는 누적 머지', () => {
    let o = emptyOverlay<Row>();
    o = stageUpdate(o, 'a', { name: 'A2' });
    o = stageUpdate(o, 'a', { v: '9' } as Partial<Row>);
    expect(o.updates['a']).toEqual({ name: 'A2', v: '9' });
    expect(overlayDirtyCount(o)).toBe(1);
  });
  it('stageDelete 는 deletes 에 넣고 updates 에서 제거', () => {
    let o = stageUpdate(emptyOverlay<Row>(), 'a', { name: 'X' });
    o = stageDelete(o, 'a');
    expect(o.deletes).toContain('a');
    expect(o.updates['a']).toBeUndefined();
  });
  it('temp 생성 후 삭제하면 creates 에서 제거(서버 안 감)', () => {
    let o = stageCreate(emptyOverlay<Row>(), 'temp-x', { id: 'temp-x', name: 'X', v: '' });
    o = stageDelete(o, 'temp-x', true);
    expect(o.creates['temp-x']).toBeUndefined();
    expect(o.deletes).not.toContain('temp-x');
  });
  it('snapshotBaseVersions 는 id→version', () => {
    const bv = snapshotBaseVersions([{ id: 'a', name: 'A', v: '1' }], (r: Row) => r.id, (r: Row) => r.v);
    expect(bv).toEqual({ a: '1' });
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/workingCopy/overlay.test.ts` → FAIL.

- [ ] **Step 3: overlay 구현**

Create `frontend/src/features/workingCopy/overlay.ts`:
```typescript
export interface Overlay<T, P = Partial<T>> {
  creates: Record<string, T>;            // tempId → 신규
  updates: Record<string, P>;            // id → 누적 패치
  deletes: string[];                     // id
  baseVersions: Record<string, string>;  // id → 로드시 version
}

export const emptyOverlay = <T, P = Partial<T>>(): Overlay<T, P> => ({
  creates: {}, updates: {}, deletes: [], baseVersions: {},
});

export function stageCreate<T, P>(o: Overlay<T, P>, tempId: string, item: T): Overlay<T, P> {
  return { ...o, creates: { ...o.creates, [tempId]: item } };
}

export function stageUpdate<T, P>(o: Overlay<T, P>, id: string, patch: P): Overlay<T, P> {
  return { ...o, updates: { ...o.updates, [id]: { ...(o.updates[id] ?? {}), ...patch } } };
}

/** isTemp=true 면 미저장 신규 삭제(서버 안 감) → creates 에서만 제거. */
export function stageDelete<T, P>(o: Overlay<T, P>, id: string, isTemp = false): Overlay<T, P> {
  const updates = { ...o.updates }; delete updates[id];
  if (isTemp) {
    const creates = { ...o.creates }; delete creates[id];
    return { ...o, creates, updates };
  }
  return { ...o, updates, deletes: o.deletes.includes(id) ? o.deletes : [...o.deletes, id] };
}

export function overlayDirtyCount<T, P>(o: Overlay<T, P>): number {
  return Object.keys(o.creates).length + Object.keys(o.updates).length + o.deletes.length;
}

export function snapshotBaseVersions<T>(
  saved: T[], idOf: (t: T) => string, versionOf: (t: T) => string | null,
): Record<string, string> {
  const bv: Record<string, string> = {};
  for (const s of saved) { const v = versionOf(s); if (v) bv[idOf(s)] = v; }
  return bv;
}
```

- [ ] **Step 4: 통과(overlay + effective 둘 다)** — `cd frontend && npx vitest run src/features/workingCopy/overlay.test.ts src/features/workingCopy/effective.test.ts` → 모두 PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/workingCopy/descriptor.ts frontend/src/features/workingCopy/overlay.ts frontend/src/features/workingCopy/overlay.test.ts frontend/src/features/workingCopy/effective.ts frontend/src/features/workingCopy/effective.test.ts
git commit -m "feat(wc): 제네릭 워킹카피 엔진 — overlay 리듀서 + effective 머지(순수 TDD)"
```

---

## Task 3: delta 빌더 (커밋 페이로드)

**Files:** Create `frontend/src/features/workingCopy/delta.ts`, `frontend/src/features/workingCopy/delta.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `frontend/src/features/workingCopy/delta.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDelta } from './delta';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete } from './overlay';

interface Row { id: string; name: string }

describe('buildDelta', () => {
  it('creates/updates/deletes + baseVersion 동봉', () => {
    let o = emptyOverlay<Row>();
    o.baseVersions = { a: 'v1', b: 'v1' };
    o = stageUpdate(o, 'a', { name: 'A2' });
    o = stageDelete(o, 'b');
    o = stageCreate(o, 'temp-x', { id: 'temp-x', name: 'X' });
    const delta = buildDelta(o);
    expect(delta.creates).toEqual([{ id: 'temp-x', name: 'X' }]);
    expect(delta.updates).toEqual([{ id: 'a', baseVersion: 'v1', patch: { name: 'A2' } }]);
    expect(delta.deletes).toEqual([{ id: 'b', baseVersion: 'v1' }]);
  });
  it('base 없는 항목은 baseVersion null', () => {
    let o = stageUpdate(emptyOverlay<Row>(), 'z', { name: 'Z' });
    expect(buildDelta(o).updates[0].baseVersion).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: delta 구현**

Create `frontend/src/features/workingCopy/delta.ts`:
```typescript
import type { Overlay } from './overlay';

export interface CollectionDelta<T, P> {
  creates: T[];
  updates: { id: string; baseVersion: string | null; patch: P }[];
  deletes: { id: string; baseVersion: string | null }[];
}

export function buildDelta<T, P>(o: Overlay<T, P>): CollectionDelta<T, P> {
  return {
    creates: Object.values(o.creates),
    updates: Object.entries(o.updates).map(([id, patch]) => ({
      id, baseVersion: o.baseVersions[id] ?? null, patch,
    })),
    deletes: o.deletes.map((id) => ({ id, baseVersion: o.baseVersions[id] ?? null })),
  };
}
```

- [ ] **Step 4: 통과 + Commit** — `npx vitest run src/features/workingCopy/delta.test.ts` PASS.
```bash
git add frontend/src/features/workingCopy/delta.ts frontend/src/features/workingCopy/delta.test.ts
git commit -m "feat(wc): delta 빌더(커밋 페이로드, baseVersion 동봉) + 테스트"
```

---

# Phase 2 — 백엔드 OCC

## Task 4: 충돌검사 헬퍼 + 충돌 에러

**Files:** Create `backend/src/services/concurrency.ts`, `backend/tests/concurrency.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `backend/tests/concurrency.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { collectConflicts } from '../src/services/concurrency.js';

describe('collectConflicts', () => {
  const current = new Map<string, Date>([['a', new Date('2026-06-05T00:00:00.000Z')]]);
  it('base 일치면 충돌 없음', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: '2026-06-05T00:00:00.000Z', name: 'A' }]);
    expect(c).toEqual([]);
  });
  it('base 불일치면 충돌', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: '2025-01-01T00:00:00.000Z', name: 'A' }]);
    expect(c).toEqual([{ collection: 'assets', id: 'a', name: 'A' }]);
  });
  it('서버에 없으면(타인이 삭제) 충돌', () => {
    const c = collectConflicts('assets', current, [{ id: 'gone', baseVersion: 'x', name: 'G' }]);
    expect(c).toEqual([{ collection: 'assets', id: 'gone', name: 'G' }]);
  });
  it('baseVersion null(신규 등) 은 검사 안 함', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: null, name: 'A' }]);
    expect(c).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd backend && npx vitest run tests/concurrency.test.ts` → FAIL.

- [ ] **Step 3: 구현**

Create `backend/src/services/concurrency.ts`:
```typescript
import { AppError } from '../utils/errors.js';

export interface ConflictItem { collection: string; id: string; name?: string }

/** 충돌 시 409. conflicts 는 AppError.details 로 → errorHandler 가 그대로 반환. */
export class VersionConflictError extends AppError {
  constructor(public conflicts: ConflictItem[]) {
    super(409, 'CONFLICT', '다른 사용자가 먼저 변경했습니다.', conflicts);
  }
}

/** current: id→현재 updatedAt. items: 커밋 대상의 base. 불일치/부재 → 충돌. base null 은 skip. */
export function collectConflicts(
  collection: string,
  current: Map<string, Date>,
  items: { id: string; baseVersion: string | null; name?: string }[],
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  for (const it of items) {
    if (it.baseVersion == null) continue;
    const cur = current.get(it.id);
    if (!cur) { conflicts.push({ collection, id: it.id, name: it.name }); continue; }
    if (cur.toISOString() !== it.baseVersion) conflicts.push({ collection, id: it.id, name: it.name });
  }
  return conflicts;
}
```

- [ ] **Step 4: 통과 + Commit** — PASS.
```bash
git add backend/src/services/concurrency.ts backend/tests/concurrency.test.ts
git commit -m "feat(occ): 충돌검사 헬퍼 + VersionConflictError(409 details)"
```

---

## Task 5: 자산 배치 커밋 엔드포인트

**Files:** Create `backend/src/services/assetCommit.service.ts`, `backend/src/controllers/assetCommit.controller.ts`, `backend/src/routes/assetCommit.routes.ts`; Modify `backend/src/index.ts`; Create `backend/tests/assetCommit.integration.test.ts`

- [ ] **Step 1: 서비스**

Create `backend/src/services/assetCommit.service.ts`:
```typescript
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { collectConflicts, VersionConflictError } from './concurrency.js';

export interface AssetCommitInput {
  creates: { tempId: string; assetTypeId: string; name: string; parentAssetId?: string | null;
    roomText?: string | null; attributes?: Record<string, unknown> | null;
    installDate?: string | null; manager?: string | null; status?: string | null;
    warrantyUntil?: string | null; replaceDue?: string | null }[];
  updates: { id: string; baseVersion: string | null; patch: Record<string, unknown> }[];
  deletes: { id: string; baseVersion: string | null }[];
}

const dateOrNull = (v: unknown) => (v ? new Date(v as string) : null);

class AssetCommitService {
  async commit(substationId: string, input: AssetCommitInput, userId: string) {
    return prisma.$transaction(async (tx) => {
      const ids = [...input.updates.map((u) => u.id), ...input.deletes.map((d) => d.id)];
      const rows = ids.length
        ? await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true, name: true } })
        : [];
      const current = new Map(rows.map((r) => [r.id, r.updatedAt]));
      const nameById = new Map(rows.map((r) => [r.id, r.name]));
      const conflicts = [
        ...collectConflicts('assets', current, input.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion, name: nameById.get(u.id) }))),
        ...collectConflicts('assets', current, input.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion, name: nameById.get(d.id) }))),
      ];
      if (conflicts.length) throw new VersionConflictError(conflicts);

      const idMap: Record<string, string> = {};
      for (const c of input.creates) {
        const created = await tx.asset.create({
          data: {
            substationId, assetTypeId: c.assetTypeId, name: c.name,
            parentAssetId: c.parentAssetId ?? null, roomText: c.roomText ?? null,
            attributes: (c.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
            installDate: dateOrNull(c.installDate), manager: c.manager ?? null, status: c.status ?? null,
            warrantyUntil: dateOrNull(c.warrantyUntil), replaceDue: dateOrNull(c.replaceDue),
            createdById: userId, updatedById: userId,
          },
        });
        idMap[c.tempId] = created.id;
      }
      for (const u of input.updates) {
        const p = u.patch;
        await tx.asset.update({
          where: { id: u.id },
          data: {
            name: p.name as string | undefined,
            roomText: p.roomText as string | null | undefined,
            attributes: (p.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
            installDate: p.installDate === undefined ? undefined : dateOrNull(p.installDate),
            manager: p.manager as string | null | undefined,
            status: p.status as string | null | undefined,
            warrantyUntil: p.warrantyUntil === undefined ? undefined : dateOrNull(p.warrantyUntil),
            replaceDue: p.replaceDue === undefined ? undefined : dateOrNull(p.replaceDue),
            updatedById: userId,
          },
        });
      }
      if (input.deletes.length) {
        await tx.asset.deleteMany({ where: { id: { in: input.deletes.map((d) => d.id) } } });
      }
      const touched = [...input.updates.map((u) => u.id), ...Object.values(idMap)];
      const updated = touched.length
        ? await tx.asset.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } })
        : [];
      return { idMap, updated: updated.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })) };
    });
  }
}
export const assetCommitService = new AssetCommitService();
```

- [ ] **Step 2: 컨트롤러 + 라우트 + 등록**

Create `backend/src/controllers/assetCommit.controller.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { assetCommitService } from '../services/assetCommit.service.js';

export const assetCommitController = {
  async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await assetCommitService.commit(req.params.substationId, req.body, userId);
      res.json({ data: result });
    } catch (error) { next(error); }
  },
};
```
Create `backend/src/routes/assetCommit.routes.ts`:
```typescript
import { Router } from 'express';
import { z } from 'zod';
import { assetCommitController } from '../controllers/assetCommit.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const commitSchema = z.object({
  creates: z.array(z.object({
    tempId: z.string(), assetTypeId: z.string().uuid(), name: z.string().min(1).max(100),
    parentAssetId: z.string().uuid().optional().nullable(), roomText: z.string().max(100).optional().nullable(),
    attributes: z.record(z.unknown()).optional().nullable(),
    installDate: z.string().date().optional().nullable(), manager: z.string().max(100).optional().nullable(),
    status: z.string().max(20).optional().nullable(),
    warrantyUntil: z.string().date().optional().nullable(), replaceDue: z.string().date().optional().nullable(),
  })).default([]),
  updates: z.array(z.object({
    id: z.string().uuid(), baseVersion: z.string().nullable(), patch: z.record(z.unknown()),
  })).default([]),
  deletes: z.array(z.object({ id: z.string().uuid(), baseVersion: z.string().nullable() })).default([]),
});

router.post('/:substationId/assets/commit', authenticate, adminOnly, validate(commitSchema), assetCommitController.commit);

export { router as assetCommitRouter };
```
In `backend/src/index.ts`, add import + mount next to other routers:
```typescript
import { assetCommitRouter } from './routes/assetCommit.routes.js';
app.use('/api/substations', assetCommitRouter);
```
(경로: `POST /api/substations/:substationId/assets/commit`.)

- [ ] **Step 3: 통합 테스트**

Create `backend/tests/assetCommit.integration.test.ts` — admin 로그인 + prisma 로 HQ/branch/substation + assetType(PITR) fixture 생성. 시나리오:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetCommitRouter } from '../src/routes/assetCommit.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('Asset 배치 커밋 + OCC', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, typeId: string;
  const created: string[] = [];
  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/api/auth', authRouter); app.use('/api/substations', assetCommitRouter); app.use(errorHandler);
    token = (await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })).body.accessToken;
    const hq = await prisma.headquarters.create({ data: { name: '__wc_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__wc_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__wc_sub__', branchId: br.id } }); subId = sub.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;
  });
  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: created } } });
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('create 커밋 → idMap 반환', async () => {
    const res = await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ creates: [{ tempId: 'temp-1', assetTypeId: typeId, name: 'WC-1' }] }).expect(200);
    expect(res.body.data.idMap['temp-1']).toBeTruthy();
    created.push(res.body.data.idMap['temp-1']);
  });

  it('update — 올바른 baseVersion 이면 적용, 틀리면 409', async () => {
    const a = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'WC-2' } });
    created.push(a.id);
    const base = a.updatedAt.toISOString();
    await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ updates: [{ id: a.id, baseVersion: base, patch: { name: 'WC-2b' } }] }).expect(200);
    // 옛 base 로 다시 → 409
    const res = await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ updates: [{ id: a.id, baseVersion: base, patch: { name: 'WC-2c' } }] }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0].id).toBe(a.id);
  });
});
```

- [ ] **Step 4: 실행 + Commit**

Run: `cd backend && npx vitest run tests/concurrency.test.ts tests/assetCommit.integration.test.ts` → PASS. `npm run build` → 0.
```bash
git add backend/src/services/assetCommit.service.ts backend/src/controllers/assetCommit.controller.ts backend/src/routes/assetCommit.routes.ts backend/src/index.ts backend/tests/assetCommit.integration.test.ts
git commit -m "feat(occ): 자산 배치 커밋 엔드포인트(충돌검사·idMap) + 통합테스트"
```

---

# Phase 3 — 레지스터 인스턴스 (즉시→스테이징)

## Task 6: 레지스터 store + commit

**Files:** Create `frontend/src/features/assets/registerStore.ts`, `frontend/src/features/assets/commit.ts`; Modify `frontend/src/services/assetApi.ts`

- [ ] **Step 1: assetApi 에 commit 추가**

In `frontend/src/services/assetApi.ts` add to `assetApi`:
```typescript
  commit: async (substationId: string, body: unknown): Promise<{ idMap: Record<string,string>; updated: { id:string; updatedAt:string }[] }> => {
    const { data } = await api.post<{ data: { idMap: Record<string,string>; updated: { id:string; updatedAt:string }[] } }>(`/substations/${substationId}/assets/commit`, body);
    return data.data;
  },
```

- [ ] **Step 2: 레지스터 store (Zustand)**

Create `frontend/src/features/assets/registerStore.ts`:
```typescript
import { create } from 'zustand';
import type { Asset, UpdateAssetInput, CreateAssetInput } from '../../types/asset';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete, overlayDirtyCount, snapshotBaseVersions, type Overlay } from '../workingCopy/overlay';

export interface PhotoQueueItem { tempPhotoId: string; assetId: string; side: 'front' | 'rear'; file: File; objectUrl: string }
export interface LogQueueItem { tempLogId: string; assetId: string; logType: string; title: string }

interface RegisterState {
  substationId: string | null;
  overlay: Overlay<Asset, Partial<UpdateAssetInput>>;
  photoQueue: PhotoQueueItem[];
  logQueue: LogQueueItem[];
  load: (substationId: string, saved: Asset[]) => void;
  stageCreate: (tempId: string, item: Asset) => void;
  stageUpdate: (id: string, patch: Partial<UpdateAssetInput>) => void;
  stageDelete: (id: string, isTemp: boolean) => void;
  enqueuePhoto: (item: PhotoQueueItem) => void;
  enqueueLog: (item: LogQueueItem) => void;
  revert: () => void;
  clear: () => void;
  dirtyCount: () => number;
}

export const useRegisterStore = create<RegisterState>((set, get) => ({
  substationId: null,
  overlay: emptyOverlay<Asset, Partial<UpdateAssetInput>>(),
  photoQueue: [],
  logQueue: [],
  load: (substationId, saved) => set({
    substationId,
    overlay: { ...emptyOverlay<Asset, Partial<UpdateAssetInput>>(), baseVersions: snapshotBaseVersions(saved, (a) => a.id, (a) => (a as Asset & { updatedAt?: string }).updatedAt ?? null) },
    photoQueue: [], logQueue: [],
  }),
  stageCreate: (tempId, item) => set((s) => ({ overlay: stageCreate(s.overlay, tempId, item) })),
  stageUpdate: (id, patch) => set((s) => ({ overlay: stageUpdate(s.overlay, id, patch) })),
  stageDelete: (id, isTemp) => set((s) => ({
    overlay: stageDelete(s.overlay, id, isTemp),
    photoQueue: s.photoQueue.filter((p) => p.assetId !== id),
    logQueue: s.logQueue.filter((l) => l.assetId !== id),
  })),
  enqueuePhoto: (item) => set((s) => ({ photoQueue: [...s.photoQueue, item] })),
  enqueueLog: (item) => set((s) => ({ logQueue: [...s.logQueue, item] })),
  revert: () => set((s) => ({ overlay: { ...emptyOverlay<Asset, Partial<UpdateAssetInput>>(), baseVersions: s.overlay.baseVersions }, photoQueue: [], logQueue: [] })),
  clear: () => set({ overlay: emptyOverlay<Asset, Partial<UpdateAssetInput>>(), photoQueue: [], logQueue: [] }),
  dirtyCount: () => { const s = get(); return overlayDirtyCount(s.overlay) + s.photoQueue.length + s.logQueue.length; },
}));
```
> 주의: `Asset` 타입에 `updatedAt: string` 이 없으면 `types/asset.ts` 의 `Asset` 에 `updatedAt: string;` 추가(서버가 반환함) — 이 Task 에서 함께.

- [ ] **Step 3: commitRegister**

Create `frontend/src/features/assets/commit.ts`:
```typescript
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { assetApi } from '../../services/assetApi';
import { buildDelta } from '../workingCopy/delta';
import { useRegisterStore } from './registerStore';
import type { Asset } from '../../types/asset';

const ASSET_KEY = (subId: string) => ['assets', subId];

/** 레지스터 워킹카피 커밋. 409 면 conflicts 반환(overlay 보존). */
export async function commitRegister(substationId: string, queryClient: QueryClient): Promise<{ ok: boolean; conflicts?: { id: string; name?: string }[] }> {
  const st = useRegisterStore.getState();
  const delta = buildDelta(st.overlay);
  // creates 직렬화: Asset(로컬 신규) → 커밋 입력 형태
  const creates = delta.creates.map((a) => ({
    tempId: a.id, assetTypeId: a.assetTypeId, name: a.name, parentAssetId: a.parentAssetId ?? null,
    roomText: a.roomText ?? null, attributes: a.attributes ?? null,
    installDate: a.installDate ?? null, manager: a.manager ?? null, status: a.status ?? null,
    warrantyUntil: a.warrantyUntil ?? null, replaceDue: a.replaceDue ?? null,
  }));
  try {
    const { idMap } = await assetApi.commit(substationId, { creates, updates: delta.updates, deletes: delta.deletes });
    // 큐 후처리: 신규 자산의 tempId → realId 해석 후 사진/로그 업로드
    for (const p of st.photoQueue) {
      const assetId = idMap[p.assetId] ?? p.assetId;
      const form = new FormData(); form.append('file', p.file); form.append('side', p.side);
      await api.post(`/equipment/${assetId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    for (const l of st.logQueue) {
      const assetId = idMap[l.assetId] ?? l.assetId;
      await api.post(`/equipment/${assetId}/maintenance-logs`, { logType: l.logType, title: l.title });
    }
    useRegisterStore.getState().clear();
    await queryClient.invalidateQueries({ queryKey: ASSET_KEY(substationId) });
    // 갱신된 saved 로 baseVersions 재설정
    const fresh = queryClient.getQueryData<Asset[]>(ASSET_KEY(substationId)) ?? [];
    useRegisterStore.getState().load(substationId, fresh);
    return { ok: true };
  } catch (e) {
    const conflicts = (e as { response?: { status?: number; data?: { details?: { id: string; name?: string }[] } } }).response;
    if (conflicts?.status === 409) return { ok: false, conflicts: conflicts.data?.details ?? [] };
    throw e;
  }
}
```
> `ASSET_KEY` 가 기존 `useSubstationAssets` 의 `ASSET_KEYS.bySubstation(subId)`(= `['assets', subId]`) 와 동일해야 함 — 실제 키 확인 후 일치시킨다.

- [ ] **Step 4: 타입체크 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0.
```bash
git add frontend/src/services/assetApi.ts frontend/src/features/assets/registerStore.ts frontend/src/features/assets/commit.ts frontend/src/types/asset.ts
git commit -m "feat(asset): 레지스터 워킹카피 store + 커밋(델타·큐·409)"
```

---

## Task 7: 그리드/패널을 staged 로 전환 + 미커밋 바

**Files:** Modify `frontend/src/features/assets/components/SubstationAssetGrid.tsx`, `AssetDetailPanel.tsx`

- [ ] **Step 1: SubstationAssetGrid 전환**

READ the file. Then:
- `useRegisterStore` 로드: `useEffect(() => { if (assets) useRegisterStore.getState().load(substationId, assets); }, [substationId, assets])` (saved 가 바뀌면 base 갱신 — 단 dirty 중엔 재로드 막기: `if (useRegisterStore.getState().dirtyCount() === 0) load(...)`).
- effective: `const overlay = useRegisterStore((s) => s.overlay); const effective = useMemo(() => mergeEffective(assets ?? [], overlay, ASSET_DESCRIPTOR), [assets, overlay]);` — `ASSET_DESCRIPTOR = { name:'assets', idOf:(a)=>a.id, versionOf:(a)=>a.updatedAt ?? null, isTemp:(id)=>id.startsWith('temp-') }` (모듈 상수). `visible`/`shown` 계산을 `effective` 기준으로.
- 편집 핸들러 전환: 행/패널의 onCommit/onCreate/onDelete/onDuplicate → 즉시 mutate 대신 `useRegisterStore.getState().stageUpdate/stageCreate/stageDelete`. 신규는 `generateTempId()`(`utils/idHelpers`)로 만든 Asset 객체를 stageCreate. 복제는 원본 복사 + tempId 로 stageCreate.
- 상단 미커밋 바: `const dirty = useRegisterStore((s) => s.dirtyCount()); {dirty > 0 && <div>미커밋 {dirty}건 <button onClick={onCommit}>커밋</button> <button onClick={() => useRegisterStore.getState().revert()}>되돌리기</button></div>}` — `onCommit = async () => { const r = await commitRegister(substationId, queryClient); if (!r.ok) setConflicts(r.conflicts); }` (queryClient from `useQueryClient()`).
- 기존 `useCreateAsset/useUpdateAsset/...` 즉시 뮤테이션 호출 제거(또는 미사용). React Query saved 쿼리(`useSubstationAssets`)는 유지.

- [ ] **Step 2: AssetDetailPanel onPatch 전환**

`AssetDetailPanel` 의 `onPatch(id, patch)` 가 즉시 mutate 대신 `useRegisterStore.getState().stageUpdate(id, patch)` 를 호출하도록, 그리드에서 넘기는 `onPatch` 를 교체. (패널 자체는 onPatch prop 만 받으므로 호출부만 변경.)

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit && npx vite build` → 성공.
```bash
git add frontend/src/features/assets/components/SubstationAssetGrid.tsx frontend/src/features/assets/components/AssetDetailPanel.tsx
git commit -m "feat(asset): 레지스터 그리드/패널을 워킹카피 staged 로 전환 + 미커밋 바"
```

---

## Task 8: 사진·유지보수 큐 스테이징

**Files:** Modify `frontend/src/features/assets/components/AssetPhotoSection.tsx`, `AssetMaintenanceSection.tsx`

- [ ] **Step 1: 사진 섹션 — 즉시 업로드 → enqueue**

`AssetPhotoSection`: `useUploadAssetPhoto` 즉시 호출 대신, 파일 선택 시 `useRegisterStore.getState().enqueuePhoto({ tempPhotoId: generateTempId(), assetId, side, file, objectUrl: URL.createObjectURL(file) })`. 표시 목록 = 서버 사진(`useAssetPhotos`) + photoQueue(해당 assetId·side) 의 objectUrl 미리보기("미커밋" 표식). 삭제: 큐 항목은 큐에서 제거, 서버 사진은 기존 즉시 삭제 유지(또는 큐 delete — Lv1 은 서버 사진 삭제도 즉시 허용).

- [ ] **Step 2: 유지보수 섹션 — 즉시 생성 → enqueue**

`AssetMaintenanceSection`: `useCreateAssetMaintenanceLog` 즉시 호출 대신 `useRegisterStore.getState().enqueueLog({ tempLogId: generateTempId(), assetId, logType, title })`. 목록 = 서버 로그 + logQueue("미커밋").

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit && npx vite build` → 성공.
```bash
git add frontend/src/features/assets/components/AssetPhotoSection.tsx frontend/src/features/assets/components/AssetMaintenanceSection.tsx
git commit -m "feat(asset): 사진·유지보수를 워킹카피 큐로 스테이징"
```

---

# Phase 4 — 충돌 UX

## Task 9: 충돌 모달 + 동시성 스모크

**Files:** Create `frontend/src/features/workingCopy/ConflictDialog.tsx`; Modify `SubstationAssetGrid.tsx`

- [ ] **Step 1: 충돌 모달**

Create `frontend/src/features/workingCopy/ConflictDialog.tsx`:
```typescript
interface Props {
  conflicts: { id: string; name?: string }[];
  onReloadLatest: () => void;
  onClose: () => void;
}
export function ConflictDialog({ conflicts, onReloadLatest, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center" style={{ zIndex: 70 }}>
      <div className="bg-white rounded-lg shadow-lg p-5 w-96">
        <h2 className="text-sm font-semibold mb-2">충돌 — 다른 사용자가 먼저 변경했습니다</h2>
        <ul className="text-sm text-gray-600 mb-3 max-h-40 overflow-auto">
          {conflicts.map((c) => <li key={c.id}>· {c.name ?? c.id}</li>)}
        </ul>
        <p className="text-xs text-gray-500 mb-3">최신 내용을 불러온 뒤 내 변경을 다시 확인하고 커밋하세요.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1 rounded bg-gray-100">닫기</button>
          <button onClick={onReloadLatest} className="text-sm px-3 py-1 rounded bg-blue-600 text-white">최신 불러오기</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 그리드에 배선**

`SubstationAssetGrid`: `const [conflicts, setConflicts] = useState<{id:string;name?:string}[] | null>(null);` 커밋이 409 면 `setConflicts(r.conflicts)`. `{conflicts && <ConflictDialog conflicts={conflicts} onClose={() => setConflicts(null)} onReloadLatest={async () => { await queryClient.invalidateQueries({ queryKey: ['assets', substationId] }); setConflicts(null); /* overlay 보존 — 사용자가 재검토 후 재커밋 */ }} />}`.

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit && npx vite build` → 성공.
```bash
git add frontend/src/features/workingCopy/ConflictDialog.tsx frontend/src/features/assets/components/SubstationAssetGrid.tsx
git commit -m "feat(wc): 충돌 모달 + 레지스터 커밋 배선"
```

- [ ] **Step 4: 검증 — 회귀 + 동시성 수동 스모크**

Run: `cd backend && npx vitest run tests/concurrency.test.ts tests/assetCommit.integration.test.ts tests/asset.service.test.ts tests/asset.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts` → 모두 PASS. `cd frontend && npx vitest run src/features/workingCopy src/features/assets/columns.test.ts src/features/assets/alerts.test.ts src/features/assets/exportCsv.test.ts` → PASS. `npx tsc --noEmit && npx vite build` → 성공.

수동(dev): 브라우저 두 탭으로 같은 변전소 현황 표 → A 탭에서 자산 이름 편집 → "미커밋 1건" → [커밋] → 반영. B 탭(편집 전 로드)에서 같은 자산 편집 → [커밋] → **충돌 모달** → [최신 불러오기] → 재검토 → 재커밋 성공. 사진·유지보수도 커밋 시 함께 올라가는지 확인.

---

## 완료 기준 (spec §10 대응)
- [ ] 레지스터 편집이 즉시저장 안 되고 "미커밋"으로 쌓이며 [커밋]으로 원자 반영 (T6·T7)
- [ ] 동시 편집 시 나중 커밋이 409 거부 + 충돌 표시(덮어쓰기 없음) (T5·T9)
- [ ] "최신 불러오기" 후 재커밋 (T9)
- [ ] 사진·유지보수도 큐로 스테이징되어 커밋 시 반영 (T8)
- [ ] 엔진은 제네릭(descriptor) — 새 컬렉션 추가 시 mergeX/resolveX 불필요 (T1~3)
- [ ] 2a·V1 테스트 회귀 없음 (T9)

## 이후 (별도 계획)
- **에디터 인스턴스 마이그레이션**(spec §11 단계5): editorStore overlay/mergeX/resolveX/commit → 엔진, baseFloorVersion OCC. 가장 큰 단계 — 별도 spec/plan.
- (가) 패널 수렴, (나) 통합 워크스페이스, V2~V5.
