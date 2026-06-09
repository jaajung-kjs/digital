# (나) 변전소 통합 워크스페이스 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 범위: 변전소 단위 한 화면에서 **도면**과 **현황**을 탭으로 오가고, (가)의 상호 이동을 워크스페이스 안에서 탭 전환으로 재사용. UI 수렴의 완결(=U2 토대).

---

## 1. 배경 / 문제

(가)로 도면 에디터와 대장 레지스터가 같은 장비 정보를 공유하고 상호 이동까지 되지만, 둘은 **여전히 별도 페이지**(`/floors/:id/plan`, `/substations/:id/assets`)다. "도면에서 보기"를 누르면 라우트가 통째로 바뀐다. 사용자는 **한 변전소를 한 프레임에서** 도면↔현황을 즉시 오가길 원한다(탭 전환, 선택 컨텍스트 유지).

## 2. 목표 / 비목표

### 목표
1. 변전소 단위 워크스페이스 라우트 — 상단 `[도면][현황]` 탭, 각 탭은 전체 화면.
2. **현황 탭** = 기존 `SubstationAssetGrid` 임베드. **도면 탭** = 층 선택 드롭다운 + 기존 `FloorPlanEditor` 임베드.
3. (가)의 상호 이동을 **워크스페이스 안에선 탭 전환**으로 — 라우트 이탈 없이.
4. 탭·선택 층을 URL 쿼리로(새로고침·공유 가능).

### 비목표 (YAGNI / 후속)
- **자동 선택 동기화**(선택만 해도 양쪽 실시간 반영) — 버튼 기반 이동으로 충분.
- **좌우 분할** 레이아웃 — 탭으로 결정됨.
- 기존 `/floors/:id/plan`·`/substations/:id/assets` 라우트 제거 — **유지**(직접 링크·외부 딥링크 호환).
- 에디터/그리드 내부 로직 변경 — 그대로 임베드(prop 기반이라 가능).

## 3. 설계

### A. 라우트 & 진입
- 신규 라우트 `App.tsx`: `<Route path="/substations/:substationId/workspace" element={<SubstationWorkspacePage/>} />`(ProtectedRoute 하위).
- 트리에서 변전소 노드 → "워크스페이스" 진입 추가(현재 변전소에서 현황/도면으로 가는 지점에). `navigate('/substations/' + id + '/workspace')`. 기존 진입(트리 더블클릭 층→도면, 현황 표)은 그대로 둠.

### B. 워크스페이스 셸 — `SubstationWorkspacePage.tsx`
```
┌──────────────────────────────────┐
│ {변전소명}   [도면] [현황]            │   ← 탭 바
├──────────────────────────────────┤
│ (도면 탭) [층 ▼]                      │   ← 도면 탭일 때만 층 드롭다운
│   <FloorPlanEditor floorId key=floor>│
│ (현황 탭)                            │
│   <SubstationAssetGrid substationId> │
└──────────────────────────────────┘
```
- 상태 = URL 쿼리: `?tab=plan|register`(기본 register), `?floor=<floorId>`(도면 탭, 기본 = 층 목록 첫 번째).
- 층 목록: `organizationApi.listFloors(substationId)`(GET /substations/:id/floors) → `useQuery(['substation-floors', substationId])`. 드롭다운.
- **도면 탭 렌더**: `<FloorPlanEditor floorId={selectedFloorId} key={selectedFloorId} />` — `key` 로 층 전환 시 remount(에디터 전역 store 리셋). 층 없으면 "등록된 층 없음" 안내.
- **현황 탭 렌더**: `<SubstationAssetGrid substationId={substationId} />`.
- 셸이 `WorkspaceNavContext`(C) Provider 로 본문을 감쌈.
- **레이아웃 주의**: `FloorPlanEditor` 루트가 `h-screen w-full`(풀스크린 전제)이다. 워크스페이스는 탭 바 아래 영역에 끼워야 하므로, 셸을 `h-screen flex flex-col`(탭 바 `shrink-0` + 본문 `flex-1 min-h-0 relative`)로 잡고, 에디터가 그 본문을 채우도록 한다. 에디터 루트의 `h-screen` 이 탭 바 높이만큼 넘치면 `FloorPlanEditor` 컨테이너 클래스를 `h-full`(부모 채움)로 바꾸는 최소 수정을 포함(임베드 호환). 단독 라우트(`FloorPlanEditorPage`)는 부모가 `h-screen` 이므로 `h-full` 이어도 동일하게 동작.

### C. 상호 이동 — `WorkspaceNavContext`
신규 `frontend/src/features/workspace/WorkspaceNavContext.tsx`:
```tsx
interface WorkspaceNav {
  gotoFloor: (floorId: string, assetId?: string) => void;   // 도면 탭 + 층 + (장비 선택)
  gotoRegister: (assetId?: string) => void;                 // 현황 탭 + (자산 선택)
}
const Ctx = createContext<WorkspaceNav | null>(null);
export const useWorkspaceNav = () => useContext(Ctx);       // null = 워크스페이스 밖
```
- 셸이 Provider 로 구현 제공. 구현은 **URL 쿼리 조작**:
  - `gotoFloor(floorId, assetId)` → `setSearchParams({ tab:'plan', floor:floorId, ...(assetId?{equipmentId:assetId}:{}) })`.
  - `gotoRegister(assetId)` → `setSearchParams({ tab:'register', ...(assetId?{assetId}:{}) })`.
