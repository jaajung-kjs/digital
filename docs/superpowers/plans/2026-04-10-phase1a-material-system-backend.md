# Phase 1-A: 자재 체계 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MaterialCategory(63종) + Material(on-demand) + 기존 테이블 확장(Equipment/Cable/FloorPlanElement/Room/Rack에 자재 연결 컬럼 추가) + REST API 구축

**Architecture:** Prisma migration으로 신규 테이블 생성 + 기존 테이블에 nullable 컬럼 추가. 기존 enum(CableType, EquipmentCategory) 유지하며 새 materialCategoryId를 병행. 시드 데이터로 63종 카테고리 + specTemplate JSON 삽입. REST API로 카테고리 조회 + Material on-demand resolve 제공.

**Tech Stack:** Prisma ORM, PostgreSQL, Express, Zod, Vitest, TypeScript (ESM)

**참조 문서:**
- `docs/공사설계_시스템_설계서.md` — 전체 아키텍처
- `docs/케이블_DB.md` — 케이블 16종 상세
- `docs/설비_DB.md` — 설비 13종 상세
- `docs/부속자재_DB.md` — 부속자재 9+25종 상세

---

## File Structure

### 신규 파일

| 파일 | 책임 |
|------|------|
| `backend/prisma/migrations/20260410_add_material_system/migration.sql` | Prisma가 자동 생성 |
| `backend/prisma/seed/materialCategories.ts` | 63종 카테고리 + specTemplate 시드 데이터 |
| `backend/prisma/seed/materialAliases.ts` | 별명/동의어 시드 데이터 |
| `backend/src/services/materialCategory.service.ts` | MaterialCategory CRUD |
| `backend/src/services/material.service.ts` | Material on-demand resolve |
| `backend/src/controllers/materialCategory.controller.ts` | HTTP 핸들러 |
| `backend/src/controllers/material.controller.ts` | HTTP 핸들러 |
| `backend/src/routes/materialCategories.routes.ts` | 라우트 + Zod 스키마 |
| `backend/src/routes/materials.routes.ts` | 라우트 + Zod 스키마 |
| `backend/tests/materialCategory.service.test.ts` | 서비스 단위 테스트 |
| `backend/tests/material.service.test.ts` | 서비스 단위 테스트 |
| `backend/tests/materialCategory.integration.test.ts` | API 통합 테스트 |
| `backend/tests/material.integration.test.ts` | API 통합 테스트 |

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `backend/prisma/schema.prisma` | 신규 모델 3개 + 기존 모델 확장 |
| `backend/prisma/seed.ts` | materialCategories 시드 import + 실행 |
| `backend/src/index.ts` | 새 라우터 마운트 2개 |

---

## API Contract

### MaterialCategory API

```
GET  /api/material-categories
     Query: ?type=CABLE|EQUIPMENT|ACCESSORY
            &parentId=<uuid>|null  (null이면 최상위만)
     Response: 200
     [
       {
         "id": "uuid",
         "code": "CBL-UTP",
         "name": "UTP/S-FTP케이블",
         "categoryType": "CABLE",
         "parentId": null,
         "displayColor": "#3b82f6",
         "iconName": "cable-utp",
         "unit": "m",
         "specTemplate": {
           "params": [
             { "key": "shield", "label": "차폐", "inputType": "select", "options": ["UTP", "S-FTP"] },
             { "key": "cat", "label": "카테고리", "inputType": "select", "options": ["5E", "6", "6A"] },
             { "key": "pairs", "label": "페어수(P)", "inputType": "select", "options": [4, 25] }
           ],
           "format": "{shield} CAT.{cat} {pairs}P"
         },
         "sortOrder": 4,
         "isActive": true,
         "children": []  // parentId=null로 조회 시 children 포함
       }
     ]

GET  /api/material-categories/:id
     Response: 200  (단건, children + aliases 포함)

GET  /api/material-categories/by-type/:type
     type: CABLE | EQUIPMENT | ACCESSORY
     Response: 200  (해당 타입 전체, 계층 구조 포함)
```

### Material API

