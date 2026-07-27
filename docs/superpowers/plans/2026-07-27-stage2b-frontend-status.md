# Stage 2B: v2 프론트 현황 뷰 (워킹카피 스토어 + 현황/상세/편집) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v2 백엔드(Stage 2A) 위에 자립적인 v2 프론트 영역(`frontend/src/v2/`)을 세운다 — 조직 트리 네비 + 현황 테이블 + capability 렌더링 상세 패널 + 워킹카피 편집(자산·이력) + 단일 커밋/되돌리기/undo. 구 앱은 무접촉으로 공존한다.

**Architecture:** 스펙 2단계 후반부. 검증된 패턴 이식(base ⊕ overlay 워킹카피, zundo temporal, 컬렉션 overlay)하되 **구 스토어 코드는 재사용하지 않고 v2 형상에 맞는 신규 단순 구현**(단순화 서약 — 호환 어댑터 금지). UI는 공용 컴포넌트(`components/ui`)와 시맨틱 토큰 재사용. 상세 패널은 `ROLE_TO_PANEL` 같은 매핑 없이 **타입의 capability(containerSpecs/portTemplates/fieldDefs)를 읽어 섹션을 파생**한다.

**Tech Stack:** React 18 + zustand/zundo + @tanstack/react-query + 기존 axios 인스턴스(`utils/api.ts` — 토큰 인터셉터 재사용) + @twin/core(dist) + vitest(+@testing-library).

## Global Constraints

- **UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md` 필독·준수** (CLAUDE.md 강제): 본문 `text-sm`/라벨 `text-xs`(미만 금지), 시맨틱 색 토큰만(`text-content`·`bg-surface`·`border-line`·`text-primary` 등, hex 금지), z-index 토큰만, 공용 컴포넌트(`DetailCard`·`DetailRow`·`Button`·`Badge`·`Input`·`Select`·`Modal`) 재사용 — 일회용 인라인 카드 금지.
- 구 소스 수정 허용 범위: `frontend/src/App.tsx` 라우트 추가(수 줄), `frontend/package.json`(+`@twin/core` dep), `packages/core` 시드(Task 1), 루트 lock. **그 외 구 프론트 소스 무접촉.**
- v2 코드는 `frontend/src/v2/` 자립 격리. 구 feature/store import 금지 (허용: `components/ui`, `utils/api`, `stores/authStore`, `lib/queryClient`).
- **타입키/역할 문자열 분기 금지** — 상세 섹션·배치 가능성·표시는 전부 capability 데이터에서 파생. Task 9 가드레일이 강제.
- 순수 로직(스토어·오버레이·커밋 변환·파생 계산)은 TDD. UI 컴포넌트는 구현 후 `npm run build -w frontend` + 브라우저 검증(각 태스크 Step에 명시된 확인 항목).
- dev 서버: `docker compose -f docker-compose.dev.yml up -d` + `npm run dev` (HMR). **docker build 금지.**
- 2A 계약 준수: 커밋 성공 후 워킹카피 재조회로 baseVersion 갱신(응답에 updatedAt 없음) / 자산 삭제 시 그 자산의 레코드 delete는 payload에서 생략(cascade) / 슬롯 이동은 빈 슬롯으로만(같은 커밋 내 스왑 불가 — UI에서 안내).
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: 코어 시드 공통 필드 + 상태 어휘 (거동 동일 데이터 준비)

**Files:**
- Modify: `packages/core/src/seed/catalog.ts`
- Create: `packages/core/src/catalog/status.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/seed/catalog.test.ts` (추가), `packages/core/src/catalog/status.test.ts`

**Interfaces:**
- Consumes: Stage 1 시드 구조
- Produces: 모든 시드 타입의 `fields`에 공통 필드 `installDate`(date)·`manager`(text) 포함(구 현황 컬럼의 데이터 드리븐 흡수), `ASSET_STATUSES: { value, label, tone }[]` — `normal/정상/success`, `standby/예비/neutral`, `fault/고장/danger`. 프론트 상태 표시·선택지가 이것만 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/catalog/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASSET_STATUSES, assetStatusLabel } from './status.js';

describe('ASSET_STATUSES', () => {
  it('3종 어휘와 라벨', () => {
    expect(ASSET_STATUSES.map((s) => s.value)).toEqual(['normal', 'standby', 'fault']);
    expect(assetStatusLabel('fault')).toBe('고장');
  });
  it('미지 값은 원문 반환', () => {
    expect(assetStatusLabel('unknown-x')).toBe('unknown-x');
  });
});
```

`packages/core/src/seed/catalog.test.ts`에 추가:

```ts
  it('모든 타입에 공통 필드(installDate/manager)가 있다', () => {
    for (const t of SEED_ASSET_TYPES) {
      const keys = t.fields.map((f) => f.key);
      expect(keys, t.key).toContain('installDate');
      expect(keys, t.key).toContain('manager');
    }
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w @twin/core` — 새 테스트 FAIL.

- [ ] **Step 3: 구현**

`packages/core/src/catalog/status.ts`:

```ts
/** 자산 상태 어휘 — 표시·선택지는 이 상수만 읽는다 (추후 카탈로그 데이터로 승격 가능). */
export const ASSET_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  { value: 'standby', label: '예비', tone: 'neutral' },
  { value: 'fault', label: '고장', tone: 'danger' },
] as const;

export type AssetStatusValue = (typeof ASSET_STATUSES)[number]['value'];

export function assetStatusLabel(value: string): string {
  return ASSET_STATUSES.find((s) => s.value === value)?.label ?? value;
}
```

`packages/core/src/seed/catalog.ts` — 상단에 공통 필드 상수 추가 후 **모든 엔트리의 `fields`를 `[...COMMON_FIELDS, ...기존]`으로 변경**:

```ts
import type { AssetTypeSpec, FieldDef } from '../catalog/types.js';

/** 구 현황 컬럼(설치일·담당자)의 데이터 드리븐 흡수 — 전 타입 공통. */
export const COMMON_FIELDS: FieldDef[] = [
  { key: 'installDate', label: '설치일', type: 'date' },
  { key: 'manager', label: '담당자', type: 'text' },
];
```

각 엔트리: `fields: [...COMMON_FIELDS]` (기존 fields 있던 FEEDER 등은 `fields: [...COMMON_FIELDS, ...기존항목]`).

`packages/core/src/index.ts`에 `export * from './catalog/status.js';` 추가.

- [ ] **Step 4: 통과 확인 + 재시드**

Run:
```bash
npm test -w @twin/core
npm run build -w @twin/core
npm run db:next:seed -w backend   # 멱등 upsert가 fieldDefs 갱신
npm test -w backend               # 168 전체 그린 유지
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 공통 커스텀 필드(설치일·담당자) + 자산 상태 어휘 상수"
```

---

### Task 2: v2 프론트 스캐폴드 — 라우트·API 모듈·타입·카탈로그/조직 훅

**Files:**
- Modify: `frontend/package.json` (`"@twin/core": "*"` deps 추가 → 루트 `npm install`)
- Create: `frontend/src/v2/api.ts`, `frontend/src/v2/types.ts`, `frontend/src/v2/hooks.ts`
- Create: `frontend/src/v2/pages/V2WorkspacePage.tsx` (셸 골격)
- Modify: `frontend/src/App.tsx` (protected 그룹에 라우트 1개)
- Test: `frontend/src/v2/__tests__/api.test.ts`

**Interfaces:**
- Consumes: 기존 `api`(axios, `utils/api.ts` — 토큰 자동 첨부), `queryClient`, `@twin/core`(FieldDef 등)
- Produces (이후 태스크 공용):
  - `frontend/src/v2/types.ts`: `V2AssetType`(containerSpecs/portTemplates/linkRules/fieldDefs 포함), `V2Catalog`, `V2OrgTree`/`V2Hq`/`V2Branch`/`V2Substation`/`V2Floor`, `V2Asset`(ports 포함, updatedAt: string), `V2Port`, `V2MaintenanceLog`, `V2InspectionLog`, `V2Workingcopy`, `V2NodeAssetRow`, `V2CommitPayload`, `V2Conflict`
  - `frontend/src/v2/api.ts`: `fetchCatalog()`, `fetchOrgTree()`, `fetchWorkingcopy(substationId)`, `fetchNodeAssets(nodeId)`, `putCommit(substationId, payload)`, org CRUD (`createOrgNode(kind, body)`, `patchOrgNode(kind, id, body)`, `deleteOrgNode(kind, id)`) — 전부 `/v2/...` 경로 (axios baseURL이 `/api`)
  - `frontend/src/v2/hooks.ts`: `useV2Catalog()`, `useV2OrgTree()`, `useV2NodeAssets(nodeId)` (+ `typesById` 파생 셀렉터)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/v2/__tests__/api.test.ts` — 경로 규약만 검증(네트워크 없이 axios mock):

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(async (url: string) => ({ data: { url } })), put: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), patch: vi.fn(async () => ({ data: {} })), delete: vi.fn(async () => ({ data: {} })) },
}));

import { api } from '../../utils/api';
import { fetchCatalog, fetchNodeAssets, fetchWorkingcopy, putCommit } from '../api';

describe('v2 api 경로', () => {
  it('catalog/workingcopy/nodes/commit 경로', async () => {
    await fetchCatalog();
    expect(api.get).toHaveBeenCalledWith('/v2/catalog');
    await fetchWorkingcopy('sub-1');
    expect(api.get).toHaveBeenCalledWith('/v2/substations/sub-1/workingcopy');
    await fetchNodeAssets('node-1');
    expect(api.get).toHaveBeenCalledWith('/v2/nodes/node-1/assets');
    await putCommit('sub-1', { assets: {} });
    expect(api.put).toHaveBeenCalledWith('/v2/substations/sub-1/commit', { assets: {} });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w frontend -- run src/v2` (frontend test 스크립트는 watch 기본이므로 `-- run` 필수)
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`frontend/src/v2/types.ts` (2A 응답 계약 그대로 — 발췌가 아니라 전체 작성):

