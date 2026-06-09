# 단계 B — 연결성 1급화 구현 계획 (B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 케이블(연결)을 현황에서 조회·메타편집·삭제하게 한다 — 상세 패널 "연결" 섹션 + 변전소 "연결" 뷰. 생성은 캔버스 유지.

**Architecture:** 백엔드 조회 2개 신규(`GET /substations/:id/connections`, `GET /assets/:id/connections`; 기존 `getByFloorId` 패턴 + `CableDetail` DTO 재사용) + 기존 `PUT/DELETE /api/cables/:id` 편집 재사용. 프론트는 두 조회 훅 + 케이블 뮤테이션 훅 + 상세 패널 연결 섹션 + 워크스페이스 "연결" 뷰(단계 A 레지스트리 첫 drop-in). 엔드포인트 클릭 → 단계 A `SelectionContext` 공유 선택.

**Tech Stack:** Express+Prisma+Vitest(+supertest) / React+React Query+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-05-phase-b-connectivity-first-class-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**백엔드 수정**: `cable.service.ts`(+getBySubstationId/getByAssetId), `cable.controller.ts`, 라우트(substations·assets), `index.ts`. **테스트**: `tests/cableConnections.integration.test.ts`.
**프론트 신규**: `features/connections/hooks/useAssetConnections.ts`·`useSubstationConnections.ts`·`useCableMutations.ts`, `features/connections/components/AssetConnectionsSection.tsx`(+test)·`SubstationConnectionsView.tsx`(+test). **수정**: `AssetDetailPanel.tsx`, `SubstationWorkspacePage.tsx`.

---

## Task 1: 백엔드 — 연결 조회 2개

**Files:** Modify `backend/src/services/cable.service.ts`, `backend/src/controllers/cable.controller.ts`, route files, `backend/src/index.ts`; Create `backend/tests/cableConnections.integration.test.ts`

- [ ] **Step 1: 서비스 — getBySubstationId / getByAssetId**

READ `cable.service.ts`, especially `getByFloorId` and the `mapToDetail`/`CableDetail` builder (the DTO that resolves endpoint names). MIRROR that pattern:
- `getBySubstationId(substationId: string): Promise<CableDetail[]>`:
  - Load asset ids of the substation: `const assets = await prisma.asset.findMany({ where: { substationId }, select: { id: true } }); const ids = assets.map(a => a.id);`
  - Load distribution circuit ids whose parent asset is in the substation: `const circuits = await prisma.distributionCircuit.findMany({ where: { distributionEquipmentId: { in: ids } }, select: { id: true } }); const circuitIds = circuits.map(c => c.id);`
  - Cables where any endpoint is in those sets:
    ```ts
    const cables = await prisma.cable.findMany({ where: { OR: [
      { sourceEquipmentId: { in: ids } }, { targetEquipmentId: { in: ids } },
      { sourceModuleId: { in: ids } }, { targetModuleId: { in: ids } },
      { sourceCircuitId: { in: circuitIds } }, { targetCircuitId: { in: circuitIds } },
    ] }, include: { /* same includes getByFloorId uses for name resolution */ } });
    ```
  - Map to `CableDetail` via the SAME mapper `getByFloorId` uses. Return.