```
POST /api/materials/resolve
     Body: {
       "categoryId": "uuid",        // MaterialCategory ID
       "specParams": { "cat": "6", "pairs": 4, "shield": "UTP" }
     }
     Response: 200
     {
       "id": "uuid",
       "categoryId": "uuid",
       "code": "CBL-UTP-001",
       "name": "UTP CAT.6 4P",
       "specification": "UTP CAT.6 4P",
       "unit": "m",
       "properties": { "cat": "6", "pairs": 4, "shield": "UTP" },
       "isActive": true,
       "created": false  // true면 신규 생성, false면 기존 재사용
     }
     Notes: specification은 specTemplate.format에 params를 적용하여 생성.
            동일 specification이 존재하면 재사용, 없으면 생성.

GET  /api/materials?categoryId=<uuid>
     Response: 200  (해당 카테고리의 Material 목록)
```

### 기존 테이블 확장 (API 변경 없음, 스키마만 추가)

기존 Equipment/Cable/FloorPlanElement API의 create/update 시 새 필드를 **선택적으로** 받을 수 있도록 Zod 스키마 확장. 기존 동작에 영향 없음 (모두 nullable).

---

## Tasks

### Task 1: Prisma 스키마 — 신규 모델 추가

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma에 MaterialCategoryType enum + MaterialCategory 모델 추가**

```prisma
// ==================== 자재 체계 ====================

enum MaterialCategoryType {
  CABLE
  EQUIPMENT
  ACCESSORY
}

model MaterialCategory {
  id           String               @id @default(uuid())
  code         String               @unique @db.VarChar(30)
  name         String               @db.VarChar(100)
  categoryType MaterialCategoryType @map("category_type")
  parentId     String?              @map("parent_id")
  description  String?              @db.Text
  displayColor String?              @map("display_color") @db.VarChar(7)
  iconName     String?              @map("icon_name") @db.VarChar(30)
  unit         String?              @db.VarChar(20)
  specTemplate Json?                @map("spec_template")
  sortOrder    Int                  @default(0) @map("sort_order")
  isActive     Boolean              @default(true) @map("is_active")
  createdAt    DateTime             @default(now()) @map("created_at")
  updatedAt    DateTime             @updatedAt @map("updated_at")

  parent   MaterialCategory?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children MaterialCategory[] @relation("CategoryHierarchy")
  materials Material[]
  aliases  MaterialAlias[]

  @@map("material_categories")
}

model MaterialAlias {
  id         String   @id @default(uuid())
  categoryId String   @map("category_id")
  aliasName  String   @unique @db.VarChar(200)
  source     String?  @db.VarChar(50)
  createdAt  DateTime @default(now()) @map("created_at")

  category MaterialCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@map("material_aliases")
}

model Material {
  id            String   @id @default(uuid())
  categoryId    String   @map("category_id")
  code          String   @unique @db.VarChar(50)
  name          String   @db.VarChar(200)
  specification String   @db.VarChar(200)
  unit          String   @db.VarChar(20)
  properties    Json?
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  category MaterialCategory @relation(fields: [categoryId], references: [id])

  @@unique([categoryId, specification])
  @@map("materials")
}
```

- [ ] **Step 2: 기존 모델에 자재 연결 컬럼 추가**

Room에 추가:
```prisma
scaleRatio         Float?   @map("scale_ratio")
asBuiltSnapshotId  String?  @map("as_built_snapshot_id")
```

Equipment에 추가:
```prisma
materialCategoryId  String?  @map("material_category_id")
materialId          String?  @map("material_id")
specParams          Json?    @map("spec_params")
```

Cable에 추가:
```prisma
materialCategoryId  String?  @map("material_category_id")
materialId          String?  @map("material_id")
specParams          Json?    @map("spec_params")
pathLength          Float?   @map("path_length")
bufferLength        Float    @default(4) @map("buffer_length")
totalLength         Float?   @map("total_length")
```

FloorPlanElement에 추가:
```prisma
materialCategoryId  String?  @map("material_category_id")
materialId          String?  @map("material_id")
specParams          Json?    @map("spec_params")
pathLength          Float?   @map("path_length")
```

Rack에 추가:
```prisma
hasSeismicBrace     Boolean  @default(false) @map("has_seismic_brace")
seismicMaterialId   String?  @map("seismic_material_id")
seismicSpecParams   Json?    @map("seismic_spec_params")
```

