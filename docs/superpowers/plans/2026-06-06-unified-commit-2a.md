# SSOT 2a — 백엔드 통합 커밋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `POST /api/substations/:id/commit` — 변전소 워킹카피 delta(assets[배치 포함]/cables/rackModules/distributionCircuits/fiberPaths + 선택 floor)를 한 트랜잭션·per-entity OCC로 원자 커밋. 기존 엔드포인트는 유지(2d에서 퇴역).

**Architecture:** delta 기반(creates/updates[{id,baseVersion,patch}]/deletes[{id,baseVersion}]). per-entity OCC는 기존 `collectConflicts`/`VersionConflictError` 재사용. tempId는 컬렉션 간 의존순(assets→cables/rack/dist 참조)으로 해소. 적용·검증 로직은 `bulkUpdatePlan`에서 공유 가능한 검증 헬퍼를 `planApply.ts`로 추출해 재사용(중복 금지, bulkUpdatePlan 회귀 없음).

**Tech Stack:** Express + Prisma + Zod + vitest(+supertest). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 백엔드는 `cd backend`.

**설계 근거:** `docs/superpowers/specs/2026-06-06-unified-workingcopy-phase2-design.md` §3.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `backend/src/schemas/substationCommit.schema.ts`(Zod), `backend/src/services/substationCommit.service.ts`, `backend/src/services/planApply.ts`(추출된 공유 검증 헬퍼), 테스트 `backend/tests/substationCommit.integration.test.ts`.
**수정**: `backend/src/controllers/substation.controller.ts`(commit), `backend/src/routes/substations.routes.ts`(route), `backend/src/services/floor.service.ts`(bulkUpdatePlan → planApply 검증 헬퍼 사용, 동작 보존).

---

## Task 1: 입력 스키마 + 타입 (Zod)

**Files:** Create `backend/src/schemas/substationCommit.schema.ts`

- [ ] **Step 1: 현황 파악**

READ: `backend/src/services/assetCommit.service.ts`(AssetCommitInput 모양 — creates/updates/deletes + baseVersion), 기존 plan 입력(`types/floorPlan` 또는 floor 서비스의 UpdatePlanInput — 장비/케이블/랙/회로/fiber 필드명), `prisma/schema.prisma`(Asset 배치 컬럼 positionX/positionY/width2d/height2d/rotation/totalU/floorId), 기존 Zod 스키마 1개(스타일).

- [ ] **Step 2: 스키마 작성**

Create `substationCommit.schema.ts` — Zod 스키마 + 추론 타입 `SubstationCommitInput`:
```ts
import { z } from 'zod';
const occRef = z.object({ id: z.string(), baseVersion: z.string().nullable() });
// 컬렉션 공통: { creates: Create[], updates: {id, baseVersion, patch}[], deletes: {id, baseVersion}[] }
const collection = <C extends z.ZodTypeAny, P extends z.ZodTypeAny>(create: C, patch: P) =>
  z.object({
    creates: z.array(create).default([]),
    updates: z.array(z.object({ id: z.string(), baseVersion: z.string().nullable(), patch })).default([]),
    deletes: z.array(occRef).default([]),
  }).partial({ creates: true, updates: true, deletes: true });

// Asset = 현황 필드 + 배치 필드 (배치는 optional)
const assetCreate = z.object({
  tempId: z.string(),
  assetTypeId: z.string(), name: z.string(),
  parentAssetId: z.string().nullable().optional(), roomText: z.string().nullable().optional(),
  attributes: z.unknown().optional(),
  installDate: z.string().nullable().optional(), manager: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  warrantyUntil: z.string().nullable().optional(), replaceDue: z.string().nullable().optional(),
  // 배치
  floorId: z.string().nullable().optional(),
  positionX: z.number().nullable().optional(), positionY: z.number().nullable().optional(),
  width2d: z.number().nullable().optional(), height2d: z.number().nullable().optional(),
  rotation: z.number().optional(), totalU: z.number().nullable().optional(),
});
const assetPatch = assetCreate.omit({ tempId: true }).partial();

// cables/rackModules/distributionCircuits/fiberPaths: 기존 plan 입력 필드명에 맞춰 create/patch 정의
// (READ 한 필드명 그대로 — cable source/target endpoints, rackModule slotIndex 등)
export const substationCommitSchema = z.object({
  assets: collection(assetCreate, assetPatch).optional(),
  cables: collection(/*cableCreate*/, /*cablePatch*/).optional(),
  rackModules: collection(/*...*/, /*...*/).optional(),
  distributionCircuits: collection(/*...*/, /*...*/).optional(),
  fiberPaths: collection(/*...*/, /*...*/).optional(),
  floor: z.object({
    id: z.string(), baseVersion: z.string().nullable(),
    settings: z.object({ canvasWidth: z.number().optional(), canvasHeight: z.number().optional(), gridSize: z.number().optional(), majorGridSize: z.number().optional(), backgroundOpacity: z.number().optional() }).optional(),
  }).optional(),
});
export type SubstationCommitInput = z.infer<typeof substationCommitSchema>;
```
> cables/rackModules/distributionCircuits/fiberPaths 의 create/patch 필드는 READ 한 기존 plan 입력 타입 그대로 옮긴다(엔드포인트·슬롯·포트 필드명 정확히).