```ts
import type { Direction, FieldDef } from '@twin/core';

export interface V2Category { id: string; key: string; name: string; sortOrder: number }
export interface V2ContainerSpec { id: string; key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: { categoryKeys?: string[]; typeKeys?: string[] }; sortOrder: number }
export interface V2PortTemplate { id: string; group: string; count: number; direction: Direction; medium: string; namePattern: string; sortOrder: number }
export interface V2LinkRule { id: string; fromGroup: string; toGroup: string; mapping: 'byIndex' | 'all' }
export interface V2AssetType {
  id: string; key: string; name: string; categoryId: string; sortOrder: number; isActive: boolean;
  placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  fieldDefs: FieldDef[];
  containerSpecs: V2ContainerSpec[]; portTemplates: V2PortTemplate[]; linkRules: V2LinkRule[];
}
export interface V2CableCategory { id: string; name: string; sortOrder: number }
export interface V2CableGroup { id: string; key: string; name: string; color: string; sortOrder: number; categories: V2CableCategory[] }
export interface V2Catalog { categories: V2Category[]; types: V2AssetType[]; cableGroups: V2CableGroup[] }

export interface V2Floor { id: string; name: string; sortOrder: number; substationId: string }
export interface V2Substation { id: string; name: string; sortOrder: number; branchId: string; floors: V2Floor[] }
export interface V2Branch { id: string; name: string; sortOrder: number; headquartersId: string; substations: V2Substation[] }
export interface V2Hq { id: string; name: string; sortOrder: number; branches: V2Branch[] }
export interface V2OrgTree { headquarters: V2Hq[] }

export interface V2Port { id: string; assetId: string; group: string; index: number; name: string; direction: Direction; medium: string }
export interface V2Asset {
  id: string; name: string; typeId: string; substationId: string; status: string;
  floorId: string | null; x: number | null; y: number | null; width: number | null; height: number | null;
  parentAssetId: string | null; containerKey: string | null; slotIndex: number | null; slotSpan: number | null;
  fieldValues: Record<string, unknown>; updatedAt: string; ports: V2Port[];
}
export interface V2MaintenanceLog { id: string; assetId: string; occurredAt: string; content: string; action: string | null; updatedAt: string }
export interface V2InspectionLog { id: string; assetId: string; inspectedAt: string; content: string; result: string | null; updatedAt: string }
export interface V2Workingcopy {
  substation: { id: string; name: string; branchId: string; sortOrder: number };
  floors: V2Floor[]; assets: V2Asset[]; maintenanceLogs: V2MaintenanceLog[]; inspectionLogs: V2InspectionLog[];
}
export interface V2NodeAssetRow {
  id: string; name: string; status: string; updatedAt: string; substationId: string; substationName: string;
  typeKey: string; typeName: string; categoryName: string; parentAssetId: string | null; parentName: string | null; floorId: string | null;
}
export interface V2Conflict { id: string; reason: 'modified' | 'deleted'; serverUpdatedAt?: string }

export interface V2AssetCreateInput {
  id: string; name: string; typeId: string; status?: string;
  floorId?: string | null; x?: number | null; y?: number | null; width?: number | null; height?: number | null;
  parentAssetId?: string | null; containerKey?: string | null; slotIndex?: number | null; slotSpan?: number | null;
  fieldValues?: Record<string, unknown>; portCounts?: Record<string, number>;
}
export type V2AssetPatch = Partial<Omit<V2AssetCreateInput, 'id' | 'typeId' | 'portCounts'>>;
export interface V2RecordOps<TCreate, TPatch> { creates?: TCreate[]; updates?: { id: string; patch: TPatch }[]; deletes?: string[] }
export interface V2CommitPayload {
  assets?: { creates?: V2AssetCreateInput[]; updates?: { id: string; patch: V2AssetPatch }[]; deletes?: string[] };
  records?: {
    maintenance?: V2RecordOps<{ id: string; assetId: string; occurredAt: string; content: string; action?: string | null }, { occurredAt?: string; content?: string; action?: string | null }>;
    inspections?: V2RecordOps<{ id: string; assetId: string; inspectedAt: string; content: string; result?: string | null }, { inspectedAt?: string; content?: string; result?: string | null }>;
  };
  baseVersions?: Record<string, string>;
}
```

`frontend/src/v2/api.ts`:

```ts
import { api } from '../utils/api';
import type { V2AssetType, V2Catalog, V2CommitPayload, V2NodeAssetRow, V2OrgTree, V2Workingcopy } from './types';

export async function fetchCatalog(): Promise<V2Catalog> {
  return (await api.get('/v2/catalog')).data;
}
export async function fetchOrgTree(): Promise<V2OrgTree> {
  return (await api.get('/v2/org-tree')).data;
}
export async function fetchWorkingcopy(substationId: string): Promise<V2Workingcopy> {
  return (await api.get(`/v2/substations/${substationId}/workingcopy`)).data;
}
export async function fetchNodeAssets(nodeId: string): Promise<V2NodeAssetRow[]> {
  return (await api.get(`/v2/nodes/${nodeId}/assets`)).data;
}
export async function putCommit(substationId: string, payload: V2CommitPayload): Promise<{ committedAt: string }> {
  return (await api.put(`/v2/substations/${substationId}/commit`, payload)).data;
}

export type OrgKind = 'headquarters' | 'branches' | 'substations' | 'floors';
export async function createOrgNode(kind: OrgKind, body: Record<string, string>) {
  return (await api.post(`/v2/org/${kind}`, body)).data;
}
export async function patchOrgNode(kind: OrgKind, id: string, body: { name?: string; sortOrder?: number }) {
  return (await api.patch(`/v2/org/${kind}/${id}`, body)).data;
}
export async function deleteOrgNode(kind: OrgKind, id: string) {
  return (await api.delete(`/v2/org/${kind}/${id}`)).data;
}
```

`frontend/src/v2/hooks.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchCatalog, fetchNodeAssets, fetchOrgTree } from './api';
import type { V2AssetType } from './types';

export function useV2Catalog() {
  return useQuery({ queryKey: ['v2', 'catalog'], queryFn: fetchCatalog, staleTime: 60_000 });
}
export function useV2OrgTree() {
  return useQuery({ queryKey: ['v2', 'org-tree'], queryFn: fetchOrgTree, staleTime: 30_000 });
}
export function useV2NodeAssets(nodeId: string | null) {
  return useQuery({
    queryKey: ['v2', 'node-assets', nodeId],
    queryFn: () => fetchNodeAssets(nodeId as string),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}
export function useTypesById(types: V2AssetType[] | undefined): Map<string, V2AssetType> {
  return useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);
}
```

`frontend/src/v2/pages/V2WorkspacePage.tsx` (골격 — Task 5에서 확장):

```tsx
export default function V2WorkspacePage() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree" />
      <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
        <div className="p-4 text-sm text-content-muted">변전소를 선택하세요</div>
      </main>
    </div>
  );
}
```

`frontend/src/App.tsx` — protected 그룹에 추가 (기존 라우트 무수정):

```tsx
<Route path="/v2" element={<V2WorkspacePage />} />
```
(상단 `import V2WorkspacePage from './v2/pages/V2WorkspacePage';`)

- [ ] **Step 4: 통과 확인**

Run:
```bash
npm install                       # @twin/core 링크
npm test -w frontend -- run src/v2   # PASS
npm run build -w frontend            # EXIT 0 (기존 앱 무손상)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json package-lock.json frontend/src/v2 frontend/src/App.tsx
git commit -m "feat(v2-fe): v2 프론트 스캐폴드 — 라우트·API 모듈·DTO 타입·카탈로그/조직 훅"
```

---

### Task 3: 워킹카피 스토어 (base ⊕ overlay, zundo)

**Files:**
- Create: `frontend/src/v2/store/overlay.ts`, `frontend/src/v2/store/workingCopyStore.ts`
- Test: `frontend/src/v2/store/__tests__/workingCopyStore.test.ts`

