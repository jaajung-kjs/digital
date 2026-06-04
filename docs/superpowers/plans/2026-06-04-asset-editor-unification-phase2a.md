# 2단계-a 구현 계획 — 에디터 백엔드 통합 (Equipment/RackModule → Asset, 어댑터 뒤)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도면 설비·랙 모듈의 저장소를 `Equipment`/`RackModule` 테이블에서 단일 `Asset` 트리로 옮기되, 기존 프론트 API 계약(`/floors/:id/plan`, `/rack-modules`, `/distribution-circuits`, 3개 idMap, 폴리모픽 케이블)을 어댑터로 보존해 **프론트 무수정**으로 동작시킨다.

**Architecture:** 계약-테스트-우선. 먼저 현재 동작(Equipment/RackModule 기반)을 라운드트립 통합테스트로 고정한다. 그다음 `AssetType.placementKind` 추가 → Cable/Circuit/Port/FiberPath/Log/Photo의 FK 대상을 Equipment→Asset으로 repoint(**칼럼명 유지**) → `floor.service`의 getPlan/bulkUpdatePlan 및 주변 서비스(equipment/rackModule/cable/port/fiberPath/distributionCircuit/photo/log/stats/preset/category)를 Asset 기반으로 재작성 → Equipment/RackModule/RackModuleCategory 테이블·EquipmentKind enum 삭제. 동일 계약테스트가 변경 전후로 통과하면 완료.

**Tech Stack:** Express + Prisma + Zod + Vitest(+supertest). 실데이터 없음(클린 재설계). dev DB 필요: `docker compose -f docker-compose.dev.yml up -d`.

**설계 근거:** `docs/superpowers/specs/2026-06-04-asset-editor-unification-phase2a-design.md`

**중요 — 실행 성격:** 이 계획은 코어 데이터모델 마이그레이션이다. Task 5(FK repoint)부터 Task 13(테이블 삭제)까지는 **중간 상태가 빌드/실행 불가일 수 있다**(서비스들이 repoint될 때까지). "동작하는 소프트웨어"의 단위는 **2a 전체**이며, 브랜치에서 모든 태스크를 끝내고 Task 14~15에서 녹색을 확인한 뒤 머지한다. 계약테스트(Task 1)가 전·후 불변의 방패다.

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경이 있다. 각 태스크의 commit 스텝은 **명시된 파일만** `git add` 한다. `git add -A`/`git add .` 금지.

---

## 파일 구조

**테스트(계약 방패)**
- 생성: `backend/tests/floorPlan.roundtrip.integration.test.ts` — plan PUT→GET 라운드트립 계약 고정

**스키마/시드**
- 수정: `backend/prisma/schema.prisma` — AssetType.placementKind/defaultSlotSpan; Cable/Circuit/Port/FiberPath/Log/Photo FK → Asset; Equipment/RackModule/RackModuleCategory/EquipmentKind 삭제
- 생성: 2개 마이그레이션(placementKind 추가; FK repoint+테이블 삭제)
- 수정: `backend/prisma/seed/assetTypes.ts` — placementKind + RackModuleCategory 흡수 + GROUNDING/HVAC
- 수정: `backend/prisma/seed.ts` — rackModuleCategories 시드 제거(흡수됨)
- 수정: `backend/prisma/seed/rackPresets.ts` — categoryCode → assetTypeCode

**어댑터(신규 매핑 모듈)**
- 생성: `backend/src/services/assetPlanMapper.ts` — Asset ↔ PlanEquipmentDTO/RackModuleDetail, placementKind↔kind

**서비스 재작성**
- 수정: `backend/src/services/floor.service.ts` — getPlan, bulkUpdatePlan
- 수정: `backend/src/services/rackModule.service.ts`, `equipment.service.ts`, `cable.service.ts`, `port.service.ts`, `fiberPath.service.ts`, `distributionCircuit.service.ts`, `equipmentPhoto.service.ts`, `maintenanceLog.service.ts`, `rackModuleStats.service.ts`, `rackPreset.service.ts`, `rackModuleCategory.service.ts`

**검증**
- 프론트 무수정: `npx tsc --noEmit` + `npx vite build` + 수동 스모크

---

## Task 1: 라운드트립 계약 통합테스트 (현재 동작 고정)

**목적:** 현재 Equipment/RackModule 기반 동작을 캡처. 이 테스트는 마이그레이션 전·후 **동일하게 통과**해야 한다.