**주의:** Equipment, Cable, FloorPlanElement에 MaterialCategory, Material relation도 추가해야 함. MaterialCategory 모델에도 역방향 relation 추가 필요.

Equipment relation 추가:
```prisma
materialCategory MaterialCategory? @relation("EquipmentMaterialCategory", fields: [materialCategoryId], references: [id])
material         Material?         @relation("EquipmentMaterial", fields: [materialId], references: [id])
```

Cable relation 추가:
```prisma
materialCategory MaterialCategory? @relation("CableMaterialCategory", fields: [materialCategoryId], references: [id])
material         Material?         @relation("CableMaterial", fields: [materialId], references: [id])
```

FloorPlanElement relation 추가:
```prisma
materialCategory MaterialCategory? @relation("ElementMaterialCategory", fields: [materialCategoryId], references: [id])
material         Material?         @relation("ElementMaterial", fields: [materialId], references: [id])
```

MaterialCategory에 역방향 relation 추가:
```prisma
cables     Cable[]            @relation("CableMaterialCategory")
equipment  Equipment[]        @relation("EquipmentMaterialCategory")
elements   FloorPlanElement[] @relation("ElementMaterialCategory")
```

Material에 역방향 relation 추가:
```prisma
cables     Cable[]            @relation("CableMaterial")
equipment  Equipment[]        @relation("EquipmentMaterial")
elements   FloorPlanElement[] @relation("ElementMaterial")
```

- [ ] **Step 3: 마이그레이션 실행**

```bash
cd backend && npx prisma migrate dev --name add_material_system
```

- [ ] **Step 4: Prisma Client 재생성 확인**

```bash
cd backend && npx prisma generate
```

- [ ] **Step 5: 기존 테스트가 깨지지 않는지 확인**

```bash
cd backend && npm run test
```

- [ ] **Step 6: 커밋**

```bash
git add backend/prisma/
git commit -m "feat: add material system schema — MaterialCategory, Material, MaterialAlias + extend existing models"
```

---

### Task 2: 시드 데이터 — 63종 MaterialCategory

**Files:**
- Create: `backend/prisma/seed/materialCategories.ts`
- Modify: `backend/prisma/seed.ts` (기존 seed.ts를 이동)

seed.ts를 seed/ 디렉토리로 이동하지 않고, 기존 seed.ts에서 새 시드 파일을 import하여 호출한다.

- [ ] **Step 1: `backend/prisma/seed/materialCategories.ts` 생성**

이 파일은 `seedMaterialCategories(prisma)` 함수를 export한다. 함수 내부에서:

1. 케이블 16종 (`CBL-FCV`, `CBL-FR`, `CBL-VCT`, `CBL-HIV`, `CBL-UTP`, `CBL-OPT`, `CBL-OPJ`, `CBL-OPT-B`, `CBL-IV`, `CBL-BARE`, `CBL-CVV`, `CBL-CPEV`, `CBL-PCM`, `CBL-COAX`, `CBL-CHAMP`, `CBL-SIG`)
2. 설비 13종 (`EQP-RTU`, `EQP-RACK`, `EQP-OFD`, `EQP-UPS`, `EQP-NET`, `EQP-SEC`, `EQP-PITR`, `EQP-SEIS`, `EQP-SURGE`, `EQP-BRK`, `EQP-SYNC`, `EQP-COOL`, `EQP-PDAS`)
3. 부속자재 Parent 9종 (`ACC-PIPE`, `ACC-CONN`, `ACC-TRAY`, `ACC-BOX`, `ACC-PIPE-FIT`, `ACC-SPLICE`, `ACC-BUILD`, `ACC-MISC`, `ACC-GND`)
4. 부속자재 Leaf 25종 (각 parent의 하위)

**각 레코드에 포함할 데이터:**
- `code`, `name`, `categoryType`, `parentId` (부속 하위만), `displayColor`, `iconName`, `unit`, `specTemplate` (JSON), `sortOrder`
- specTemplate 값은 `docs/스키마_리팩토링_계획.md` §3에 정의된 것을 그대로 사용 — 해당 문서는 삭제되었으므로 `docs/케이블_DB.md`, `docs/설비_DB.md`, `docs/부속자재_DB.md`와 `docs/공사설계_시스템_설계서.md`를 참조

