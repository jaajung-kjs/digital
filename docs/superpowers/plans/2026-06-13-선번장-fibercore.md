# 선번장(FiberCore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원주가 엑셀 선번장으로 관리하던 OFD 광코어 단위 연결 대장을 단일 SSOT 위 그리드 뷰로 앱에 넣는다 — 점유는 기존 케이블에서 도출, 실무 메타(용도·수용내역·융착/패치·사용여부)만 신규 희소 테이블 `FiberCore`에 저장.

**Architecture:** `FiberPath`(OFD쌍, 유지) 밑에 `FiberCore`(희소 메타) 테이블을 추가한다. 점유/빈/양측 자산은 기존 `usePortStatus(ofdId)` 도출을 그대로 쓰고, 읽을 때 `buildFiberCoreRows`가 도출+메타를 합쳐 코어 한 행을 만든다. 변전소 top-level "연결" 뷰를 선번장 그리드로 교체하고, 행 클릭 시 현황뷰와 동일하게 공유 선택 → 사이드패널(연결탭) → 평면도 하이라이트.

**Tech Stack:** Prisma/PostgreSQL, Node/Zod(backend), React/TS/Zustand(frontend), Vitest + @testing-library/react.

**참조 스펙:** `docs/superpowers/specs/2026-06-13-선번장-fibercore-design.md`

---

## 개발/테스트 환경 규칙 (모든 태스크 공통)

- DB는 dev compose로만: `docker compose -f docker-compose.dev.yml up -d` (이미 떠 있으면 생략).
- **절대** `docker compose build` / 기본 `docker compose up` 사용 금지.
- 빌드 검증은 `npm run build`(프론트는 tsc+vite, 백엔드는 tsc)로만.
- 백엔드 테스트: `cd backend && npx vitest run <file>`. 프론트 테스트: `cd frontend && npx vitest run <file>`.
- Prisma 마이그레이션: dev DB 대상 `cd backend && npx prisma migrate dev --name <name>` + `npx prisma generate`.

---

## File Structure

**Backend (생성/수정)**
- `backend/prisma/schema.prisma` — `FiberCore` 모델 추가 + `FiberPath.fiberCores` 역참조 + `User` 역참조 2개.
- `backend/prisma/migrations/<ts>_add_fiber_core/migration.sql` — 마이그레이션(자동 생성).
- `backend/src/services/substationWorkingCopy.service.ts` — 응답에 `fiberCores` 추가(변전소 광경로 스코프).
- `backend/src/schemas/substationCommit.schema.ts` — `fiberCoreCreate/Patch` + `fiberCores` 컬렉션.
- `backend/src/services/substationCommit.service.ts` — fiberCores create/update/delete + OCC + idMaps/updated.
- `backend/tests/fiberCore.commit.test.ts` — 신규 커밋 테스트.

**Frontend (생성/수정)**
- `frontend/src/features/fiber/types.ts` — `FiberCore`, `FiberCoreRow` 타입.
- `frontend/src/features/fiber/fiberRegister.ts` — `buildFiberCoreRows` 순수 함수.
- `frontend/src/features/fiber/fiberRegister.test.ts` — 순수 함수 테스트.
- `frontend/src/features/workingCopy/substationStore.ts` — `fiberCores` 컬렉션 등록(레지스트리/saved/overlay/buildSaved).
- `frontend/src/features/workingCopy/hooks.ts` — `useEffectiveFiberCores`.
- `frontend/src/features/assets/components/StagedAssetDetailPanel.tsx` — NodeStatusView의 private 패널을 공유 컴포넌트로 추출(+`initialTab`).
- `frontend/src/features/assets/components/NodeStatusView.tsx` — 추출한 패널 import 로 교체.
- `frontend/src/features/assets/components/AssetDetailPanel.tsx` + `AssetInspector.tsx` — `initialTab` 패스스루.
- `frontend/src/features/fiber/components/FiberRegisterView.tsx` + `OfdFiberRegister.tsx` — 선번장 그리드.
- `frontend/src/features/fiber/components/FiberRegisterView.test.tsx` — 렌더/클릭 테스트.
- `frontend/src/pages/WorkspacePage.tsx` — VIEWS "연결"→"선번장", 렌더 교체.

---

## Task 1: FiberCore Prisma 모델 + 마이그레이션

**Files:**
- Modify: `backend/prisma/schema.prisma` (모델 `FiberPath` 근처 ~line 294-313, `User` 모델, `Cable` 위 주석 영역)
- Create: `backend/prisma/migrations/<ts>_add_fiber_core/migration.sql` (prisma 자동 생성)

- [ ] **Step 1: `FiberCore` 모델 추가**

`schema.prisma` 의 `FiberPath` 모델 바로 아래에 추가:

```prisma
// ==================== 광코어 메타(선번장) ====================
// FiberPath(OFD쌍) 밑 코어별 *희소* 메타. 점유/빈/양측 자산은 저장하지 않는다 —
// 그건 케이블에서 도출(usePortStatus). 여기엔 케이블이 못 담는 실무 메타만:
// 용도·수용내역(회선/링)·융착/패치·사용여부override. 메타가 있는 코어만 행이 생긴다.
model FiberCore {
  id          String @id @default(uuid())
  fiberPathId String @map("fiber_path_id")
  coreNumber  Int    @map("core_number") // 1..portCount

  purpose       String? @map("purpose") @db.VarChar(50)        // 용도
  circuitText   String? @map("circuit_text") @db.VarChar(200)  // 수용내역(회선/링명)
  spliceType    String? @map("splice_type") @db.VarChar(10)    // 융착 | 패치 | null
  usageOverride String? @map("usage_override") @db.VarChar(10) // 사용 | 미사용 | null(=도출)

  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by")
  updatedById String?  @map("updated_by")

  fiberPath FiberPath @relation(fields: [fiberPathId], references: [id], onDelete: Cascade)
  createdBy User?     @relation("FiberCoreCreatedBy", fields: [createdById], references: [id])
  updatedBy User?     @relation("FiberCoreUpdatedBy", fields: [updatedById], references: [id])

  @@unique([fiberPathId, coreNumber])
  @@index([fiberPathId])
  @@map("fiber_cores")
}
```

- [ ] **Step 2: `FiberPath` 역참조 추가**

`FiberPath` 모델 안 `cables Cable[] @relation("CableFiberPath")` 다음 줄에 추가:

