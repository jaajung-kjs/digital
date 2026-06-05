# 에디터 OCC (5a) 구현 계획 — 도면 저장 동시성 충돌 감지

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 도면 에디터의 `PUT /floors/:id/plan` 저장에 낙관적 동시성(OCC)을 추가해, 다른 사용자가 그새 저장한 도면을 조용히 덮어쓰지 못하게 한다(충돌 시 409 + 충돌 모달).

**Architecture:** OCC 토큰 = `Floor.updatedAt`(매 저장 시 Prisma `@updatedAt` 으로 갱신, `FloorPlanDetail` 이 이미 반환). 클라이언트는 로드 시 그 값을 보관했다가 저장 payload `baseFloorVersion` 으로 동봉. 서버는 reconcile 트랜잭션 시작 시 현재 `Floor.updatedAt` 과 대조(+REPEATABLE READ 격리 + P2034 직렬화충돌 catch) → 불일치 시 기존 `VersionConflictError`(409). 프론트는 레지스터에서 만든 `ConflictDialog` 를 재사용한다. **엔진 통합(5b)은 범위 외** — 이 계획은 OCC만.

**Tech Stack:** Express+Prisma+Zod+Vitest(+supertest) / React+Zustand+React Query. dev DB: `docker compose -f docker-compose.dev.yml up -d`.

**설계 근거:** `docs/superpowers/specs/2026-06-05-unified-workingcopy-concurrency-design.md` §6·§7. 재사용: `backend/src/services/concurrency.ts`(`VersionConflictError`), `frontend/src/features/workingCopy/ConflictDialog.tsx`.

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

**중요한 동작 차이(문서화):** 레지스터는 충돌 후 "최신 불러오기" 시 overlay(미커밋 편집)를 보존하지만, **에디터는 reconcile 로드라 "최신 불러오기" 시 현재 미저장 편집이 server 상태로 덮여 사라진다.** 따라서 에디터 충돌 모달 문구는 "최신을 불러오면 저장하지 않은 편집을 잃습니다" 로 다르게 한다. Lv1 에선 이 동작이 허용(편집 재적용은 5b/후속).

---

## 파일 구조

**Backend**
- 수정: `backend/src/services/floor.service.ts` (`bulkUpdatePlan` 시작에 OCC 검사 + 격리수준 + P2034 catch)
- 수정: `backend/src/routes/floors.routes.ts` (zod 에 `baseFloorVersion`)
- 테스트: `backend/tests/floorPlanOcc.integration.test.ts` (신규)

**Frontend**
- 수정: `frontend/src/features/editor/stores/editorStore.ts` (`baseFloorVersion`, `floorConflict` 상태 + 세터)
- 수정: `frontend/src/features/editor/hooks/useFloorPlanData.ts` (로드 시 base 보관, 저장 payload 동봉, 409 → floorConflict)
- 수정: `frontend/src/types/floorPlan.ts` (`UpdateFloorPlanRequest.baseFloorVersion?`)
- 수정: `frontend/src/features/workingCopy/ConflictDialog.tsx` (optional `message` prop)
- 수정: `frontend/src/features/editor/components/FloorPlanEditor.tsx` (충돌 시 `ConflictDialog` 렌더)

---

## Task 1: 백엔드 — bulkUpdatePlan OCC

**Files:** Modify `backend/src/services/floor.service.ts`, `backend/src/routes/floors.routes.ts`; Create `backend/tests/floorPlanOcc.integration.test.ts`

- [ ] **Step 1: zod 스키마에 baseFloorVersion 추가**

In `backend/src/routes/floors.routes.ts`, the `bulkUpdatePlanSchema` object — add:
```typescript
  baseFloorVersion: z.string().optional(),   // 로드 시점의 Floor.updatedAt(ISO). OCC 토큰
```

- [ ] **Step 2: 서비스에 OCC 검사 + 격리 + P2034 catch**

