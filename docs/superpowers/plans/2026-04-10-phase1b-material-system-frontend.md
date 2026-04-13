# Phase 1-B: 자재 체계 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설비/케이블 생성 시 기존 enum 선택을 MaterialCategory 기반 자재 선택으로 교체. 최근사용/프리셋 제공. 기존 enum은 데이터 호환을 위해 유지하되 UI에서는 MaterialCategory가 primary.

**Architecture:** MaterialCategory API 기반 react-query hooks + 재사용 MaterialPicker 컴포넌트. 설비/케이블 생성 모달에서 종류→규격 2단계 선택. 저장 시 materialCategoryId + specParams를 기존 bulkUpdatePlan payload에 추가. 기존 category/cableType 필드도 MaterialCategory→enum 자동 매핑으로 함께 전송 (하위호환).

**Tech Stack:** React 18, Zustand 5, @tanstack/react-query 5, TypeScript, Tailwind CSS

**API Contract (Backend와 공유):**
```
GET  /api/material-categories?type=CABLE|EQUIPMENT|ACCESSORY
GET  /api/material-categories/by-type/:type
GET  /api/material-categories/:id
POST /api/materials/resolve  { categoryId, specParams }
GET  /api/materials?categoryId=<uuid>
```

---

## File Structure

### 신규 파일

| 파일 | 책임 |
|------|------|
| `frontend/src/types/material.ts` | MaterialCategory, Material 타입 + enum 매핑 |
| `frontend/src/features/materials/hooks/useMaterialCategories.ts` | react-query hooks |
| `frontend/src/features/materials/components/MaterialPicker.tsx` | 종류→규격 2단계 선택 컴포넌트 (재사용) |
| `frontend/src/features/materials/components/CableMaterialPicker.tsx` | 케이블 전용 자재 선택 (MaterialPicker 래핑) |
| `frontend/src/features/materials/stores/recentMaterialsStore.ts` | 최근 사용 자재 (localStorage 영속화) |

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/types/floorPlan.ts` | FloorPlanEquipment에 materialCategoryId, materialId, specParams 추가 |
| `frontend/src/types/connection.ts` | RoomConnection에 materialCategoryId, materialId, specParams 추가 |
| `frontend/src/features/editor/components/FloorPlanEditor.tsx` | 설비 생성 모달 → MaterialPicker 교체 |
| `frontend/src/features/editor/stores/canvasStore.ts` | newEquipmentCategory → materialCategory 상태 교체 |
| `frontend/src/features/editor/stores/editorStore.ts` | ChangeEntry cable:create에 materialCategoryId 추가 |
| `frontend/src/features/editor/hooks/useFloorPlanData.ts` | 저장 payload에 materialCategoryId 포함 |
| `frontend/src/features/equipment/components/ConnectionDiagram.tsx` | 케이블 타입 선택 → CableMaterialPicker 교체 |
| `frontend/src/features/connections/stores/connectionCreationStore.ts` | cableType → materialCategory 상태 교체 |
| `frontend/src/features/editor/hooks/useCanvasEvents.ts` | 케이블 생성 시 materialCategoryId 전달 |
| `frontend/src/features/equipment/types/equipment.ts` | CATEGORY_LABELS를 MaterialCategory 기반으로 확장 |

---

## enum ↔ MaterialCategory 매핑

하위호환을 위해 MaterialCategory 선택 시 기존 enum 값을 자동 매핑한다.

**설비:**
```typescript
const MATERIAL_TO_EQUIPMENT_CATEGORY: Record<string, EquipmentCategory> = {
  'EQP-RTU': 'SERVER',
  'EQP-RACK': 'OTHER',
  'EQP-OFD': 'OFD',
  'EQP-UPS': 'UPS',
  'EQP-NET': 'NETWORK',
  'EQP-SEC': 'SECURITY',
  'EQP-PITR': 'SERVER',
  'EQP-SEIS': 'OTHER',
  'EQP-SURGE': 'OTHER',
  'EQP-BRK': 'DISTRIBUTION_BOARD',
  'EQP-SYNC': 'SERVER',
  'EQP-COOL': 'OTHER',
  'EQP-PDAS': 'OTHER',
};
```

**케이블:**
```typescript
const MATERIAL_TO_CABLE_TYPE: Record<string, CableType> = {
  'CBL-FCV': 'AC', 'CBL-FR': 'AC', 'CBL-VCT': 'AC', 'CBL-HIV': 'AC',
  'CBL-UTP': 'LAN',
  'CBL-OPT': 'FIBER', 'CBL-OPJ': 'FIBER', 'CBL-OPT-B': 'FIBER',
  'CBL-IV': 'GROUND', 'CBL-BARE': 'GROUND',
  'CBL-CVV': 'DC', 'CBL-CPEV': 'LAN', 'CBL-PCM': 'LAN',
  'CBL-COAX': 'LAN', 'CBL-CHAMP': 'LAN', 'CBL-SIG': 'DC',
};
```

---

## Tasks

### Task 1: 타입 정의 + API Hooks

**Files:**
- Create: `frontend/src/types/material.ts`
- Create: `frontend/src/features/materials/hooks/useMaterialCategories.ts`

- [ ] **Step 1: `frontend/src/types/material.ts` 생성**

```typescript
import type { EquipmentCategory, CableType } from './enums';