```prisma
  fiberCores FiberCore[]
```

- [ ] **Step 3: `User` 역참조 추가**

`User` 모델(line 12 근처)의 관계 목록에 다른 `@relation(...)` 역참조들과 나란히 추가:

```prisma
  fiberCoresCreated FiberCore[] @relation("FiberCoreCreatedBy")
  fiberCoresUpdated FiberCore[] @relation("FiberCoreUpdatedBy")
```

- [ ] **Step 4: 마이그레이션 생성 + 클라이언트 재생성**

Run:
```bash
cd backend && npx prisma migrate dev --name add_fiber_core && npx prisma generate
```
Expected: 새 마이그레이션 폴더 생성, `fiber_cores` 테이블 CREATE, `prisma generate` 성공("Generated Prisma Client").

- [ ] **Step 5: 타입체크**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (FiberCore 델리게이트가 prisma client 에 생김).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(선번장): FiberCore 모델 — FiberPath 밑 코어별 희소 메타 테이블"
```

---

## Task 2: 워킹카피 응답에 fiberCores 포함

**Files:**
- Modify: `backend/src/services/substationWorkingCopy.service.ts:22-69`

- [ ] **Step 1: fiberCores 조회 + 반환 추가**

`getWorkingCopy` 의 `Promise.all` 블록(line 23-34)은 그대로 두고, 그 아래 — fiberPaths 가 정해진 다음 — fiberCores 를 조회한다. `return` 문(line 68)도 수정한다.

`Promise.all` 직후(line 34 다음)에 추가:
```ts
  // 광코어 메타(희소) — 이 변전소 OFD 가 속한 광경로의 코어만.
  const fiberPathIds = fiberPaths.map((p) => p.id);
  const fiberCores = fiberPathIds.length
    ? await prisma.fiberCore.findMany({ where: { fiberPathId: { in: fiberPathIds } } })
    : [];
```

`return` 문(line 68)을 교체:
```ts
  return { assets: assetsWithRecords, cables, fiberPaths, fiberCores };
```

- [ ] **Step 2: 타입체크**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsk/1210/digital
git add backend/src/services/substationWorkingCopy.service.ts
git commit -m "feat(선번장): 워킹카피 응답에 fiberCores 포함(광경로 스코프)"
```

---

## Task 3: 커밋 스키마에 fiberCores 컬렉션

**Files:**
- Modify: `backend/src/schemas/substationCommit.schema.ts:142-201`
- Test: `backend/tests/fiberCore.commit.test.ts` (Task 4에서 본격 작성 — 여기선 스키마 파싱만)

- [ ] **Step 1: 실패 테스트 작성**

Create `backend/tests/fiberCore.commit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';

describe('substationCommitSchema: fiberCores', () => {
  it('fiberCores create/update/delete 를 파싱한다', () => {
    const parsed = substationCommitSchema.parse({
      fiberCores: {
        creates: [{ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말', circuitText: '원주 GR2링' }],
        updates: [{ id: 'fc1', baseVersion: null, patch: { spliceType: '패치', usageOverride: '사용' } }],
        deletes: [{ id: 'fc2', baseVersion: null }],
      },
    });
    expect(parsed.fiberCores?.creates[0]).toMatchObject({ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5 });
    expect(parsed.fiberCores?.updates[0].patch).toMatchObject({ spliceType: '패치', usageOverride: '사용' });
    expect(parsed.fiberCores?.deletes[0].id).toBe('fc2');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npx vitest run tests/fiberCore.commit.test.ts`
Expected: FAIL (`fiberCores` 키가 strip 되어 `parsed.fiberCores` 가 undefined).

- [ ] **Step 3: 스키마 추가**

`substationCommit.schema.ts` 의 fiberPath 정의(line 144-151) 아래에 추가:
```ts
// ==================== FiberCore (광코어 희소 메타) ====================
const fiberCoreCreate = z.object({
  tempId: z.string(),
  fiberPathId: z.string(), // real id 또는 같은 커밋의 fiberPath tempId
  coreNumber: z.number(),
  purpose: z.string().nullable().optional(),
  circuitText: z.string().nullable().optional(),
  spliceType: z.string().nullable().optional(),
  usageOverride: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
const fiberCorePatch = fiberCoreCreate.omit({ tempId: true }).partial();
```

`substationCommitSchema` 객체(line 177-201) 안, `fiberPaths:` 줄 다음에 추가:
```ts
  fiberCores: collection(fiberCoreCreate, fiberCorePatch).optional(),
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && npx vitest run tests/fiberCore.commit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add backend/src/schemas/substationCommit.schema.ts backend/tests/fiberCore.commit.test.ts
git commit -m "feat(선번장): 커밋 스키마 fiberCores 컬렉션 + 파싱 테스트"
```

---

## Task 4: 커밋 서비스 — fiberCores create/update/delete

**Files:**
- Modify: `backend/src/services/substationCommit.service.ts` (OCC 검사부 ~line 230-245, 쓰기부 ~line 460-507, idMaps/updated 초기화부)
- Test: `backend/tests/fiberCore.commit.test.ts`

먼저 `idMaps` 와 `updated` 초기화 위치를 찾는다(`idMaps.fiberPaths` / `updated.fiberPaths` 로 grep). 거기에 fiberCores 항목을 나란히 추가한다.

- [ ] **Step 1: idMaps/updated 에 fiberCores 슬롯 추가**

`idMaps` 초기화에서 `fiberPaths: {}` 옆에:
```ts
    fiberCores: {} as Record<string, string>,
```
`updated` 초기화(또는 타입)에서 `fiberPaths` 옆에 `fiberCores: []` 형태로 추가(기존 fiberPaths 항목 형태를 그대로 따른다).

- [ ] **Step 2: OCC 충돌 검사 추가**

fiberPaths OCC 블록(line 231-245) 다음에 추가:
```ts
  // fiberCores
  if (input.fiberCores) {
    const ids = [...input.fiberCores.updates.map((u) => u.id), ...input.fiberCores.deletes.map((d) => d.id)];
    const rows = ids.length
      ? await tx.fiberCore.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } })
      : [];
    const { current } = await loadOcc(rows);
    conflicts.push(
      ...collectConflicts('fiberCores', current, input.fiberCores.updates.map((u) => ({ id: u.id, baseVersion: u.baseVersion }))),
      ...collectConflicts('fiberCores', current, input.fiberCores.deletes.map((d) => ({ id: d.id, baseVersion: d.baseVersion }))),
    );
  }
```