In `backend/src/services/floor.service.ts`:
1. Ensure imports: `import { Prisma } from '@prisma/client';` (likely already present) and `import { VersionConflictError } from './concurrency.js';`.
2. `bulkUpdatePlan(floorId, input, userId)` — read `input.baseFloorVersion`.
3. Add REPEATABLE READ to the existing `prisma.$transaction(async (tx) => { ... })` call: pass a 2nd arg `{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }`.
4. At the VERY START of the transaction callback (before loading current DB state / reconciliation), add the version check:
```typescript
      const floorRow = await tx.floor.findUnique({ where: { id: floorId }, select: { updatedAt: true, name: true } });
      if (!floorRow) throw new NotFoundError('도면을 찾을 수 없습니다.');   // use the project's existing NotFoundError if available; else AppError(404,...)
      if (input.baseFloorVersion && floorRow.updatedAt.toISOString() !== input.baseFloorVersion) {
        throw new VersionConflictError([{ collection: 'floor', id: floorId, name: floorRow.name }]);
      }
```
   (If a `floor` load already happens at the top of the tx, reuse it — just add the `baseFloorVersion` comparison; don't double-query.)
5. Ensure the floor row is ALWAYS updated so `updatedAt` bumps on every successful save (so the next concurrent save detects this one). The existing Step 4 `tx.floor.update({ where:{id}, data: { ...canvas..., updatedById, ...(structural? version increment) } })` already runs unconditionally — VERIFY it always executes (not gated by `hasStructuralChange`). If it is conditionally skipped, make the `tx.floor.update` run on every save (at minimum updating `updatedById`), so `updatedAt` always advances. Report which you found.
6. Wrap the whole `bulkUpdatePlan` transaction call so a Postgres serialization failure surfaces as a clean 409 instead of 500:
```typescript
    try {
      return await prisma.$transaction(async (tx) => { ...existing body... }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
        throw new VersionConflictError([{ collection: 'floor', id: floorId, name: '도면' }]);
      }
      throw e;
    }
```

- [ ] **Step 3: 통합 테스트**

Create `backend/tests/floorPlanOcc.integration.test.ts`. READ `backend/tests/floorPlan.roundtrip.integration.test.ts` first and MIRROR its fixture setup (express app wiring with the floors router + auth router + errorHandler, admin login, and creating headquarters→branch→substation→floor). Then:
```typescript
  it('baseFloorVersion 이 최신이면 저장 200, stale 면 409', async () => {
    // 1) 현재 도면 plan 로드 → updatedAt(version 토큰) 확보
    const plan = await request(app).get(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`).expect(200);
    const base: string = plan.body.data.updatedAt;   // FloorPlanDetail.updatedAt (ISO string)
    // 2) 올바른 base 로 저장 → 200 (캔버스 크기만 살짝 변경)
    await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2100, baseFloorVersion: base }).expect(200);
    // 3) 같은(이제 stale) base 로 다시 저장 → 409 CONFLICT
    const res = await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2200, baseFloorVersion: base }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('baseFloorVersion 미동봉이면 검사 생략(하위호환, 200)', async () => {
    await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2300 }).expect(200);
  });
```
> 주의: `data` 래핑 형태(`res.body.data...`)는 프로젝트 응답 규약에 맞춘다(다른 통합테스트 확인). `GET /plan` 의 정확한 응답 경로(`body.data.updatedAt`)도 floorPlan.roundtrip 테스트에서 확인해 일치시킨다.

- [ ] **Step 4: 실행 + 빌드 + Commit**

Run: `cd backend && npx vitest run tests/floorPlanOcc.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts tests/assetCommit.integration.test.ts` → ALL pass (OCC 신규 + 라운드트립 회귀 + 자산 OCC). `npm run build` → 0.
```bash
git add backend/src/services/floor.service.ts backend/src/routes/floors.routes.ts backend/tests/floorPlanOcc.integration.test.ts
git commit -m "feat(occ): 도면 plan 저장에 baseFloorVersion 동시성 검사(409) + REPEATABLE READ"
```

## Task 1 완료 기준
- [ ] 올바른 base → 200, stale base → 409, base 미동봉 → 200(하위호환)
- [ ] 라운드트립·자산 OCC 회귀 없음

---

## Task 2: 프론트 — base 보관·동봉 + 충돌 모달

**Files:** Modify `frontend/src/features/editor/stores/editorStore.ts`, `frontend/src/features/editor/hooks/useFloorPlanData.ts`, `frontend/src/types/floorPlan.ts`, `frontend/src/features/workingCopy/ConflictDialog.tsx`, `frontend/src/features/editor/components/FloorPlanEditor.tsx`

- [ ] **Step 1: 타입에 baseFloorVersion**

In `frontend/src/types/floorPlan.ts`, `UpdateFloorPlanRequest` interface — add:
```typescript
  baseFloorVersion?: string;
```

- [ ] **Step 2: editorStore 상태**

In `frontend/src/features/editor/stores/editorStore.ts`, add to the state interface + store:
```typescript
  // OCC
  baseFloorVersion: string | null;
  setBaseFloorVersion: (v: string | null) => void;
  floorConflict: { id: string; name?: string }[] | null;
  setFloorConflict: (c: { id: string; name?: string }[] | null) => void;