**Files:** Create `backend/tests/floorPlan.roundtrip.integration.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { floorsRouter } from '../src/routes/floors.routes.js';
import { rackModulesRouter } from '../src/routes/rackModules.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('FloorPlan 라운드트립 계약 (Asset 마이그레이션 불변 방패)', () => {
  let app: Express;
  let token: string;
  let hqId: string, branchId: string, subId: string, floorId: string;
  let rackCatId: string; // RackModuleCategory id (마이그레이션 후엔 AssetType id 로 동일 동작해야 함)

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/auth', authRouter);
    app.use('/api/floors', floorsRouter);
    app.use('/api/rack-modules', rackModulesRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__rt_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__rt_br__', headquartersId: hq.id } });
    branchId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__rt_sub__', branchId: br.id } });
    subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: sub.id, name: '__rt_floor__', floorNumber: '1' } });
    floorId = floor.id;
    // 랙 모듈 카테고리 1개 확보 (시드된 것 사용)
    // ⚠️ 마이그레이션 민감 라인 — Task 13에서 AssetType 으로 교체한다(rack_module_categories 테이블이 삭제되므로).
    const cat = await prisma.rackModuleCategory.findFirstOrThrow({ where: { isActive: true } });
    rackCatId = cat.id;
  });

  afterAll(async () => {
    // 자식부터 정리. 케이블/모듈/설비는 floor cascade 로 함께 삭제됨.
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('PUT plan(설비2+모듈1+케이블1) → GET plan 이 동일 형태로 돌려준다', async () => {
    const put = await request(app)
      .put(`/api/floors/${floorId}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        equipment: [
          { tempId: 'temp-rack', kind: 'RACK', name: '랙A', positionX: 10, positionY: 20, width: 80, height: 200, rotation: 0, totalU: 42 },
          { tempId: 'temp-ofd', kind: 'OFD', name: 'OFD-1', positionX: 300, positionY: 50, width: 100, height: 60 },
        ],
        rackModules: [
          { tempId: 'temp-mod', rackEquipmentId: 'temp-rack', categoryId: rackCatId, name: '모듈1', slotIndex: 0, slotSpan: 1 },
        ],
        cables: [
          { source: { moduleId: 'temp-mod' }, target: { equipmentId: 'temp-ofd' }, cableType: 'LAN', pathPoints: [[10, 20], [300, 50]] },
        ],
      })
      .expect(200);

    // 3개 idMap 이 모두 채워졌는지
    expect(Object.keys(put.body.equipmentIdMap)).toContain('temp-rack');
    expect(Object.keys(put.body.equipmentIdMap)).toContain('temp-ofd');
    expect(Object.keys(put.body.rackModuleIdMap)).toContain('temp-mod');
    const rackId = put.body.equipmentIdMap['temp-rack'];
    const ofdId = put.body.equipmentIdMap['temp-ofd'];
    const modId = put.body.rackModuleIdMap['temp-mod'];

    // GET plan 계약 형태
    const get = await request(app).get(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`).expect(200);
    const eqRack = get.body.equipment.find((e: any) => e.id === rackId);
    expect(eqRack).toMatchObject({ kind: 'RACK', name: '랙A', positionX: 10, positionY: 20, width: 80, height: 200, totalU: 42 });
    const eqOfd = get.body.equipment.find((e: any) => e.id === ofdId);
    expect(eqOfd).toMatchObject({ kind: 'OFD', name: 'OFD-1', positionX: 300, positionY: 50 });

    // 케이블: 모듈→설비 폴리모픽 엔드포인트 보존
    const cable = get.body.cables[0];
    expect(cable.sourceModuleId).toBe(modId);
    expect(cable.targetEquipmentId).toBe(ofdId);
    expect(cable.cableType).toBe('LAN');

    // GET /rack-modules?rackId= 어댑터 계약
    const mods = await request(app).get(`/api/rack-modules?rackId=${rackId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(mods.body.data[0]).toMatchObject({ rackEquipmentId: rackId, name: '모듈1', slotIndex: 0, slotSpan: 1, categoryId: rackCatId });
  });
});
```

> 주의: `/api/rack-modules?rackId=` 의 실제 쿼리 파라미터 이름(rackId vs rackEquipmentId)을 `backend/src/routes/rackModules.routes.ts` 에서 확인하고 일치시킨다. 응답 envelope(`{ data }` vs 배열)도 실제에 맞춘다. floorsRouter/rackModulesRouter export 이름도 확인.

- [ ] **Step 2: 실행 — 현재 코드에서 통과해야 함**

Run: `cd backend && npx vitest run tests/floorPlan.roundtrip.integration.test.ts`
Expected: PASS. 실패하면 테스트를 실제 계약(쿼리파라미터/envelope/필드)에 맞게 고친다 — 이 시점 production 코드는 바꾸지 않는다.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/floorPlan.roundtrip.integration.test.ts
git commit -m "test(plan): floor-plan 라운드트립 계약 고정 (Asset 마이그레이션 방패)"
```

---

## Task 2: AssetType.placementKind / defaultSlotSpan 추가

**Files:** Modify `backend/prisma/schema.prisma`

- [ ] **Step 1: AssetType 모델에 두 필드 추가**

`model AssetType { ... }` 안에 추가:
```prisma
  placementKind   String? @map("placement_kind") @db.VarChar(20)   // 'RACK'|'OFD'|'DIST'|'GROUNDING'|'HVAC'|null(모듈/장치)
  defaultSlotSpan Int     @default(1) @map("default_slot_span")
```

- [ ] **Step 2: 마이그레이션**

Run: `cd backend && npx prisma migrate dev --name assettype_placement_kind`
Expected: `ALTER TABLE asset_types ADD COLUMN placement_kind`, `ADD COLUMN default_slot_span`. 적용 성공.

- [ ] **Step 3: 클라이언트 확인**

Run: `cd backend && npx prisma generate && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.assetType.findFirst().then(()=>console.log('ok')).then(()=>p.\$disconnect())"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(asset): AssetType.placementKind/defaultSlotSpan 추가"
```

---