- [ ] **Step 3: 쓰기 블록 추가**

`resolveFiber` 정의(line 506-507) 다음에 fiberCores 쓰기를 추가(fiberPathId tempId 를 `resolveFiber` 로 해소):
```ts
  // ── 4b) fiberCores ── (fiberPaths 뒤 — fiberPathId tempId 해소 위해)
  if (input.fiberCores) {
    const fc = input.fiberCores;
    if (fc.deletes.length) {
      await tx.fiberCore.deleteMany({ where: { id: { in: fc.deletes.map((d) => d.id) } } });
    }
    for (const c of fc.creates) {
      const created = await tx.fiberCore.create({
        data: {
          fiberPathId: resolveFiber(c.fiberPathId)!,
          coreNumber: c.coreNumber,
          purpose: c.purpose ?? null,
          circuitText: c.circuitText ?? null,
          spliceType: c.spliceType ?? null,
          usageOverride: c.usageOverride ?? null,
          description: c.description ?? null,
          createdById: userId,
          updatedById: userId,
        },
      });
      idMaps.fiberCores[c.tempId] = created.id;
    }
    for (const u of fc.updates) {
      const p = u.patch;
      await tx.fiberCore.update({
        where: { id: u.id },
        data: {
          purpose: p.purpose as string | null | undefined,
          circuitText: p.circuitText as string | null | undefined,
          spliceType: p.spliceType as string | null | undefined,
          usageOverride: p.usageOverride as string | null | undefined,
          description: p.description as string | null | undefined,
          updatedById: userId,
        },
      });
    }
    const touched = [...fc.updates.map((u) => u.id), ...Object.values(idMaps.fiberCores)];
    if (touched.length) {
      const rows = await tx.fiberCore.findMany({ where: { id: { in: touched } }, select: { id: true, updatedAt: true } });
      updated.fiberCores = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
    }
  }
```

> NOTE: `collectConflicts`/`loadOcc`/`idMaps`/`updated` 의 정확한 형태는 같은 파일 fiberPaths 처리를 그대로 따른다. `updated.fiberCores` 가 타입 에러면 `updated` 타입 선언에 `fiberCores` 를 추가한다.

- [ ] **Step 4: 라운드트립 테스트 추가**

`backend/tests/fiberCore.commit.test.ts` 에 통합 테스트를 추가한다. 기존 커밋 통합 테스트(예: `backend/tests/substationCommit*.test.ts` 또는 `assetCommit*.test.ts`)의 셋업(테스트 DB, 사용자/변전소/OFD/FiberPath 시드)을 참고해 패턴을 맞춘다. 핵심 단언:

```ts
// (셋업: substation + OFD asset 2개 + FiberPath 1개를 시드한 뒤)
// 1) create: fiberCore(core 5, 용도=통합단말) 커밋 → DB 에 1행, idMap 으로 real id 반환.
// 2) update: 같은 코어 spliceType=패치 패치 → DB 반영.
// 3) delete: 그 코어 삭제 → DB 에서 사라짐.
// 4) fiberPath 삭제 시 onDelete:Cascade 로 fiberCore 도 사라짐.
```
(통합 셋업이 과하면, 최소한 서비스가 `tx.fiberCore.create/update/deleteMany` 를 호출하도록 prisma 클라이언트를 모킹한 단위 테스트로 대체 가능 — 단, Step 3 코드 경로가 실제로 실행되는지 검증할 것.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && npx vitest run tests/fiberCore.commit.test.ts`
Expected: PASS.

- [ ] **Step 6: 전체 백엔드 타입체크**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsk/1210/digital
git add backend/src/services/substationCommit.service.ts backend/tests/fiberCore.commit.test.ts
git commit -m "feat(선번장): 커밋 서비스 fiberCores create/update/delete + OCC + 테스트"
```

---

## Task 5: 프론트 워킹카피에 fiberCores 컬렉션 등록

**Files:**
- Modify: `frontend/src/features/fiber/types.ts` (FiberCore 타입)
- Modify: `frontend/src/features/workingCopy/substationStore.ts` (레지스트리/saved/overlay/buildSaved)
- Modify: `frontend/src/features/workingCopy/hooks.ts` (useEffectiveFiberCores)

`COLLECTIONS` 레지스트리 + 제네릭 `put/patch/remove` 덕에 전용 stage 함수는 불필요하다(`put('fiberCores', ...)` 로 stage).

- [ ] **Step 1: FiberCore 타입 추가**

`frontend/src/features/fiber/types.ts` 끝에 추가:
```ts
/** 광코어 희소 메타(선번장) — DB FiberCore 와 1:1. updatedAt 은 OCC 용. */
export interface FiberCore {
  id: string;
  fiberPathId: string;
  coreNumber: number;
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usageOverride: string | null;
  updatedAt?: string | null;
}
```

- [ ] **Step 2: 실패 테스트 작성 (effective 머지)**

Create `frontend/src/features/workingCopy/fiberCores.effective.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSubstationWorkingCopy } from './substationStore';

describe('workingCopy fiberCores 컬렉션', () => {
  beforeEach(() => useSubstationWorkingCopy.getState().reset());

  it('put/patch/remove 로 fiberCores overlay 가 dirty 에 참여한다', () => {
    const s = useSubstationWorkingCopy.getState();
    expect(s.dirtyCount()).toBe(0);
    s.put('fiberCores', { id: 'temp-1', fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말' });
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(1);
    useSubstationWorkingCopy.getState().remove('fiberCores', 'temp-1');
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(0);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/fiberCores.effective.test.ts`
Expected: FAIL (`'fiberCores'` 가 CollectionKey 아님 → 타입 에러 또는 런타임 undefined overlay).

- [ ] **Step 4: substationStore 에 컬렉션 등록**

`substationStore.ts` 를 수정한다(레지스트리 순회 덕에 dirty/revert 는 자동 참여):

(a) import 에 FiberCore 타입 추가(파일 상단 import 블록):
```ts
import type { FiberCore } from '../fiber/types';
```

(b) descriptor 추가(`fiberPathDescriptor` 옆, line 94 근처):
```ts
export const fiberCoreDescriptor = makeDescriptor<FiberCore>();
```

(c) `COLLECTIONS`(line 123-128)에 추가:
```ts
  fiberCores: fiberCoreDescriptor,
```

(d) `SavedCollections`(line 139-144)에 추가:
```ts
  fiberCores: FiberCore[];
```

(e) `Overlays`(line 146-151)에 추가:
```ts
  fiberCores: Overlay<FiberCore, Partial<FiberCore>>;
```

(f) `buildSaved`(line 157-172) return 에 추가:
```ts
    fiberCores: (raw.fiberCores as FiberCore[]) ?? [],
```

(g) (선택) effective getter — `effectiveFiberPaths` 옆에 추가(getState 호출용, 없어도 됨):
```ts
      effectiveFiberCores: () =>
        mergeEffective(get().saved.fiberCores, get().overlays.fiberCores, fiberCoreDescriptor),
```
추가 시 `SubstationWorkingCopyState` 인터페이스에 `effectiveFiberCores: () => FiberCore[];` 도 선언.

- [ ] **Step 5: useEffectiveFiberCores 훅 추가**

`frontend/src/features/workingCopy/hooks.ts` 의 `useEffectiveFiberPaths`(line 44-48) 다음에 추가. import 에 `fiberCoreDescriptor` 를 더한다(line 3-11 의 substationStore import).
```ts
export function useEffectiveFiberCores() {
  const saved = useSubstationWorkingCopy((s) => s.saved.fiberCores);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.fiberCores);
  return useMemo(() => mergeEffective(saved, overlay, fiberCoreDescriptor), [saved, overlay]);
}
```

- [ ] **Step 6: 통과 확인 + 타입체크**

Run: `cd frontend && npx vitest run src/features/workingCopy/fiberCores.effective.test.ts`
Expected: PASS.
Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/types.ts frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/hooks.ts frontend/src/features/workingCopy/fiberCores.effective.test.ts
git commit -m "feat(선번장): 프론트 워킹카피 fiberCores 컬렉션 등록 + useEffectiveFiberCores"
```

---

## Task 6: buildFiberCoreRows 순수 도출 함수

점유(usePortStatus 산출 `FiberPortStatus`) + 메타(FiberCore)를 합쳐 코어 한 행을 만든다. 순수 함수라 단위 테스트가 쉽다.

**Files:**
- Create: `frontend/src/features/fiber/fiberRegister.ts`
- Modify: `frontend/src/features/fiber/types.ts` (FiberCoreRow 타입)
- Test: `frontend/src/features/fiber/fiberRegister.test.ts`

- [ ] **Step 1: FiberCoreRow 타입 추가**

`frontend/src/features/fiber/types.ts` 끝에 추가:
```ts
/** 선번장 한 행 — 도출 점유(near/far/occupied) + 저장 메타(용도/수용내역/융착/사용). */
export interface FiberCoreRow {
  fiberPathId: string;
  coreNumber: number;
  near: FiberPortUsage | null;   // 보고 있는 OFD(로컬) 측 자산
  far: FiberPortUsage | null;    // 상대국 측 자산
  occupied: boolean;
  coreRecordId: string | null;   // FiberCore 행 id(없으면 null=메타 미입력 → 편집 시 신규 생성)
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usage: '사용' | '미사용';       // usageOverride ?? (occupied ? 사용 : 미사용)
}
```

- [ ] **Step 2: 실패 테스트 작성**

Create `frontend/src/features/fiber/fiberRegister.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildFiberCoreRows } from './fiberRegister';
import type { FiberPathDetail, FiberCore } from './types';

