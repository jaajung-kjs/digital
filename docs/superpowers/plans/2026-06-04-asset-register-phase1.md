# 자산 대장 토대 — 1단계 구현 계획 (Asset 모델 + 변전소 현황 표)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도면 없이 변전소 단위로 장비를 표(그리드)에 입력·열람할 수 있는 `Asset`/`AssetType` 레지스터를 **완전 가산(additive)** 으로 추가한다.

**Architecture:** 새 테이블 `asset_types`, `assets` 만 추가한다. 기존 `equipment`/`rack_modules`/`cables`/`maintenance_logs`/`equipment_photos` 는 1단계에서 **변경하지 않는다**(공존). `Asset` 은 자기참조 트리이며 도면 배치(`floorId`+좌표)·랙 실장(`slotIndex/Span`)·자산 속성(`attributes` JSON)을 모두 **선택 필드**로 갖는다. 생성 필수는 `substationId + assetTypeId + name` 셋뿐. 프론트는 `/substations/:id/assets` 경로에 인라인 편집 그리드를 추가한다.

**Tech Stack:** Backend — Express + Prisma + Zod + Vitest(+supertest). Frontend — React + Vite + React Query(@tanstack) + axios + Tailwind + Zustand + Vitest.

**설계 근거:** `docs/superpowers/specs/2026-06-04-asset-register-foundation-design.md`

**권한 주의(별도 결정):** 기존 관례를 따라 쓰기(POST/PUT/DELETE)는 `authenticate + adminOnly`, 읽기(GET)는 `authenticate`. 만약 현장 담당자가 VIEWER 역할이라면 입력이 막히므로 역할 정책 재검토가 필요하다 — 이는 1단계 범위 밖이며 별도로 다룬다. 통합 테스트는 `admin/admin123` 로 로그인한다.

---

## 파일 구조 (생성/수정)

**Backend**
- 수정: `backend/prisma/schema.prisma` — `AssetType`, `Asset` 모델 + `Substation`/`Floor`/`User` 역참조 추가
- 생성: `backend/prisma/migrations/<ts>_add_asset_register/migration.sql` (prisma migrate 자동 생성)
- 수정: `backend/prisma/seed.ts` — 자산 종류 시드 호출
- 생성: `backend/prisma/seeds/assetTypes.ts` — 시드 데이터 + 함수
- 생성: `backend/src/services/assetType.service.ts`
- 생성: `backend/src/services/asset.service.ts`
- 생성: `backend/src/controllers/assetType.controller.ts`
- 생성: `backend/src/controllers/asset.controller.ts`
- 생성: `backend/src/routes/assetTypes.routes.ts`
- 생성: `backend/src/routes/assets.routes.ts`
- 수정: `backend/src/index.ts` — 라우터 2개 등록
- 생성: `backend/tests/assetType.service.test.ts`
- 생성: `backend/tests/asset.service.test.ts`
- 생성: `backend/tests/asset.integration.test.ts`

**Frontend**
- 생성: `frontend/src/types/asset.ts`
- 생성: `frontend/src/services/assetApi.ts`
- 생성: `frontend/src/features/assets/columns.ts` (순수 헬퍼)
- 생성: `frontend/src/features/assets/columns.test.ts`
- 생성: `frontend/src/features/assets/hooks/useAssetTypes.ts`
- 생성: `frontend/src/features/assets/hooks/useSubstationAssets.ts`
- 생성: `frontend/src/features/assets/components/SubstationAssetGrid.tsx`
- 생성: `frontend/src/features/assets/components/AssetGridRow.tsx`
- 생성: `frontend/src/pages/SubstationAssetGridPage.tsx`
- 수정: `frontend/src/App.tsx` — 라우트 추가
- 수정: `frontend/src/components/tree/TreeVisualization.tsx` — 변전소 "현황 표" 진입 버튼

---

# Backend

## Task 1: Prisma 스키마 — AssetType / Asset 모델 추가 + 마이그레이션

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: 두 모델을 schema.prisma 끝부분에 추가**

`backend/prisma/schema.prisma` 파일 맨 끝에 추가:

```prisma
// ==================== 자산 레지스터 (1단계, 가산) ====================
// Asset = 대장 레코드(SSOT). 도면 배치/랙 실장/속성은 전부 선택 필드.
// 생성 필수: substationId + assetTypeId + name.

model AssetType {
  id               String   @id @default(uuid())
  code             String   @unique @db.VarChar(30)   // 'RACK','OFD','DIST','PITR','RTU','OPT-XPONDER','CHARGER','UPS','BATTERY' ...
  name             String   @db.VarChar(100)
  group            String?  @db.VarChar(20)            // 통신|전원|구조|공조
  isContainer      Boolean  @default(false) @map("is_container")
  fieldTemplate    Json?    @map("field_template")     // [{ key,label,type,required?,options?,group?,unit? }]
  requiredToCreate Json?    @map("required_to_create")  // 예: ["name"]
  iconName         String?  @map("icon_name") @db.VarChar(30)
  displayColor     String?  @map("display_color") @db.VarChar(7)
  sortOrder        Int      @default(0) @map("sort_order")
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  assets Asset[]

  @@map("asset_types")
}

model Asset {
  id            String    @id @default(uuid())
  substationId  String    @map("substation_id")
  assetTypeId   String    @map("asset_type_id")
  name          String    @db.VarChar(100)
  parentAssetId String?   @map("parent_asset_id")
  roomText      String?   @map("room_text") @db.VarChar(100)
  // 도면 배치 (선택, 1단계 UI 는 사용하지 않음 — 2단계 대비 컬럼만)
  floorId       String?   @map("floor_id")
  positionX     Float?    @map("position_x")
  positionY     Float?    @map("position_y")
  width2d       Float?    @map("width_2d")
  height2d      Float?    @map("height_2d")
  rotation      Int       @default(0)
  // 랙 실장 (선택)
  slotIndex     Int?      @map("slot_index")
  slotSpan      Int?      @map("slot_span")
  // 컨테이너 전용
  totalU        Int?      @map("total_u")
  // 자산 속성
  attributes    Json?
  // 공통 메타
  installDate   DateTime? @map("install_date") @db.Date
  manager       String?   @db.VarChar(100)
  description   String?   @db.Text
  status        String?   @db.VarChar(20)
  sortOrder     Int       @default(0) @map("sort_order")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  createdById   String?   @map("created_by")
  updatedById   String?   @map("updated_by")

  substation Substation @relation(fields: [substationId], references: [id], onDelete: Cascade)
  assetType  AssetType  @relation(fields: [assetTypeId], references: [id])
  parent     Asset?     @relation("AssetTree", fields: [parentAssetId], references: [id], onDelete: SetNull)
  children   Asset[]    @relation("AssetTree")
  floor      Floor?     @relation(fields: [floorId], references: [id], onDelete: SetNull)
  createdBy  User?      @relation("AssetCreatedBy", fields: [createdById], references: [id])
  updatedBy  User?      @relation("AssetUpdatedBy", fields: [updatedById], references: [id])

  @@index([substationId])
  @@index([parentAssetId])
  @@map("assets")
}
```