```
Initial values: `baseFloorVersion: null, floorConflict: null,` and actions `setBaseFloorVersion: (v) => set({ baseFloorVersion: v }), setFloorConflict: (c) => set({ floorConflict: c }),`.
> `clearPendingData` 는 `baseFloorVersion`/`floorConflict` 를 건드리지 않는다(저장 후에도 base 는 refetch 가 갱신).

- [ ] **Step 3: useFloorPlanData — base 보관 + payload 동봉 + 409 처리**

In `frontend/src/features/editor/hooks/useFloorPlanData.ts`:
- 로드 시(`floorPlan` 데이터가 store 에 반영되는 effect, 현재 `setLocalEquipment(floorPlan.equipment)` 근처)에 추가:
```typescript
      useEditorStore.getState().setBaseFloorVersion(
        typeof floorPlan.updatedAt === 'string' ? floorPlan.updatedAt : new Date(floorPlan.updatedAt).toISOString()
      );
```
- `handleSave` 의 `updateData` 조립에 추가:
```typescript
      baseFloorVersion: useEditorStore.getState().baseFloorVersion ?? undefined,
```
- `saveMutation` 의 `onError` 에 409 분기 추가(기존 에러 처리 위/대신):
```typescript
      onError: (error) => {
        const status = (error as { response?: { status?: number; data?: { details?: { id: string; name?: string }[] } } }).response;
        if (status?.status === 409) {
          useEditorStore.getState().setFloorConflict(status.data?.details ?? [{ id: floorId, name: '도면' }]);
          return;   // 일반 에러 토스트 대신 충돌 모달로 처리
        }
        // ...기존 에러 처리 유지...
      },
```
> `floorId` 가 onError 스코프에 없으면 mutation 정의 위치의 floorId 를 사용(이 훅은 floorId 를 인자로 받음).

- [ ] **Step 4: ConflictDialog 에 optional message**

In `frontend/src/features/workingCopy/ConflictDialog.tsx`, extend props + render:
```typescript
interface Props {
  conflicts: { id: string; name?: string }[];
  onReloadLatest: () => void;
  onClose: () => void;
  message?: string;   // 컨텍스트별 안내문구(미지정 시 레지스터 기본)
}
```
Replace the fixed `<p>` line with:
```tsx
        <p className="text-xs text-gray-500 mb-3">{message ?? '최신 내용을 불러온 뒤 내 변경을 다시 확인하고 커밋하세요.'}</p>
```

- [ ] **Step 5: FloorPlanEditor — 충돌 모달 렌더**

In `frontend/src/features/editor/components/FloorPlanEditor.tsx`:
- import: `import { ConflictDialog } from '../../workingCopy/ConflictDialog';` and ensure `useQueryClient` available (likely already).
- read state: `const floorConflict = useEditorStore((s) => s.floorConflict);`
- render near the other panels/modals (e.g. alongside `EquipmentDetailPanel`):
```tsx
{floorConflict && (
  <ConflictDialog
    conflicts={floorConflict}
    message="다른 사용자가 이 도면을 먼저 변경했습니다. 최신을 불러오면 저장하지 않은 현재 편집을 잃습니다."
    onClose={() => useEditorStore.getState().setFloorConflict(null)}
    onReloadLatest={async () => {
      await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      useEditorStore.getState().setFloorConflict(null);   // refetch 가 store 를 server 상태로 재적재 + baseFloorVersion 갱신
    }}
  />
)}
```
> `floorId` 는 이 컴포넌트의 라우트 param(`useParams`)에서 이미 사용 중인 값을 쓴다.

- [ ] **Step 6: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓ built.
```bash
git add frontend/src/types/floorPlan.ts frontend/src/features/editor/stores/editorStore.ts frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/features/workingCopy/ConflictDialog.tsx frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "feat(occ): 에디터 도면 저장에 baseFloorVersion 동봉 + 충돌 모달(편집 유실 안내)"
```

## Task 2 완료 기준
- [ ] 로드 시 baseFloorVersion 보관, 저장에 동봉, 409 → 충돌 모달
- [ ] "최신 불러오기" → 도면 재적재 + 모달 닫힘
- [ ] tsc 0, vite build

---

## 최종 검증 (양 태스크 후)
- [ ] `cd backend && npx vitest run tests/floorPlanOcc.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts tests/assetCommit.integration.test.ts tests/concurrency.test.ts` → ALL pass. `npm run build` → 0.
- [ ] `cd frontend && npx vitest run src/features/workingCopy` → pass. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): 도면 두 탭 → A 편집·저장(200) → B(편집 전 로드) 편집·저장 → **충돌 모달** → "최신 불러오기" → 도면 갱신. base 미동봉 경로 없음(항상 동봉).

## 이후
- 5b 엔진 통합(editorStore overlay→제네릭 엔진, mergeX/resolveX 제거) — 별도 계획, (가) 패널 작업과 함께 또는 그 후.
- (가) 통합 상세 패널 + 상호 네비 → (나) 통합 워크스페이스 → V2~V5.
