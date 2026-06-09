# 현황 안정화 — 통합 노드 현황 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 트리에서 본부/사업소/변전소 클릭 모두 일관된 현황(`NodeStatusView` — 읽기 리스트, 실무 컬럼, 설치장소·마지막점검일)을 보이고, 편집은 인스펙터로 일원화한다.

**Architecture:** 백엔드 노드범위 자산 리스트(`listByNode` + `collectSubstationIds`) → 프론트 `useNodeAssets` → `NodeStatusView`(읽기, 요약 칩 + 고정 컬럼 + 검색/필터/그룹/하이라이트). 트리 클릭 통일(본부/사업소→홈 현황), 워크스페이스 현황=NodeStatusView + registerStore 커밋 바. 개요(OverviewView) 제거.

**Tech Stack:** Express+Prisma+Zod+vitest(+supertest) 백엔드 / React+Vite+React Query+Zustand+vitest(+RTL) 프론트. dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-06-unified-node-status-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**백엔드**: `services/asset.service.ts`(+listByNode/collectSubstationIds), `controllers/asset.controller.ts`(+listByNode), `routes/nodes.routes.ts`(신규), `app.ts`(라우트 등록), 테스트.
**프론트 신규**: `features/assets/components/NodeStatusView.tsx`(+test), `hooks/useNodeAssets.ts`, `features/assets/nodeStatus.ts`(순수 헬퍼+타입, test).
**프론트 수정**: `components/tree/TreePanel.tsx`, `pages/TreePage.tsx`, `pages/SubstationWorkspacePage.tsx`, `features/assets/components/AssetInspector.tsx`.

---

## Task 1: 백엔드 — 노드범위 자산 리스트

**Files:** Modify `backend/src/services/asset.service.ts`, `backend/src/controllers/asset.controller.ts`; Create `backend/src/routes/nodes.routes.ts`; Modify `backend/src/app.ts`; Create `backend/src/services/__tests__/listByNode.test.ts` (or alongside existing asset tests)

- [ ] **Step 1: 현황 파악**

READ: `asset.service.ts`(assetInclude, mapToDetail, listBySubstation ~L80), `rackModuleStats.service.ts:236-256`(collectFloorIds 패턴), `prisma/schema.prisma`(Asset/Substation/Branch/Headquarters/Floor/MaintenanceLog 관계), `app.ts`(라우트 등록 방식), 기존 백엔드 테스트 1개(supertest 패턴 + 로그인 헬퍼).

- [ ] **Step 2: 실패 테스트**

Create a backend test (match existing test style — supertest + admin login). Seed or use existing seed: a branch with ≥1 substation with ≥1 asset that has assetType/substation; assert:
```ts
// GET /api/nodes/:branchId/assets?nodeType=branch → 200, array; each item has
//   substationName (string), assetTypeName (string), lastMaintenanceDate (string|null), installDate field present.
// GET /api/nodes/:substationId/assets?nodeType=substation → only that substation's assets.
// 401 without auth.
```
Run the backend test → FAIL (route 404).

- [ ] **Step 3: service — collectSubstationIds + listByNode**