- [ ] **Step 2: 역참조 필드 추가**

`model Substation { ... }` 의 relations 영역에 한 줄 추가:
```prisma
  assets Asset[]
```
`model Floor { ... }` 의 relations 영역에 한 줄 추가:
```prisma
  assets Asset[]
```
`model User { ... }` 의 relations 영역에 두 줄 추가:
```prisma
  assetsCreated Asset[] @relation("AssetCreatedBy")
  assetsUpdated Asset[] @relation("AssetUpdatedBy")
```

- [ ] **Step 3: 마이그레이션 생성·적용**

Run:
```bash
cd backend && npx prisma migrate dev --name add_asset_register
```
Expected: `asset_types`, `assets` 테이블 생성 + `Migration applied`. Prisma Client 재생성됨.

- [ ] **Step 4: 스모크 테스트로 모델 접근 확인**

Run:
```bash
cd backend && npx prisma generate && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.assetType.count().then(c=>{console.log('assetType ok',c);return p.asset.count()}).then(c=>console.log('asset ok',c)).then(()=>p.\$disconnect())"
```
Expected: `assetType ok 0` / `asset ok 0` (에러 없이 출력).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(asset): asset_types/assets 테이블 추가 (1단계 가산)"
```

---

## Task 2: 자산 종류 시드

**Files:**
- Create: `backend/prisma/seeds/assetTypes.ts`
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: 시드 데이터 + upsert 함수 작성**

Create `backend/prisma/seeds/assetTypes.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'month' | 'select';
  required?: boolean;
  options?: string[];
  group?: string;
  unit?: string;
}

interface AssetTypeSeed {
  code: string;
  name: string;
  group: string;
  isContainer: boolean;
  displayColor: string;
  sortOrder: number;
  fieldTemplate: FieldDef[];
}

const ASSET_LIFECYCLE: FieldDef[] = [
  { key: 'model', label: '모델명', type: 'text' },
  { key: 'vendor', label: '제작사', type: 'text' },
  { key: 'mfgYm', label: '제작년월', type: 'month' },
  { key: 'serialNo', label: 'S/N', type: 'text' },
  { key: 'installYm', label: '설치년월', type: 'month' },
  { key: 'replacePlan', label: '교체예정', type: 'text' },
  { key: 'warrantyUntil', label: '하자보수기한', type: 'date' },
];