**Interfaces:**
- Consumes: `fetchWorkingcopy`, `V2Asset` 등 타입
- Produces:
  - `Overlay<T>` = `{ creates: Record<string,T>; updates: Record<string,Partial<T>>; deletes: string[] }` + `emptyOverlay()`, `stageCreate/stageUpdate/stageDelete(overlay, ...)` (순수 함수, 구 패턴 이식 신규 구현), `overlayDirtyCount`
  - `useV2WorkingCopy` (zustand + zundo temporal):
    - state: `substationId`, `saved: { substation, floors, assets, maintenanceLogs, inspectionLogs }`, `overlays: { assets, maintenance, inspections }`, `baseVersions: Record<assetId, updatedAt>`
    - actions: `load(substationId)` (temporal pause, overlay 초기화), `stageAssetCreate(asset)`, `stageAssetUpdate(id, patch)`, `stageAssetDeleteCascade(id)` (자식 자산 + 양쪽 레코드까지 연쇄 스테이징), `stageMaintenance*`/`stageInspection*` (create/update/delete), `revert()`
    - selectors: `effectiveAssets()`, `effectiveMaintenanceFor(assetId)`, `effectiveInspectionsFor(assetId)`, `dirtyCount()`, `isTempId(id)` (creates에 있는 id)
  - temporal 옵션: `partialize: overlays만`, `limit: 50`, load/revert 시 pause+clear

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/v2/store/__tests__/workingCopyStore.test.ts` — fetch를 mock, 스토어 로직 전수:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V2Asset, V2Workingcopy } from '../../types';

const wc: V2Workingcopy = {
  substation: { id: 'sub-1', name: '변전소A', branchId: 'br-1', sortOrder: 1 },
  floors: [],
  assets: [
    asset('a-rack', '랙1', { updatedAt: '2026-07-27T00:00:00.000Z' }),
    asset('a-mod', '모듈1', { parentAssetId: 'a-rack', containerKey: 'main', slotIndex: 0, slotSpan: 1, updatedAt: '2026-07-27T00:00:01.000Z' }),
  ],
  maintenanceLogs: [{ id: 'm-1', assetId: 'a-mod', occurredAt: '2026-07-01T00:00:00.000Z', content: '고장', action: null, updatedAt: '2026-07-27T00:00:00.000Z' }],
  inspectionLogs: [],
};

function asset(id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset {
  return {
    id, name, typeId: 't-1', substationId: 'sub-1', status: 'normal',
    floorId: null, x: null, y: null, width: null, height: null,
    parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
    fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
    ...extra,
  };
}

vi.mock('../../api', () => ({ fetchWorkingcopy: vi.fn(async () => wc) }));

import { useV2WorkingCopy } from '../workingCopyStore';

describe('useV2WorkingCopy', () => {
  beforeEach(async () => {
    await useV2WorkingCopy.getState().load('sub-1');
  });

  it('load: saved 반영 + baseVersions(assets) + overlay 초기화 + dirty 0', () => {
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveAssets()).toHaveLength(2);
    expect(s.baseVersions['a-mod']).toBe('2026-07-27T00:00:01.000Z');
    expect(s.dirtyCount()).toBe(0);
  });

  it('stageAssetUpdate: effective에 패치 반영, 중복 패치는 병합', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: '랙1-개명' });
    s.stageAssetUpdate('a-rack', { status: 'fault' });
    const rack = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'a-rack')!;
    expect(rack.name).toBe('랙1-개명');
    expect(rack.status).toBe('fault');
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(1);
  });

  it('stageAssetCreate + 그 자산 stage 삭제 = 흔적 없음(temp 소거)', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetCreate(asset('tmp-1', '신규'));
    expect(useV2WorkingCopy.getState().isTempId('tmp-1')).toBe(true);
    s.stageAssetDeleteCascade('tmp-1');
    expect(useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'tmp-1')).toBeUndefined();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('stageAssetDeleteCascade: 자식 자산과 레코드까지 삭제 스테이징', () => {
    useV2WorkingCopy.getState().stageAssetDeleteCascade('a-rack');
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveAssets()).toHaveLength(0);
    expect(s.effectiveMaintenanceFor('a-mod')).toHaveLength(0);
    expect(s.overlays.assets.deletes.sort()).toEqual(['a-mod', 'a-rack']);
    expect(s.overlays.maintenance.deletes).toEqual(['m-1']);
  });

  it('레코드 stage create/update/delete + effective 필터', () => {
    const s = useV2WorkingCopy.getState();
    s.stageInspectionCreate({ id: 'i-tmp', assetId: 'a-mod', inspectedAt: '2026-07-27T00:00:00.000Z', content: '점검', result: null, updatedAt: '' });
    expect(useV2WorkingCopy.getState().effectiveInspectionsFor('a-mod')).toHaveLength(1);
    s.stageMaintenanceUpdate('m-1', { content: '수정됨' });
    expect(useV2WorkingCopy.getState().effectiveMaintenanceFor('a-mod')[0]!.content).toBe('수정됨');
    s.stageMaintenanceDelete('m-1');
    expect(useV2WorkingCopy.getState().effectiveMaintenanceFor('a-mod')).toHaveLength(0);
  });

  it('revert: overlay 비움 + dirty 0', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: 'x' });
    s.revert();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
    expect(useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'a-rack')!.name).toBe('랙1');
  });

  it('undo: temporal 로 overlay 되돌리기', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: 'x' });
    useV2WorkingCopy.temporal.getState().undo();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w frontend -- run src/v2` — FAIL.

- [ ] **Step 3: 구현**

`frontend/src/v2/store/overlay.ts`:

```ts
export interface Overlay<T> {
  creates: Record<string, T>;
  updates: Record<string, Partial<T>>;
  deletes: string[];
}

export function emptyOverlay<T>(): Overlay<T> {
  return { creates: {}, updates: {}, deletes: [] };
}

export function stageCreate<T>(o: Overlay<T>, id: string, item: T): Overlay<T> {
  return { ...o, creates: { ...o.creates, [id]: item } };
}

export function stageUpdate<T>(o: Overlay<T>, id: string, patch: Partial<T>): Overlay<T> {
  if (o.creates[id]) return { ...o, creates: { ...o.creates, [id]: { ...o.creates[id], ...patch } } };
  return { ...o, updates: { ...o.updates, [id]: { ...o.updates[id], ...patch } } };
}

export function stageDelete<T>(o: Overlay<T>, id: string): Overlay<T> {
  if (o.creates[id]) {
    const creates = { ...o.creates };
    delete creates[id];
    return { ...o, creates };
  }
  const updates = { ...o.updates };
  delete updates[id];
  return { creates: o.creates, updates, deletes: o.deletes.includes(id) ? o.deletes : [...o.deletes, id] };
}

export function overlayDirtyCount<T>(o: Overlay<T>): number {
  return Object.keys(o.creates).length + Object.keys(o.updates).length + o.deletes.length;
}

export function mergeEffective<T extends { id: string }>(saved: T[], o: Overlay<T>): T[] {
  const deleted = new Set(o.deletes);
  const merged = saved.filter((s) => !deleted.has(s.id)).map((s) => (o.updates[s.id] ? { ...s, ...o.updates[s.id] } : s));
  return [...merged, ...Object.values(o.creates)];
}
```

`frontend/src/v2/store/workingCopyStore.ts`:

```ts
import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { fetchWorkingcopy } from '../api';
import type { V2Asset, V2InspectionLog, V2MaintenanceLog, V2Workingcopy } from '../types';
import { emptyOverlay, mergeEffective, overlayDirtyCount, stageCreate, stageDelete, stageUpdate, type Overlay } from './overlay';

interface Overlays {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

const EMPTY_SAVED = { substation: null as V2Workingcopy['substation'] | null, floors: [] as V2Workingcopy['floors'], assets: [] as V2Asset[], maintenanceLogs: [] as V2MaintenanceLog[], inspectionLogs: [] as V2InspectionLog[] };

function emptyOverlays(): Overlays {
  return { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay() };
}

export interface V2WorkingCopyState {
  substationId: string | null;
  saved: typeof EMPTY_SAVED;
  overlays: Overlays;
  baseVersions: Record<string, string>;
  load: (substationId: string) => Promise<void>;
  revert: () => void;
  stageAssetCreate: (asset: V2Asset) => void;
  stageAssetUpdate: (id: string, patch: Partial<V2Asset>) => void;
  stageAssetDeleteCascade: (id: string) => void;
  stageMaintenanceCreate: (log: V2MaintenanceLog) => void;
  stageMaintenanceUpdate: (id: string, patch: Partial<V2MaintenanceLog>) => void;
  stageMaintenanceDelete: (id: string) => void;
  stageInspectionCreate: (log: V2InspectionLog) => void;
  stageInspectionUpdate: (id: string, patch: Partial<V2InspectionLog>) => void;
  stageInspectionDelete: (id: string) => void;
  effectiveAssets: () => V2Asset[];
  effectiveMaintenanceFor: (assetId: string) => V2MaintenanceLog[];
  effectiveInspectionsFor: (assetId: string) => V2InspectionLog[];
  dirtyCount: () => number;
  isTempId: (id: string) => boolean;
}

export const v2WorkingCopyStore = createStore<V2WorkingCopyState>()(
  temporal(
    (set, get) => ({
      substationId: null,
      saved: EMPTY_SAVED,
      overlays: emptyOverlays(),
      baseVersions: {},

      load: async (substationId) => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        const wc = await fetchWorkingcopy(substationId);
        set({
          substationId,
          saved: { substation: wc.substation, floors: wc.floors, assets: wc.assets, maintenanceLogs: wc.maintenanceLogs, inspectionLogs: wc.inspectionLogs },
          overlays: emptyOverlays(),
          baseVersions: Object.fromEntries(wc.assets.map((a) => [a.id, a.updatedAt])),
        });
        t.clear();
        t.resume();
      },

      revert: () => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        set({ overlays: emptyOverlays() });
        t.clear();
        t.resume();
      },

      stageAssetCreate: (asset) => set((s) => ({ overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } })),
      stageAssetUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, patch) } })),

      stageAssetDeleteCascade: (id) => {
        const s = get();
        const all = s.effectiveAssets();
        const targets = new Set<string>([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const a of all) {
            if (a.parentAssetId && targets.has(a.parentAssetId) && !targets.has(a.id)) {
              targets.add(a.id);
              grew = true;
            }
          }
        }
        set((st) => {
          let assets = st.overlays.assets;
          let maintenance = st.overlays.maintenance;
          let inspections = st.overlays.inspections;
          for (const tid of targets) {
            assets = stageDelete(assets, tid);
            for (const m of mergeEffective(st.saved.maintenanceLogs, maintenance).filter((r) => r.assetId === tid)) maintenance = stageDelete(maintenance, m.id);
            for (const i of mergeEffective(st.saved.inspectionLogs, inspections).filter((r) => r.assetId === tid)) inspections = stageDelete(inspections, i.id);
          }
          return { overlays: { assets, maintenance, inspections } };
        });
      },

      stageMaintenanceCreate: (log) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageCreate(s.overlays.maintenance, log.id, log) } })),
      stageMaintenanceUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageUpdate(s.overlays.maintenance, id, patch) } })),
      stageMaintenanceDelete: (id) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageDelete(s.overlays.maintenance, id) } })),
      stageInspectionCreate: (log) => set((s) => ({ overlays: { ...s.overlays, inspections: stageCreate(s.overlays.inspections, log.id, log) } })),
      stageInspectionUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, inspections: stageUpdate(s.overlays.inspections, id, patch) } })),
      stageInspectionDelete: (id) => set((s) => ({ overlays: { ...s.overlays, inspections: stageDelete(s.overlays.inspections, id) } })),

      effectiveAssets: () => mergeEffective(get().saved.assets, get().overlays.assets),
      effectiveMaintenanceFor: (assetId) => mergeEffective(get().saved.maintenanceLogs, get().overlays.maintenance).filter((r) => r.assetId === assetId),
      effectiveInspectionsFor: (assetId) => mergeEffective(get().saved.inspectionLogs, get().overlays.inspections).filter((r) => r.assetId === assetId),
      dirtyCount: () => {
        const o = get().overlays;
        return overlayDirtyCount(o.assets) + overlayDirtyCount(o.maintenance) + overlayDirtyCount(o.inspections);
      },
      isTempId: (id) => id in get().overlays.assets.creates,
    }),
    {
      partialize: (state) => ({ overlays: state.overlays }),
      equality: shallow,
      limit: 50,
    },
  ),
);

export const useV2WorkingCopy = Object.assign(
  <T,>(selector: (s: V2WorkingCopyState) => T): T => useStore(v2WorkingCopyStore, selector),
  { getState: () => v2WorkingCopyStore.getState(), temporal: v2WorkingCopyStore.temporal },
);
```

- [ ] **Step 4: 통과 확인 → Commit**

Run: `npm test -w frontend -- run src/v2` — PASS. `npm run build -w frontend` — EXIT 0.

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 워킹카피 스토어 — base⊕overlay·cascade 삭제·zundo temporal"
```

---

### Task 4: 커밋 페이로드 변환기 + 커밋/충돌 훅

**Files:**
- Create: `frontend/src/v2/store/buildCommitPayload.ts`, `frontend/src/v2/store/useCommit.ts`
- Test: `frontend/src/v2/store/__tests__/buildCommitPayload.test.ts`

**Interfaces:**
- Consumes: `Overlays`, `baseVersions`, `putCommit`, `useV2WorkingCopy`
- Produces:
  - `buildCommitPayload(overlays, baseVersions): V2CommitPayload` — 순수 함수. 규칙(2A 계약):
    1. assets creates: `V2Asset` → `V2AssetCreateInput` (ports/updatedAt 등 서버 파생 필드 제외)
    2. baseVersions는 assets updates+deletes 대상만 포함
    3. **assets.deletes에 포함된 자산의 레코드 delete는 records에서 생략** (서버 cascade — 포함 시 422)
    4. 삭제 자산 대상 레코드 create/update도 드랍
    5. 빈 연산은 키 자체를 생략 (빈 payload면 `{}`)
  - `useCommit()` 훅: `{ commit, isCommitting, conflicts, clearConflicts }` — 성공 시 `load(substationId)` 재조회(baseVersion 갱신) + `['v2','org-tree']`·`['v2','node-assets']` 쿼리 invalidate; 409면 `conflicts: V2Conflict[]` 세팅(다이얼로그는 Task 9)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/v2/store/__tests__/buildCommitPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { V2Asset, V2MaintenanceLog } from '../../types';
import { emptyOverlay, type Overlay } from '../overlay';
import { buildCommitPayload } from '../buildCommitPayload';

const baseAsset: V2Asset = {
  id: 'a-1', name: '자산', typeId: 't-1', substationId: 's-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
};

function overlays(partial: { assets?: Partial<Overlay<V2Asset>>; maintenance?: Partial<Overlay<V2MaintenanceLog>> }) {
  return {
    assets: { ...emptyOverlay<V2Asset>(), ...partial.assets },
    maintenance: { ...emptyOverlay<V2MaintenanceLog>(), ...partial.maintenance },
    inspections: emptyOverlay<never>(),
  };
}

describe('buildCommitPayload', () => {
  it('create에서 서버 파생 필드(ports/updatedAt/substationId) 제외', () => {
    const p = buildCommitPayload(overlays({ assets: { creates: { 'a-1': baseAsset } } }), {});
    const c = p.assets!.creates![0]! as Record<string, unknown>;
    expect(c.id).toBe('a-1');
    expect('ports' in c).toBe(false);
    expect('updatedAt' in c).toBe(false);
    expect('substationId' in c).toBe(false);
  });

  it('baseVersions는 updates+deletes 대상만', () => {
    const p = buildCommitPayload(
      overlays({ assets: { updates: { 'a-1': { name: 'x' } }, deletes: ['a-2'] } }),
      { 'a-1': 'v1', 'a-2': 'v2', 'a-3': 'v3' },
    );
    expect(p.baseVersions).toEqual({ 'a-1': 'v1', 'a-2': 'v2' });
  });

  it('삭제 자산의 레코드 delete/update/create는 드랍 (cascade 계약)', () => {
    const log: V2MaintenanceLog = { id: 'm-1', assetId: 'a-del', occurredAt: 'x', content: 'c', action: null, updatedAt: 'v' };
    const p = buildCommitPayload(
      overlays({
        assets: { deletes: ['a-del'] },
        maintenance: { deletes: ['m-1'], creates: { 'm-2': { ...log, id: 'm-2' } }, updates: { 'm-1': { content: 'y' } } },
      }),
      { 'a-del': 'v' },
      { 'm-1': 'a-del' },
    );
    expect(p.records?.maintenance).toBeUndefined();
  });

  it('삭제 자산 판정은 saved 레코드의 assetId 로 한다 — 무관 레코드는 유지', () => {
    const keep: V2MaintenanceLog = { id: 'm-keep', assetId: 'a-live', occurredAt: 'x', content: 'c', action: null, updatedAt: 'v' };
    const p = buildCommitPayload(
      overlays({ assets: { deletes: ['a-del'] }, maintenance: { creates: { 'm-keep': keep } } }),
      { 'a-del': 'v' },
    );
    expect(p.records!.maintenance!.creates).toHaveLength(1);
  });

  it('빈 오버레이 → {}', () => {
    expect(buildCommitPayload(overlays({}), {})).toEqual({});
  });
});
```

주의: 드랍 판정에 레코드의 `assetId`가 필요하다 — deletes는 id 배열뿐이므로 **maintenance/inspections overlay의 deletes 드랍 판정은 호출부가 넘기는 `recordAssetIds: Record<recordId, assetId>` 맵으로 한다**. 시그니처: `buildCommitPayload(overlays, baseVersions, recordAssetIds?: Record<string,string>)` — 테스트의 세 번째 케이스는 `{ 'm-1': 'a-del' }`을 넘겨 검증하도록 작성한다 (위 테스트 코드에 인자 추가).

- [ ] **Step 2: 실패 확인** — `npm test -w frontend -- run src/v2` FAIL.

- [ ] **Step 3: 구현**

`frontend/src/v2/store/buildCommitPayload.ts`:

```ts
import type { V2Asset, V2AssetCreateInput, V2AssetPatch, V2CommitPayload, V2InspectionLog, V2MaintenanceLog } from '../types';
import type { Overlay } from './overlay';

interface OverlaysIn {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

function toCreateInput(a: V2Asset): V2AssetCreateInput {
  return {
    id: a.id, name: a.name, typeId: a.typeId, status: a.status,
    floorId: a.floorId, x: a.x, y: a.y, width: a.width, height: a.height,
    parentAssetId: a.parentAssetId, containerKey: a.containerKey, slotIndex: a.slotIndex, slotSpan: a.slotSpan,
    fieldValues: a.fieldValues,
  };
}

export function buildCommitPayload(
  overlays: OverlaysIn,
  baseVersions: Record<string, string>,
  recordAssetIds: Record<string, string> = {},
): V2CommitPayload {
  const payload: V2CommitPayload = {};
  const deletedAssets = new Set(overlays.assets.deletes);

  const creates = Object.values(overlays.assets.creates).map(toCreateInput);
  const updates = Object.entries(overlays.assets.updates).map(([id, patch]) => ({ id, patch: patch as V2AssetPatch }));
  const deletes = overlays.assets.deletes;
  if (creates.length || updates.length || deletes.length) {
    payload.assets = {
      ...(creates.length ? { creates } : {}),
      ...(updates.length ? { updates } : {}),
      ...(deletes.length ? { deletes } : {}),
    };
  }

  const bv: Record<string, string> = {};
  for (const id of [...updates.map((u) => u.id), ...deletes]) {
    if (baseVersions[id]) bv[id] = baseVersions[id]!;
  }
  if (Object.keys(bv).length) payload.baseVersions = bv;

  const maintenance = recordOps(overlays.maintenance, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, occurredAt: r.occurredAt, content: r.content, action: r.action,
  }));
  const inspections = recordOps(overlays.inspections, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, inspectedAt: r.inspectedAt, content: r.content, result: r.result,
  }));
  if (maintenance || inspections) {
    payload.records = { ...(maintenance ? { maintenance } : {}), ...(inspections ? { inspections } : {}) };
  }
  return payload;
}

function recordOps<T extends { id: string; assetId: string; updatedAt: string }, C>(
  o: Overlay<T>,
  deletedAssets: ReadonlySet<string>,
  recordAssetIds: Record<string, string>,
  toCreate: (r: T) => C,
): { creates?: C[]; updates?: { id: string; patch: Partial<T> }[]; deletes?: string[] } | null {
  const creates = Object.values(o.creates).filter((r) => !deletedAssets.has(r.assetId)).map(toCreate);
  const updates = Object.entries(o.updates)
    .filter(([id]) => !deletedAssets.has(recordAssetIds[id] ?? ''))
    .map(([id, patch]) => {
      const { updatedAt: _u, assetId: _a, id: _i, ...rest } = patch as Record<string, unknown>;
      return { id, patch: rest as Partial<T> };
    });
  const deletes = o.deletes.filter((id) => !deletedAssets.has(recordAssetIds[id] ?? ''));
  if (!creates.length && !updates.length && !deletes.length) return null;
  return {
    ...(creates.length ? { creates } : {}),
    ...(updates.length ? { updates } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}
```

`frontend/src/v2/store/useCommit.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { putCommit } from '../api';
import type { V2Conflict } from '../types';
import { useV2WorkingCopy } from './workingCopyStore';

export function useCommit() {
  const queryClient = useQueryClient();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<V2Conflict[] | null>(null);

  const commit = useCallback(async () => {
    const s = useV2WorkingCopy.getState();
    if (!s.substationId || s.dirtyCount() === 0) return;
    const recordAssetIds: Record<string, string> = Object.fromEntries([
      ...s.saved.maintenanceLogs.map((r) => [r.id, r.assetId]),
      ...s.saved.inspectionLogs.map((r) => [r.id, r.assetId]),
    ]);
    const { buildCommitPayload } = await import('./buildCommitPayload');
    const payload = buildCommitPayload(s.overlays, s.baseVersions, recordAssetIds);
    setCommitting(true);
    try {
      await putCommit(s.substationId, payload);
      await s.load(s.substationId); // baseVersion 갱신 (2A 계약)
      await queryClient.invalidateQueries({ queryKey: ['v2', 'node-assets'] });
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        setConflicts((e.response.data?.details as V2Conflict[]) ?? []);
      } else {
        throw e;
      }
    } finally {
      setCommitting(false);
    }
  }, [queryClient]);

  const clearConflicts = useCallback(() => setConflicts(null), []);
  return { commit, isCommitting, conflicts, clearConflicts };
}
```

- [ ] **Step 4: 통과 확인 → Commit**

Run: `npm test -w frontend -- run src/v2` PASS, `npm run build -w frontend` EXIT 0.

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 커밋 페이로드 변환기(cascade 레코드 생략) + 커밋/충돌 훅"
```

---

### Task 5: 워크스페이스 셸 — 조직 트리 + 조직 CRUD + 변전소 선택

**Files:**
- Create: `frontend/src/v2/components/OrgTreePanel.tsx`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx`
- Test: `frontend/src/v2/__tests__/orgTreeSelectors.test.ts` (+ 순수 헬퍼 `frontend/src/v2/orgTreeSelectors.ts`)

**Interfaces:**
- Consumes: `useV2OrgTree`, org CRUD api, `useV2WorkingCopy.load`
- Produces: 좌측 트리(본부▸지사▸변전소, 선택 하이라이트), 노드별 컨텍스트 액션(＋하위 추가/이름변경/삭제 — `Modal`+`Input`, mutation 후 `['v2','org-tree']` invalidate), 변전소 클릭 시 `load(substationId)` + 선택 상태(`selectedNode: { kind: 'hq'|'branch'|'substation'; id } | null`)를 페이지 로컬 state로. 순수 헬퍼 `flattenTree(tree): { kind, id, name, depth, parentId }[]` (렌더·테스트 공용).

- [ ] **Step 1: 순수 헬퍼 TDD**

`frontend/src/v2/__tests__/orgTreeSelectors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { V2OrgTree } from '../types';
import { flattenTree } from '../orgTreeSelectors';

const tree: V2OrgTree = {
  headquarters: [
    {
      id: 'hq1', name: '본부', sortOrder: 1,
      branches: [
        { id: 'br1', name: '지사', sortOrder: 1, headquartersId: 'hq1', substations: [
          { id: 'ss1', name: '변전소A', sortOrder: 1, branchId: 'br1', floors: [] },
        ] },
      ],
    },
  ],
};

describe('flattenTree', () => {
  it('깊이·부모 포함 평탄화 (hq→branch→substation)', () => {
    expect(flattenTree(tree)).toEqual([
      { kind: 'hq', id: 'hq1', name: '본부', depth: 0, parentId: null },
      { kind: 'branch', id: 'br1', name: '지사', depth: 1, parentId: 'hq1' },
      { kind: 'substation', id: 'ss1', name: '변전소A', depth: 2, parentId: 'br1' },
    ]);
  });
});
```

`frontend/src/v2/orgTreeSelectors.ts`:

```ts
import type { V2OrgTree } from './types';

export type OrgNodeKind = 'hq' | 'branch' | 'substation';
export interface FlatOrgNode { kind: OrgNodeKind; id: string; name: string; depth: number; parentId: string | null }

export function flattenTree(tree: V2OrgTree): FlatOrgNode[] {
  const out: FlatOrgNode[] = [];
  for (const hq of tree.headquarters) {
    out.push({ kind: 'hq', id: hq.id, name: hq.name, depth: 0, parentId: null });
    for (const br of hq.branches) {
      out.push({ kind: 'branch', id: br.id, name: br.name, depth: 1, parentId: hq.id });
      for (const ss of br.substations) {
        out.push({ kind: 'substation', id: ss.id, name: ss.name, depth: 2, parentId: br.id });
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: UI 구현**

`OrgTreePanel.tsx` — 요구 구조 (CONVENTIONS 준수, 트리 행은 `text-sm`, 액션 아이콘은 hover 시):

```tsx
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton, Input, Modal } from '../../components/ui';
import { createOrgNode, deleteOrgNode, patchOrgNode, type OrgKind } from '../api';
import { flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useV2OrgTree } from '../hooks';

const CHILD_KIND: Record<FlatOrgNode['kind'], OrgKind | null> = { hq: 'branches', branch: 'substations', substation: 'floors' };
const SELF_KIND: Record<FlatOrgNode['kind'], OrgKind> = { hq: 'headquarters', branch: 'branches', substation: 'substations' };
const PARENT_FIELD: Record<OrgKind, string> = { headquarters: '', branches: 'headquartersId', substations: 'branchId', floors: 'substationId' };