**upsert 사용:** `code`를 기준으로 upsert하여 반복 실행 가능하게.

**데이터 규모:** 63건의 upsert이므로 하드코딩 배열로 충분. 파일이 길어지지만 단순 반복이므로 문제없음.

**specTemplate 예시 (CBL-UTP):**
```typescript
{
  code: 'CBL-UTP',
  name: 'UTP/S-FTP케이블',
  categoryType: 'CABLE' as const,
  displayColor: '#3b82f6',
  iconName: 'cable-utp',
  unit: 'm',
  sortOrder: 4,
  specTemplate: {
    params: [
      { key: 'shield', label: '차폐', inputType: 'select', options: ['UTP', 'S-FTP'] },
      { key: 'cat', label: '카테고리', inputType: 'select', options: ['5E', '6', '6A'] },
      { key: 'pairs', label: '페어수(P)', inputType: 'select', options: [4, 25] },
    ],
    format: '{shield} CAT.{cat} {pairs}P',
  },
}
```

- [ ] **Step 2: `backend/prisma/seed.ts` 수정 — materialCategories 시드 호출 추가**

기존 seed.ts의 `main()` 함수 끝에 추가:
```typescript
import { seedMaterialCategories } from './seed/materialCategories.js';

// main() 함수 내, headquarters 시드 후:
await seedMaterialCategories(prisma);
```

- [ ] **Step 3: 시드 실행 확인**

```bash
cd backend && npm run db:seed
```

63건이 정상 upsert되는지 확인.

- [ ] **Step 4: DB에서 데이터 검증**

```bash
cd backend && npx prisma studio
```

material_categories 테이블에서:
- CABLE 타입 16건
- EQUIPMENT 타입 13건
- ACCESSORY 타입 34건 (parent 9 + leaf 25)
- 부속자재 leaf의 parentId가 올바르게 연결되었는지

- [ ] **Step 5: 커밋**

```bash
git add backend/prisma/seed/
git add backend/prisma/seed.ts
git commit -m "feat: add material category seed data — 63 categories with specTemplates"
```

---

### Task 3: MaterialCategory 서비스 + 라우트

**Files:**
- Create: `backend/src/services/materialCategory.service.ts`
- Create: `backend/src/controllers/materialCategory.controller.ts`
- Create: `backend/src/routes/materialCategories.routes.ts`
- Create: `backend/tests/materialCategory.service.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: 단위 테스트 작성 — `backend/tests/materialCategory.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { materialCategoryService } from '../src/services/materialCategory.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    materialCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('MaterialCategoryService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getAll', () => {
    it('should return all active categories', async () => {
      const mock = [{ id: '1', code: 'CBL-UTP', name: 'UTP', isActive: true }];
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue(mock as any);
      const result = await materialCategoryService.getAll();
      expect(result).toEqual(mock);
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });

    it('should filter by categoryType', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ type: 'CABLE' });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, categoryType: 'CABLE' } })
      );
    });

    it('should filter by parentId', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ parentId: 'parent-1' });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, parentId: 'parent-1' } })
      );
    });

    it('should filter top-level when parentId is null', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ parentId: null });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, parentId: null } })
      );
    });
  });

  describe('getById', () => {
    it('should return category with children and aliases', async () => {
      const mock = { id: '1', code: 'ACC-PIPE', children: [], aliases: [] };
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mock as any);
      const result = await materialCategoryService.getById('1');
      expect(result).toEqual(mock);
    });

    it('should throw NotFoundError if not exists', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(null);
      await expect(materialCategoryService.getById('nope')).rejects.toThrow('찾을 수 없습니다');
    });
  });

  describe('getByType', () => {
    it('should return categories with hierarchy for ACCESSORY type', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getByType('ACCESSORY');
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, categoryType: 'ACCESSORY', parentId: null },
          include: expect.objectContaining({ children: expect.anything() }),
        })
      );
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && npx vitest run tests/materialCategory.service.test.ts
```

Expected: FAIL (service 파일 없음)

- [ ] **Step 3: 서비스 구현 — `backend/src/services/materialCategory.service.ts`**

```typescript
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import type { MaterialCategoryType } from '@prisma/client';