export const ASSET_TYPE_SEEDS: AssetTypeSeed[] = [
  { code: 'RACK', name: '랙', group: '구조', isContainer: true, displayColor: '#64748b', sortOrder: 10,
    fieldTemplate: [{ key: 'totalU', label: 'U수', type: 'number', unit: 'U' }] },
  { code: 'OFD', name: 'OFD(광분배함)', group: '통신', isContainer: true, displayColor: '#0ea5e9', sortOrder: 20,
    fieldTemplate: [{ key: 'portCount', label: '포트수', type: 'number' }] },
  { code: 'DIST', name: '분전반', group: '전원', isContainer: true, displayColor: '#f59e0b', sortOrder: 30,
    fieldTemplate: [] },
  { code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false, displayColor: '#6366f1', sortOrder: 40,
    fieldTemplate: [
      { key: 'tlName', label: 'T/L명', type: 'text' },
      { key: 'tlVoltage', label: 'T/L전압', type: 'text' },
      { key: 'typeCode', label: 'TYPE', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'RTU', name: 'SCADA RTU', group: '통신', isContainer: false, displayColor: '#8b5cf6', sortOrder: 50,
    fieldTemplate: [
      { key: 'hostOffice', label: '급전(분)소', type: 'text' },
      { key: 'voltage', label: '전압', type: 'text' },
      { key: 'kind', label: '종류', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'OPT-XPONDER', name: '광전송장치', group: '통신', isContainer: false, displayColor: '#06b6d4', sortOrder: 60,
    fieldTemplate: [
      { key: 'remote', label: '대국', type: 'text' },
      { key: 'topology', label: '구성형태', type: 'select', options: ['링', 'P-TO-P'] },
      { key: 'ringName', label: '링 명칭', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'CHARGER', name: '충전기', group: '전원', isContainer: false, displayColor: '#ef4444', sortOrder: 70,
    fieldTemplate: ASSET_LIFECYCLE },
  { code: 'UPS', name: 'UPS', group: '전원', isContainer: false, displayColor: '#f97316', sortOrder: 80,
    fieldTemplate: ASSET_LIFECYCLE },
  { code: 'BATTERY', name: '축전지', group: '전원', isContainer: false, displayColor: '#eab308', sortOrder: 90,
    fieldTemplate: ASSET_LIFECYCLE },
];

export async function seedAssetTypes(prisma: PrismaClient): Promise<void> {
  for (const t of ASSET_TYPE_SEEDS) {
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: {
        name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      },
      create: {
        code: t.code, name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      },
    });
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types`);
}
```

- [ ] **Step 2: seed.ts 에서 호출**

`backend/prisma/seed.ts` 상단 import 영역에 추가:
```typescript
import { seedAssetTypes } from './seeds/assetTypes.js';
```
`backend/prisma/seed.ts` 의 main 시드 함수 본문(다른 시드 호출들 사이)에 추가:
```typescript
  await seedAssetTypes(prisma);
```

- [ ] **Step 3: 시드 실행**

Run:
```bash
cd backend && npm run db:seed
```
Expected: 출력에 `✅ seeded 9 asset types` 포함.

- [ ] **Step 4: 확인**

Run:
```bash
cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.assetType.findMany({orderBy:{sortOrder:'asc'}}).then(r=>console.log(r.map(x=>x.code).join(','))).then(()=>p.\$disconnect())"
```
Expected: `RACK,OFD,DIST,PITR,RTU,OPT-XPONDER,CHARGER,UPS,BATTERY`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seeds/assetTypes.ts backend/prisma/seed.ts
git commit -m "feat(asset): 자산 종류 9종 시드"
```

---

## Task 3: assetType.service (읽기)

**Files:**
- Create: `backend/src/services/assetType.service.ts`
- Test: `backend/tests/assetType.service.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/assetType.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetTypeService } from '../src/services/assetType.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    assetType: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

describe('AssetTypeService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getAll 은 isActive 종류를 sortOrder 순으로 반환', async () => {
    const rows = [{ id: '1', code: 'RACK', name: '랙', isActive: true, sortOrder: 10 }];
    vi.mocked(prisma.assetType.findMany).mockResolvedValue(rows as any);
    const result = await assetTypeService.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('RACK');
    expect(prisma.assetType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('getById 는 없으면 NotFoundError', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null);
    await expect(assetTypeService.getById('nope')).rejects.toThrow('찾을 수 없습니다');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npm run test -- tests/assetType.service.test.ts`
Expected: FAIL — `Cannot find module '../src/services/assetType.service.js'`

- [ ] **Step 3: 서비스 구현**

Create `backend/src/services/assetType.service.ts`:
```typescript
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface AssetTypeDetail {
  id: string;
  code: string;
  name: string;
  group: string | null;
  isContainer: boolean;
  fieldTemplate: unknown | null;
  requiredToCreate: unknown | null;
  iconName: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
}

class AssetTypeService {
  private mapToDetail(t: {
    id: string; code: string; name: string; group: string | null;
    isContainer: boolean; fieldTemplate: unknown; requiredToCreate: unknown;
    iconName: string | null; displayColor: string | null; sortOrder: number; isActive: boolean;
  }): AssetTypeDetail {
    return {
      id: t.id, code: t.code, name: t.name, group: t.group,
      isContainer: t.isContainer, fieldTemplate: t.fieldTemplate ?? null,
      requiredToCreate: t.requiredToCreate ?? null, iconName: t.iconName,
      displayColor: t.displayColor, sortOrder: t.sortOrder, isActive: t.isActive,
    };
  }

  async getAll(): Promise<AssetTypeDetail[]> {
    const rows = await prisma.assetType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => this.mapToDetail(r));
  }

  async getById(id: string): Promise<AssetTypeDetail> {
    const row = await prisma.assetType.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('자산 종류');
    return this.mapToDetail(row);
  }
}

export const assetTypeService = new AssetTypeService();
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && npm run test -- tests/assetType.service.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assetType.service.ts backend/tests/assetType.service.test.ts
git commit -m "feat(asset): assetType 읽기 서비스 + 테스트"
```

---

## Task 4: asset.service (CRUD + 복제)

**Files:**
- Create: `backend/src/services/asset.service.ts`
- Test: `backend/tests/asset.service.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/asset.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetService } from '../src/services/asset.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    asset: {
      findMany: vi.fn(), findUnique: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
  },
}));

const typeRel = { id: 't1', code: 'PITR', name: '계통보호전송장치', group: '통신', displayColor: '#6366f1', fieldTemplate: [] };

describe('AssetService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 substation+type+name 으로 생성하고 audit 필드를 채운다', async () => {
    vi.mocked(prisma.asset.create).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
      parentAssetId: null, roomText: null, attributes: null, installDate: null,
      manager: null, description: null, status: null, sortOrder: 0,
      assetType: typeRel,
    } as any);
    const out = await assetService.create(
      { substationId: 's1', assetTypeId: 't1', name: 'PITR-1' }, 'u1',
    );
    expect(out.name).toBe('PITR-1');
    expect(out.assetType.code).toBe('PITR');
    const arg = vi.mocked(prisma.asset.create).mock.calls[0][0];
    expect((arg as any).data.createdById).toBe('u1');
    expect((arg as any).data.updatedById).toBe('u1');
  });

  it('listBySubstation 은 변전소 자산을 sortOrder 순으로 반환', async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
        parentAssetId: null, roomText: null, attributes: null, installDate: null,
        manager: null, description: null, status: null, sortOrder: 0, assetType: typeRel },
    ] as any);
    const out = await assetService.listBySubstation('s1');
    expect(out).toHaveLength(1);
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { substationId: 's1' } }),
    );
  });

  it('update 는 대상이 없으면 NotFoundError', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null);
    await expect(assetService.update('nope', { name: 'X' }, 'u1')).rejects.toThrow('찾을 수 없습니다');
  });

  it('duplicate 는 원본 필드를 복사하고 이름에 (복제)를 붙인다', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
      parentAssetId: null, roomText: 'ICT실', attributes: { model: 'X' },
      installDate: null, manager: null, description: null, status: null, sortOrder: 0,
    } as any);
    vi.mocked(prisma.asset.create).mockResolvedValue({
      id: 'a2', substationId: 's1', assetTypeId: 't1', name: 'PITR-1 (복제)',
      parentAssetId: null, roomText: 'ICT실', attributes: { model: 'X' },
      installDate: null, manager: null, description: null, status: null, sortOrder: 0, assetType: typeRel,
    } as any);
    const out = await assetService.duplicate('a1', 'u1');
    expect(out.name).toBe('PITR-1 (복제)');
    const arg = vi.mocked(prisma.asset.create).mock.calls[0][0];
    expect((arg as any).data.roomText).toBe('ICT실');
    expect((arg as any).data.attributes).toEqual({ model: 'X' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npm run test -- tests/asset.service.test.ts`
Expected: FAIL — `Cannot find module '../src/services/asset.service.js'`

- [ ] **Step 3: 서비스 구현**

Create `backend/src/services/asset.service.ts`:
```typescript
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export interface CreateAssetInput {
  substationId: string;
  assetTypeId: string;
  name: string;
  parentAssetId?: string | null;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  status?: string | null;
}

export interface UpdateAssetInput {
  assetTypeId?: string;
  name?: string;
  parentAssetId?: string | null;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  status?: string | null;
}

export interface AssetDetail {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: { id: string; code: string; name: string; group: string | null; displayColor: string | null; fieldTemplate: unknown | null };
  name: string;
  parentAssetId: string | null;
  roomText: string | null;
  attributes: Record<string, unknown> | null;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
}

const assetInclude = {
  assetType: {
    select: { id: true, code: true, name: true, group: true, displayColor: true, fieldTemplate: true },
  },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

class AssetService {
  private mapToDetail(a: AssetRow): AssetDetail {
    return {
      id: a.id, substationId: a.substationId, assetTypeId: a.assetTypeId,
      assetType: {
        id: a.assetType.id, code: a.assetType.code, name: a.assetType.name,
        group: a.assetType.group, displayColor: a.assetType.displayColor,
        fieldTemplate: a.assetType.fieldTemplate ?? null,
      },
      name: a.name, parentAssetId: a.parentAssetId, roomText: a.roomText,
      attributes: (a.attributes as Record<string, unknown> | null) ?? null,
      installDate: a.installDate, manager: a.manager, description: a.description,
      status: a.status, sortOrder: a.sortOrder,
    };
  }

  async listBySubstation(substationId: string): Promise<AssetDetail[]> {
    const rows = await prisma.asset.findMany({
      where: { substationId },
      include: assetInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.mapToDetail(r));
  }

  async getById(id: string): Promise<AssetDetail> {
    const row = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
    if (!row) throw new NotFoundError('자산');
    return this.mapToDetail(row);
  }

  async create(input: CreateAssetInput, userId: string): Promise<AssetDetail> {
    const row = await prisma.asset.create({
      data: {
        substationId: input.substationId,
        assetTypeId: input.assetTypeId,
        name: input.name,
        parentAssetId: input.parentAssetId ?? null,
        roomText: input.roomText ?? null,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager ?? null,
        description: input.description ?? null,
        status: input.status ?? null,
        createdById: userId,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }

  async update(id: string, input: UpdateAssetInput, userId: string): Promise<AssetDetail> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산');
    const row = await prisma.asset.update({
      where: { id },
      data: {
        assetTypeId: input.assetTypeId,
        name: input.name,
        parentAssetId: input.parentAssetId,
        roomText: input.roomText,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: input.installDate === undefined ? undefined : input.installDate ? new Date(input.installDate) : null,
        manager: input.manager,
        description: input.description,
        status: input.status,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('자산');
    await prisma.asset.delete({ where: { id } });
  }

  async duplicate(id: string, userId: string): Promise<AssetDetail> {
    const src = await prisma.asset.findUnique({ where: { id } });
    if (!src) throw new NotFoundError('자산');
    const row = await prisma.asset.create({
      data: {
        substationId: src.substationId,
        assetTypeId: src.assetTypeId,
        name: `${src.name} (복제)`,
        parentAssetId: src.parentAssetId,
        roomText: src.roomText,
        attributes: (src.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        installDate: src.installDate,
        manager: src.manager,
        description: src.description,
        status: src.status,
        createdById: userId,
        updatedById: userId,
      },
      include: assetInclude,
    });
    return this.mapToDetail(row);
  }
}

export const assetService = new AssetService();
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && npm run test -- tests/asset.service.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/asset.service.ts backend/tests/asset.service.test.ts
git commit -m "feat(asset): asset CRUD+복제 서비스 + 테스트"
```

---

## Task 5: 컨트롤러 + 라우트 + 등록

**Files:**
- Create: `backend/src/controllers/assetType.controller.ts`
- Create: `backend/src/controllers/asset.controller.ts`
- Create: `backend/src/routes/assetTypes.routes.ts`
- Create: `backend/src/routes/assets.routes.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: assetType 컨트롤러**

Create `backend/src/controllers/assetType.controller.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { assetTypeService } from '../services/assetType.service.js';

export const assetTypeController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetTypeService.getAll() });
    } catch (error) { next(error); }
  },
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetTypeService.getById(req.params.id) });
    } catch (error) { next(error); }
  },
};
```

- [ ] **Step 2: asset 컨트롤러**

Create `backend/src/controllers/asset.controller.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service.js';

export const assetController = {
  async listBySubstation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetService.listBySubstation(req.params.substationId) });
    } catch (error) { next(error); }
  },
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ data: await assetService.getById(req.params.id) });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.status(201).json({ data: await assetService.create(req.body, userId) });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.json({ data: await assetService.update(req.params.id, req.body, userId) });
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assetService.delete(req.params.id);
      res.json({ message: '자산이 삭제되었습니다.' });
    } catch (error) { next(error); }
  },
  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      res.status(201).json({ data: await assetService.duplicate(req.params.id, userId) });
    } catch (error) { next(error); }
  },
};
```

- [ ] **Step 3: assetTypes 라우트**

Create `backend/src/routes/assetTypes.routes.ts`:
```typescript
import { Router } from 'express';
import { assetTypeController } from '../controllers/assetType.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, assetTypeController.getAll);
router.get('/:id', authenticate, assetTypeController.getById);

export { router as assetTypesRouter };
```

- [ ] **Step 4: assets 라우트 (Zod 검증 포함)**

Create `backend/src/routes/assets.routes.ts`:
```typescript
import { Router } from 'express';
import { z } from 'zod';
import { assetController } from '../controllers/asset.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createAssetSchema = z.object({
  substationId: z.string().uuid(),
  assetTypeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  attributes: z.record(z.unknown()).optional().nullable(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

const updateAssetSchema = z.object({
  assetTypeId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  attributes: z.record(z.unknown()).optional().nullable(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

router.post('/', authenticate, adminOnly, validate(createAssetSchema), assetController.create);
router.get('/:id', authenticate, assetController.getById);
router.put('/:id', authenticate, adminOnly, validate(updateAssetSchema), assetController.update);
router.delete('/:id', authenticate, adminOnly, assetController.delete);
router.post('/:id/duplicate', authenticate, adminOnly, assetController.duplicate);

export { router as assetsRouter };
```

- [ ] **Step 5: 변전소-자산 목록 라우트 + 등록**

`backend/src/index.ts` 의 라우터 import 영역에 추가:
```typescript
import { assetTypesRouter } from './routes/assetTypes.routes.js';
import { assetsRouter } from './routes/assets.routes.js';
import { assetController } from './controllers/asset.controller.js';
import { authenticate as authForAssets } from './middleware/auth.js';
```
`backend/src/index.ts` 의 `app.use('/api/...')` 등록 영역에 추가:
```typescript
app.use('/api/asset-types', assetTypesRouter);
app.use('/api/assets', assetsRouter);
app.get('/api/substations/:substationId/assets', authForAssets, assetController.listBySubstation);
```
> 주의: `authenticate` 가 이미 index.ts 에 import 돼 있으면 별칭(authForAssets) 대신 기존 것을 쓰고 중복 import 를 제거한다.

- [ ] **Step 6: 타입체크/빌드 확인**

Run: `cd backend && npm run build`
Expected: tsc 에러 없이 완료.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/assetType.controller.ts backend/src/controllers/asset.controller.ts backend/src/routes/assetTypes.routes.ts backend/src/routes/assets.routes.ts backend/src/index.ts
git commit -m "feat(asset): asset/assetType 컨트롤러·라우트·등록"
```

---

## Task 6: 통합 테스트 (supertest, 실 DB)

**Files:**
- Create: `backend/tests/asset.integration.test.ts`

- [ ] **Step 1: 통합 테스트 작성**

Create `backend/tests/asset.integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { assetTypesRouter } from '../src/routes/assetTypes.routes.js';
import { assetController } from '../src/controllers/asset.controller.js';
import { authenticate } from '../src/middleware/auth.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('Asset API 통합 테스트', () => {
  let app: Express;
  let adminToken: string;
  let substationId: string;
  let pitrTypeId: string;
  let hqId: string;
  let branchId: string;
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/asset-types', assetTypesRouter);
    app.use('/api/assets', assetsRouter);
    app.get('/api/substations/:substationId/assets', authenticate, assetController.listBySubstation);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__test_hq__' } });
    hqId = hq.id;
    const branch = await prisma.branch.create({ data: { name: '__test_branch__', headquartersId: hq.id } });
    branchId = branch.id;
    const sub = await prisma.substation.create({ data: { name: '__test_sub__', branchId: branch.id } });
    substationId = sub.id;
    const pitr = await prisma.assetType.findUniqueOrThrow({ where: { code: 'PITR' } });
    pitrTypeId = pitr.id;
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    await prisma.substation.delete({ where: { id: substationId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('GET /api/asset-types 는 인증 시 시드된 종류를 반환', async () => {
    const res = await request(app).get('/api/asset-types').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.some((t: any) => t.code === 'PITR')).toBe(true);
  });

  it('GET /api/asset-types 는 인증 없이 401', async () => {
    await request(app).get('/api/asset-types').expect(401);
  });

  it('POST /api/assets 는 substation+type+name 만으로 생성', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId, name: 'PITR-통합-1' })
      .expect(201);
    expect(res.body.data.name).toBe('PITR-통합-1');
    expect(res.body.data.assetType.code).toBe('PITR');
    createdAssetIds.push(res.body.data.id);
  });

  it('POST /api/assets 는 name 누락 시 400', async () => {
    await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId })
      .expect(400);
  });

  it('GET /api/substations/:id/assets 는 생성한 자산을 목록에 포함', async () => {
    const res = await request(app)
      .get(`/api/substations/${substationId}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.some((a: any) => a.name === 'PITR-통합-1')).toBe(true);
  });

  it('POST /api/assets/:id/duplicate 는 (복제) 이름으로 복사', async () => {
    const base = await request(app)
      .post('/api/assets').set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId, name: 'PITR-원본' }).expect(201);
    createdAssetIds.push(base.body.data.id);
    const dup = await request(app)
      .post(`/api/assets/${base.body.data.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(dup.body.data.name).toBe('PITR-원본 (복제)');
    createdAssetIds.push(dup.body.data.id);
  });
});
```

- [ ] **Step 2: 실행 (실 DB 필요 — dev DB 가 떠 있어야 함)**

Run: `cd backend && npm run test -- tests/asset.integration.test.ts`
Expected: PASS (6 passed). DB 연결 안 되면 먼저 `docker compose -f docker-compose.dev.yml up -d` 후 재실행.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/asset.integration.test.ts
git commit -m "test(asset): asset API 통합 테스트"
```

---

# Frontend

## Task 7: 타입 정의

**Files:**
- Create: `frontend/src/types/asset.ts`

- [ ] **Step 1: 타입 작성**

Create `frontend/src/types/asset.ts`:
```typescript
export interface AssetFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'month' | 'select';
  required?: boolean;
  options?: string[];
  group?: string;
  unit?: string;
}

export interface AssetType {
  id: string;
  code: string;
  name: string;
  group: string | null;
  isContainer: boolean;
  fieldTemplate: AssetFieldDef[] | null;
  requiredToCreate: string[] | null;
  iconName: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Asset {
  id: string;
  substationId: string;
  assetTypeId: string;
  assetType: {
    id: string;
    code: string;
    name: string;
    group: string | null;
    displayColor: string | null;
    fieldTemplate: AssetFieldDef[] | null;
  };
  name: string;
  parentAssetId: string | null;
  roomText: string | null;
  attributes: Record<string, unknown> | null;
  installDate: string | null;
  manager: string | null;
  description: string | null;
  status: string | null;
  sortOrder: number;
}

export interface CreateAssetInput {
  substationId: string;
  assetTypeId: string;
  name: string;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface UpdateAssetInput {
  assetTypeId?: string;
  name?: string;
  roomText?: string | null;
  attributes?: Record<string, unknown> | null;
}
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/asset.ts
git commit -m "feat(asset): 프론트 asset 타입"
```

---

## Task 8: API 모듈

**Files:**
- Create: `frontend/src/services/assetApi.ts`

- [ ] **Step 1: API 모듈 작성**

Create `frontend/src/services/assetApi.ts`:
```typescript
import { api } from '../utils/api';
import type { Asset, AssetType, CreateAssetInput, UpdateAssetInput } from '../types/asset';

export const assetApi = {
  listTypes: async (): Promise<AssetType[]> => {
    const { data } = await api.get<{ data: AssetType[] }>('/asset-types');
    return data.data;
  },
  listBySubstation: async (substationId: string): Promise<Asset[]> => {
    const { data } = await api.get<{ data: Asset[] }>(`/substations/${substationId}/assets`);
    return data.data;
  },
  create: async (payload: CreateAssetInput): Promise<Asset> => {
    const { data } = await api.post<{ data: Asset }>('/assets', payload);
    return data.data;
  },
  update: async (id: string, payload: UpdateAssetInput): Promise<Asset> => {
    const { data } = await api.put<{ data: Asset }>(`/assets/${id}`, payload);
    return data.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/assets/${id}`);
  },
  duplicate: async (id: string): Promise<Asset> => {
    const { data } = await api.post<{ data: Asset }>(`/assets/${id}/duplicate`, {});
    return data.data;
  },
};
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 에러 없음.
```bash
git add frontend/src/services/assetApi.ts
git commit -m "feat(asset): assetApi 클라이언트"
```

---

## Task 9: 컬럼 헬퍼 (순수 로직, TDD)

**Files:**
- Create: `frontend/src/features/assets/columns.ts`
- Test: `frontend/src/features/assets/columns.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `frontend/src/features/assets/columns.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildColumns, attrValue } from './columns';
import type { AssetType } from '../../types/asset';

const pitr: AssetType = {
  id: 't1', code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false,
  fieldTemplate: [
    { key: 'tlName', label: 'T/L명', type: 'text' },
    { key: 'model', label: '모델명', type: 'text' },
  ],
  requiredToCreate: ['name'], iconName: null, displayColor: '#000', sortOrder: 40, isActive: true,
};

describe('buildColumns', () => {
  it('항상 이름 컬럼을 먼저 둔다', () => {
    const cols = buildColumns([pitr]);
    expect(cols[0]).toEqual({ key: 'name', label: '이름', kind: 'name' });
  });

  it('표시된 종류들의 fieldTemplate 필드를 중복 없이 컬럼으로 만든다', () => {
    const cols = buildColumns([pitr]);
    const keys = cols.map((c) => c.key);
    expect(keys).toContain('tlName');
    expect(keys).toContain('model');
  });

  it('여러 종류의 같은 key 는 한 번만 나온다', () => {
    const rtu: AssetType = { ...pitr, id: 't2', code: 'RTU',
      fieldTemplate: [{ key: 'model', label: '모델명', type: 'text' }] };
    const cols = buildColumns([pitr, rtu]);
    expect(cols.filter((c) => c.key === 'model')).toHaveLength(1);
  });

  it('attrValue 는 attributes 에서 값을 읽고 없으면 빈 문자열', () => {
    expect(attrValue({ model: 'CT-1000' }, 'model')).toBe('CT-1000');
    expect(attrValue({ model: 'CT-1000' }, 'vendor')).toBe('');
    expect(attrValue(null, 'model')).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm run test -- src/features/assets/columns.test.ts`
Expected: FAIL — `Cannot find module './columns'`

- [ ] **Step 3: 구현**

Create `frontend/src/features/assets/columns.ts`:
```typescript
import type { AssetType } from '../../types/asset';

export interface GridColumn {
  key: string;
  label: string;
  kind: 'name' | 'attr';
}

/** 표시할 종류들의 fieldTemplate 을 합쳐 그리드 컬럼을 만든다. 이름 컬럼이 항상 맨 앞. */
export function buildColumns(types: AssetType[]): GridColumn[] {
  const cols: GridColumn[] = [{ key: 'name', label: '이름', kind: 'name' }];
  const seen = new Set<string>();
  for (const t of types) {
    for (const f of t.fieldTemplate ?? []) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      cols.push({ key: f.key, label: f.label, kind: 'attr' });
    }
  }
  return cols;
}

/** attributes 에서 key 의 표시 문자열을 읽는다. */
export function attrValue(attributes: Record<string, unknown> | null, key: string): string {
  const v = attributes?.[key];
  return v === null || v === undefined ? '' : String(v);
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `cd frontend && npm run test -- src/features/assets/columns.test.ts`
Expected: PASS (4 passed)
```bash
git add frontend/src/features/assets/columns.ts frontend/src/features/assets/columns.test.ts
git commit -m "feat(asset): 그리드 컬럼 빌더 + 테스트"
```

---

## Task 10: React Query 훅

**Files:**
- Create: `frontend/src/features/assets/hooks/useAssetTypes.ts`
- Create: `frontend/src/features/assets/hooks/useSubstationAssets.ts`

- [ ] **Step 1: useAssetTypes 작성**

Create `frontend/src/features/assets/hooks/useAssetTypes.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';

const ASSET_TYPE_KEYS = { all: ['asset-types'] as const };

export function useAssetTypes() {
  return useQuery({
    queryKey: ASSET_TYPE_KEYS.all,
    queryFn: () => assetApi.listTypes(),
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: useSubstationAssets (목록 + 변경 뮤테이션) 작성**

Create `frontend/src/features/assets/hooks/useSubstationAssets.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import type { CreateAssetInput, UpdateAssetInput } from '../../../types/asset';

const ASSET_KEYS = {
  all: ['assets'] as const,
  bySubstation: (substationId: string) => [...ASSET_KEYS.all, substationId] as const,
};

export function useSubstationAssets(substationId: string) {
  return useQuery({
    queryKey: ASSET_KEYS.bySubstation(substationId),
    queryFn: () => assetApi.listBySubstation(substationId),
    enabled: !!substationId,
  });
}

export function useCreateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssetInput) => assetApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useUpdateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateAssetInput & { id: string }) => assetApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useDeleteAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useDuplicateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}
```

- [ ] **Step 3: 타입체크 + Commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 에러 없음.
```bash
git add frontend/src/features/assets/hooks
git commit -m "feat(asset): assetType/asset React Query 훅"
```

---

## Task 11: 그리드 행 컴포넌트

**Files:**
- Create: `frontend/src/features/assets/components/AssetGridRow.tsx`

- [ ] **Step 1: 행 컴포넌트 작성 (인라인 편집: 이름 + 속성 셀, blur 시 저장)**

Create `frontend/src/features/assets/components/AssetGridRow.tsx`:
```typescript
import { useState } from 'react';
import type { Asset } from '../../../types/asset';
import type { GridColumn } from '../columns';
import { attrValue } from '../columns';

interface Props {
  asset: Asset;
  columns: GridColumn[];
  onCommit: (id: string, patch: { name?: string; attributes?: Record<string, unknown> }) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AssetGridRow({ asset, columns, onCommit, onDuplicate, onDelete }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const cellValue = (col: GridColumn): string => {
    if (col.key in draft) return draft[col.key];
    if (col.kind === 'name') return asset.name;
    return attrValue(asset.attributes, col.key);
  };

  const commitCell = (col: GridColumn) => {
    if (!(col.key in draft)) return;
    const value = draft[col.key];
    if (col.kind === 'name') {
      if (value.trim() && value !== asset.name) onCommit(asset.id, { name: value.trim() });
    } else {
      const nextAttrs = { ...(asset.attributes ?? {}), [col.key]: value };
      onCommit(asset.id, { attributes: nextAttrs });
    }
    setDraft((d) => { const n = { ...d }; delete n[col.key]; return n; });
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-2 py-1 text-xs text-gray-500 whitespace-nowrap">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
          style={{ backgroundColor: asset.assetType.displayColor ?? '#94a3b8' }}
        />
        {asset.assetType.name}
      </td>
      {columns.map((col) => (
        <td key={col.key} className="px-1 py-0.5">
          <input
            className="w-full px-1 py-0.5 text-sm bg-transparent border border-transparent rounded hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none"
            value={cellValue(col)}
            onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
            onBlur={() => commitCell(col)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </td>
      ))}
      <td className="px-2 py-1 whitespace-nowrap text-right">
        <button onClick={() => onDuplicate(asset.id)} className="text-xs text-gray-400 hover:text-blue-600 mr-2" title="복제">⧉</button>
        <button onClick={() => onDelete(asset.id)} className="text-xs text-gray-400 hover:text-red-600" title="삭제">✕</button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 에러 없음.
```bash
git add frontend/src/features/assets/components/AssetGridRow.tsx
git commit -m "feat(asset): 자산 그리드 행(인라인 편집)"
```

---

## Task 12: 그리드 컨테이너 + 행 추가

**Files:**
- Create: `frontend/src/features/assets/components/SubstationAssetGrid.tsx`

- [ ] **Step 1: 그리드 작성 (종류 필터, 행 추가, 컬럼 빌드)**

Create `frontend/src/features/assets/components/SubstationAssetGrid.tsx`:
```typescript
import { useMemo, useState } from 'react';
import { useAssetTypes } from '../hooks/useAssetTypes';
import {
  useSubstationAssets, useCreateAsset, useUpdateAsset, useDeleteAsset, useDuplicateAsset,
} from '../hooks/useSubstationAssets';
import { buildColumns } from '../columns';
import { AssetGridRow } from './AssetGridRow';

interface Props { substationId: string }

export function SubstationAssetGrid({ substationId }: Props) {
  const { data: types = [] } = useAssetTypes();
  const { data: assets = [], isLoading } = useSubstationAssets(substationId);
  const createAsset = useCreateAsset(substationId);
  const updateAsset = useUpdateAsset(substationId);
  const deleteAsset = useDeleteAsset(substationId);
  const duplicateAsset = useDuplicateAsset(substationId);

  const [filterTypeId, setFilterTypeId] = useState<string>('');
  const [newTypeId, setNewTypeId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');

  const visible = useMemo(
    () => (filterTypeId ? assets.filter((a) => a.assetTypeId === filterTypeId) : assets),
    [assets, filterTypeId],
  );

  // 컬럼은 "현재 보이는 자산들의 종류" 기준으로 구성
  const columns = useMemo(() => {
    const usedTypeIds = new Set(visible.map((a) => a.assetTypeId));
    const usedTypes = types.filter((t) => usedTypeIds.has(t.id));
    return buildColumns(usedTypes.length ? usedTypes : []);
  }, [visible, types]);

  const handleAdd = () => {
    if (!newTypeId || !newName.trim()) return;
    createAsset.mutate(
      { substationId, assetTypeId: newTypeId, name: newName.trim() },
      { onSuccess: () => setNewName('') },
    );
  };

  return (
    <div className="p-4">
      {/* 필터 + 추가 바 */}
      <div className="flex items-center gap-2 mb-3">
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
        >
          <option value="">전체 종류</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <div className="flex-1" />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={newTypeId}
          onChange={(e) => setNewTypeId(e.target.value)}
        >
          <option value="">종류 선택</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1"
          placeholder="이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          onClick={handleAdd}
          disabled={!newTypeId || !newName.trim() || createAsset.isPending}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300"
        >+ 추가</button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400">아직 등록된 자산이 없습니다. 위에서 종류를 고르고 이름을 입력해 추가하세요.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 text-left">
              <th className="px-2 py-1 text-xs font-semibold text-gray-500">종류</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-xs font-semibold text-gray-500">{c.label}</th>
              ))}
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <AssetGridRow
                key={a.id}
                asset={a}
                columns={columns}
                onCommit={(id, patch) => updateAsset.mutate({ id, ...patch })}
                onDuplicate={(id) => duplicateAsset.mutate(id)}
                onDelete={(id) => { if (confirm('이 자산을 삭제할까요?')) deleteAsset.mutate(id); }}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 에러 없음.
```bash
git add frontend/src/features/assets/components/SubstationAssetGrid.tsx
git commit -m "feat(asset): 변전소 현황 표 그리드(필터·추가)"
```

---

## Task 13: 페이지 + 라우트

**Files:**
- Create: `frontend/src/pages/SubstationAssetGridPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 페이지 컴포넌트**

Create `frontend/src/pages/SubstationAssetGridPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';

export function SubstationAssetGridPage() {
  const { substationId } = useParams<{ substationId: string }>();
  const navigate = useNavigate();
  if (!substationId) return null;
  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200">
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-800">← 트리로</button>
        <h1 className="text-base font-semibold text-gray-900">변전소 현황 표</h1>
      </header>
      <div className="flex-1 overflow-auto">
        <SubstationAssetGrid substationId={substationId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 라우트 추가**

`frontend/src/App.tsx` 의 import 영역에 추가:
```typescript
import { SubstationAssetGridPage } from './pages/SubstationAssetGridPage';
```
`frontend/src/App.tsx` 의 `/floors/:floorId/plan` 라우트 바로 아래(같은 레벨)에 추가:
```typescript
      <Route
        path="/substations/:substationId/assets"
        element={
          <ProtectedRoute>
            <SubstationAssetGridPage />
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 3: 타입체크/빌드 + Commit**

Run: `cd frontend && npm run build`
Expected: tsc + vite build 성공.
```bash
git add frontend/src/pages/SubstationAssetGridPage.tsx frontend/src/App.tsx
git commit -m "feat(asset): 변전소 현황 표 페이지 + 라우트"
```

---

## Task 14: 트리에서 진입 버튼

**Files:**
- Modify: `frontend/src/components/tree/TreeVisualization.tsx`

- [ ] **Step 1: 파일을 읽어 변전소 카드/노드가 렌더링되는 위치를 찾는다**

Run: `cd frontend && grep -n "substation\|navigate\|type ===" src/components/tree/TreeVisualization.tsx | head -40`
목표: 변전소 노드 카드가 그려지는 JSX 와 `navigate` 가 이미 import 되어 있는지 확인.

- [ ] **Step 2: 진입 버튼 추가**

`TreeVisualization.tsx` 에서, 현재 보고 있는 노드(viewingNode)가 변전소일 때 헤더/브레드크럼 영역에 버튼을 추가한다. `navigate` 가 이미 있으면 재사용한다. 변전소 노드 식별이 `node.type === 'substation'` 인 지점에 아래 버튼을 삽입:
```tsx
{node.type === 'substation' && (
  <button
    onClick={(e) => { e.stopPropagation(); navigate(`/substations/${node.id}/assets`); }}
    className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
    title="이 변전소의 자산을 표로 보기"
  >
    현황 표
  </button>
)}
```
> `navigate` 가 없으면 상단에 `import { useNavigate } from 'react-router-dom';` 추가 후 컴포넌트 내부에서 `const navigate = useNavigate();` 선언.

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 성공.

- [ ] **Step 4: 수동 확인 (dev 서버)**

Run: `npm run dev` (루트). 브라우저에서 트리 → 변전소 선택 → "현황 표" 클릭 → `/substations/:id/assets` 진입. 종류 선택 + 이름 입력 + 추가 → 행 생성. 셀 인라인 편집 후 blur → 저장(새로고침해도 유지). 복제/삭제 동작 확인.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tree/TreeVisualization.tsx
git commit -m "feat(asset): 트리에서 변전소 현황 표 진입 버튼"
```

---

## 완료 기준 (스펙 §9 대응)

- [ ] 도면·좌표 없이 `변전소+종류+이름` 으로 자산 생성 (Task 6 통합 테스트 + Task 14 수동)
- [ ] 배치 없는 자산이 변전소 현황 표에 나타남 (Task 12·14)
- [ ] `AssetType.fieldTemplate` 필드가 그리드 열로 렌더링되고 `attributes` 에 저장됨 (Task 9·11·12)
- [ ] 종류만 골라 행 추가 + 복제로 반복 입력 (Task 12·14)
- [ ] 기존 도면 에디터 회귀 없음 — 1단계는 가산이라 기존 테이블 미변경 (전 backend 빌드/기존 테스트 통과로 확인: `cd backend && npm run test` 및 `cd frontend && npm run build`)

## 2·3단계 예고 (별도 계획)
- **2단계:** 도면 에디터·working-copy 를 Asset 위로 이전(배치=Asset 속성), Equipment/RackModule 점진 대체. editor 36파일.
- **3단계:** 케이블/광경로/회선 엔드포인트를 `assetId` 로 통합, Equipment/RackModule 최종 제거, MaintenanceLog/Photo 를 Asset 으로 재연결.