## Task 3: 시드 — AssetType가 RackModuleCategory 흡수 + placementKind + GROUNDING/HVAC

**Files:** Modify `backend/prisma/seed/assetTypes.ts`, `backend/prisma/seed.ts`, `backend/prisma/seed/rackPresets.ts`

- [ ] **Step 1: 기존 RackModuleCategory 시드 코드를 읽어 코드/이름/색/defaultSlotSpan 목록을 확보**

Run: `cd backend && sed -n '1,200p' prisma/seed/rackModuleCategories.ts`
이 목록(코드/name/displayColor/defaultSlotSpan)을 다음 스텝에서 AssetType 시드에 병합한다.

- [ ] **Step 2: assetTypes.ts 에 placementKind + GROUNDING/HVAC + 모듈 카테고리들 추가**

`backend/prisma/seed/assetTypes.ts` 의 `AssetTypeSeed` 인터페이스에 `placementKind?: string | null;` 와 `defaultSlotSpan?: number;` 를 추가하고, `ASSET_TYPE_SEEDS` 의 배치형 5종에 placementKind 를 부여하며, GROUNDING/HVAC 와 (Step 1에서 확보한) 모듈 카테고리들을 추가한다. 배치형 5종:
```typescript
  // 배치형 — placementKind 지정
  { code: 'RACK', name: '랙', group: '구조', isContainer: true, placementKind: 'RACK', displayColor: '#64748b', sortOrder: 10, fieldTemplate: [{ key: 'totalU', label: 'U수', type: 'number', unit: 'U' }] },
  { code: 'OFD', name: 'OFD(광분배함)', group: '통신', isContainer: true, placementKind: 'OFD', displayColor: '#0ea5e9', sortOrder: 20, fieldTemplate: [{ key: 'portCount', label: '포트수', type: 'number' }] },
  { code: 'DIST', name: '분전반', group: '전원', isContainer: true, placementKind: 'DIST', displayColor: '#f59e0b', sortOrder: 30, fieldTemplate: [] },
  { code: 'GROUNDING', name: '접지함체', group: '구조', isContainer: false, placementKind: 'GROUNDING', displayColor: '#84cc16', sortOrder: 31, fieldTemplate: [] },
  { code: 'HVAC', name: '공조설비', group: '공조', isContainer: false, placementKind: 'HVAC', displayColor: '#14b8a6', sortOrder: 32, fieldTemplate: [] },
```
그리고 `seedAssetTypes` 의 upsert `update`/`create` data 에 `placementKind: t.placementKind ?? null` 와 `defaultSlotSpan: t.defaultSlotSpan ?? 1` 를 포함시킨다. 모듈 카테고리들은 Step 1의 코드/이름/색을 placementKind=null, defaultSlotSpan=그 값으로 추가한다(코드 충돌 없게 기존 device 종류와 합침).

- [ ] **Step 3: seed.ts 에서 rackModuleCategories 시드 호출 제거**

`backend/prisma/seed.ts` 에서 `seedRackModuleCategories(...)` import 와 호출 라인을 삭제(흡수됨). `seedAssetTypes` 가 rackPresets/기타보다 먼저 실행되도록 순서 확인(프리셋이 assetType 코드를 참조).

- [ ] **Step 4: rackPresets 시드의 categoryCode → assetTypeCode**

`backend/prisma/seed/rackPresets.ts` 에서 modules 정의의 `categoryCode` 키를 `assetTypeCode` 로 바꾸고 값은 동일 코드 유지(코드 자체는 그대로 AssetType 에 존재).

- [ ] **Step 5: 시드 실행 + 확인**

Run: `cd backend && npm run db:seed && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.assetType.findMany({where:{placementKind:{not:null}}}).then(r=>console.log('placementKinds:',r.map(x=>x.code+':'+x.placementKind).join(','))).then(()=>p.\$disconnect())"`
Expected: `RACK:RACK,OFD:OFD,DIST:DIST,GROUNDING:GROUNDING,HVAC:HVAC` 포함.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/seed/assetTypes.ts backend/prisma/seed.ts backend/prisma/seed/rackPresets.ts
git commit -m "feat(asset): AssetType가 모듈카테고리·배치형 종류 흡수(placementKind)"
```

---

## Task 4: Asset↔Plan 매핑 헬퍼 (신규 모듈)

**Files:** Create `backend/src/services/assetPlanMapper.ts`

- [ ] **Step 1: 매퍼 작성**

Create `backend/src/services/assetPlanMapper.ts`:
```typescript
import type { Asset, AssetType } from '@prisma/client';

export type PlacementKind = 'RACK' | 'OFD' | 'DISTRIBUTION' | 'GROUNDING' | 'HVAC';

// AssetType.placementKind 는 'DIST' 약어를 쓰지만, 프론트 계약의 kind 는 'DISTRIBUTION'.
const PLACEMENT_TO_KIND: Record<string, PlacementKind> = {
  RACK: 'RACK', OFD: 'OFD', DIST: 'DISTRIBUTION', GROUNDING: 'GROUNDING', HVAC: 'HVAC',
};
const KIND_TO_PLACEMENT: Record<PlacementKind, string> = {
  RACK: 'RACK', OFD: 'OFD', DISTRIBUTION: 'DIST', GROUNDING: 'GROUNDING', HVAC: 'HVAC',
};