- [ ] **Step 3: 타입체크 + Commit**

`cd backend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/schemas/substationCommit.schema.ts
git commit -m "feat(commit): 통합 커밋 입력 Zod 스키마(배치 포함 Asset + 컬렉션 delta)"
```

---

## Task 2: substationCommit 서비스 (TDD, 핵심)

**Files:** Create `backend/src/services/substationCommit.service.ts`, `backend/src/services/planApply.ts`, `backend/tests/substationCommit.integration.test.ts`; Modify `backend/src/services/floor.service.ts`

- [ ] **Step 1: 현황 파악 (검증/적용 로직)**

READ `floor.service.ts bulkUpdatePlan` 전체: 장비(asset) 적용 + **OFD 유일성** 검증, **랙 슬롯 충돌** 검증, **케이블 엔드포인트 유효성** 검증, fiber 유일성. 이 *검증 술어*들을 식별(추출 대상). `assetCommit.service.ts`의 OCC(collectConflicts/VersionConflictError)와 asset 적용. `concurrency.ts`(collectConflicts 시그니처).

- [ ] **Step 2: 실패 테스트**

Create `substationCommit.integration.test.ts` (자체 시드 hq→branch→substation→floor + 기존 supertest/admin 패턴). 어서션:
```
- POST /api/substations/:id/commit { assets:{creates:[배치 포함 asset(tempId)]}, cables:{creates:[temp asset 참조 cable]} }
   → 200, idMaps.assets[tempId]=실제id, idMaps.cables[...]. DB: Asset(positionX 등) + Cable 생성, cable 양 끝이 실제 asset id 로 연결.
- asset update patch{positionX:999} 올바른 baseVersion → 200, DB positionX 갱신 + updatedAt 변경.
- asset update 잘못된 baseVersion → 409, 충돌에 그 asset id/name.
- 원자성: cables 한 건 잘못된 baseVersion(delete) → 409 + assets creates 도 DB 미반영(롤백).
- floor.settings(gridSize 등) + floor.baseVersion OCC.
- 401(no auth), 400(잘못된 입력).
```
Run → FAIL (route 404).

- [ ] **Step 3: planApply 추출 + 서비스 구현**

`planApply.ts`: bulkUpdatePlan 의 검증 술어를 순수 헬퍼로 추출(동작 동일):
```ts
// 예시 — 실제 시그니처는 READ 후 맞춤
export async function assertOfdUnique(tx, substationId, equipmentCreatesUpdates): Promise<void>;
export async function assertRackSlotsFree(tx, floorId, rackModuleCreatesUpdates): Promise<void>;
export async function assertCableEndpointsValid(tx, cables, idMaps): Promise<void>;
```
`floor.service.bulkUpdatePlan` 이 이 헬퍼를 호출하도록 수정(인라인 검증 → 헬퍼 호출, **동작 보존**). 기존 floor 테스트로 회귀 확인.