In `asset.service.ts`:
```ts
type NodeType = 'headquarters' | 'branch' | 'substation';

export interface AssetListItem {
  id: string; name: string;
  assetTypeName: string; assetTypeColor: string | null;
  substationId: string; substationName: string;
  floorId: string | null; floorName: string | null; roomText: string | null;
  installDate: Date | null; manager: string | null; status: string | null;
  warrantyUntil: Date | null; replaceDue: Date | null;
  lastMaintenanceDate: Date | null;
}

async function collectSubstationIds(nodeType: NodeType, nodeId: string): Promise<string[]> {
  if (nodeType === 'substation') return [nodeId];
  if (nodeType === 'branch') {
    const subs = await prisma.substation.findMany({ where: { branchId: nodeId }, select: { id: true } });
    return subs.map((s) => s.id);
  }
  const subs = await prisma.substation.findMany({ where: { branch: { headquartersId: nodeId } }, select: { id: true } });
  return subs.map((s) => s.id);
}

// in assetService:
async listByNode(nodeType: NodeType, nodeId: string): Promise<AssetListItem[]> {
  const substationIds = await collectSubstationIds(nodeType, nodeId);
  if (substationIds.length === 0) return [];
  const rows = await prisma.asset.findMany({
    where: { substationId: { in: substationIds } },
    include: {
      assetType: { select: { name: true, displayColor: true } },
      substation: { select: { name: true } },
      floor: { select: { name: true } },
      maintenanceLogs: { where: { logType: 'MAINTENANCE' }, orderBy: { logDate: 'desc' }, take: 1, select: { logDate: true } },
    },
    orderBy: [{ substationId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id, name: r.name,
    assetTypeName: r.assetType.name, assetTypeColor: r.assetType.displayColor,
    substationId: r.substationId, substationName: r.substation.name,
    floorId: r.floorId, floorName: r.floor?.name ?? null, roomText: r.roomText,
    installDate: r.installDate, manager: r.manager, status: r.status,
    warrantyUntil: r.warrantyUntil, replaceDue: r.replaceDue,
    lastMaintenanceDate: r.maintenanceLogs[0]?.logDate ?? null,
  }));
}
```
(필드명은 schema 확인해 맞출 것 — displayColor/roomText/logDate 등.)

- [ ] **Step 4: controller + route + 등록**

`asset.controller.ts`:
```ts
async listByNode(req: Request, res: Response): Promise<void> {
  const { nodeId } = req.params;
  const nodeType = req.query.nodeType as 'headquarters' | 'branch' | 'substation';
  if (!['headquarters', 'branch', 'substation'].includes(nodeType)) { res.status(400).json({ message: 'invalid nodeType' }); return; }
  res.json({ data: await assetService.listByNode(nodeType, nodeId) });
}
```
Create `routes/nodes.routes.ts`:
```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';  // match actual path
import { assetController } from '../controllers/asset.controller';
const router = Router();
router.get('/:nodeId/assets', authenticate, assetController.listByNode);
export default router;
```
Register in `app.ts`: `app.use('/api/nodes', nodesRoutes);` (match existing registration style).

- [ ] **Step 5: 통과 + Commit**

Run backend test → PASS. `cd backend && npx tsc --noEmit` (or build) → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/asset.service.ts backend/src/controllers/asset.controller.ts backend/src/routes/nodes.routes.ts backend/src/app.ts backend/src/services/__tests__/listByNode.test.ts
git commit -m "feat(asset): 노드범위 자산 리스트 listByNode + GET /nodes/:id/assets(설치장소·마지막점검일)"
```

---

## Task 2: 프론트 — useNodeAssets 훅 + 헬퍼/타입 (RTL)

**Files:** Create `frontend/src/hooks/useNodeAssets.ts`, `frontend/src/features/assets/nodeStatus.ts`, `frontend/src/features/assets/nodeStatus.test.ts`

- [ ] **Step 1: 실패 테스트 (순수 헬퍼)**

Create `nodeStatus.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { installLocation, inspectionState } from './nodeStatus';