export function placementKindToKind(placementKind: string | null): PlacementKind | null {
  return placementKind ? PLACEMENT_TO_KIND[placementKind] ?? null : null;
}
export function kindToPlacementCode(kind: PlacementKind): string {
  return KIND_TO_PLACEMENT[kind];
}

type AssetWithType = Asset & { assetType: AssetType };

/** 배치된 top-level Asset → plan equipment DTO */
export function assetToPlanEquipment(a: AssetWithType) {
  return {
    id: a.id,
    kind: placementKindToKind(a.assetType.placementKind),
    name: a.name,
    positionX: a.positionX ?? 0,
    positionY: a.positionY ?? 0,
    width: a.width2d ?? 0,
    height: a.height2d ?? 0,
    rotation: a.rotation,
    totalU: a.totalU,
    description: a.description,
    manager: a.manager,
    installDate: a.installDate ? a.installDate.toISOString().slice(0, 10) : null,
    height3d: null as number | null,
    frontImageUrl: null as string | null,
    rearImageUrl: null as string | null,
    properties: a.attributes,
  };
}

/** 랙 자식 Asset → rack-module DTO */
export function assetToRackModule(a: AssetWithType) {
  return {
    id: a.id,
    rackEquipmentId: a.parentAssetId!,
    categoryId: a.assetTypeId,
    categoryCode: a.assetType.code,
    categoryName: a.assetType.name,
    categoryDisplayColor: a.assetType.displayColor,
    categoryDefaultSlotSpan: a.assetType.defaultSlotSpan,
    name: a.name,
    slotIndex: a.slotIndex ?? 0,
    slotSpan: a.slotSpan ?? 1,
    installDate: a.installDate,
    manager: a.manager,
    description: a.description,
    properties: a.attributes,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
```

- [ ] **Step 2: 타입체크**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep assetPlanMapper || echo "no errors in assetPlanMapper"`
Expected: `no errors in assetPlanMapper` (다른 파일의 기존 에러는 무시).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/assetPlanMapper.ts
git commit -m "feat(asset): Asset↔plan DTO 매핑 헬퍼"
```

---

## Task 5: 스키마 FK repoint (Equipment→Asset) + Equipment/RackModule/Category 삭제 + 마이그레이션

> 이 태스크부터 빌드가 깨진다(서비스가 아직 prisma.equipment 등을 참조). Task 6~13에서 모두 repoint한 뒤 Task 13 끝에서 빌드 녹색을 확인한다.

**Files:** Modify `backend/prisma/schema.prisma`

- [ ] **Step 1: Cable 엔드포인트 관계를 Asset 으로 (칼럼명 유지)**

`model Cable` 에서 `sourceEquipment`/`targetEquipment` 관계 대상을 `Asset` 으로, `sourceModule`/`targetModule` 관계 대상을 `Asset` 으로 바꾼다(스칼라 칼럼 `source_equipment_id` 등은 유지). `sourceCircuit`/`targetCircuit` 은 `DistributionCircuit` 유지. 예:
```prisma
  sourceEquipment Asset? @relation("CableSourceEquipment", fields: [sourceEquipmentId], references: [id])
  targetEquipment Asset? @relation("CableTargetEquipment", fields: [targetEquipmentId], references: [id])
  sourceModule    Asset? @relation("CableSourceModule", fields: [sourceModuleId], references: [id])
  targetModule    Asset? @relation("CableTargetModule", fields: [targetModuleId], references: [id])
```

- [ ] **Step 2: Circuit/Port/FiberPath/Log/Photo 부모 FK를 Asset 으로 (칼럼명 유지)**

- `DistributionCircuit.distribution` 관계 → `Asset`(칼럼 `distribution_equipment_id` 유지).
- `Port.equipment` 관계 → `Asset`(`equipment_id` 유지).
- `FiberPath.ofdA`/`ofdB` 관계 → `Asset`(`ofd_a_id`/`ofd_b_id` 유지).
- `MaintenanceLog.equipment` 관계 → `Asset`(`equipment_id` 유지).
- `EquipmentPhoto.equipment` 관계 → `Asset`(`equipment_id` 유지).

- [ ] **Step 3: Asset 에 역참조 관계 추가**

`model Asset` 에 추가(이름 충돌 없게):
```prisma
  sourceCablesEq   Cable[] @relation("CableSourceEquipment")
  targetCablesEq   Cable[] @relation("CableTargetEquipment")
  sourceCablesMod  Cable[] @relation("CableSourceModule")
  targetCablesMod  Cable[] @relation("CableTargetModule")
  circuits         DistributionCircuit[]
  ports            Port[]
  fiberPathsAsA    FiberPath[] @relation("FiberPathOfdA")
  fiberPathsAsB    FiberPath[] @relation("FiberPathOfdB")
  maintenanceLogs  MaintenanceLog[]
  photos           EquipmentPhoto[]
```

- [ ] **Step 4: Equipment / RackModule / RackModuleCategory 모델 + EquipmentKind enum 삭제**

세 `model` 블록과 `enum EquipmentKind` 를 schema.prisma 에서 제거한다. (이들을 참조하던 다른 모델의 관계 필드는 위에서 Asset 으로 옮겨졌으므로 남은 참조가 없어야 한다.)

- [ ] **Step 5: 마이그레이션 생성·적용**

Run: `cd backend && npx prisma migrate dev --name unify_equipment_into_asset`
Expected: `DROP TABLE equipment`, `DROP TABLE rack_modules`, `DROP TABLE rack_module_categories`, FK 재생성. 적용 성공(실데이터 없음).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(asset): Cable/Circuit/Port/FiberPath FK→Asset, Equipment/RackModule 테이블 삭제"
```

---

## Task 6: floor.service.getPlan → Asset 읽기

**Files:** Modify `backend/src/services/floor.service.ts`

- [ ] **Step 1: getPlan 의 equipment/ofd 조회를 Asset 으로 교체**

`getPlan`(현재 ~line 302)에서:
- `prisma.equipment.findMany({ where: { floorId: id } })` → `prisma.asset.findMany({ where: { floorId: id, parentAssetId: null }, include: { assetType: true }, orderBy: { sortOrder: 'asc' } })`
- OFD 조회 `prisma.equipment.findMany({ where: { floorId: id, kind: EquipmentKind.OFD } })` → `prisma.asset.findMany({ where: { floorId: id, parentAssetId: null, assetType: { placementKind: 'OFD' } }, select: { id: true } })`
- 케이블 `where` 의 `sourceEquipment: { floorId }` 등은 관계가 Asset 으로 바뀌었으므로 그대로 동작(Asset.floorId 존재). `sourceModule: { rack: { floorId } }` 는 모듈이 이제 Asset 이고 `rack` 관계가 없어졌으므로 → `sourceModule: { parent: { floorId: id } }` 로 변경(모듈 Asset 의 parent=랙 Asset, 랙은 floorId 보유).
- equipment 매핑부를 `import { assetToPlanEquipment } from './assetPlanMapper.js'` 로 교체: `equipment: equipmentAssets.map((a) => assetToPlanEquipment(a))`.
- 케이블 매핑은 그대로(칼럼명 동일).

- [ ] **Step 2: import 정리**

`floor.service.ts` 상단에서 `EquipmentKind` import 제거, `assetPlanMapper` import 추가.

- [ ] **Step 3: 타입체크(이 파일만)**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "floor.service" | head` — getPlan 관련 에러가 없어야 함(bulkUpdatePlan 은 Task 7에서 고치므로 그쪽 에러는 남아 있을 수 있음).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/floor.service.ts
git commit -m "refactor(plan): getPlan 을 Asset 읽기로 전환"
```

---

## Task 7: floor.service.bulkUpdatePlan → Asset 쓰기

**Files:** Modify `backend/src/services/floor.service.ts`

- [ ] **Step 1: load-current-state 를 Asset 기준으로**

`bulkUpdatePlan`(현재 ~line 507)의 Step 0 로드를:
- `tx.equipment.findMany({ where: { floorId: id } })` → `tx.asset.findMany({ where: { floorId: id, parentAssetId: null } })`
- `tx.rackModule.findMany({ where: { rack: { floorId: id } } })` → `tx.asset.findMany({ where: { parent: { floorId: id } } })`
- `tx.distributionCircuit.findMany({ where: { distribution: { floorId: id } } })` → `where: { distribution: { floorId: id } }` (관계가 Asset 이지만 floorId 보유하므로 동일)
- 케이블 where 의 `sourceModule: { rack: { floorId } }` → `sourceModule: { parent: { floorId: id } }`.

- [ ] **Step 2: equipment CREATE 분기를 Asset 생성으로**

기존 `tx.equipment.create({ data: { floorId, kind, ... width2d, height2d ... } })` (CREATE 분기, ~line 694)를:
```typescript
const created = await tx.asset.create({
  data: {
    substationId: floorSubstationId, // 아래 Step 5에서 확보
    assetTypeId: await resolveAssetTypeIdByPlacement(tx, equip.kind), // helper, 아래
    name: equip.name,
    floorId: id,
    positionX: equip.positionX,
    positionY: equip.positionY,
    width2d: equip.width,
    height2d: equip.height,
    rotation: equip.rotation ?? 0,
    totalU: equip.kind === 'RACK' ? equip.totalU ?? 42 : null,
    description: equip.description,
    manager: equip.manager,
    installDate: equip.installDate ? new Date(equip.installDate) : null,
    attributes: equip.properties as Prisma.InputJsonValue | undefined,
    createdById: userId,
    updatedById: userId,
  },
});
if (equip.tempId) equipmentIdMap[equip.tempId] = created.id;
if (equip.id && equip.id !== created.id) equipmentIdMap[equip.id] = created.id;
```
UPDATE 분기도 `tx.asset.update` 로, width→width2d 등 매핑.

- [ ] **Step 3: rackModule CREATE 분기를 child Asset 생성으로**

카테고리 검증을 AssetType 으로: `tx.rackModuleCategory.findUnique` → `tx.assetType.findUnique({ where: { id: mod.categoryId } })`. CREATE(~line 812):
```typescript
const created = await tx.asset.create({
  data: {
    substationId: floorSubstationId,
    assetTypeId: mod.categoryId,         // 이제 AssetType id
    name: mod.name,
    parentAssetId: rackAssetId,          // 부모 랙 Asset (tempId 해소된 id)
    slotIndex: mod.slotIndex,
    slotSpan: mod.slotSpan,
    installDate: mod.installDate ? new Date(mod.installDate) : null,
    manager: mod.manager ?? null,
    description: mod.description ?? null,
    attributes: (mod.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    sortOrder: mod.sortOrder ?? 0,
    createdById: userId,
    updatedById: userId,
  },
});
if (mod.tempId) rackModuleIdMap[mod.tempId] = created.id;
if (mod.id && mod.id !== created.id) rackModuleIdMap[mod.id] = created.id;
```
부모 랙 검증(`tx.equipment.findUnique ... kind===RACK`)을 `tx.asset.findUnique({ where:{id: rackAssetId}, include:{assetType:true} })` 후 `assetType.placementKind === 'RACK'` 로. 슬롯 충돌 검사 로직(assertSlotValid/assertNoSlotCollision/liveByRack)은 그대로 재사용.

- [ ] **Step 4: 케이블 엔드포인트 — kind 조회를 Asset 으로**

`getEquipmentKind(id)` 헬퍼가 `prisma.equipment.findUnique(...kind)` 를 쓰면, `prisma.asset.findUnique({ where:{id}, include:{assetType:true} })` 후 `placementKindToKind(assetType.placementKind)` 반환으로 교체. 엔드포인트 해소(3맵)·검증(정확히 하나·직결 금지·OFD fiberPath·중복포트)은 그대로. 케이블 create 의 6칼럼은 그대로(이제 FK가 Asset).

- [ ] **Step 5: floor 의 substationId 확보 + assetType 해소 헬퍼**

`bulkUpdatePlan` 시작부에서 floor 로드 시 substationId 확보:
```typescript
const floorRow = await tx.floor.findUniqueOrThrow({ where: { id }, select: { substationId: true } });
const floorSubstationId = floorRow.substationId;
```
그리고 placement kind → AssetType id 해소 헬퍼(트랜잭션 내, 캐시):
```typescript
const typeCache = new Map<string, string>();
async function resolveAssetTypeIdByPlacement(kind: string): Promise<string> {
  const code = kindToPlacementCode(kind as PlacementKind);
  if (typeCache.has(code)) return typeCache.get(code)!;
  const t = await tx.assetType.findUniqueOrThrow({ where: { code }, select: { id: true } });
  typeCache.set(code, t.id);
  return t.id;
}
```
(`floor.substationId` 가 nullable 이면 NotNull 가정을 확인하고, null 일 경우 ValidationError.)

- [ ] **Step 6: 감사 스냅샷/구조변경 검출이 equipment 형태를 참조하면 Asset 으로 매핑**

`captureFloorSnapshot`/구조변경 비교가 `kind`/`width2d` 등 구 형태를 읽으면 getPlan 의 매퍼(assetToPlanEquipment)를 재사용하도록 조정. 스냅샷 형태는 계약(plan)과 동일해야 함.

- [ ] **Step 7: 빌드(이 파일까지) + 계약테스트(아직 다른 서비스 미repoint면 import 에러 가능 → Task 8~13 후 일괄 검증)**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "floor.service" | head`
Expected: floor.service 자체 에러 없음(다른 서비스 에러는 이후 태스크에서 해소).

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/floor.service.ts
git commit -m "refactor(plan): bulkUpdatePlan 을 Asset 쓰기로 전환"
```

---

## Task 8: rackModule.service → Asset

**Files:** Modify `backend/src/services/rackModule.service.ts`

- [ ] **Step 1: 모든 prisma.rackModule / prisma.equipment / rackModuleCategory 참조를 Asset/AssetType 으로**

- `getByRackId`: 부모 랙을 `prisma.asset.findUnique({ where:{id}, include:{assetType:true} })` 로 로드 후 `assetType.placementKind==='RACK'` 검증. 모듈 조회 `prisma.rackModule.findMany({ where:{ rackEquipmentId } })` → `prisma.asset.findMany({ where:{ parentAssetId: rackId }, include:{ assetType:true }, orderBy:[{slotIndex:'asc'},{createdAt:'asc'}] })`. 매핑은 `assetToRackModule`(Task 4) 사용.
- 개별 CRUD(create/update/delete/slot 이동)도 Asset 으로. categoryId→assetTypeId. 슬롯 검증 로직 유지.

- [ ] **Step 2: 타입체크(이 파일)**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "rackModule.service" | head` — 에러 없어야 함.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/rackModule.service.ts
git commit -m "refactor(rack): rackModule.service 를 Asset 기반으로"
```

---

## Task 9: equipment.service → Asset

**Files:** Modify `backend/src/services/equipment.service.ts`

- [ ] **Step 1: prisma.equipment / EquipmentKind 참조를 Asset/placementKind 로 교체**

Equipment CRUD·OFD 유일성·kind 기반 로직을 Asset(placement 있는 top-level)으로. kind 비교는 `assetType.placementKind` 로. 이 서비스의 엔드포인트(`/equipment/*`)가 프론트에서 호출되면 계약 형태를 어댑터(assetToPlanEquipment 류)로 보존. 호출되지 않는 메서드는 최소 컴파일만 맞추고 2b 정리 대상으로 둔다.

- [ ] **Step 2: 타입체크(이 파일) + Commit**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "equipment.service" | head` — 에러 없어야 함.
```bash
git add backend/src/services/equipment.service.ts
git commit -m "refactor(equipment): equipment.service 를 Asset 기반으로"
```

---

## Task 10: cable / port / fiberPath / distributionCircuit 서비스 → Asset

**Files:** Modify `backend/src/services/cable.service.ts`, `port.service.ts`, `fiberPath.service.ts`, `distributionCircuit.service.ts`

- [ ] **Step 1: 각 서비스의 prisma.equipment / kind 참조를 Asset/placementKind 로**

- `cable.service.ts`: 엔드포인트 kind 검증(RACK→모듈/DIST→회로/OFD→fiberPath)을 Asset.assetType.placementKind 로. 엔드포인트 resolve 는 모듈/회로가 Asset/Circuit 이므로 그대로.
- `port.service.ts`: OFD equipment 조회 → Asset(placementKind 'OFD') 조회. `equipmentId` 칼럼 유지.
- `fiberPath.service.ts`: ofdA/ofdB 가 OFD 인지 검증 → Asset placementKind 'OFD'. `ofdAId/ofdBId` 칼럼 유지.
- `distributionCircuit.service.ts`: `getByDistributionId` 의 `distributionEquipmentId` where 유지(관계만 Asset). 부모가 DIST 인지 검증 시 Asset placementKind 'DIST'.

- [ ] **Step 2: 타입체크(이 4파일) + Commit**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "cable.service|port.service|fiberPath.service|distributionCircuit.service" | head`
Expected: 에러 없음.
```bash
git add backend/src/services/cable.service.ts backend/src/services/port.service.ts backend/src/services/fiberPath.service.ts backend/src/services/distributionCircuit.service.ts
git commit -m "refactor(cable/port/fiber/circuit): Asset 기반으로"
```

---

## Task 11: photo / log / stats / preset / category 서비스 → Asset

**Files:** Modify `backend/src/services/equipmentPhoto.service.ts`, `maintenanceLog.service.ts`, `rackModuleStats.service.ts`, `rackPreset.service.ts`, `rackModuleCategory.service.ts`

- [ ] **Step 1: 각 서비스 repoint**

- `equipmentPhoto.service.ts` / `maintenanceLog.service.ts`: `prisma.equipment` 존재 검증 → `prisma.asset`. `equipmentId` 칼럼 유지.
- `rackModuleStats.service.ts`: `prisma.rackModule` 집계 → `prisma.asset`(parentAssetId not null). EquipmentKind 필터 → placementKind.
- `rackPreset.service.ts`: RackModuleCategory 참조 → AssetType. preset modules 의 categoryCode → assetTypeCode.
- `rackModuleCategory.service.ts`: 이제 AssetType 위임. 이 서비스/라우트가 프론트에서 `/rack-module-categories` 로 호출되면, AssetType(placementKind=null=모듈) 목록을 기존 RackModuleCategory DTO 형태로 어댑트해 반환(categoryCode/displayColor/defaultSlotSpan). 호출 안 되면 최소 컴파일.

- [ ] **Step 2: 타입체크(이 5파일) + Commit**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "equipmentPhoto|maintenanceLog|rackModuleStats|rackPreset|rackModuleCategory" | head`
Expected: 에러 없음.
```bash
git add backend/src/services/equipmentPhoto.service.ts backend/src/services/maintenanceLog.service.ts backend/src/services/rackModuleStats.service.ts backend/src/services/rackPreset.service.ts backend/src/services/rackModuleCategory.service.ts
git commit -m "refactor(photo/log/stats/preset/category): Asset/AssetType 기반으로"
```

---

## Task 12: 컨트롤러/라우트 잔여 참조 정리

**Files:** Modify `backend/src/controllers/equipment.controller.ts` 및 빌드가 가리키는 잔여 파일

- [ ] **Step 1: 전체 빌드로 잔여 에러 수집**

Run: `cd backend && npm run build 2>&1 | grep -E "error TS" | head -40`
남은 에러(컨트롤러/라우트의 EquipmentKind import, 타입 불일치 등)를 하나씩 Asset/placementKind 로 정리. import 되지 않는 심볼 제거.

- [ ] **Step 2: 빌드 녹색까지 반복**

Run: `cd backend && npm run build`
Expected: tsc exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src
git commit -m "refactor(asset): 컨트롤러/라우트 잔여 Equipment 참조 정리, 빌드 녹색"
```

> 주의: 이 commit 은 backend/src 전체를 add 한다. 이 시점 backend/src 의 변경은 전부 이 마이그레이션 소속이어야 한다(무관한 src 변경이 작업트리에 없음을 `git status backend/src` 로 먼저 확인).

---

## Task 13: 계약테스트 + 전체 백엔드 테스트 (마이그레이션 검증)

**Files:** Modify `backend/tests/floorPlan.roundtrip.integration.test.ts` (fixture 한 줄), 그 외 검증

- [ ] **Step 0: 계약테스트의 fixture 취득 라인을 AssetType 으로 교체**

`rack_module_categories` 테이블이 삭제됐으므로, beforeAll 의 카테고리 fixture 라인을 모듈형 AssetType 으로 바꾼다(계약 it 본문은 그대로):
```typescript
// 변경 전: const cat = await prisma.rackModuleCategory.findFirstOrThrow({ where: { isActive: true } });
const cat = await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } });
rackCatId = cat.id;
```
이제 `rackModules` 입력의 `categoryId` 와 GET /rack-modules 응답의 `categoryId` 는 AssetType id 로 일치한다.

- [ ] **Step 1: 시드 재실행(스키마 바뀜)**

Run: `cd backend && npm run db:seed`
Expected: 성공(AssetType 시드, rackPresets 등).

- [ ] **Step 2: 라운드트립 계약테스트 — 마이그레이션 후에도 통과**

Run: `cd backend && npx vitest run tests/floorPlan.roundtrip.integration.test.ts`
Expected: PASS(변경 전과 동일). 실패하면 floor.service/매퍼를 수정해 계약을 정확히 복원(테스트는 계약이므로 바꾸지 않는다).

- [ ] **Step 3: Asset 저장 정확성 직접 검증**

Run(라운드트립이 만든 자산을 즉석 확인하는 1회용 스크립트):
```bash
cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const placed=await p.asset.count({where:{floorId:{not:null},parentAssetId:null}});const mods=await p.asset.count({where:{parentAssetId:{not:null}}});console.log('placed',placed,'modules',mods);await p.\$disconnect();})()"
```
Expected: 라운드트립 테스트 정리 후라면 0/0 이어도 무방 — 핵심은 테스트 PASS. (테스트 afterAll 이 floor cascade 로 정리함.)

- [ ] **Step 4: 1단계 자산 테스트 + 통합테스트 재확인**

Run: `cd backend && npx vitest run tests/assetType.service.test.ts tests/asset.service.test.ts tests/asset.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: Commit (fixture 라인 교체 + 보정)**

```bash
git add backend/tests/floorPlan.roundtrip.integration.test.ts backend/src backend/prisma
git commit -m "fix(asset): 계약테스트 fixture를 AssetType으로, floor.service 보정"
```

---

## Task 14: 프론트 무수정 검증 (계약 보존 확인)

**Files:** (프론트 코드 변경 없음)

- [ ] **Step 1: 프론트 타입체크 + 번들**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: tsc exit 0, `✓ built`. (프론트는 바뀐 게 없으니 당연히 통과해야 함 — 통과 못 하면 누군가 프론트를 건드린 것.)

- [ ] **Step 2: 수동 스모크 (dev 서버)**

기존에 떠 있는 stale 컨테이너(포트 3000)를 쓰지 말고, dev 서버로 검증:
```bash
# 사용자에게 안내: 별도 터미널에서
npm run dev
```
브라우저(http://twin.local:8080 또는 dev 프론트 URL)에서:
1. 트리 → 변전소 → 층 더블클릭 → 에디터 진입(GET plan 동작)
2. 설비(랙/OFD) 배치 → 저장(PUT plan) → 새로고침 후 유지
3. 랙 클릭 → 모듈 추가/편집 → 저장 → 유지
4. 케이블 그리기(모듈→OFD 포트) → 저장 → 경로추적 표시
5. **핵심**: 방금 배치한 설비가 1단계 변전소 현황 표(`/substations/:id/assets`)에 자산으로 나타나는지 확인
모두 이전과 동일하게 동작해야 한다.

- [ ] **Step 3: 검증 결과 기록**

스모크 결과를 보고한다(통과 항목/이상). 코드 변경 없음 — 커밋 없음.

---

## Task 15: 완료 정리

- [ ] **Step 1: 전체 diff 점검**

Run: `cd /Users/jsk/1210/digital && git log --oneline main..HEAD | cat` (feature 브랜치에서 실행 시) 또는 작업 커밋 범위 확인. backend 만 바뀌고 frontend 는 무변경인지 확인:
```bash
git diff --stat <base>..HEAD -- frontend | cat   # 비어 있어야 함
```

- [ ] **Step 2: finishing-a-development-branch 스킬로 마무리**

(컨트롤러가 처리)

---

## 완료 기준 (스펙 §10 대응)

- [ ] Equipment/RackModule 테이블 삭제, 도면 설비·랙 모듈이 Asset 행으로 저장 (Task 5·7·13)
- [ ] 프론트 무수정으로 에디터 동작 동일 (Task 14: tsc/vite + 수동 스모크 + 라운드트립 계약테스트 Task 13)
- [ ] 도면 배치 설비가 1단계 현황 표에 나타남 (Task 14 Step 2-5)
- [ ] 3개 idMap 이 asset/circuit realId, 폴리모픽 케이블 계약 보존 (Task 1·13 계약테스트)
- [ ] 1단계 자산 테스트 + 라운드트립 계약테스트 모두 통과 (Task 13)

## 2b 예고 (다음 spec/plan)
- plan 계약을 asset 기반(단일 assetIdMap, source/target=assetId)으로 변경, 케이블 엔드포인트 단일 assetId collapse, 칼럼명 assetId 로 개명.
- 프론트 ~200지점 그룹 이전(타입→cableTracer→network→피커→패널→fiber→overlay→resolvers), 어댑터·미사용 엔드포인트·옛 타입 제거.
- 미배치 자산을 도면에 끌어다 놓는 배치 UX.