export function OrgTreePanel(props: { selectedId: string | null; onSelect: (node: FlatOrgNode) => void }) {
  const { data: tree } = useV2OrgTree();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ mode: 'create' | 'rename'; kind: OrgKind; targetId: string; initial: string } | null>(null);
  const [name, setName] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['v2', 'org-tree'] });
  const createMut = useMutation({ mutationFn: (v: { kind: OrgKind; body: Record<string, string> }) => createOrgNode(v.kind, v.body), onSuccess: invalidate });
  const renameMut = useMutation({ mutationFn: (v: { kind: OrgKind; id: string; name: string }) => patchOrgNode(v.kind, v.id, { name: v.name }), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: (v: { kind: OrgKind; id: string }) => deleteOrgNode(v.kind, v.id), onSuccess: invalidate });

  const nodes = tree ? flattenTree(tree) : [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-content-muted">조직</span>
        <IconButton aria-label="본부 추가" size="sm" variant="ghost" onClick={() => { setName(''); setModal({ mode: 'create', kind: 'headquarters', targetId: '', initial: '' }); }}>
          <Plus size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`group flex cursor-pointer items-center gap-1 px-2 py-1 text-sm ${props.selectedId === n.id ? 'bg-surface-2 text-primary' : 'text-content hover:bg-surface-2'}`}
            style={{ paddingLeft: 8 + n.depth * 14 }}
            onClick={() => props.onSelect(n)}
          >
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              {CHILD_KIND[n.kind] && (
                <IconButton aria-label="하위 추가" size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setName(''); setModal({ mode: 'create', kind: CHILD_KIND[n.kind]!, targetId: n.id, initial: '' }); }}>
                  <Plus size={12} />
                </IconButton>
              )}
              <IconButton aria-label="이름 변경" size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setName(n.name); setModal({ mode: 'rename', kind: SELF_KIND[n.kind], targetId: n.id, initial: n.name }); }}>
                <Pencil size={12} />
              </IconButton>
              <IconButton aria-label="삭제" size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (window.confirm(`'${n.name}' 을 삭제할까요? (하위 항목이 있으면 거부됩니다)`)) deleteMut.mutate({ kind: SELF_KIND[n.kind], id: n.id }); }}>
                <Trash2 size={12} />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={modal.mode === 'create' ? '추가' : '이름 변경'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-3">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setModal(null)}>취소</Button>
              <Button variant="primary" size="sm" onClick={() => {
                if (!name.trim()) return;
                if (modal.mode === 'create') {
                  const body: Record<string, string> = { name: name.trim() };
                  const pf = PARENT_FIELD[modal.kind];
                  if (pf) body[pf] = modal.targetId;
                  createMut.mutate({ kind: modal.kind, body });
                } else {
                  renameMut.mutate({ kind: modal.kind, id: modal.targetId, name: name.trim() });
                }
                setModal(null);
              }}>확인</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
```

(주의: `Modal` 실제 prop 시그니처는 `components/ui/Modal.tsx`를 열어 확인 후 맞춘다 — `title/onClose` 가 아니면 그 시그니처에 맞출 것. 삭제 확인은 공용 confirm 컴포넌트가 있으면 그걸 쓰고, 없으면 window.confirm 유지.)

`V2WorkspacePage.tsx` — 선택 상태 + 변전소 선택 시 load:

```tsx
import { useState } from 'react';
import { OrgTreePanel } from '../components/OrgTreePanel';
import type { FlatOrgNode } from '../orgTreeSelectors';
import { useV2WorkingCopy } from '../store/workingCopyStore';

export default function V2WorkspacePage() {
  const [selected, setSelected] = useState<FlatOrgNode | null>(null);
  const handleSelect = (n: FlatOrgNode) => {
    setSelected(n);
    if (n.kind === 'substation') void useV2WorkingCopy.getState().load(n.id);
  };
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-line bg-sidebar">
        <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {selected == null && <div className="p-4 text-sm text-content-muted">좌측에서 조직/변전소를 선택하세요</div>}
        {selected != null && <div className="p-4 text-sm text-content" data-testid="v2-selected">{selected.name}</div>}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 검증**

```bash
npm test -w frontend -- run src/v2   # 헬퍼 테스트 PASS
npm run build -w frontend            # EXIT 0
```
브라우저(dev 서버, `/v2`): 본부→지사→변전소 추가/이름변경/삭제 동작, 자식 있는 노드 삭제 시 409 에러 확인(콘솔), 변전소 클릭 시 network 탭에 workingcopy 요청.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 워크스페이스 셸 — 조직 트리·조직 CRUD·변전소 선택 로드"
```

---

### Task 6: 현황 테이블

**Files:**
- Create: `frontend/src/v2/statusRows.ts`, `frontend/src/v2/components/StatusTable.tsx`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx`
- Test: `frontend/src/v2/__tests__/statusRows.test.ts`

**Interfaces:**
- Consumes: `useV2WorkingCopy`(변전소 스코프), `useV2NodeAssets`(본부/지사 스코프), `useV2Catalog`(+`useTypesById`), `assetStatusLabel`/`ASSET_STATUSES`(@twin/core)
- Produces:
  - 순수 함수 `buildStatusRows(args): StatusRow[]` — `StatusRow = { id, typeName, categoryName, name, location, installDate, manager, lastInspectedAt, status, substationName? }`
    - 변전소 스코프: effective assets + typesById로 계산. `location` = 층 이름(`floorId`→floors) 또는 `부모이름 · 슬롯 n`(parentAssetId→effective 조회) 또는 `'미배치'`. `installDate`/`manager` = `fieldValues`. `lastInspectedAt` = 그 자산 effective inspections의 max(inspectedAt).
    - 노드 스코프: `V2NodeAssetRow[]` → 동일 형상 매핑(location = parentName ?? '—', installDate 등 없음 → null).
  - `StatusTable` 컴포넌트: 컬럼 종류/이름/설치장소/설치일/담당자/마지막점검일/상태(구 현황 컬럼 동일) + 헤더 클릭 정렬(로컬 state) + 행 클릭 `onSelectAsset(id)` + 선택 행 하이라이트. 상태 셀은 `ASSET_STATUSES` tone→`Badge` status 매핑(`success→success`, `neutral→neutral`, `danger→danger`).

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/v2/__tests__/statusRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildStatusRows } from '../statusRows';

const types = new Map([
  ['t-rack', { id: 't-rack', name: '랙', categoryId: 'c-1' } as never],
]);
const categories = new Map([['c-1', '구조']]);

describe('buildStatusRows (변전소 스코프)', () => {
  const floors = [{ id: 'f-1', name: '1층', sortOrder: 1, substationId: 's' }];
  const rack = { id: 'a-1', name: '랙1', typeId: 't-rack', status: 'normal', floorId: 'f-1', parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: { installDate: '2026-01-01', manager: '홍길동' } };
  const mod = { id: 'a-2', name: '모듈', typeId: 't-rack', status: 'fault', floorId: null, parentAssetId: 'a-1', containerKey: 'main', slotIndex: 3, fieldValues: {} };

  it('층 배치·컨테이너 배치·미배치 location + 필드·최근점검 계산', () => {
    const rows = buildStatusRows({
      assets: [rack, mod] as never,
      floors: floors as never,
      typesById: types,
      categoryNameById: categories,
      inspectionsByAsset: new Map([['a-1', ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z']]]),
    });
    expect(rows[0]).toMatchObject({ id: 'a-1', typeName: '랙', location: '1층', installDate: '2026-01-01', manager: '홍길동', lastInspectedAt: '2026-07-01T00:00:00.000Z', status: 'normal' });
    expect(rows[1]).toMatchObject({ id: 'a-2', location: '랙1 · 슬롯 4', lastInspectedAt: null });
  });
});
```

(슬롯 표기는 1-based 표시: `slotIndex 3` → `슬롯 4`. 미배치 자산 location `'미배치'` 케이스도 테스트에 추가.)

- [ ] **Step 2: 실패 확인 → 구현**

`frontend/src/v2/statusRows.ts`:

```ts
import type { V2Asset, V2AssetType, V2Floor } from './types';

export interface StatusRow {
  id: string; typeName: string; categoryName: string; name: string; location: string;
  installDate: string | null; manager: string | null; lastInspectedAt: string | null; status: string;
  substationName?: string;
}

export function buildStatusRows(args: {
  assets: V2Asset[];
  floors: V2Floor[];
  typesById: Map<string, V2AssetType>;
  categoryNameById: Map<string, string>;
  inspectionsByAsset: Map<string, string[]>;
}): StatusRow[] {
  const floorName = new Map(args.floors.map((f) => [f.id, f.name]));
  const assetName = new Map(args.assets.map((a) => [a.id, a.name]));
  return args.assets.map((a) => {
    const type = args.typesById.get(a.typeId);
    const location =
      a.floorId != null ? (floorName.get(a.floorId) ?? '—')
      : a.parentAssetId != null ? `${assetName.get(a.parentAssetId) ?? '—'}${a.slotIndex != null ? ` · 슬롯 ${a.slotIndex + 1}` : ''}`
      : '미배치';
    const inspections = args.inspectionsByAsset.get(a.id) ?? [];
    return {
      id: a.id,
      typeName: type?.name ?? '—',
      categoryName: (type && args.categoryNameById.get(type.categoryId)) ?? '—',
      name: a.name,
      location,
      installDate: (a.fieldValues['installDate'] as string | undefined) ?? null,
      manager: (a.fieldValues['manager'] as string | undefined) ?? null,
      lastInspectedAt: inspections.length ? [...inspections].sort().at(-1)! : null,
      status: a.status,
    };
  });
}
```

`StatusTable.tsx` — 요구 구조: `<table>` (`w-full text-sm`), 헤더 `text-xs text-content-muted` + 클릭 정렬(컬럼 key 로컬 state, asc/desc 토글), 상태 셀 `Badge`, 행 `hover:bg-surface-2` + 선택 시 `bg-surface-2`, 날짜는 `YYYY-MM-DD` 표시. 정렬은 `localeCompare`(ko) / null last. 노드 스코프일 땐 맨 앞에 `변전소` 컬럼 추가.

`V2WorkspacePage.tsx` — 변전소 선택 시: effective 기반 rows (`buildStatusRows`), hq/branch 선택 시: `useV2NodeAssets(selected.id)` rows 매핑. `selectedAssetId` state 추가(상세는 Task 7).

- [ ] **Step 3: 검증 → Commit**

```bash
npm test -w frontend -- run src/v2
npm run build -w frontend
```
브라우저: 변전소에 자산이 있으면(백엔드 스모크 데이터 또는 Task 8에서 생성) 테이블 표시·정렬 동작, 본부 선택 시 교차 변전소 행.

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 현황 테이블 — 스코프별 행 파생·정렬·상태 배지"
```

---

### Task 7: 자산 상세 패널 — capability 렌더링 + 인라인 편집

**Files:**
- Create: `frontend/src/v2/components/AssetDetailPanel.tsx`, `frontend/src/v2/components/detailSections.ts`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx` (우측 패널 배선)
- Test: `frontend/src/v2/__tests__/detailSections.test.ts`

**Interfaces:**
- Consumes: `useV2WorkingCopy`, `useV2Catalog`, `ASSET_STATUSES`, `components/ui`(`DetailCard`·`DetailCardHeader`·`DetailRow`·`Select`·`Input`·`Badge`)
- Produces:
  - 순수 함수 `deriveDetailSections(type: V2AssetType): { showPorts: boolean; containerSpecs: V2ContainerSpec[]; fieldDefs: FieldDef[] }` — **역할 매핑 없이 capability 유무로만 섹션 파생** (containerSpecs 있으면 수용 섹션, portTemplates 있으면 포트 섹션, fieldDefs는 항상)
  - `AssetDetailPanel({ assetId })`: 우측 패널(`w-96 border-l border-line`), 탭 정보/점검/고장이력(구 UX 동일 — 사진·연결은 비목표):
    - **정보 탭**: DetailCard — 이름(Input→`stageAssetUpdate`), 타입명(read-only), 상태(`Select` — `ASSET_STATUSES` 옵션), 커스텀 필드(fieldDefs 순회: date→`<Input type="date">`, select→`Select`, number→`<Input type="number">`, text→`Input`; 값은 `fieldValues[key]`, 변경 시 `stageAssetUpdate(id, { fieldValues: { ...현재, [key]: v } })`), 위치(read-only 텍스트 — Task 6 location 로직 재사용)
    - **포트 섹션** (portTemplates 있으면): 그룹별로 포트 나열(`name · direction · medium`) — read-only 리스트(`text-xs`), 케이블 연결은 Stage 4
    - **수용 섹션** (containerSpecs 있으면): spec별로 — 고정 슬롯(`slotCount`)이면 슬롯 번호 1..N 그리드에 자식 이름 표시(빈 슬롯은 `—`), 자유형이면 자식 리스트. 자식 행 클릭 시 그 자산 선택으로 이동. (자식 추가/제거는 Task 8)
    - **점검/고장이력 탭**: Task 9에서 편집 배선 — 이번 태스크는 read 목록만(occurredAt/content 표시)
- 삭제/추가 버튼은 Task 8.

- [ ] **Step 1: 순수 파생 TDD**

`frontend/src/v2/__tests__/detailSections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { V2AssetType } from '../types';
import { deriveDetailSections } from '../components/detailSections';

const base: V2AssetType = {
  id: 't', key: 'X', name: 'X', categoryId: 'c', sortOrder: 1, isActive: true,
  placeable: false, defaultWidth: null, defaultHeight: null,
  laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [{ key: 'installDate', label: '설치일', type: 'date' }],
  containerSpecs: [], portTemplates: [], linkRules: [],
};

describe('deriveDetailSections — capability 유무로만 파생 (역할 매핑 0)', () => {
  it('컨테이너 명세 있으면 수용 섹션', () => {
    const t = { ...base, containerSpecs: [{ id: 's', key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: {}, sortOrder: 0 }] };
    expect(deriveDetailSections(t).containerSpecs).toHaveLength(1);
  });
  it('포트 템플릿 있으면 포트 섹션', () => {
    const t = { ...base, portTemplates: [{ id: 'p', group: 'P', count: 2, direction: 'BI' as const, medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }] };
    expect(deriveDetailSections(t).showPorts).toBe(true);
    expect(deriveDetailSections(base).showPorts).toBe(false);
  });
});
```

`frontend/src/v2/components/detailSections.ts`:

```ts
import type { V2AssetType, V2ContainerSpec } from '../types';
import type { FieldDef } from '@twin/core';

export function deriveDetailSections(type: V2AssetType): {
  showPorts: boolean;
  containerSpecs: V2ContainerSpec[];
  fieldDefs: FieldDef[];
} {
  return {
    showPorts: type.portTemplates.length > 0,
    containerSpecs: type.containerSpecs,
    fieldDefs: type.fieldDefs,
  };
}
```

- [ ] **Step 2: 패널 구현**

`AssetDetailPanel.tsx` — 위 인터페이스 명세대로. 구현 지침:
- effective asset은 `useV2WorkingCopy((s) => s.effectiveAssets().find((a) => a.id === assetId))`
- 탭 상태 로컬(`'info' | 'inspections' | 'logs'`), 탭바는 구 DetailTabs 스타일(`border-b-2 border-primary` 활성).
- 슬롯 그리드: 고정 슬롯이면 `grid grid-cols-6 gap-1`의 셀(`text-xs`, 점유 셀은 `bg-surface-2` + 자식 이름 truncate, span은 `col-span-{n}` 대신 인라인 style gridColumn span 사용), 12슬롯 기준 2행.
- 커스텀 필드 onChange는 blur/enter 시 stage (타이핑마다 undo 항목 생기지 않게).

- [ ] **Step 3: 검증 → Commit**

```bash
npm test -w frontend -- run src/v2
npm run build -w frontend
```
브라우저: 자산 선택 → 정보 탭 편집 시 저장바 dirty 증가(Task 9 전까지는 스토어 devtools/수치로 확인), 랙 선택 시 슬롯 그리드, PITR 선택 시 포트 목록.

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 자산 상세 패널 — capability 파생 섹션·인라인 편집"
```

---

### Task 8: 자산 추가/삭제 + 슬롯 배치

**Files:**
- Create: `frontend/src/v2/components/AddAssetModal.tsx`
- Modify: `frontend/src/v2/components/AssetDetailPanel.tsx` (삭제 버튼, 수용 섹션에 자식 추가/제거)
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx` (테이블 상단 "자산 추가" 버튼)
- Test: `frontend/src/v2/__tests__/newAsset.test.ts` (+ `frontend/src/v2/newAsset.ts`)

**Interfaces:**
- Consumes: `useV2Catalog`, `useV2WorkingCopy`, `@twin/core`의 `AcceptRule` 개념(수용 필터), `crypto.randomUUID()`
- Produces:
  - 순수 함수 `frontend/src/v2/newAsset.ts`:
    - `makeNewAsset(args: { type: V2AssetType; name: string; substationId: string; placement?: { parentAssetId: string; containerKey: string; slotIndex: number | null; slotSpan: number } }): V2Asset` — id는 randomUUID, status 'normal', fieldValues {}, ports [] (서버가 인스턴스화 — 표시용 빈 배열)
    - `acceptedTypes(spec: V2ContainerSpec, types: V2AssetType[], categoriesById: Map<string,string(카테고리 key)>): V2AssetType[]` — accepts의 categoryKeys/typeKeys OR 매칭(빈 accepts = 전체)
    - `freeSlots(spec: V2ContainerSpec, siblings: { slotIndex: number|null; slotSpan: number|null }[]): number[]` — 고정 슬롯일 때 빈 슬롯 인덱스 목록 (span 1 기준)
  - `AddAssetModal`: 타입 `Select`(활성 타입, 분류별 optgroup) → 이름 `Input` → 확인 시 `stageAssetCreate(makeNewAsset(...))`. 컨테이너 컨텍스트로 열리면(수용 섹션의 ＋) 타입 목록이 `acceptedTypes` 필터, 슬롯 `Select`는 `freeSlots` (자유형이면 슬롯 선택 없음).
  - 상세 패널 헤더에 삭제 버튼(`DetailCardHeader onDelete`): 자식 있으면 `'{n}개 하위 자산이 함께 삭제됩니다'` confirm 후 `stageAssetDeleteCascade`.
  - 슬롯 이동: 점유 셀 선택 후 "빈 슬롯으로 이동" (`Select` — freeSlots) → `stageAssetUpdate(childId, { slotIndex })`. **스왑은 미지원 안내** (2A 계약: 같은 커밋 내 스왑 불가): "슬롯 맞교환은 한 번에 한 자산씩, 중간 저장이 필요합니다."

- [ ] **Step 1: 순수 로직 TDD**

`frontend/src/v2/__tests__/newAsset.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { V2AssetType, V2ContainerSpec } from '../types';
import { acceptedTypes, freeSlots, makeNewAsset } from '../newAsset';

const mkType = (id: string, key: string, categoryId: string): V2AssetType => ({
  id, key, name: key, categoryId, sortOrder: 1, isActive: true, placeable: false,
  defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [], containerSpecs: [], portTemplates: [], linkRules: [],
});
const catKeyById = new Map([['c-comm', '통신'], ['c-struct', '구조']]);

describe('acceptedTypes', () => {
  const types = [mkType('t1', 'PITR', 'c-comm'), mkType('t2', 'RACK', 'c-struct')];
  it('categoryKeys 매칭', () => {
    const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] }, sortOrder: 0 };
    expect(acceptedTypes(spec, types, catKeyById).map((t) => t.key)).toEqual(['PITR']);
  });
  it('typeKeys OR 매칭 + 빈 accepts 전체', () => {
    const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['RACK'] }, sortOrder: 0 };
    expect(acceptedTypes(spec, types, catKeyById).map((t) => t.key)).toEqual(['RACK']);
    expect(acceptedTypes({ ...spec, accepts: {} }, types, catKeyById)).toHaveLength(2);
  });
});