interface GetAllFilters {
  type?: MaterialCategoryType;
  parentId?: string | null;
}

class MaterialCategoryService {
  async getAll(filters?: GetAllFilters) {
    const where: any = { isActive: true };
    if (filters?.type) where.categoryType = filters.type;
    if (filters && 'parentId' in filters) where.parentId = filters.parentId;

    return prisma.materialCategory.findMany({
      where,
      include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getById(id: string) {
    const category = await prisma.materialCategory.findUnique({
      where: { id },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        aliases: { orderBy: { aliasName: 'asc' } },
      },
    });
    if (!category) throw new NotFoundError('자재 카테고리');
    return category;
  }

  async getByType(type: MaterialCategoryType) {
    return prisma.materialCategory.findMany({
      where: { isActive: true, categoryType: type, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }
}

export const materialCategoryService = new MaterialCategoryService();
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && npx vitest run tests/materialCategory.service.test.ts
```

Expected: PASS

- [ ] **Step 5: 컨트롤러 구현 — `backend/src/controllers/materialCategory.controller.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { materialCategoryService } from '../services/materialCategory.service.js';
import type { MaterialCategoryType } from '@prisma/client';

class MaterialCategoryController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, parentId } = req.query;
      const filters: any = {};
      if (type) filters.type = type as MaterialCategoryType;
      if (parentId === 'null') filters.parentId = null;
      else if (parentId) filters.parentId = parentId as string;

      const categories = await materialCategoryService.getAll(
        Object.keys(filters).length > 0 ? filters : undefined
      );
      res.json(categories);
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await materialCategoryService.getById(req.params.id);
      res.json(category);
    } catch (err) { next(err); }
  }

  async getByType(req: Request, res: Response, next: NextFunction) {
    try {
      const type = req.params.type.toUpperCase() as MaterialCategoryType;
      const categories = await materialCategoryService.getByType(type);
      res.json(categories);
    } catch (err) { next(err); }
  }
}

export const materialCategoryController = new MaterialCategoryController();
```

- [ ] **Step 6: 라우트 구현 — `backend/src/routes/materialCategories.routes.ts`**

```typescript
import { Router } from 'express';
import { materialCategoryController } from '../controllers/materialCategory.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', materialCategoryController.getAll);
router.get('/by-type/:type', materialCategoryController.getByType);
router.get('/:id', materialCategoryController.getById);