const path: FiberPathDetail = {
  id: 'fp1',
  ofdA: { id: 'ofdLocal', name: '원주OFD', substationName: '원주', floorId: 'f1' },
  ofdB: { id: 'ofdRemote', name: '홍천OFD', substationName: '홍천', floorId: 'f2' },
  portCount: 3,
  description: null,
  ports: [
    { portNumber: 1, sideA: null, sideB: null },
    { portNumber: 2, sideA: { cableId: 'c2', assetId: 'a2', assetName: '송변전광단말' }, sideB: { cableId: 'c2r', assetId: 'r2', assetName: '홍천단말' } },
    { portNumber: 3, sideA: null, sideB: null },
  ],
  createdAt: '', updatedAt: '',
};

describe('buildFiberCoreRows', () => {
  it('로컬=ofdA 일 때 near=sideA, far=sideB', () => {
    const rows = buildFiberCoreRows(path, 'ofdLocal', []);
    expect(rows[1].near?.assetName).toBe('송변전광단말');
    expect(rows[1].far?.assetName).toBe('홍천단말');
    expect(rows[1].occupied).toBe(true);
    expect(rows[1].usage).toBe('사용');
  });

  it('로컬=ofdB 면 near/far 가 뒤집힌다', () => {
    const rows = buildFiberCoreRows(path, 'ofdRemote', []);
    expect(rows[1].near?.assetName).toBe('홍천단말');
    expect(rows[1].far?.assetName).toBe('송변전광단말');
  });

  it('빈 코어는 occupied=false, usage=미사용', () => {
    const rows = buildFiberCoreRows(path, 'ofdLocal', []);
    expect(rows[0].occupied).toBe(false);
    expect(rows[0].usage).toBe('미사용');
  });

  it('FiberCore 메타를 코어번호로 머지하고 coreRecordId 를 단다', () => {
    const cores: FiberCore[] = [{ id: 'fc1', fiberPathId: 'fp1', coreNumber: 2, purpose: '통합단말', circuitText: '원주 GR2링', spliceType: '패치', usageOverride: null }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[1].purpose).toBe('통합단말');
    expect(rows[1].circuitText).toBe('원주 GR2링');
    expect(rows[1].coreRecordId).toBe('fc1');
  });

  it('usageOverride 가 점유 도출을 이긴다(빈 코어를 사용으로 예약)', () => {
    const cores: FiberCore[] = [{ id: 'fc2', fiberPathId: 'fp1', coreNumber: 1, purpose: null, circuitText: null, spliceType: null, usageOverride: '사용' }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[0].occupied).toBe(false);
    expect(rows[0].usage).toBe('사용');
  });

  it('다른 fiberPath 의 메타는 무시한다', () => {
    const cores: FiberCore[] = [{ id: 'x', fiberPathId: 'OTHER', coreNumber: 2, purpose: '엉뚱', circuitText: null, spliceType: null, usageOverride: null }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[1].purpose).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend && npx vitest run src/features/fiber/fiberRegister.test.ts`
Expected: FAIL (`buildFiberCoreRows` 없음).

- [ ] **Step 4: 구현**

Create `frontend/src/features/fiber/fiberRegister.ts`:
```ts
import type { FiberPathDetail, FiberCore, FiberCoreRow } from './types';

/**
 * 선번장 한 광경로의 코어 행들을 만든다 — 점유는 ports(케이블 도출)에서, 메타는 FiberCore(희소)에서.
 * 점유는 저장하지 않는다(드리프트 0); 여기서 읽을 때 합쳐 한 행으로 보여줄 뿐이다.
 *
 * @param localOfdId 보고 있는 OFD. path.ofdA.id===localOfdId 면 near=sideA, 아니면 near=sideB
 *                   (usePortStatus / backend buildPortStatuses 규약과 동일).
 */
export function buildFiberCoreRows(
  path: FiberPathDetail,
  localOfdId: string,
  fiberCores: FiberCore[],
): FiberCoreRow[] {
  const localIsA = path.ofdA.id === localOfdId;
  const metaByCore = new Map<number, FiberCore>();
  for (const c of fiberCores) {
    if (c.fiberPathId === path.id) metaByCore.set(c.coreNumber, c);
  }
  return path.ports.map((port) => {
    const near = localIsA ? port.sideA : port.sideB;
    const far = localIsA ? port.sideB : port.sideA;
    const occupied = !!(port.sideA || port.sideB);
    const m = metaByCore.get(port.portNumber);
    const usage: '사용' | '미사용' =
      (m?.usageOverride as '사용' | '미사용' | null | undefined) ?? (occupied ? '사용' : '미사용');
    return {
      fiberPathId: path.id,
      coreNumber: port.portNumber,
      near,
      far,
      occupied,
      coreRecordId: m?.id ?? null,
      purpose: m?.purpose ?? null,
      circuitText: m?.circuitText ?? null,
      spliceType: m?.spliceType ?? null,
      usage,
    };
  });
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/fiberRegister.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/fiberRegister.ts frontend/src/features/fiber/fiberRegister.test.ts frontend/src/features/fiber/types.ts
git commit -m "feat(선번장): buildFiberCoreRows 순수 도출(점유+메타 머지) + 테스트"
```

---

## Task 7: 사이드패널 추출 + initialTab 패스스루

NodeStatusView 의 private `StagedEditDetailPanel` 을 공유 컴포넌트로 추출하고(중복 제거), 선번장에서 연결탭을 바로 열 수 있도록 `initialTab` 을 패널→인스펙터→DetailTabs 로 패스스루한다.

**Files:**
- Create: `frontend/src/features/assets/components/StagedAssetDetailPanel.tsx`
- Modify: `frontend/src/features/assets/components/NodeStatusView.tsx` (local 정의 제거 → import)
- Modify: `frontend/src/features/assets/components/AssetDetailPanel.tsx` (initialTab prop)
- Modify: `frontend/src/features/assets/components/AssetInspector.tsx` (initialTab → DetailTabs initial)

- [ ] **Step 1: AssetInspector 에 initialTab 추가**

`AssetInspector.tsx` `Props`(line 26-38)에 추가:
```ts
  /** 처음 활성화할 탭 라벨(예: '연결'). 없으면 첫 탭. */
  initialTab?: string;
```
시그니처 구조분해에 `initialTab` 추가하고, `<DetailTabs tabs={tabs} />`(line 297)를 교체:
```tsx
      <DetailTabs tabs={tabs} initial={initialTab} />
```

- [ ] **Step 2: AssetDetailPanel 에 initialTab 패스스루**

`AssetDetailPanel.tsx` 의 Props 에 `initialTab?: string;` 추가하고, 내부에서 `<AssetInspector ... />` 를 렌더하는 곳에 `initialTab={initialTab}` 를 전달한다(파일 내 AssetInspector 사용처를 찾아 prop 추가).

- [ ] **Step 3: StagedAssetDetailPanel 추출**

Create `frontend/src/features/assets/components/StagedAssetDetailPanel.tsx` — NodeStatusView line 116-156 의 `StagedEditDetailPanel` 본문을 옮기고 `initialTab` 을 추가, export 한다:
```tsx
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useAsset } from '../hooks/useAsset'; // NodeStatusView 가 쓰는 동일 훅 경로로 맞출 것
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { AssetDetailPanel } from './AssetDetailPanel';

/** 현황·선번장 등 그리드 뷰가 공유하는 staged 편집 사이드패널(SSOT). */
export function StagedAssetDetailPanel({
  assetId,
  targetSubstationId,
  loadedSubstationId,
  onClose,
  initialTab,
}: {
  assetId: string;
  targetSubstationId: string;
  loadedSubstationId: string | null;
  onClose: () => void;
  initialTab?: string;
}) {
  const effective = useEffectiveAssets();
  const { data: fetched } = useAsset(assetId);
  const loaded = loadedSubstationId === targetSubstationId;
  const asset = loaded ? effective.find((a) => a.id === assetId) : undefined;
  const display = asset ?? fetched;
  if (!display) {
    return (
      <aside className="w-96 shrink-0 border-l border-line bg-surface h-full overflow-y-auto p-4 text-sm text-content-muted">
        불러오는 중…
      </aside>
    );
  }
  return (
    <AssetDetailPanel
      key={display.id}
      asset={display}
      mode={asset ? 'edit' : 'view'}
      initialTab={initialTab}
      onClose={onClose}
      onPatch={asset ? (id, patch) => useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch) : undefined}
    />
  );
}
```
> `useAsset` 의 정확한 import 경로는 NodeStatusView 상단 import 에서 그대로 복사한다.

- [ ] **Step 4: NodeStatusView 가 추출본을 쓰도록 교체**

`NodeStatusView.tsx` 에서 local `function StagedEditDetailPanel(...)`(line 116-156) 정의를 삭제하고, 상단에 import 추가:
```ts
import { StagedAssetDetailPanel } from './StagedAssetDetailPanel';
```
사용처(line 368 근처 `<StagedEditDetailPanel ... />`)를 `<StagedAssetDetailPanel ... />` 로 교체(props 동일, initialTab 미전달 → 기존처럼 첫 탭).
이제 불필요해진 import(useAsset / AssetDetailPanel 등이 NodeStatusView 에서 더는 안 쓰이면) 정리.

- [ ] **Step 5: 회귀 확인 — 빌드 + 기존 현황 테스트**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.
Run(있으면): `cd frontend && npx vitest run src/features/assets`
Expected: PASS (현황 패널 회귀 없음).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/StagedAssetDetailPanel.tsx frontend/src/features/assets/components/NodeStatusView.tsx frontend/src/features/assets/components/AssetDetailPanel.tsx frontend/src/features/assets/components/AssetInspector.tsx
git commit -m "refactor(선번장): staged 상세패널 공유 추출 + initialTab 패스스루(연결탭 직접 오픈)"
```

---

## Task 8: 선번장 그리드 — FiberRegisterView + OfdFiberRegister

변전소의 OFD 자산마다 `<OfdFiberRegister ofdId>` 를 렌더(각자 `usePortStatus(ofdId)` 합법 호출). 광경로(상대국)별 섹션 + 코어 행. 행 클릭 → 공유 선택 + trace. 빈 코어 클릭 → OFD 선택. 메타 인라인 편집 → 워킹카피 put/patch.

**Files:**
- Create: `frontend/src/features/fiber/components/OfdFiberRegister.tsx`
- Create: `frontend/src/features/fiber/components/FiberRegisterView.tsx`
- Test: `frontend/src/features/fiber/components/FiberRegisterView.test.tsx`

- [ ] **Step 1: 실패 테스트 작성 (렌더 + 클릭)**

Create `frontend/src/features/fiber/components/FiberRegisterView.test.tsx`. usePortStatus / 워킹카피 / 선택 / trace 를 모킹하고, 코어 행 렌더와 클릭 동작을 검증한다(`AssetConnectionsSection.test.tsx` 모킹 스타일 참고):
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const setSelectedAssetId = vi.fn();
const startTrace = vi.fn();
const put = vi.fn(); const patch = vi.fn();

vi.mock('../hooks/usePortStatus', () => ({
  usePortStatus: () => ({
    isLoading: false,
    mergedPaths: [{
      id: 'fp1',
      ofdA: { id: 'ofd1', name: '원주OFD', substationName: '원주', floorId: 'f1' },
      ofdB: { id: 'ofd2', name: '홍천OFD', substationName: '홍천', floorId: 'f2' },
      portCount: 2, description: null, createdAt: '', updatedAt: '',
      ports: [
        { portNumber: 1, sideA: null, sideB: null },
        { portNumber: 2, sideA: { cableId: 'c2', assetId: 'a2', assetName: '송변전광단말' }, sideB: { cableId: 'c2r', assetId: 'r2', assetName: '홍천단말' } },
      ],
    }],
  }),
}));
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveFiberCores: () => [],
  useEffectiveAssets: () => [{ id: 'ofd1', name: '원주OFD', assetType: { placementKind: 'OFD' } }],
}));
vi.mock('../../workspace/selectionStore', () => ({
  useSelectionStore: (sel: (s: unknown) => unknown) => sel({ selectedAssetId: null, setSelectedAssetId }),
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, tracingCableId: null };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});
vi.mock('../../workingCopy/substationStore', () => {
  const st = { put, patch };
  const hook = () => st;
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});