- `getByAssetId(assetId: string): Promise<CableDetail[]>`:
  - Child module ids: `const modules = await prisma.asset.findMany({ where: { parentAssetId: assetId }, select: { id: true } }); const moduleIds = modules.map(m => m.id);`
  - `const endpointIds = [assetId, ...moduleIds];`
  - Cables where source/target equipmentId or moduleId ∈ endpointIds (+ circuits of assetId if it's a DISTRIBUTION):
    ```ts
    const circuitIds = (await prisma.distributionCircuit.findMany({ where: { distributionEquipmentId: assetId }, select: { id: true } })).map(c => c.id);
    where: { OR: [
      { sourceEquipmentId: { in: endpointIds } }, { targetEquipmentId: { in: endpointIds } },
      { sourceModuleId: { in: endpointIds } }, { targetModuleId: { in: endpointIds } },
      { sourceCircuitId: { in: circuitIds } }, { targetCircuitId: { in: circuitIds } },
    ] }
    ```
  - Map to CableDetail, return.
> 핵심: `getByFloorId` 가 쓰는 include + mapper 를 그대로 재사용해 DTO(이름 resolved)를 동일하게. 다르면 보고.

- [ ] **Step 2: 컨트롤러 + 라우트**

In `cable.controller.ts`, add:
```ts
async getBySubstation(req, res, next) { try { res.json({ data: await cableService.getBySubstationId(req.params.substationId) }); } catch (e) { next(e); } },
async getByAsset(req, res, next) { try { res.json({ data: await cableService.getByAssetId(req.params.assetId) }); } catch (e) { next(e); } },
```
(Match the controller's existing style/handler signatures.)
Routes (follow existing auth pattern — read = `authenticate`):
- `GET /api/substations/:substationId/connections` → add to the substations router (or a connections router mounted at `/api/substations`). Grep how `/api/substations/:substationId/assets/commit` (assetCommit.routes) is mounted and mirror.
- `GET /api/assets/:assetId/connections` → add to `assets.routes.ts` (it already has `/:id` GET).
Register any new router in `index.ts`.

- [ ] **Step 3: 통합 테스트**

Create `backend/tests/cableConnections.integration.test.ts`. MIRROR `assetCommit.integration.test.ts` setup (express app + auth + errorHandler, admin login, hq→branch→substation fixtures). Then:
- Create 2 assets in the substation (assetType placementKind null) + 1 cable between them (`prisma.cable.create({ data: { sourceEquipmentId: a1.id, targetEquipmentId: a2.id, cableType: 'LAN' } })`).
- `GET /api/substations/${subId}/connections` → 200, body.data length ≥ 1, includes the cable with resolved source/target names.
- `GET /api/assets/${a1.id}/connections` → 200, includes the cable (a1 is source).
- `GET /api/assets/${a2.id}/connections` → 200, includes the cable (a2 is target).
- afterAll cleanup (delete cable, assets, substation, branch, hq).
> cableType enum 값·필수필드는 schema 확인. OFD 아닌 일반 케이블이면 fiberPath 불필요.

- [ ] **Step 4: 실행 + Commit**

`cd backend && npx vitest run tests/cableConnections.integration.test.ts tests/assetCommit.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts` → PASS(회귀 포함). `npm run build` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/cable.service.ts backend/src/controllers/cable.controller.ts backend/src/routes/ backend/src/index.ts backend/tests/cableConnections.integration.test.ts
git commit -m "feat(connections): 변전소/자산 연결 조회 엔드포인트(GET /substations|assets/:id/connections)"
```
(라우트 파일은 실제 수정/신규한 것만 add.)

---

## Task 2: 프론트 — 연결 훅 (조회 2 + 뮤테이션)

**Files:** Create `frontend/src/features/connections/hooks/useAssetConnections.ts`, `useSubstationConnections.ts`, `useCableMutations.ts`

> 확인: 프론트에 `CableDetailDTO` 타입이 있는지(`grep -rn "CableDetailDTO\|cableDtoToLocal" frontend/src`). 있으면 그 타입 재사용; 없으면 응답 형태로 로컬 타입 정의. axios `api` from `frontend/src/utils/api`.

- [ ] **Step 1: 조회 훅**

Create `useAssetConnections.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableDetailDTO } from '../../network/store'; // 실제 위치로 조정(grep 결과)

export function useAssetConnections(assetId: string | undefined) {
  return useQuery<CableDetailDTO[]>({
    queryKey: ['asset-connections', assetId],
    queryFn: async () => (await api.get<{ data: CableDetailDTO[] }>(`/assets/${assetId}/connections`)).data.data,
    enabled: !!assetId && !assetId.startsWith('temp-'),
    staleTime: 15_000,
  });
}
```
Create `useSubstationConnections.ts` (same shape, `/substations/${substationId}/connections`, key `['substation-connections', substationId]`).
> `CableDetailDTO` import 경로는 grep 으로 확인해 맞춘다. 없으면 두 훅이 공유할 `features/connections/types.ts` 에 최소 타입 정의(`id, source{equipmentId,moduleId,name}, target{...}, cableType, label, length`).

- [ ] **Step 2: 뮤테이션 훅**

Create `useCableMutations.ts`:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';

export function useCableMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asset-connections'] });
    qc.invalidateQueries({ queryKey: ['substation-connections'] });
  };
  const updateCable = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string | null; cableType?: string } }) =>
      api.put(`/cables/${id}`, patch),
    onSuccess: invalidate,
  });
  const deleteCable = useMutation({
    mutationFn: (id: string) => api.delete(`/cables/${id}`),
    onSuccess: invalidate,
  });
  return { updateCable, deleteCable };
}
```
> `PUT /cables/:id` 가 받는 필드(label/cableType/length 등)는 `cables.routes.ts` zod 확인 후 맞춘다.

- [ ] **Step 3: 타입체크 + Commit**

`cd frontend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/hooks/useAssetConnections.ts frontend/src/features/connections/hooks/useSubstationConnections.ts frontend/src/features/connections/hooks/useCableMutations.ts
git commit -m "feat(connections): 연결 조회/뮤테이션 훅(asset·substation connections, /cables 편집)"
```
(`features/connections/types.ts` 만들었으면 함께 add.)

---

## Task 3: 상세 패널 "연결" 섹션

**Files:** Create `frontend/src/features/connections/components/AssetConnectionsSection.tsx`, `AssetConnectionsSection.test.tsx`; Modify `frontend/src/features/assets/components/AssetDetailPanel.tsx`

- [ ] **Step 1: 실패 테스트**

Create `AssetConnectionsSection.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetConnectionsSection } from './AssetConnectionsSection';

const conns = [
  { id: 'c1', source: { equipmentId: 'A', moduleId: null, name: '장비A' },
    target: { equipmentId: 'B', moduleId: null, name: '장비B' }, cableType: 'LAN', label: 'L1', length: null },
] as any;
const noop = { onDelete: vi.fn(), onUpdate: vi.fn(), onSelectAsset: vi.fn() };

describe('AssetConnectionsSection', () => {
  it('상대(target) 이름·유형 표시 — 이 자산이 source(A)', () => {
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} />);
    expect(screen.getByText(/장비B/)).toBeInTheDocument();
    expect((screen.getByLabelText('유형') as HTMLSelectElement).value).toBe('LAN');
  });
  it('상대 이름 클릭 → onSelectAsset(상대 id)', () => {
    const onSelectAsset = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onSelectAsset={onSelectAsset} />);
    fireEvent.click(screen.getByText(/장비B/));
    expect(onSelectAsset).toHaveBeenCalledWith('B');
  });
  it('삭제 → onDelete(cableId)', () => {
    const onDelete = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('연결 삭제'));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
  it('유형 변경 → onUpdate(cableType)', () => {
    const onUpdate = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('유형'), { target: { value: 'DC' } });
    expect(onUpdate).toHaveBeenCalledWith('c1', { cableType: 'DC' });
  });
  it('라벨 변경(blur) → onUpdate(label)', () => {
    const onUpdate = vi.fn();
    render(<AssetConnectionsSection assetId="A" connections={conns} {...noop} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('라벨') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'L2' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith('c1', { label: 'L2' });
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/connections/components/AssetConnectionsSection.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

Create `AssetConnectionsSection.tsx`:
```tsx
interface Endpoint { equipmentId: string | null; moduleId: string | null; name: string }
interface Conn { id: string; source: Endpoint; target: Endpoint; cableType: string; label: string | null; length: number | null }
interface Props {
  assetId: string;
  connections: Conn[];
  onDelete: (cableId: string) => void;
  onUpdate: (cableId: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (assetId: string) => void;
}

const epId = (e: Endpoint) => e.equipmentId ?? e.moduleId;
const TYPES = ['AC', 'DC', 'LAN', 'FIBER', 'GROUND'];

export function AssetConnectionsSection({ assetId, connections, onDelete, onUpdate, onSelectAsset }: Props) {
  if (!connections.length) return <p className="text-xs text-gray-400">연결 없음</p>;
  return (
    <div className="space-y-0.5">
      {connections.map((c) => {
        const isSource = epId(c.source) === assetId;
        const other = isSource ? c.target : c.source;
        const otherId = epId(other);
        return (
          <div key={c.id} className="flex items-center gap-2 text-sm py-0.5">
            <button
              className="flex-1 text-left text-blue-700 hover:underline truncate"
              onClick={() => otherId && onSelectAsset(otherId)}>
              {other.name}
            </button>
            <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
              className="text-xs border border-gray-200 rounded px-1 py-0.5 shrink-0">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input aria-label="라벨" defaultValue={c.label ?? ''}
              onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
              className="w-16 text-xs border border-gray-200 rounded px-1 py-0.5 shrink-0" placeholder="라벨" />
            <button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-gray-300 hover:text-red-500 shrink-0">✕</button>
          </div>
        );
      })}
    </div>
  );
}
```
> 라벨 input 은 `defaultValue`(uncontrolled) — 부모(AssetDetailPanel)가 `key={asset.id}` 로 remount 하므로 자산 전환 시 리셋됨(기존 패턴). connections 데이터 변경 시 정렬 안정성을 위해 row `key={c.id}`.

- [ ] **Step 4: AssetDetailPanel 에 섹션 추가**

In `AssetDetailPanel.tsx`: import `useAssetConnections`, `useCableMutations`, `AssetConnectionsSection`, `useSelection`(from workspace SelectionContext). Add a "연결" section (below 생애주기/속성, above/below 사진):
```tsx
const { data: connections = [] } = useAssetConnections(asset.id);
const { deleteCable, updateCable } = useCableMutations();
const sel = useSelection();
// ...in JSX, a labeled section:
<section>
  <h3 className="text-xs font-semibold text-gray-500 mb-1">연결</h3>
  <AssetConnectionsSection
    assetId={asset.id}
    connections={connections}
    onDelete={(id) => deleteCable.mutate(id)}
    onUpdate={(id, patch) => updateCable.mutate({ id, patch })}
    onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
  />
</section>
```
(Match the panel's existing section markup style. `asset.id` = equipment id.)

- [ ] **Step 5: 통과 + 빌드 + Commit**

`cd frontend && npx vitest run src/features/connections` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/components/AssetConnectionsSection.tsx frontend/src/features/connections/components/AssetConnectionsSection.test.tsx frontend/src/features/assets/components/AssetDetailPanel.tsx
git commit -m "feat(connections): 상세 패널 연결 섹션(상대·유형·라벨 수정·삭제·공유선택)"
```

---

## Task 4: 변전소 "연결" 뷰 컴포넌트

**Files:** Create `frontend/src/features/connections/components/SubstationConnectionsView.tsx`, `SubstationConnectionsView.test.tsx`

- [ ] **Step 1: 실패 테스트**

Create `SubstationConnectionsView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubstationConnectionsTable } from './SubstationConnectionsView';

const conns = [
  { id: 'c1', source: { equipmentId: 'A', moduleId: null, name: '장비A' }, target: { equipmentId: 'B', moduleId: null, name: '장비B' }, cableType: 'LAN', label: 'L1', length: 3 },
  { id: 'c2', source: { equipmentId: 'C', moduleId: null, name: '장비C' }, target: { equipmentId: 'D', moduleId: null, name: '장비D' }, cableType: 'DC', label: null, length: null },
] as any;

const noop = { onDelete: vi.fn(), onUpdate: vi.fn(), onSelectAsset: vi.fn() };

describe('SubstationConnectionsTable', () => {
  it('전체 연결 렌더', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="" {...noop} />);
    expect(screen.getByText('장비A')).toBeInTheDocument();
    expect(screen.getByText('장비D')).toBeInTheDocument();
  });
  it('유형 필터 적용', () => {
    render(<SubstationConnectionsTable connections={conns} typeFilter="LAN" {...noop} />);
    expect(screen.getByText('장비A')).toBeInTheDocument();
    expect(screen.queryByText('장비C')).not.toBeInTheDocument();
  });
  it('유형 변경 → onUpdate', () => {
    const onUpdate = vi.fn();
    render(<SubstationConnectionsTable connections={[conns[0]]} typeFilter="" {...noop} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('유형'), { target: { value: 'DC' } });
    expect(onUpdate).toHaveBeenCalledWith('c1', { cableType: 'DC' });
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

Create `SubstationConnectionsView.tsx` exporting both a pure `SubstationConnectionsTable` (test target) and a connected `SubstationConnectionsView`:
```tsx
import { useState } from 'react';
import { useSubstationConnections } from '../hooks/useSubstationConnections';
import { useCableMutations } from '../hooks/useCableMutations';
import { useSelection } from '../../workspace/SelectionContext';

interface Endpoint { equipmentId: string | null; moduleId: string | null; name: string }
interface Conn { id: string; source: Endpoint; target: Endpoint; cableType: string; label: string | null; length: number | null }
const epId = (e: Endpoint) => e.equipmentId ?? e.moduleId;

const EDIT_TYPES = ['AC', 'DC', 'LAN', 'FIBER', 'GROUND'];

export function SubstationConnectionsTable({ connections, typeFilter, onDelete, onUpdate, onSelectAsset }: {
  connections: Conn[]; typeFilter: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (id: string) => void;
}) {
  const rows = typeFilter ? connections.filter((c) => c.cableType === typeFilter) : connections;
  if (!rows.length) return <p className="p-4 text-sm text-gray-400">연결 없음</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-500 border-b">
        <th className="p-2">출발</th><th className="p-2">도착</th><th className="p-2">유형</th><th className="p-2">라벨</th><th className="p-2">길이</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b hover:bg-gray-50">
            <td className="p-2"><button className="text-blue-700 hover:underline" onClick={() => epId(c.source) && onSelectAsset(epId(c.source)!)}>{c.source.name}</button></td>
            <td className="p-2"><button className="text-blue-700 hover:underline" onClick={() => epId(c.target) && onSelectAsset(epId(c.target)!)}>{c.target.name}</button></td>
            <td className="p-2">
              <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
                className="text-xs border border-gray-200 rounded px-1 py-0.5">
                {EDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td className="p-2">
              <input aria-label="라벨" defaultValue={c.label ?? ''} key={c.id + (c.label ?? '')}
                onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
                className="w-20 text-xs border border-gray-200 rounded px-1 py-0.5" placeholder="-" />
            </td>
            <td className="p-2 text-gray-500">{c.length ?? '-'}</td>
            <td className="p-2"><button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-gray-300 hover:text-red-500">✕</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TYPES = ['', 'AC', 'DC', 'LAN', 'FIBER', 'GROUND'];

export function SubstationConnectionsView({ substationId }: { substationId: string }) {
  const { data: connections = [] } = useSubstationConnections(substationId);
  const { deleteCable, updateCable } = useCableMutations();
  const sel = useSelection();
  const [typeFilter, setTypeFilter] = useState('');
  return (
    <div className="h-full overflow-auto">
      <div className="p-2 border-b flex gap-2 items-center">
        <span className="text-xs text-gray-500">유형</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm border rounded px-1 py-0.5">
          {TYPES.map((t) => <option key={t} value={t}>{t || '전체'}</option>)}
        </select>
        <span className="text-xs text-gray-400">{connections.length}건</span>
      </div>
      <SubstationConnectionsTable
        connections={connections} typeFilter={typeFilter}
        onDelete={(id) => deleteCable.mutate(id)}
        onUpdate={(id, patch) => updateCable.mutate({ id, patch })}
        onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
      />
    </div>
  );
}
```

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/connections` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/components/SubstationConnectionsView.tsx frontend/src/features/connections/components/SubstationConnectionsView.test.tsx
git commit -m "feat(connections): 변전소 연결 뷰(표·필터·메타수정·삭제·공유선택)"
```

---

## Task 5: 워크스페이스 "연결" 뷰 등록

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`

- [ ] **Step 1: VIEWS 에 connections 추가 + 본문 분기**

In `SubstationWorkspacePage.tsx`:
- import: `import { SubstationConnectionsView } from '../features/connections/components/SubstationConnectionsView';`
- Add to VIEWS: `{ key: 'connections', label: '연결' }` (after register/plan).
- `ViewKey` 가 union 이므로 `view` 계산이 'register'|'plan'|'connections' 를 수용하도록: `const view: ViewKey = rawView === 'plan' ? 'plan' : rawView === 'connections' ? 'connections' : 'register';`
- 탭 버튼 onClick: connections 는 `switchView('connections')`(plan 처럼 floor 필요 없음). 기존 `v.key === 'plan' && selectedFloorId ? gotoFloor : switchView(v.key)` 분기에 connections 는 자동으로 switchView 로 감(plan 아니므로). 확인.
- 본문 분기: `view === 'plan' ? <편집기> : view === 'connections' ? <SubstationConnectionsView substationId={substationId} /> : <SubstationAssetGrid .../>`.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/connections src/features/workspace src/features/assets` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx
git commit -m "feat(workspace): '연결' 뷰를 뷰 레지스트리에 추가(연결성 1급화 표면)"
```

---

## 최종 검증
- [ ] 백엔드: `cd backend && npx vitest run tests/cableConnections.integration.test.ts tests/assetCommit.integration.test.ts tests/floorPlanOcc.integration.test.ts` → PASS. `npm run build` → 0.
- [ ] 프론트: `cd frontend && npx vitest run src/features/connections src/features/workspace src/features/assets` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 현황에서 연결된 장비 선택 → 상세 패널 "연결"에 상대·유형 표시. ② 삭제 즉시 반영. ③ 워크스페이스 "연결" 뷰 → 전체 케이블 표·유형 필터. ④ 연결 상대 클릭 → 공유 선택(배치도 전환 시 그 장비). ⑤ 캔버스 케이블 편집 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 현황 상세 패널 연결 섹션(상대·유형·라벨 수정·삭제·공유선택)
- [ ] 변전소 "연결" 뷰(표·필터·메타수정·삭제)
- [ ] 백엔드 조회 2개 + /cables 편집 재사용, 캔버스 회귀 없음

## 이후
- 단계 C: 토폴로지 정식 뷰 + 전원계통도 자동생성(이 연결 그래프 기반). 단계 D: 커밋 통합.