export const materialCategoriesRouter = router;
```

- [ ] **Step 7: `backend/src/index.ts`에 라우트 마운트**

import 추가:
```typescript
import { materialCategoriesRouter } from './routes/materialCategories.routes.js';
```

라우트 마운트 추가 (fiberPathsRouter 아래):
```typescript
app.use('/api/material-categories', materialCategoriesRouter);
```

- [ ] **Step 8: 빌드 확인**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 9: 커밋**

```bash
git add backend/src/services/materialCategory.service.ts backend/src/controllers/materialCategory.controller.ts backend/src/routes/materialCategories.routes.ts backend/tests/materialCategory.service.test.ts backend/src/index.ts
git commit -m "feat: add MaterialCategory service, controller, routes with unit tests"
```

---

### Task 4: Material 서비스 + 라우트 (on-demand resolve)

**Files:**
- Create: `backend/src/services/material.service.ts`
- Create: `backend/src/controllers/material.controller.ts`
- Create: `backend/src/routes/materials.routes.ts`
- Create: `backend/tests/material.service.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: 단위 테스트 작성 — `backend/tests/material.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { materialService } from '../src/services/material.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError, ValidationError } from '../src/utils/errors.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    materialCategory: { findUnique: vi.fn() },
    material: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  },
}));

describe('MaterialService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const mockCategory = {
    id: 'cat-1',
    code: 'CBL-UTP',
    name: 'UTP/S-FTP케이블',
    unit: 'm',
    specTemplate: {
      params: [
        { key: 'shield', label: '차폐', inputType: 'select', options: ['UTP', 'S-FTP'] },
        { key: 'cat', label: '카테고리', inputType: 'select', options: ['5E', '6', '6A'] },
        { key: 'pairs', label: '페어수(P)', inputType: 'select', options: [4, 25] },
      ],
      format: '{shield} CAT.{cat} {pairs}P',
    },
  };

  describe('resolve', () => {
    it('should return existing material if specification matches', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mockCategory as any);
      const existing = { id: 'mat-1', specification: 'UTP CAT.6 4P' };
      vi.mocked(prisma.material.findFirst).mockResolvedValue(existing as any);

      const result = await materialService.resolve('cat-1', { shield: 'UTP', cat: '6', pairs: 4 });
      expect(result).toEqual({ ...existing, created: false });
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('should create new material if specification not found', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.material.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.material.count).mockResolvedValue(5);
      const created = { id: 'mat-new', specification: 'UTP CAT.6A 4P', code: 'CBL-UTP-006' };
      vi.mocked(prisma.material.create).mockResolvedValue(created as any);

      const result = await materialService.resolve('cat-1', { shield: 'UTP', cat: '6A', pairs: 4 });
      expect(result).toEqual({ ...created, created: true });
      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: 'cat-1',
          specification: 'UTP CAT.6A 4P',
          name: 'UTP CAT.6A 4P',
          unit: 'm',
        }),
      });
    });

    it('should throw NotFoundError if category not found', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(null);
      await expect(materialService.resolve('nope', {})).rejects.toThrow('찾을 수 없습니다');
    });

    it('should throw ValidationError if category has no specTemplate', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(
        { ...mockCategory, specTemplate: null } as any
      );
      await expect(materialService.resolve('cat-1', {})).rejects.toThrow();
    });
  });

  describe('getByCategoryId', () => {
    it('should return materials for a category', async () => {
      const mats = [{ id: '1' }, { id: '2' }];
      vi.mocked(prisma.material.findMany).mockResolvedValue(mats as any);
      const result = await materialService.getByCategoryId('cat-1');
      expect(result).toEqual(mats);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && npx vitest run tests/material.service.test.ts
```

- [ ] **Step 3: 서비스 구현 — `backend/src/services/material.service.ts`**

```typescript
import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

interface SpecTemplate {
  params: { key: string; label: string; inputType: string; options?: (string | number)[] }[];
  format: string;
}

class MaterialService {
  async resolve(categoryId: string, specParams: Record<string, any>) {
    const category = await prisma.materialCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundError('자재 카테고리');

    const template = category.specTemplate as SpecTemplate | null;
    if (!template) throw new ValidationError('이 카테고리에는 specTemplate이 정의되어 있지 않습니다.');

    // format 문자열에 params 적용하여 specification 생성
    const specification = this.buildSpecification(template.format, specParams);

    // 기존 Material 조회
    const existing = await prisma.material.findFirst({
      where: { categoryId, specification },
    });

    if (existing) return { ...existing, created: false };

    // 신규 생성
    const count = await prisma.material.count({ where: { categoryId } });
    const code = `${category.code}-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.material.create({
      data: {
        categoryId,
        code,
        name: specification,
        specification,
        unit: category.unit || '개',
        properties: specParams,
      },
    });

    return { ...created, created: true };
  }

  async getByCategoryId(categoryId: string) {
    return prisma.material.findMany({
      where: { categoryId, isActive: true },
      orderBy: { specification: 'asc' },
    });
  }

  private buildSpecification(format: string, params: Record<string, any>): string {
    let result = format;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(`{${key}}`, String(value));
    }
    return result;
  }
}

export const materialService = new MaterialService();
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && npx vitest run tests/material.service.test.ts
```

- [ ] **Step 5: 컨트롤러 구현 — `backend/src/controllers/material.controller.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { materialService } from '../services/material.service.js';

class MaterialController {
  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, specParams } = req.body;
      const result = await materialService.resolve(categoryId, specParams);
      res.json(result);
    } catch (err) { next(err); }
  }

  async getByCategoryId(req: Request, res: Response, next: NextFunction) {
    try {
      const materials = await materialService.getByCategoryId(req.query.categoryId as string);
      res.json(materials);
    } catch (err) { next(err); }
  }
}