`substationCommit.service.ts`:
```ts
export async function commitSubstation(substationId: string, input: SubstationCommitInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    // 1) per-entity OCC: 각 컬렉션 update/delete 대상 현재 updatedAt 로드 → collectConflicts
    const conflicts = [];
    for (const [name, model, coll] of [['assets', tx.asset, input.assets], ['cables', tx.cable, input.cables], /* rackModules, distributionCircuits, fiberPaths */]) {
      if (!coll) continue;
      const ids = [...(coll.updates??[]).map(u=>u.id), ...(coll.deletes??[]).map(d=>d.id)];
      if (!ids.length) continue;
      const rows = await model.findMany({ where:{ id:{ in: ids } }, select:{ id:true, updatedAt:true, name:true } });
      const current = new Map(rows.map(r=>[r.id, r.updatedAt.toISOString()]));
      conflicts.push(...collectConflicts(name, current, coll.updates??[], coll.deletes??[]));
    }
    if (conflicts.length) throw new VersionConflictError(conflicts);

    // 2) tempId 해소: assets creates 먼저 삽입 → idMaps.assets, 그 후 참조 치환
    const idMaps = { assets:{}, cables:{}, rackModules:{}, distributionCircuits:{}, fiberPaths:{} };
    const updated = { assets:[], cables:[], rackModules:[], distributionCircuits:[], fiberPaths:[] };
    // assets: 검증(assertOfdUnique) → creates(배치 포함)/updates(patch, 배치 포함)/deletes
    // cables/rackModules/distCircuits/fiber: idMaps 로 참조(equipmentId/rackEquipmentId/source·target 등) 치환 → 검증 → 적용
    // (각 적용은 planApply 헬퍼 + tx 직접 사용)

    // 3) floor 섹션(있으면): floor.baseVersion OCC → 캔버스 설정 갱신, 구조변경 시 Floor.version 스냅샷
    // 4) 반환
    return { idMaps, updated };
  }, { isolationLevel: 'RepeatableRead' });
}
```
> 배치 필드(positionX 등)는 asset create/update 의 일부로 Prisma asset 모델에 직접 기록. cable/rack/dist/fiber 적용·검증은 bulkUpdatePlan 과 동일 규칙(planApply 헬퍼 재사용). 충돌/검증 실패는 throw → 트랜잭션 전체 롤백.

- [ ] **Step 4: 통과 + Commit**

`cd backend && <test cmd> tests/substationCommit.integration.test.ts` → PASS. 기존 floor/asset 테스트 회귀 없음. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/substationCommit.service.ts backend/src/services/planApply.ts backend/src/services/floor.service.ts backend/tests/substationCommit.integration.test.ts
git commit -m "feat(commit): substationCommit 서비스 — 통합 delta 커밋(per-entity OCC, tempId 교차해소, planApply 공유)"
```

---

## Task 3: 컨트롤러 + 라우트

**Files:** Modify `backend/src/controllers/substation.controller.ts`, `backend/src/routes/substations.routes.ts`

- [ ] **Step 1: 컨트롤러 + 라우트**

`substation.controller.ts`:
```ts
async commit(req, res, next) {
  try {
    const parsed = substationCommitSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: '잘못된 입력', issues: parsed.error.issues }); return; }
    const result = await commitSubstation(req.params.substationId, parsed.data, req.user!.id);
    res.json({ data: result });
  } catch (e) { next(e); }  // VersionConflictError → errorHandler 가 409
}
```
(req.user 접근·에러 핸들러 패턴은 기존 컨트롤러와 일치.)
`routes/substations.routes.ts`: `router.post('/:substationId/commit', authenticate, substationController.commit);` (기존 라우트 옆).

- [ ] **Step 2: 빌드 + 전체 테스트 + Commit**

`cd backend && npx tsc --noEmit` → 0. `<test cmd>` 전체에서 substationCommit + 기존 floor/asset 회귀 PASS.
```bash
cd /Users/jsk/1210/digital
git add backend/src/controllers/substation.controller.ts backend/src/routes/substations.routes.ts
git commit -m "feat(commit): POST /substations/:id/commit 라우트 + 컨트롤러(Zod 검증, 409 충돌)"
```

---

## 최종 검증
- [ ] `cd backend && npx tsc --noEmit` → 0. 백엔드 테스트: substationCommit 통과 + 기존 floor(bulkUpdatePlan)·asset(assetCommit) 회귀 없음.
- [ ] 수동(선택, curl): admin 로그인 토큰으로 `POST /api/substations/:id/commit` 에 asset+cable delta → 200, DB 반영 확인.

## 완료 기준 (spec §3)
- [ ] `POST /substations/:id/commit` 가 assets(배치 포함)+cables+rack+circuits+fiber+floor 원자·per-entity OCC 커밋
- [ ] tempId 교차 해소, 충돌 시 전체 롤백 + 409
- [ ] 검증(OFD/슬롯/엔드포인트) planApply 재사용, bulkUpdatePlan 회귀 없음
- [ ] 기존 엔드포인트 유지

## 이후
- 2b 프론트 통합 스토어 → 2c 현황·연결 이관 → 2d 에디터 이관(기존 엔드포인트 퇴역).