const base = { substationName: '춘천S/S', floorName: null, roomText: null } as any;
describe('installLocation', () => {
  it('floorName 우선', () => expect(installLocation({ ...base, floorName: '통신실' })).toBe('춘천S/S 통신실'));
  it('floor 없으면 roomText', () => expect(installLocation({ ...base, roomText: '배전실' })).toBe('춘천S/S 배전실'));
  it('둘 다 없으면 변전소명', () => expect(installLocation(base)).toBe('춘천S/S'));
});
describe('inspectionState', () => {
  const today = new Date('2026-06-06T00:00:00Z');
  it('null → 미점검', () => expect(inspectionState(null, today).level).toBe('none'));
  it('1년 초과 → 지연', () => expect(inspectionState('2025-01-01', today).level).toBe('overdue'));
  it('최근 → 정상', () => expect(inspectionState('2026-05-01', today).level).toBe('ok'));
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

`nodeStatus.ts`:
```ts
export interface AssetListItem {
  id: string; name: string;
  assetTypeName: string; assetTypeColor: string | null;
  substationId: string; substationName: string;
  floorId: string | null; floorName: string | null; roomText: string | null;
  installDate: string | null; manager: string | null; status: string | null;
  warrantyUntil: string | null; replaceDue: string | null;
  lastMaintenanceDate: string | null;
}

export function installLocation(a: Pick<AssetListItem, 'substationName' | 'floorName' | 'roomText'>): string {
  const room = a.floorName ?? a.roomText;
  return room ? `${a.substationName} ${room}` : a.substationName;
}

const OVERDUE_DAYS = 365;
export function inspectionState(lastDate: string | null, today: Date): { level: 'none' | 'ok' | 'overdue'; label: string } {
  if (!lastDate) return { level: 'none', label: '미점검' };
  const days = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
  if (days > OVERDUE_DAYS) return { level: 'overdue', label: new Date(lastDate).toLocaleDateString('ko-KR') };
  return { level: 'ok', label: new Date(lastDate).toLocaleDateString('ko-KR') };
}
```
`useNodeAssets.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';  // match actual api client path
import type { AssetListItem } from '../features/assets/nodeStatus';

export type NodeKind = 'headquarters' | 'branch' | 'substation';
export function useNodeAssets(nodeType: NodeKind | null, nodeId: string | null) {
  return useQuery({
    queryKey: ['nodeAssets', nodeType, nodeId],
    queryFn: async () => {
      const { data } = await api.get<{ data: AssetListItem[] }>(`/nodes/${nodeId}/assets`, { params: { nodeType } });
      return data.data;
    },
    enabled: !!nodeType && !!nodeId,
  });
}
```

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets/nodeStatus.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/hooks/useNodeAssets.ts frontend/src/features/assets/nodeStatus.ts frontend/src/features/assets/nodeStatus.test.ts
git commit -m "feat(assets): useNodeAssets 훅 + nodeStatus 헬퍼(설치장소·점검상태)"
```

---

## Task 3: NodeStatusView (읽기 리스트 + 편의) (RTL)

**Files:** Create `frontend/src/features/assets/components/NodeStatusView.tsx`, `NodeStatusView.test.tsx`

- [ ] **Step 1: 실패 테스트 (렌더/필터/행클릭)**

Create `NodeStatusView.test.tsx` — mock `useNodeAssets` + `useNodeStats` to return fixed items; wrap in QueryClientProvider + a SelectionContext provider (or pass onSelectAsset). Assert:
```tsx
// 컬럼 헤더 종류/이름/설치장소/설치일/담당자/마지막 점검일/상태 렌더
// 설치장소 셀 "춘천S/S 통신실" 표시
// 이름 검색 인풋에 입력 → 일치 행만
// 행 클릭 → onSelectAsset(id) 호출
```
(mock 방법은 기존 RTL 테스트 패턴 따름. useNodeAssets/useNodeStats 를 vi.mock.)

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

`NodeStatusView.tsx`, props `{ nodeType: NodeKind; nodeId: string }`:
- 데이터: `const { data: items = [] } = useNodeAssets(nodeType, nodeId);` `const { data: stats } = useNodeStats(nodeType, nodeId);`
- 상태: `search`, `typeFilter`, `substationFilter`(nodeType!=='substation'일 때만), `statusFilter`.
- `const today = useMemo(() => new Date(), []);`
- 공유 선택/네비: `const sel = useSelection(); const ws = useWorkspaceNav(); const navigate = useNavigate();`
- filtered = items.filter(검색=name includes, typeFilter, substationFilter, statusFilter).
- **요약 칩**: 재사용 `StatusSummary`(SubstationStatusView 에서 export 되어 있으면 import; 아니면 간단 인라인) — 총계 + 종류별(stats.self.byCategory).
- **툴바**: 검색 인풋, 종류 select(고유 assetTypeName), 변전소 select(nodeType!=='substation'), 상태 select, CSV 버튼(있으면 재사용/간단).
- **표(읽기전용)**: 헤더 종류/이름/설치장소/설치일/담당자/마지막 점검일/상태.
  - nodeType!=='substation'면 `substationName` 으로 그룹(그룹 헤더 행) — `filtered` 를 substationName 별로 묶어 렌더.
  - 행: 종류(색점+assetTypeName), 이름(+ 생애주기 배지: `assetAlert` 재사용 — warrantyUntil/replaceDue), 설치장소(`installLocation(item)`), 설치일, 담당자, 마지막 점검일(`inspectionState` — level별 색: none=회색 '미점검', overdue=주황, ok=기본), 상태.
  - 행 클릭 → `sel?.setSelectedAssetId(item.id)`. 행 우측 도면 아이콘(item.floorId 있으면) → `ws ? ws.gotoFloor(item.floorId) : navigate(\`/substations/${item.substationId}/workspace?view=plan&floor=${item.floorId}\`)`.
- 루트 `h-full flex flex-col`: 요약+툴바 shrink-0, 표 영역 flex-1 overflow-auto.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets/components/NodeStatusView.test.tsx` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/NodeStatusView.tsx frontend/src/features/assets/components/NodeStatusView.test.tsx
git commit -m "feat(assets): NodeStatusView — 노드 현황 읽기 리스트(설치장소·점검상태·검색·필터·그룹·도면점프)"
```

---

## Task 4: 진입 통일 — 트리 클릭 + 홈 현황

**Files:** Modify `frontend/src/components/tree/TreePanel.tsx`, `frontend/src/pages/TreePage.tsx`

- [ ] **Step 1: 트리 본부/사업소 클릭 → 홈 네비**

READ `TreePanel.tsx handleClick`(현재 hq/branch는 expand/select만, substation→workspace, floor→plan). hq/branch 분기에 `navigate('/')` 추가(setViewingNodeId/expand 유지). substation/floor 는 그대로.

- [ ] **Step 2: 홈 = NodeStatusView**

READ `TreePage.tsx`(현재 viewingNode 컨테이너면 OverviewView). 변경: `OverviewView` → `NodeStatusView`:
```tsx
{viewingNode && viewingNode.type !== 'floor' ? (
  <NodeStatusView
    nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'}
    nodeId={viewingNode.id}
  />
) : (
  <div className="p-8 text-sm text-gray-500">좌측 트리에서 본부·사업소·변전소를 선택하세요.</div>
)}
```
`OverviewView` import 제거. (홈에 substation viewingNode 가 올 수도 있으나 NodeStatusView 가 처리 — 안전.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/components src/features/assets` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/tree/TreePanel.tsx frontend/src/pages/TreePage.tsx
git commit -m "feat(ui): 본부/사업소 클릭→홈 현황(NodeStatusView), 트리 클릭 동작 통일"
```

---

## Task 5: 워크스페이스 현황 = NodeStatusView + 커밋 바 + 인스펙터 드릴 (핵심)

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`, `frontend/src/features/assets/components/AssetInspector.tsx`

- [ ] **Step 1: 현황 파악 (커밋 바 위치)**

READ `SubstationWorkspacePage.tsx`(현재 status뷰=SubstationStatusView), `SubstationStatusView.tsx` 및 그 안의 `SubstationAssetGrid`(registerStore 워킹카피 + **커밋 바** + 인라인 편집이 어디에 있는지 — 커밋 바 컴포넌트/마크업, registerStore 훅, 커밋 액션). 커밋 바를 현황 뷰 레벨로 올리는 방법 파악(커밋 바 마크업 + registerStore 구독을 워크스페이스 status 분기로).

- [ ] **Step 2: 워크스페이스 status = NodeStatusView + 커밋 바**

`SubstationWorkspacePage.tsx`: status 분기를
```tsx
<div className="h-full flex flex-col">
  {/* registerStore 에 스테이지된 변경이 있으면 커밋 바 (SubstationAssetGrid 에서 가져온 마크업/로직) */}
  <RegisterCommitBar substationId={substationId} />   {/* 또는 인라인 — Step1 에서 본 구조대로 */}
  <div className="flex-1 min-h-0">
    <NodeStatusView nodeType="substation" nodeId={substationId} />
  </div>
</div>
```
- 커밋 바: 기존 SubstationAssetGrid 의 커밋 바(registerStore 변경 수 + 커밋/취소 버튼)를 추출하거나 그 마크업을 status 분기에 재현. registerStore 구독은 그대로(substationId 기준). 인스펙터 편집(②A edit 모드)이 registerStore.stage 하므로 커밋 바가 그걸 반영.
- `SubstationStatusView`/`SubstationAssetGrid` import 제거(미사용 시). `OverviewView` 잔재 제거.
- 본문 분기 `plan`/`connections` 유지.

- [ ] **Step 3: 인스펙터 — 본부 맥락 "변전소에서 편집" 드릴**

`AssetInspector.tsx`(view 모드 onGotoRegister): 홈(본부/사업소) 맥락에서 자산은 다른 변전소 소속일 수 있음. NodeStatusView/홈에서 인스펙터를 띄울 때 `onGotoRegister(assetId)` 가 그 자산의 **변전소 워크스페이스 현황**으로 가도록 — 호출부(홈/NodeStatusView 가 인스펙터를 어떻게 띄우는지)에서 `onGotoRegister`를 `(id) => navigate(registerUrl(item.substationId, id))` 로 연결. (registerUrl 이 `?view=status&assetId=` 로 가는지 확인 — Task 의 gotoRegister 가 status 로 가게 ②C 에서 바뀌었으면 OK. AssetInspector 자체 변경은 최소 — onGotoRegister 시그니처 유지, 호출부에서 substationId 주입.)
> 주: 홈에서 인스펙터를 어떻게 렌더하는지(우측 패널) 확인 필요 — 현재 홈엔 인스펙터 슬롯이 없을 수 있음. 있으면 그 호출부에 onGotoRegister 연결, 없으면 행 클릭 시 바로 해당 변전소로 드릴(navigate)하는 단순안으로 대체하고 보고.

- [ ] **Step 4: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features src/components` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx frontend/src/features/assets/components/AssetInspector.tsx
git commit -m "feat(ui): 워크스페이스 현황=NodeStatusView + 커밋 바 이전, 본부 인스펙터 드릴"
```

---

## 최종 검증
- [ ] 백엔드 테스트 PASS. `cd frontend && npx vitest run src/components src/features` → PASS. `npx tsc --noEmit`(front+back) → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 트리 본부/사업소 클릭 → 홈에 현황(집계, 설치장소, 변전소별 그룹, 요약 칩). ② 변전소 클릭 → 워크스페이스 현황(그 변전소) + 평면도·연결. ③ 컬럼=종류/이름/설치장소/설치일/담당자/마지막점검일/상태(U수·포트수 없음). ④ 행 클릭 → 인스펙터; 변전소 맥락 편집→커밋 바→커밋 / 본부 맥락 읽기+"변전소에서 편집" 드릴. ⑤ 마지막점검일 미점검/지연 색, 생애주기 배지, 검색·필터, 도면 점프. ⑥ 평면도·연결·공유선택 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 본부/사업소/변전소 클릭 모두 일관 현황(NodeStatusView)
- [ ] 컬럼 종류/이름/설치장소/설치일/담당자/마지막점검일/상태(U수·포트수 제거)
- [ ] 설치장소·변전소별 그룹으로 어디 건지 식별
- [ ] 본부=읽기+드릴, 변전소=인스펙터 편집·커밋, 개요 제거
- [ ] 점검 하이라이트·생애주기 배지·검색·필터·도면 점프, 회귀 없음

## 이후
- 본부 요약에 변전소별 개수, 점검주기 기반 정밀 임박/지연. C4 연결→계통도. ③ 글로벌 검색.