export const materialController = new MaterialController();
```

- [ ] **Step 6: 라우트 구현 — `backend/src/routes/materials.routes.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { materialController } from '../controllers/material.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

const resolveSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid(),
    specParams: z.record(z.union([z.string(), z.number()])),
  }),
});

router.post('/resolve', validate(resolveSchema), materialController.resolve);
router.get('/', materialController.getByCategoryId);

export const materialsRouter = router;
```

- [ ] **Step 7: `backend/src/index.ts`에 라우트 마운트**

import 추가:
```typescript
import { materialsRouter } from './routes/materials.routes.js';
```

라우트 마운트 추가:
```typescript
app.use('/api/materials', materialsRouter);
```

- [ ] **Step 8: 빌드 확인**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 9: 커밋**

```bash
git add backend/src/services/material.service.ts backend/src/controllers/material.controller.ts backend/src/routes/materials.routes.ts backend/tests/material.service.test.ts backend/src/index.ts
git commit -m "feat: add Material resolve service — on-demand material creation from specTemplate"
```

---

### Task 5: 통합 테스트

**Files:**
- Create: `backend/tests/materialCategory.integration.test.ts`
- Create: `backend/tests/material.integration.test.ts`

이 테스트들은 실제 DB가 필요. 기존 `backend/tests/*.integration.test.ts` 패턴을 따른다.

- [ ] **Step 1: 기존 통합 테스트 패턴 확인**

`backend/tests/equipment.integration.test.ts`의 setup/teardown 패턴을 읽고 동일하게 사용.

- [ ] **Step 2: MaterialCategory 통합 테스트 작성**

`backend/tests/materialCategory.integration.test.ts`:

- `GET /api/material-categories` — 전체 조회
- `GET /api/material-categories?type=CABLE` — 타입 필터
- `GET /api/material-categories?parentId=null` — 최상위만
- `GET /api/material-categories/by-type/CABLE` — 타입별 계층
- `GET /api/material-categories/:id` — 단건 (children + aliases 포함)
- `GET /api/material-categories/:id` — 404 (존재하지 않는 ID)
- 인증 없이 요청 → 401

- [ ] **Step 3: Material 통합 테스트 작성**

`backend/tests/material.integration.test.ts`:

- `POST /api/materials/resolve` — 신규 생성 (created: true)
- `POST /api/materials/resolve` — 동일 spec 재요청 시 기존 반환 (created: false)
- `POST /api/materials/resolve` — 존재하지 않는 categoryId → 404
- `GET /api/materials?categoryId=<id>` — 해당 카테고리 Material 목록

- [ ] **Step 4: 통합 테스트 실행**

```bash
cd backend && npx vitest run tests/materialCategory.integration.test.ts tests/material.integration.test.ts
```

- [ ] **Step 5: 전체 테스트 실행 (기존 테스트 포함)**

```bash
cd backend && npm run test
```

- [ ] **Step 6: 커밋**

```bash
git add backend/tests/materialCategory.integration.test.ts backend/tests/material.integration.test.ts
git commit -m "test: add integration tests for MaterialCategory and Material APIs"
```

---

## Verification Checklist

Phase 1-A 완료 조건:

- [ ] `material_categories` 테이블에 63건 존재 (CABLE 16 + EQUIPMENT 13 + ACCESSORY 34)
- [ ] 각 카테고리에 specTemplate JSON이 올바르게 저장됨
- [ ] `GET /api/material-categories?type=CABLE` → 16건 반환
- [ ] `GET /api/material-categories/by-type/ACCESSORY` → 부모 9건 + children 포함
- [ ] `POST /api/materials/resolve` → specification 생성 + Material on-demand 생성
- [ ] 동일 specParams 재요청 시 기존 Material 재사용 (created: false)
- [ ] Equipment, Cable, FloorPlanElement에 materialCategoryId 컬럼 존재 (nullable)
- [ ] Room에 scaleRatio 컬럼 존재
- [ ] Cable에 pathLength, bufferLength, totalLength 컬럼 존재
- [ ] Rack에 hasSeismicBrace 컬럼 존재
- [ ] 기존 테스트 전부 통과 (깨지지 않음)
- [ ] `npm run build` 성공