- **임베드된 에디터/그리드는 기존 딥링크 핸들러로 반응**(변경 불필요):
  - `FloorPlanEditor` 는 이미 `?equipmentId=` 를 읽어 패널 오픈+센터.
  - `SubstationAssetGrid` 는 이미 `?assetId=` 를 읽어 행 선택.
  - 즉 워크스페이스가 쿼리만 세팅하면 둘이 알아서 선택. (둘 다 소비 후 파라미터 제거하지만, 워크스페이스의 `tab`/`floor` 는 별개라 유지.)

### D. (가) 버튼 재배선 — 컨텍스트 우선
- `AssetDetailPanel` "도면에서 보기": 
  ```tsx
  const ws = useWorkspaceNav();
  onClick = () => ws ? ws.gotoFloor(asset.floorId!, asset.id) : navigate(floorPlanUrl(asset.floorId!, asset.id));
  ```
- `InfoTab` "대장에서 편집":
  ```tsx
  const ws = useWorkspaceNav();
  onClick = () => ws ? ws.gotoRegister(asset.id) : navigate(registerUrl(asset.substationId, asset.id));
  ```
- 워크스페이스 안이면 탭 전환, 밖(옛 라우트)이면 기존 navigate — 양쪽 호환.

> 주의: 그리드의 기존 `?assetId=` 핸들러와 에디터의 `?equipmentId=` 핸들러가 파라미터를 소비 후 `replace`로 지운다. 워크스페이스에서 `gotoFloor` 가 `equipmentId` 를 세팅 → 에디터가 소비·제거. `tab`/`floor` 는 남아 탭/층 유지. 충돌 없음.

## 4. 데이터 흐름
- 진입: `/substations/:id/workspace?tab=register`(기본) → 현황 탭(그리드).
- 도면 탭 클릭/`gotoFloor`: `?tab=plan&floor=F[&equipmentId=A]` → 층 F 에디터 렌더(`key=F`), A 있으면 에디터가 선택·센터.
- 현황에서 "도면에서 보기"(워크스페이스): `gotoFloor(asset.floorId, asset.id)` → 도면 탭·그 층·그 장비.
- 도면에서 "대장에서 편집"(워크스페이스): `gotoRegister(asset.id)` → 현황 탭·그 자산.

## 5. 영향 받는 파일
**신규**
- `frontend/src/pages/SubstationWorkspacePage.tsx` — 셸(탭·층 드롭다운·Provider)
- `frontend/src/features/workspace/WorkspaceNavContext.tsx` — 컨텍스트 + `useWorkspaceNav`
- `frontend/src/features/workspace/useSubstationFloors.ts` — 층 목록 useQuery(또는 page 내 인라인)

**수정**
- `frontend/src/App.tsx` — 워크스페이스 라우트
- `frontend/src/features/assets/components/AssetDetailPanel.tsx` — "도면에서 보기" 컨텍스트 우선
- `frontend/src/features/equipment/components/detail/InfoTab.tsx` — "대장에서 편집" 컨텍스트 우선
- 트리 진입(`TreePanel.tsx` 또는 변전소 액션 지점) — "워크스페이스" 추가
- `frontend/src/features/editor/components/FloorPlanEditor.tsx` — 루트 `h-screen`→`h-full`(임베드 호환, 단독 라우트도 동일 동작). 필요 시에만.

## 6. 테스트
- **단위(vitest+RTL)**: `useWorkspaceNav` Provider 밖에서 `null`. `gotoFloor`/`gotoRegister` 가 기대한 searchParams 를 세팅(MemoryRouter + 모의 셸).
- **(가) 버튼 분기**: WorkspaceNavContext Provider 있을 때 `gotoFloor` 호출, 없을 때 navigate(모의).
- **수동(dev)**: ① 트리 변전소 → 워크스페이스 → `[도면][현황]` 전환. ② 도면 탭 층 드롭다운으로 층 전환(에디터 remount). ③ 현황에서 "도면에서 보기" → 라우트 안 바뀌고 도면 탭+그 장비. ④ 도면에서 "대장에서 편집" → 현황 탭+그 자산. ⑤ 옛 라우트(`/substations/:id/assets`)에서 "도면에서 보기" → 기존처럼 에디터 라우트로 이동(컨텍스트 없음).

## 7. 성공 기준
1. `/substations/:id/workspace` 한 프레임에서 `[도면][현황]` 탭 전환, 각 전체 화면.
2. 도면 탭에서 층 드롭다운으로 층 선택(remount).
3. 워크스페이스 안에서 (가) 상호 이동이 **탭 전환**으로 동작(라우트 유지). 밖에선 기존 navigate.
4. 탭·층이 URL 쿼리에 반영(새로고침 유지).
5. 에디터/그리드 내부·기존 라우트·(가) 동작 회귀 없음.

## 8. 이후
- 선택 자동 동기화·좌우 분할(원하면 후속).
- V2 선번장/회선 → V3 점검 → V4 전원계통 → V5 송전선로.