// ── API 응답 타입 ──

export interface SpecParam {
  key: string;
  label: string;
  inputType: 'select' | 'number' | 'text';
  options?: (string | number)[];
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

export interface SpecTemplate {
  params: SpecParam[];
  format: string;
}

export type MaterialCategoryType = 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';

export interface MaterialCategory {
  id: string;
  code: string;
  name: string;
  categoryType: MaterialCategoryType;
  parentId: string | null;
  displayColor: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
  children?: MaterialCategory[];
}

export interface Material {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  specification: string;
  unit: string;
  properties: Record<string, any> | null;
  isActive: boolean;
  created?: boolean; // resolve 응답에서만
}

// ── enum 매핑 ──

export const MATERIAL_TO_EQUIPMENT_CATEGORY: Record<string, EquipmentCategory> = {
  'EQP-RTU': 'SERVER',
  'EQP-RACK': 'OTHER',
  'EQP-OFD': 'OFD',
  'EQP-UPS': 'UPS',
  'EQP-NET': 'NETWORK',
  'EQP-SEC': 'SECURITY',
  'EQP-PITR': 'SERVER',
  'EQP-SEIS': 'OTHER',
  'EQP-SURGE': 'OTHER',
  'EQP-BRK': 'DISTRIBUTION_BOARD',
  'EQP-SYNC': 'SERVER',
  'EQP-COOL': 'OTHER',
  'EQP-PDAS': 'OTHER',
};

export const MATERIAL_TO_CABLE_TYPE: Record<string, CableType> = {
  'CBL-FCV': 'AC', 'CBL-FR': 'AC', 'CBL-VCT': 'AC', 'CBL-HIV': 'AC',
  'CBL-UTP': 'LAN',
  'CBL-OPT': 'FIBER', 'CBL-OPJ': 'FIBER', 'CBL-OPT-B': 'FIBER',
  'CBL-IV': 'GROUND', 'CBL-BARE': 'GROUND',
  'CBL-CVV': 'DC', 'CBL-CPEV': 'LAN', 'CBL-PCM': 'LAN',
  'CBL-COAX': 'LAN', 'CBL-CHAMP': 'LAN', 'CBL-SIG': 'DC',
};

export function getEquipmentCategoryFromMaterial(code: string): EquipmentCategory {
  return MATERIAL_TO_EQUIPMENT_CATEGORY[code] || 'OTHER';
}

export function getCableTypeFromMaterial(code: string): CableType {
  return MATERIAL_TO_CABLE_TYPE[code] || 'LAN';
}
```

- [ ] **Step 2: `frontend/src/features/materials/hooks/useMaterialCategories.ts` 생성**

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../api/client';
import type { MaterialCategory, MaterialCategoryType, Material } from '../../../types/material';

const MATERIAL_KEYS = {
  categories: ['material-categories'] as const,
  byType: (type: MaterialCategoryType) => [...MATERIAL_KEYS.categories, 'type', type] as const,
  detail: (id: string) => [...MATERIAL_KEYS.categories, 'detail', id] as const,
  materials: (categoryId: string) => ['materials', categoryId] as const,
};

export function useMaterialCategories(type?: MaterialCategoryType) {
  return useQuery({
    queryKey: type ? MATERIAL_KEYS.byType(type) : MATERIAL_KEYS.categories,
    queryFn: async () => {
      const url = type
        ? `/material-categories/by-type/${type}`
        : '/material-categories';
      const { data } = await api.get<MaterialCategory[]>(url);
      return data;
    },
    staleTime: 1000 * 60 * 30, // 30분 캐시 (마스터 데이터)
  });
}

export function useMaterialCategory(id: string | null) {
  return useQuery({
    queryKey: MATERIAL_KEYS.detail(id!),
    queryFn: async () => {
      const { data } = await api.get<MaterialCategory>(`/material-categories/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useMaterials(categoryId: string | null) {
  return useQuery({
    queryKey: MATERIAL_KEYS.materials(categoryId!),
    queryFn: async () => {
      const { data } = await api.get<Material[]>(`/materials?categoryId=${categoryId}`);
      return data;
    },
    enabled: !!categoryId,
  });
}

export function useMaterialResolve() {
  return useMutation({
    mutationFn: async (input: { categoryId: string; specParams: Record<string, any> }) => {
      const { data } = await api.post<Material>('/materials/resolve', input);
      return data;
    },
  });
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/types/material.ts frontend/src/features/materials/
git commit -m "feat: add material types and react-query hooks for MaterialCategory API"
```

---

### Task 2: 최근 사용 자재 스토어

**Files:**
- Create: `frontend/src/features/materials/stores/recentMaterialsStore.ts`

- [ ] **Step 1: 스토어 생성**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentMaterial {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  specParams: Record<string, any>;
  specification: string; // 표시용: "UTP CAT.6 4P"
  usedAt: number;
}

interface RecentMaterialsState {
  recentEquipment: RecentMaterial[];
  recentCables: RecentMaterial[];
  addRecent: (type: 'equipment' | 'cable', item: Omit<RecentMaterial, 'usedAt'>) => void;
}

const MAX_RECENT = 10;

export const useRecentMaterialsStore = create<RecentMaterialsState>()(
  persist(
    (set) => ({
      recentEquipment: [],
      recentCables: [],
      addRecent: (type, item) =>
        set((state) => {
          const key = type === 'equipment' ? 'recentEquipment' : 'recentCables';
          const existing = state[key];
          // 같은 specification 제거 후 앞에 추가
          const filtered = existing.filter((r) => r.specification !== item.specification);
          const updated = [{ ...item, usedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
          return { [key]: updated };
        }),
    }),
    { name: 'recent-materials' }
  )
);
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/materials/stores/recentMaterialsStore.ts
git commit -m "feat: add recent materials store with localStorage persistence"
```

---

### Task 3: MaterialPicker 컴포넌트

**Files:**
- Create: `frontend/src/features/materials/components/MaterialPicker.tsx`
- Create: `frontend/src/features/materials/components/CableMaterialPicker.tsx`

- [ ] **Step 1: MaterialPicker 컴포넌트 생성**

범용 자재 선택 컴포넌트. 2단계: 종류(MaterialCategory) → 규격(specTemplate 파라미터).

Props:
```typescript
interface MaterialPickerProps {
  categoryType: 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';
  value: { categoryId: string; specParams: Record<string, any> } | null;
  onChange: (value: { categoryId: string; categoryCode: string; specParams: Record<string, any>; specification: string }) => void;
  recentItems?: RecentMaterial[]; // 최근 사용 목록
}
```

구현:
1. `useMaterialCategories(categoryType)` 로 카테고리 목록 로드
2. 카테고리 select 드롭다운
3. 선택 후 `specTemplate.params` 기반 동적 폼 렌더링
   - `inputType: 'select'` → `<select>` with options
   - `inputType: 'number'` → `<input type="number" min max>`
   - `inputType: 'text'` → `<input type="text">`
4. 모든 필수 파라미터 입력 완료 시 `onChange` 호출
5. 상단에 `recentItems` 있으면 "최근 사용" 섹션 표시 → 클릭하면 즉시 onChange

**최근 사용 UI:**
```
┌─────────────────────────┐
│ ★ 최근 사용              │
│   L2 스위치 24포트       │  ← 클릭 시 즉시 선택
│   UPS 10kVA             │
│ ─────────────────────── │
│ 종류: [네트워크장비  ▾]   │
│ 규격: [L2 스위치    ▾]   │
│       [24포트       ▾]   │
└─────────────────────────┘
```

- [ ] **Step 2: CableMaterialPicker 컴포넌트 생성**

MaterialPicker를 `categoryType='CABLE'`로 래핑. 추가로 선택된 카테고리의 `displayColor`를 표시.

```typescript
interface CableMaterialPickerProps {
  value: { categoryId: string; specParams: Record<string, any> } | null;
  onChange: (value: { categoryId: string; categoryCode: string; specParams: Record<string, any>; specification: string }) => void;
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/materials/components/
git commit -m "feat: add MaterialPicker and CableMaterialPicker components"
```

---

### Task 4: 설비 생성 모달 교체

**Files:**
- Modify: `frontend/src/features/editor/stores/canvasStore.ts`
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`
- Modify: `frontend/src/types/floorPlan.ts`
- Modify: `frontend/src/features/editor/hooks/useFloorPlanData.ts`

- [ ] **Step 1: `frontend/src/types/floorPlan.ts` — FloorPlanEquipment에 자재 필드 추가**

FloorPlanEquipment interface에 추가:
```typescript
materialCategoryId?: string | null;
materialCategoryCode?: string | null;
materialId?: string | null;
specParams?: Record<string, any> | null;
```

UpdateFloorPlanRequest의 equipment[] 항목에도 동일 필드 추가.

- [ ] **Step 2: `frontend/src/features/editor/stores/canvasStore.ts` — 상태 교체**

기존 `newEquipmentCategory: string` 을 유지하되 추가:
```typescript
newEquipmentMaterialCategoryId: string | null;
newEquipmentMaterialCategoryCode: string | null;
newEquipmentSpecParams: Record<string, any> | null;
newEquipmentSpecification: string | null;
setNewEquipmentMaterial: (categoryId: string | null, categoryCode: string | null, specParams: Record<string, any> | null, specification: string | null) => void;
```

`setNewEquipmentMaterial` 액션에서 `newEquipmentCategory`도 `getEquipmentCategoryFromMaterial(code)` 로 자동 매핑.

- [ ] **Step 3: `FloorPlanEditor.tsx` — 설비 생성 모달 교체**

기존 카테고리 드롭다운 (lines 233-239) 을 `MaterialPicker` 로 교체:

```tsx
// 기존:
<select value={newEquipmentCategory} onChange={...}>
  <option value="NETWORK">네트워크</option>
  ...
</select>

// 변경:
<MaterialPicker
  categoryType="EQUIPMENT"
  value={newEquipmentMaterialCategoryId ? { categoryId: newEquipmentMaterialCategoryId, specParams: newEquipmentSpecParams || {} } : null}
  onChange={({ categoryId, categoryCode, specParams, specification }) => {
    setNewEquipmentMaterial(categoryId, categoryCode, specParams, specification);
  }}
  recentItems={recentMaterialsStore.recentEquipment}
/>
```

`handleAddEquipment` (lines 89-113) 에서 새 필드 추가:
```typescript
const newEquip: FloorPlanEquipment = {
  // ...기존 필드...
  category: newEquipmentCategory, // 자동 매핑된 enum 값
  materialCategoryId: newEquipmentMaterialCategoryId,
  materialCategoryCode: newEquipmentMaterialCategoryCode,
  specParams: newEquipmentSpecParams,
};
```

완료 후 `addRecent('equipment', ...)` 호출.

- [ ] **Step 4: `useFloorPlanData.ts` — 저장 payload에 자재 필드 포함**

`handleSave`에서 equipment 빌드 시 (lines 198-218 근처) 새 필드 포함:
```typescript
equipment: localEquipment.map((eq) => ({
  // ...기존 필드...
  materialCategoryId: eq.materialCategoryId || null,
  specParams: eq.specParams || null,
})),
```

- [ ] **Step 5: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/types/floorPlan.ts frontend/src/features/editor/
git commit -m "feat: replace equipment category dropdown with MaterialPicker"
```

---

### Task 5: 케이블 생성 플로우 교체

**Files:**
- Modify: `frontend/src/types/connection.ts`
- Modify: `frontend/src/features/connections/stores/connectionCreationStore.ts`
- Modify: `frontend/src/features/equipment/components/ConnectionDiagram.tsx`
- Modify: `frontend/src/features/editor/stores/editorStore.ts`
- Modify: `frontend/src/features/editor/hooks/useCanvasEvents.ts`

- [ ] **Step 1: `frontend/src/types/connection.ts` — RoomConnection에 자재 필드 추가**

RoomConnection interface에 추가:
```typescript
materialCategoryId?: string | null;
materialCategoryCode?: string | null;
materialId?: string | null;
specParams?: Record<string, any> | null;
pathLength?: number | null;
totalLength?: number | null;
```

- [ ] **Step 2: `connectionCreationStore.ts` — materialCategory 상태 추가**

기존 `cableType: CableType | null` 유지하되 추가:
```typescript
materialCategoryId: string | null;
materialCategoryCode: string | null;
specParams: Record<string, any> | null;
specification: string | null;
```

`startCreation` 시그니처 변경:
```typescript
startCreation: (
  sourceEquipmentId: string,
  cableType: CableType,
  materialCategoryId: string,
  materialCategoryCode: string,
  specParams: Record<string, any>,
  specification: string,
) => void;
```

- [ ] **Step 3: `ConnectionDiagram.tsx` — 케이블 타입 선택 UI 교체**

기존 `CABLE_TYPES` 리스트 (lines 85-114) 를 `CableMaterialPicker` 로 교체:

```tsx
// 기존: CABLE_TYPES.map(...)으로 LAN/FIBER/AC/DC/GROUND 선택
// 변경: CableMaterialPicker 컴포넌트

{showCableSelector && (
  <CableMaterialPicker
    value={null}
    onChange={({ categoryId, categoryCode, specParams, specification }) => {
      const cableType = getCableTypeFromMaterial(categoryCode);
      startCreation(equipmentId, cableType, categoryId, categoryCode, specParams, specification);
      addRecent('cable', { categoryId, categoryCode, categoryName: '...', specParams, specification });
      setShowCableSelector(false);
    }}
  />
)}
```

- [ ] **Step 4: `editorStore.ts` — ChangeEntry cable:create에 자재 필드 추가**

`cable:create` 타입에 추가:
```typescript
| {
    type: 'cable:create';
    localId: string;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: CableType;
    // NEW
    materialCategoryId?: string;
    specParams?: Record<string, any>;
    label?: string;
    length?: number;
    color?: string;
    fiberPathId?: string;
    fiberPortNumber?: number;
  }
```

- [ ] **Step 5: `useCanvasEvents.ts` — 케이블 생성 시 자재 정보 전달**

lines 245-272 근처, cable:create addChange 호출 시:
```typescript
editorStore.getState().addChange({
  type: 'cable:create',
  localId: generateTempId(),
  sourceEquipmentId: creationStore.sourceEquipmentId!,
  targetEquipmentId: found.item.id,
  cableType: creationStore.cableType!,
  // NEW
  materialCategoryId: creationStore.materialCategoryId || undefined,
  specParams: creationStore.specParams || undefined,
});
```

- [ ] **Step 6: `useFloorPlanData.ts` — 케이블 저장 payload에 자재 필드 포함**

handleSave의 cables 빌드 부분에서 새 필드 포함:
```typescript
cables: cableChanges.map((c) => ({
  // ...기존 필드...
  materialCategoryId: c.materialCategoryId || null,
  specParams: c.specParams || null,
})),
```

- [ ] **Step 7: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/types/connection.ts frontend/src/features/connections/ frontend/src/features/editor/ frontend/src/features/equipment/
git commit -m "feat: replace cable type selector with CableMaterialPicker"
```

---

### Task 6: 자재 정보 표시 개선

**Files:**
- Modify: `frontend/src/features/equipment/types/equipment.ts`
- Modify: `frontend/src/features/equipment/components/EquipmentPanel.tsx`
- Modify: `frontend/src/features/connections/components/ConnectionOverlay.tsx`

- [ ] **Step 1: equipment.ts — CATEGORY_LABELS 확장**

기존 `CATEGORY_LABELS`는 유지하되, `materialCategoryCode`가 있을 때 더 상세한 표시를 위한 헬퍼 추가:

```typescript
export function getEquipmentDisplayName(equipment: {
  category: string;
  materialCategoryCode?: string | null;
  specParams?: Record<string, any> | null;
}): string {
  if (equipment.materialCategoryCode && equipment.specParams) {
    // TODO: specification 문자열이 있으면 그걸 표시
    return equipment.materialCategoryCode;
  }
  return CATEGORY_LABELS[equipment.category] || equipment.category;
}
```

- [ ] **Step 2: ConnectionOverlay — 케이블 표시에 규격 정보 추가**

케이블 호버/라벨에서 기존 `cableType` 대신 `specification` 또는 `materialCategoryCode` 표시:

```typescript
// 기존: label || cableType ('LAN')
// 변경: label || specification || cableType ('UTP CAT.6 4P' 또는 폴백 'LAN')
const displayLabel = cable.label
  || (cable.specParams ? buildSpecification(cable) : null)
  || cable.cableType;
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/equipment/ frontend/src/features/connections/
git commit -m "feat: display material specification in equipment and cable labels"
```

---

## Verification Checklist

Phase 1-B 완료 조건:

- [ ] 설비 추가 모달에서 MaterialCategory 13종(설비) 목록이 표시됨
- [ ] 종류 선택 후 specTemplate 기반 규격 파라미터 입력 폼이 동적 렌더링됨
- [ ] 선택 완료 시 FloorPlanEquipment에 materialCategoryId + specParams가 저장됨
- [ ] 기존 category 필드에 자동 매핑된 enum 값이 들어감 (하위호환)
- [ ] 케이블 생성 시 MaterialCategory 16종(케이블) 목록이 표시됨
- [ ] 케이블 선택 완료 시 changeSet에 materialCategoryId + specParams 포함
- [ ] 기존 cableType 필드에 자동 매핑된 enum 값이 들어감 (하위호환)
- [ ] 최근 사용 자재가 localStorage에 저장되고, 다음 선택 시 상단에 표시됨
- [ ] 최근 사용 항목 클릭 시 1클릭으로 선택 완료
- [ ] 설비/케이블 표시에 규격 정보가 보임 (materialCategoryCode가 있을 때)
- [ ] 기존 기능 (사진, 점검이력, 포트, 경로추적) 정상 동작
- [ ] `npm run build` 성공