import { OfdFiberRegister } from './OfdFiberRegister';

beforeEach(() => { setSelectedAssetId.mockClear(); startTrace.mockClear(); put.mockClear(); patch.mockClear(); });

describe('OfdFiberRegister', () => {
  it('상대국 섹션 + 코어 행(점유/빈)을 렌더한다', () => {
    render(<OfdFiberRegister ofdId="ofd1" />);
    expect(screen.getByText(/홍천/)).toBeInTheDocument();        // 상대국 섹션 헤더
    expect(screen.getByText('송변전광단말')).toBeInTheDocument(); // 점유 코어의 근접자산
  });

  it('점유 코어 클릭 → 근접자산 선택 + startTrace', () => {
    render(<OfdFiberRegister ofdId="ofd1" />);
    fireEvent.click(screen.getByText('송변전광단말'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('a2');
    expect(startTrace).toHaveBeenCalledWith('c2');
  });
});
```
> 모킹 경로/시그니처는 실제 import 에 맞춰 조정한다(특히 selectionStore 셀렉터 형태, usePathHighlightStore).

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/fiber/components/FiberRegisterView.test.tsx`
Expected: FAIL (`OfdFiberRegister` 없음).

- [ ] **Step 3: OfdFiberRegister 구현**

Create `frontend/src/features/fiber/components/OfdFiberRegister.tsx`:
```tsx
import { useMemo } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEffectiveFiberCores } from '../../workingCopy/hooks';
import { buildFiberCoreRows } from '../fiberRegister';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import type { FiberCoreRow } from '../types';

/** 한 OFD 의 선번장 — 광경로(상대국)별 섹션 + 코어 행. usePortStatus 합법 호출 단위. */
export function OfdFiberRegister({ ofdId }: { ofdId: string }) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const fiberCores = useEffectiveFiberCores();

  const sections = useMemo(
    () => mergedPaths.map((p) => ({ path: p, rows: buildFiberCoreRows(p, ofdId, fiberCores) })),
    [mergedPaths, ofdId, fiberCores],
  );

  if (isLoading) return <p className="p-3 text-sm text-content-faint">불러오는 중…</p>;
  if (!sections.length) return null;

  return (
    <div className="space-y-4">
      {sections.map(({ path, rows }) => {
        const remoteName = path.ofdA.id === ofdId ? path.ofdB.substationName : path.ofdA.substationName;
        const used = rows.filter((r) => r.usage === '사용').length;
        return (
          <section key={path.id}>
            <header className="mb-1 flex items-center gap-2 px-1 text-[12px] font-medium text-content-muted">
              <span>{remoteName}</span>
              <span className="ml-auto tabular-nums text-content-faint">사용 {used}/{path.portCount}</span>
            </header>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-content-faint border-b border-line">
                  <th className="px-2 py-1 w-12 tabular-nums">코어</th>
                  <th className="px-2 py-1">근접자산</th>
                  <th className="px-2 py-1">상대국측</th>
                  <th className="px-2 py-1">용도</th>
                  <th className="px-2 py-1">수용내역</th>
                  <th className="px-2 py-1 w-16">융착</th>
                  <th className="px-2 py-1 w-14">사용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <CoreRow key={r.coreNumber} ofdId={ofdId} row={r} />)}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function CoreRow({ ofdId, row }: { ofdId: string; row: FiberCoreRow }) {
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const active = !!row.near && tracingCableId === row.near.cableId;

  const onClick = () => {
    if (row.near) {
      useSelectionStore.getState().setSelectedAssetId(row.near.assetId);
      usePathHighlightStore.getState().startTrace(row.near.cableId);
    } else {
      // 빈 코어 → 점유 가능 슬롯 안내: 그 OFD 선택.
      useSelectionStore.getState().setSelectedAssetId(ofdId);
    }
  };

  return (
    <tr
      onClick={onClick}
      className={`border-b border-line cursor-pointer ${active ? 'bg-info-bg' : 'hover:bg-surface-2'}`}
    >
      <td className="px-2 py-1.5 tabular-nums text-content-muted">{row.coreNumber}</td>
      <td className="px-2 py-1.5 truncate">{row.near?.assetName ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 truncate text-content-muted">{row.far?.assetName ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 text-content-muted">{row.purpose ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 text-content-muted truncate">{row.circuitText ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 text-content-muted">{row.spliceType ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5">
        {row.usage === '사용'
          ? <span className="inline-flex items-center gap-1 text-content"><span className="h-1.5 w-1.5 rounded-full bg-danger" />사용</span>
          : <span className="text-content-faint">미사용</span>}
      </td>
    </tr>
  );
}
```
> 메타 인라인 편집(용도/수용내역/융착/사용override)은 본 슬라이스에서 **읽기 표시까지** 구현한다. 편집 입력 위젯은 Step 5(추가)에서 붙인다 — 우선 그리드/선택/trace 골격을 통과시키고 분리 커밋.

- [ ] **Step 4: FiberRegisterView(변전소 셸) 구현**

Create `frontend/src/features/fiber/components/FiberRegisterView.tsx`:
```tsx
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { StagedAssetDetailPanel } from '../../assets/components/StagedAssetDetailPanel';
import { OfdFiberRegister } from './OfdFiberRegister';
import type { Asset } from '../../../types/asset';

/** 선번장 뷰(변전소 스코프) — OFD 별 코어 대장 + 행 클릭 시 공유 선택 사이드패널(연결탭). */
export function FiberRegisterView({ substationId }: { substationId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const ofds = assets.filter(
    (a) => a.assetType?.placementKind === 'OFD' && a.substationId === substationId,
  );
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-auto p-3 space-y-6">
        {ofds.length === 0 ? (
          <p className="p-4 text-sm text-content-faint">이 변전소에 OFD(광단국)가 없습니다.</p>
        ) : (
          ofds.map((ofd) => (
            <section key={ofd.id}>
              <h2 className="mb-2 text-sm font-semibold text-content">{ofd.name}</h2>
              <OfdFiberRegister ofdId={ofd.id} />
            </section>
          ))
        )}
      </div>
      {selectedAssetId && (
        <StagedAssetDetailPanel
          assetId={selectedAssetId}
          targetSubstationId={substationId}
          loadedSubstationId={loadedSubstationId}
          initialTab="연결"
          onClose={() => setSelectedAssetId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/components/FiberRegisterView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/components/OfdFiberRegister.tsx frontend/src/features/fiber/components/FiberRegisterView.tsx frontend/src/features/fiber/components/FiberRegisterView.test.tsx
git commit -m "feat(선번장): 그리드 뷰(OFD별 코어 대장) + 행클릭 공유선택/trace + 연결탭 패널"
```

---

## Task 9: 메타 인라인 편집 (용도·수용내역·융착·사용override)

희소 FiberCore 는 메타 입력 시 신규 생성(temp id)된다. 기존 행이면 patch, 없으면 put.

**Files:**
- Modify: `frontend/src/features/fiber/components/OfdFiberRegister.tsx` (CoreRow 편집 셀)
- Test: `frontend/src/features/fiber/components/FiberRegisterView.test.tsx` (편집 케이스 추가)

- [ ] **Step 1: 실패 테스트 추가**

`FiberRegisterView.test.tsx` 에 추가:
```tsx
it('빈 메타 코어의 용도 입력 → put(fiberCores, 신규)', () => {
  render(<OfdFiberRegister ofdId="ofd1" />);
  const inputs = screen.getAllByPlaceholderText('용도');
  fireEvent.change(inputs[0], { target: { value: '통합단말' } });
  fireEvent.blur(inputs[0]);
  expect(put).toHaveBeenCalledWith('fiberCores', expect.objectContaining({ fiberPathId: 'fp1', coreNumber: 1, purpose: '통합단말' }));
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/fiber/components/FiberRegisterView.test.tsx`
Expected: FAIL (용도 input 없음).

- [ ] **Step 3: CoreRow 에 편집 셀 구현**

`OfdFiberRegister.tsx` 의 `CoreRow` 에 메타 편집 핸들러 + input/select 를 추가한다. 임시 id 생성기는 코드베이스 공용 헬퍼를 쓴다(`frontend/src/utils/idHelpers` 의 temp-id 팩토리 — `isTempId` 와 짝. canvas draw 가 쓰는 동일 함수). 핸들러:
```tsx
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { newTempId } from '../../../utils/idHelpers'; // 실제 export 이름에 맞춰 import

function commitMeta(row: FiberCoreRow, field: 'purpose' | 'circuitText' | 'spliceType' | 'usageOverride', value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  if (row.coreRecordId) {
    wc.patch('fiberCores', row.coreRecordId, { [field]: value });
  } else {
    wc.put('fiberCores', {
      id: newTempId(), fiberPathId: row.fiberPathId, coreNumber: row.coreNumber,
      purpose: null, circuitText: null, spliceType: null, usageOverride: null,
      [field]: value,
    });
  }
}
```
용도/수용내역 셀을 `<input>` 으로(blur 시 commitMeta, 값 안 바뀌면 skip), 융착을 `<select>`(융착/패치/공백), 사용을 `<select>`(자동/사용/미사용 → usageOverride; '자동'=null)로 교체. 점유/근접/상대국 컬럼은 읽기 전용 유지. input 클릭이 행 onClick(선택)을 트리거하지 않게 `onClick={(e) => e.stopPropagation()}`.

용도 input 예:
```tsx
<td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
  <input
    aria-label="용도" placeholder="용도" defaultValue={row.purpose ?? ''}
    key={`${row.coreNumber}-purpose-${row.purpose ?? ''}`}
    onBlur={(e) => { const v = e.target.value || null; if (v !== row.purpose) commitMeta(row, 'purpose', v); }}
    className="w-full text-[12px] border border-line rounded px-1 py-0.5 bg-surface"
  />
</td>
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/components/FiberRegisterView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/components/OfdFiberRegister.tsx frontend/src/features/fiber/components/FiberRegisterView.test.tsx
git commit -m "feat(선번장): 코어 메타 인라인 편집 — 희소 FiberCore put/patch"
```

---

## Task 10: 워크스페이스 "연결" 뷰 → 선번장 교체

**Files:**
- Modify: `frontend/src/pages/WorkspacePage.tsx` (VIEWS, rawView 파싱, 렌더 블록, import)

- [ ] **Step 1: VIEWS 라벨/키 교체**

`WorkspacePage.tsx` line 20-25 의 `VIEWS` 에서 `connections` 항목을 교체:
```ts
const VIEWS = [
  { key: 'status', label: '현황' },
  { key: 'plan', label: '평면도' },
  { key: 'fiber', label: '선번장' },
] as const;
```
line 59-63 의 rawView 파싱에서 `connections` → `fiber` 로:
```ts
  const view: ViewKey =
    rawView === 'plan' ? 'plan'
    : rawView === 'fiber' ? 'fiber'
    : 'status';
```
(이전 `?view=connections` 딥링크는 status 로 폴백 — 허용.)

- [ ] **Step 2: 렌더 블록 교체**

line 246-254 의 `{view === 'connections' ? (...)}` 블록을 교체:
```tsx
            {view === 'fiber' ? (
              <div className="absolute inset-0 bg-surface overflow-hidden">
                {contextSubstationId ? (
                  <FiberRegisterView substationId={contextSubstationId} />
                ) : (
                  selectPrompt
                )}
              </div>
            ) : null}
```
상단 import 교체: `SubstationConnectionsView` import(line 6) 제거, 추가:
```ts
import { FiberRegisterView } from '../features/fiber/components/FiberRegisterView';
```

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: PASS (tsc + vite 빌드 성공, `SubstationConnectionsView` 미사용 import 에러 없음).

- [ ] **Step 4: (정리) 죽은 코드 제거**

`SubstationConnectionsView` 가 더는 어디서도 import 되지 않으면(`grep -rn SubstationConnectionsView frontend/src` 로 확인) `frontend/src/features/connections/components/SubstationConnectionsView.tsx` 를 삭제한다. (per-asset 연결탭 `AssetConnectionsSection` 은 그대로 유지 — 혼동 금지.)
Run: `grep -rn "SubstationConnectionsView" frontend/src` → 결과 없음 확인 후 `git rm` 대상.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/WorkspacePage.tsx
git rm frontend/src/features/connections/components/SubstationConnectionsView.tsx  # Step4 에서 미사용 확인 시
git commit -m "feat(선번장): 워크스페이스 '연결' 뷰를 선번장으로 교체 + 죽은 연결뷰 제거"
```

---

## Task 11: 전체 검증 + 스모크

**Files:** 없음(검증 전용)

- [ ] **Step 1: 백엔드 전체 타입체크 + 테스트**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: PASS (fiberCore 커밋 테스트 포함, 회귀 없음).

- [ ] **Step 2: 프론트 전체 빌드 + 테스트**

Run: `cd frontend && npm run build && npx vitest run`
Expected: PASS (fiberRegister/effective/FiberRegisterView 포함, 현황 회귀 없음).

- [ ] **Step 3: 수동 스모크 (dev 서버)**

DB(`docker compose -f docker-compose.dev.yml up -d`) + `npm run dev` 상태에서:
1. 변전소 워크스페이스 → 상단 탭에 **선번장** 표시.
2. 선번장 탭 → OFD 별 광경로(상대국) 섹션 + 코어 행(점유/빈) 표시.
3. 점유 코어 행 클릭 → 우측 사이드패널 열리고 **연결탭** 활성 + (평면도 탭으로 가면) 경로 하이라이트.
4. 빈 코어의 용도/수용내역 입력 → 하단 저장 바 dirty 증가 → 저장 → 새로고침 후에도 값 유지.
5. 빈 코어 행 클릭 → 그 OFD 자산 선택.

- [ ] **Step 4: 메모리 갱신**

`project_refactoring_direction.md` 에 선번장 슬라이스 완료(FiberCore 희소 메타 + 도출 유지 + 연결뷰→선번장)를 한 줄 추가. 후속 슬라이스(전원계통/접지계통/회선엔티티/엑셀 import)는 스펙 §7 그대로 남겨둠.

- [ ] **Step 5: (전체 PR 리뷰)** subagent-driven-development 의 최종 코드 리뷰 단계로 진행.

---

## Self-Review (작성자 체크)

- **스펙 커버리지:** §3.1 FiberCore=T1 · §3.2 커밋/워킹카피=T2/T3/T4/T5 · §4 도출 머지=T6 · §5 뷰 교체=T8/T10 · §5.2 클릭/편집=T8/T9 · 연결탭 직접 오픈=T7. 누락 없음.
- **범위:** 선번장 단일 슬라이스. 전원/접지/회선엔티티/엑셀 import 는 명시적 범위 밖(스펙 §7) — 플랜에 미포함이 의도.
- **타입 일관성:** `FiberCore`(T5) → `FiberCoreRow`(T6) → `buildFiberCoreRows`(T6) → `OfdFiberRegister`(T8) 전 구간 동일 필드명(purpose/circuitText/spliceType/usageOverride/coreNumber/coreRecordId). 커밋 스키마 필드명(T3)도 동일.
- **점유 SSOT:** 어떤 태스크도 FiberCore 에 점유를 저장하지 않음 — 점유는 usePortStatus 도출(T6 머지)로만. 드리프트 0 불변식 유지.
- **확인 필요(구현 중 해소):** `idMaps`/`updated` 정확한 형태(T4), `useAsset` import 경로(T7), temp-id 팩토리 export 이름(T9), AssetDetailPanel 내부 AssetInspector 사용처(T7) — 각 태스크에 NOTE 로 명시.