describe('freeSlots', () => {
  const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: 6, allowSpan: true, accepts: {}, sortOrder: 0 };
  it('점유(span 포함) 제외한 빈 슬롯', () => {
    expect(freeSlots(spec, [{ slotIndex: 0, slotSpan: 2 }, { slotIndex: 4, slotSpan: 1 }])).toEqual([2, 3, 5]);
  });
});

describe('makeNewAsset', () => {
  it('uuid id + 기본값 + 배치 반영', () => {
    const a = makeNewAsset({ type: mkType('t1', 'PITR', 'c-comm'), name: '신규', substationId: 'ss', placement: { parentAssetId: 'rack', containerKey: 'main', slotIndex: 3, slotSpan: 1 } });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({ name: '신규', typeId: 't1', status: 'normal', parentAssetId: 'rack', slotIndex: 3 });
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현**

`frontend/src/v2/newAsset.ts`:

```ts
import type { V2Asset, V2AssetType, V2ContainerSpec } from './types';

export function acceptedTypes(spec: V2ContainerSpec, types: V2AssetType[], categoryKeyById: Map<string, string>): V2AssetType[] {
  const { categoryKeys, typeKeys } = spec.accepts;
  if (!categoryKeys && !typeKeys) return types;
  return types.filter((t) => (categoryKeys?.includes(categoryKeyById.get(t.categoryId) ?? '') ?? false) || (typeKeys?.includes(t.key) ?? false));
}

export function freeSlots(spec: V2ContainerSpec, siblings: { slotIndex: number | null; slotSpan: number | null }[]): number[] {
  if (spec.slotCount === null) return [];
  const occupied = new Set<number>();
  for (const s of siblings) {
    if (s.slotIndex == null) continue;
    const span = s.slotSpan ?? 1;
    for (let i = s.slotIndex; i < s.slotIndex + span; i += 1) occupied.add(i);
  }
  return Array.from({ length: spec.slotCount }, (_, i) => i).filter((i) => !occupied.has(i));
}

export function makeNewAsset(args: {
  type: V2AssetType; name: string; substationId: string;
  placement?: { parentAssetId: string; containerKey: string; slotIndex: number | null; slotSpan: number };
}): V2Asset {
  return {
    id: crypto.randomUUID(),
    name: args.name,
    typeId: args.type.id,
    substationId: args.substationId,
    status: 'normal',
    floorId: null, x: null, y: null, width: null, height: null,
    parentAssetId: args.placement?.parentAssetId ?? null,
    containerKey: args.placement?.containerKey ?? null,
    slotIndex: args.placement?.slotIndex ?? null,
    slotSpan: args.placement ? args.placement.slotSpan : null,
    fieldValues: {},
    updatedAt: '',
    ports: [],
  };
}
```

UI: `AddAssetModal` + 상세패널 배선은 인터페이스 명세대로 구현 (공용 `Modal`/`Select`/`Input`/`Button`).

- [ ] **Step 3: 검증 → Commit**

```bash
npm test -w frontend -- run src/v2
npm run build -w frontend
```
브라우저: 자산 추가(미배치) → 테이블에 등장(dirty↑), 랙 상세에서 슬롯에 모듈 추가 → 그리드 반영, 랙 삭제 confirm에 자식 수 표시.

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 자산 추가/삭제(cascade)·슬롯 배치/이동(빈 슬롯 한정)"
```

---

### Task 9: 이력/점검 편집 + 저장바 + 충돌 다이얼로그 + 가드레일/최종 검증

**Files:**
- Create: `frontend/src/v2/components/SaveBar.tsx`, `frontend/src/v2/components/ConflictDialog.tsx`, `frontend/src/v2/components/RecordsTab.tsx`
- Modify: `frontend/src/v2/components/AssetDetailPanel.tsx` (점검/고장 탭에 RecordsTab 배선)
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx` (SaveBar/ConflictDialog 배선)
- Test: `frontend/src/v2/__tests__/guardrail.test.ts`

**Interfaces:**
- Consumes: `useCommit`, `useV2WorkingCopy`, temporal(undo/redo)
- Produces:
  - `RecordsTab({ assetId, kind: 'maintenance' | 'inspections' })`: 목록(날짜·내용·부가필드) + 추가 폼(날짜 `Input type="datetime-local"`, 내용 `Input`, action/result `Input`) → `stage*Create`(id=randomUUID) / 행 편집 → `stage*Update` / 삭제 → `stage*Delete`. kind에 따라 날짜 필드명(occurredAt/inspectedAt)·부가 필드(action/result)만 다름 — props로 필드 키를 받는 단일 컴포넌트(2종 하드코딩 아님).
  - `SaveBar`: 하단 고정 바 — `변경 {dirtyCount}건` + 저장(`useCommit().commit`, isCommitting 시 비활성) + 되돌리기(`revert`, confirm) + undo/redo 버튼(temporal). dirty 0이면 숨김.
  - `ConflictDialog`: `conflicts` 있으면 `z-alert` 모달 — 충돌 자산 목록(id/reason) + "서버 기준으로 새로고침" 버튼 → `load(substationId)`(오버레이 폐기) + `clearConflicts`.
  - 가드레일 `frontend/src/v2/__tests__/guardrail.test.ts` — 백엔드와 동일 패턴:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('v2 프론트 가드레일 — 타입키/역할 분기 금지', () => {
  it('v2 소스(테스트 제외)에 자산 타입 키 리터럴·role/key 비교가 없다', () => {
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // frontend/src/v2
    const files = walk(v2dir).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('__tests__'));
    const forbidden = /["'`](RACK|OFD|OFD-SLOT|DIST|FEEDER|GROUNDING|HVAC|PITR-2000|PITR-5000)["'`]|\brole\s*[!=]==|\.key\s*===/;
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });
});
```

- [ ] **Step 1: 가드레일부터 작성** (RED가 아니라 현 코드 그린 확인용) → **Step 2: UI 구현** (인터페이스 명세대로) → **Step 3: 최종 검증**

```bash
npm test -w frontend -- run src/v2   # 전체 (스토어/변환기/파생/가드레일)
npm test -w @twin/core               # 유지
npm test -w backend                  # 유지 (168)
npm run build                        # 루트 EXIT 0
```

**브라우저 종합 시나리오 (dev 서버, /v2 — 컨트롤러가 검증):**
1. 조직 생성(본부→지사→변전소) → 변전소 선택
2. 자산 추가(랙) → 랙 슬롯에 모듈 추가 → dirty 카운트 확인 → 저장 → 새로고침 후 유지 확인
3. 상세에서 이름/상태/설치일 편집 + 점검 이력 추가 → 저장 → 현황 테이블의 마지막 점검일 갱신
4. undo/redo, 되돌리기 동작
5. 두 탭에서 같은 자산 수정 후 순차 저장 → 두 번째 탭 409 충돌 다이얼로그 → 새로고침 복구
6. 랙 삭제(자식 포함 confirm) → 저장 → 빈 현황

- [ ] **Step 4: Commit**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 이력/점검 편집·저장바·충돌 다이얼로그 + v2 프론트 가드레일"
```

---

## 완료 기준 (Stage 2B Definition of Done)

1. `npm test -w frontend -- run src/v2` 전체 PASS (스토어·변환기·파생·가드레일).
2. `npm test -w backend`(168)·`npm test -w @twin/core` 유지, `npm run build` 루트 EXIT 0.
3. 브라우저 종합 시나리오 6단계 통과 (컨트롤러 검증 — "검증 예정"으로 남기지 않음).
4. main 머지.

## 명시적 비목표 (Stage 2B)

- 평면도 캔버스 (Stage 3)
- 케이블/연결/추적 UI (Stage 4) — 상세 패널 연결 탭 없음
- 사진 업로드 (별도 후속 — 구 uploads 는 구 앱 전용 유지)
- 관리자 타입 정의 화면 (Stage 6) — 카탈로그는 read-only 소비
- 조직 워킹카피 스테이징 (즉시 CRUD 확정)
- 랙 프리셋 (구 기능 — 타입 정의 UI(Stage 6)와 함께 재설계)
- 슬롯 스왑 단일 커밋 지원 (2A 제약 — 필요 시 Stage 3+에서 커밋 서비스 개선과 함께)
