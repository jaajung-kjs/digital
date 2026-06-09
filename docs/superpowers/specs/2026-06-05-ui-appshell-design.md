# UI 리팩토링 ① — AppShell (영속 셸: 좌 트리 + 브레드크럼 + 메인) 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 전문적 현황관리 UI/UX 리팩토링의 **1단계**. 앱을 3개 분리된 껍데기에서 **하나의 영속 셸**로 통일 — 좌측 영속 트리 + 상단 브레드크럼 + 메인 콘텐츠. 변전소에 들어가도 트리·맥락을 잃지 않는다.

---

## 1. 배경 / 문제

현재 앱은 3개 껍데기로 분열: `/` 트리페이지(헤더+3패널) / 워크스페이스(탭만) / 옛 에디터·그리드(크롬 없음). **변전소에 들어가면 좌측 트리·브레드크럼을 잃고**, 다른 변전소로 가려면 `/`로 되돌아가야 한다. 같은 계층을 트리(좌)+카드(중앙)로 중복 표시. 진입점 7개 분산. 브레드크럼·검색 없음.

업계 표준(DCIM netTerrain·Device42, GIS, EAM): **하나의 영속 셸** — 좌측 영속 네비 트리 + 상단 브레드크럼/검색/유저 + 메인 컨텍스트 뷰 + 우측 인스펙터. "트리에서 선택 → 메인에서 본다."

## 2. 목표 / 비목표

### 목표 (1단계)
1. **`AppShell` 하나로 전 인증영역을 감싼다**: 상단 바(로고·브레드크럼·유저) + **좌측 영속 트리(접기 가능·기본 펼침)** + 메인 `<Outlet/>`.
2. **보호 라우트를 셸 아래 중첩** — 워크스페이스·에디터·그리드·홈이 모두 메인 영역에서 렌더(트리·브레드크럼 유지, 풀스크린 크롬리스 폐기).
3. **브레드크럼**(HQ>본부>변전소>층) 상단 표시.
4. **트리페이지 3패널 → 셸로 흡수**: 좌 트리는 셸로 이동(영속), `/` 홈의 메인 = 둘러보기(TreeVisualization 카드 + StatsSidePanel).
5. 좌측 트리 **접기 토글**(localStorage 기억) — 캔버스 등 넓은 뷰에서 공간 확보.

### 비목표 (2·3단계)
- **진입점 통일**(중복 "워크스페이스" 버튼·통계 랙클릭 정리), TreeVisualization을 메인 둘러보기로 정식 재설계 — 2단계.
- **글로벌 검색**, 대시보드 재설계, 상세 패널(EquipmentDetailPanel/AssetDetailPanel) 단일 컴포넌트 통합 — 3단계.
- 에디터/그리드 내부 레이아웃 변경 — 그대로(높이만 맞춤).
- 브레드크럼 cold deep-link 완전 robust(조상 미로드 시) — 1단계는 org store 기반 best-effort, 보강은 3단계.

## 3. 설계

### A. AppShell — `frontend/src/components/AppShell.tsx`
기존 `Layout.tsx`를 확장/대체:
```
┌──────────────────────────────────────────────────────┐
│ [로고→홈]  Breadcrumb              [유저 ▾ · 로그아웃] │ TopBar (shrink-0, h-12)
├─────────┬────────────────────────────────────────────┤
│ [◀접기] │                                            │
│ 좌측    │            <Outlet/> (메인)                 │
│ 트리    │                                            │
│(영속·   │                                            │
│ 접기O)  │                                            │
└─────────┴────────────────────────────────────────────┘
```
- 루트: `h-screen flex flex-col`. TopBar(`shrink-0`) + 하단 `flex-1 min-h-0 flex`(좌 nav + 메인).
- 좌 nav: `<TreePanel/>`(기존 컴포넌트 재사용, 영속). 컨테이너 `w-72 shrink-0 border-r overflow-auto`, 접힘 시 `w-0`(또는 좁은 레일 아이콘). 접기 토글 버튼(TopBar 좌측 또는 nav 상단), 상태 `localStorage('appshell-nav-collapsed')`.
- 메인: `flex-1 min-h-0 relative` — `<Outlet/>` 렌더.
- TopBar: 로고(→ `/`), `<Breadcrumb/>`, 유저명+역할+로그아웃(기존 Layout 헤더 내용 이전).

### B. Breadcrumb — `frontend/src/components/Breadcrumb.tsx`
- 현재 라우트 param(`substationId`/`floorId`)을 읽어 `useOrganizationStore`의 `findNode` + `parentId` 체인을 루트까지 거슬러 경로 구성: `HQ > 본부 > 변전소 > 층`. 각 항목 클릭 → 해당 노드로 네비(본부/변전소 등).
- org store에 조상 노드가 없으면(cold deep-link) 알려진 노드까지만 표시(best-effort). 홈(`/`)에선 빈/“전체”.
- 워크스페이스에선 `?view`/`?floor`도 반영 가능(예: 변전소 > (층) ). 최소: 변전소·층 이름.

### C. 라우트 재구성 — `frontend/src/App.tsx`
보호 라우트를 AppShell 아래로 중첩:
```tsx
<Route path="/login" element={<LoginPage/>} />
<Route element={<ProtectedRoute><AppShell/></ProtectedRoute>}>
  <Route path="/" element={<HomeOverview/>} />
  <Route path="/substations/:substationId/workspace" element={<SubstationWorkspacePage/>} />
  <Route path="/floors/:floorId/plan" element={<FloorPlanEditorPage/>} />
  <Route path="/substations/:substationId/assets" element={<SubstationAssetGridPage/>} />
</Route>
```
- AppShell이 `<Outlet/>`로 각 페이지를 메인에 렌더 → 모든 페이지가 트리·브레드크럼과 함께.

### D. 홈 둘러보기 — `pages/TreePage.tsx` 재구성
- 좌측 `TreePanel`은 셸로 이동했으므로 제거. `/` 홈의 메인 = `TreeVisualization`(중앙 카드) + `StatsSidePanel`(우). (2단계에서 메인 둘러보기로 정식 재설계 — 1단계는 이 둘을 메인에 배치만.)
- `Layout` 컴포넌트는 AppShell로 대체 후 제거(또는 AppShell이 흡수).

### E. 페이지 높이 적응 (메인 영역에 맞춤)
- 메인 영역은 이제 뷰포트가 아니라 `flex-1 min-h-0`. 풀스크린 전제였던 페이지를 `h-full`로:
  - `SubstationWorkspacePage` 루트 `h-screen` → `h-full`.
  - `FloorPlanEditorPage` 래퍼 `h-screen` → `h-full`(FloorPlanEditor는 이미 h-full).
  - `SubstationAssetGridPage`/그리드 루트도 `h-full` 보장.
- 좌 nav 접힘 시 메인이 넓어짐(접기 토글로 캔버스 공간).

### F. 기존 네비 트리거 (1단계 유지)
- TreePanel 더블클릭, TreeVisualization 카드/버튼, StatsSidePanel 랙클릭은 **그대로 동작**(이제 셸 메인의 Outlet을 네비). 진입점 통일·중복 제거는 2단계.

## 4. 영향 받는 파일
**신규**: `components/AppShell.tsx`, `components/Breadcrumb.tsx`(+test)
**수정**: `App.tsx`(중첩 라우트), `pages/TreePage.tsx`(좌 TreePanel 제거 → 홈 둘러보기), `pages/SubstationWorkspacePage.tsx`·`pages/FloorPlanEditorPage.tsx`·`pages/SubstationAssetGridPage.tsx`(h-full), `components/Layout.tsx`(AppShell로 흡수/제거)
**재사용(무변경)**: `TreePanel`(셸 좌 nav로), `TreeVisualization`/`StatsSidePanel`(홈 메인).

## 5. 테스트
- **단위(RTL)**: `Breadcrumb` — org store mock로 HQ>본부>변전소 경로 렌더 + 항목 클릭 네비. AppShell — TopBar/좌 nav/Outlet 렌더, 접기 토글 동작.
- **수동(dev)**: ① 어느 페이지(홈·워크스페이스·에디터·그리드)에서든 **좌측 트리·상단 브레드크럼 항상 보임**. ② 변전소 워크스페이스에서 좌측 트리로 **다른 변전소 즉시 이동**(맥락 안 잃음). ③ 브레드크럼 항목 클릭 이동. ④ 좌 nav 접기→캔버스 넓어짐, 새로고침 후 접힘 유지. ⑤ 기존 네비(트리 더블클릭 등) 정상. ⑥ 에디터/그리드 높이 정상(메인에 꽉 참).

## 6. 성공 기준
1. 모든 인증 페이지가 **하나의 셸**(상단 브레드크럼 + 좌 영속 트리 + 메인) 안에서 렌더.
2. 변전소/층에 들어가도 좌 트리·브레드크럼 유지 — 다른 변전소로 트리에서 즉시 이동.
3. 좌 트리 접기 토글(localStorage 유지).
4. 홈 `/`은 셸 안에서 둘러보기(카드+통계)로.
5. 기존 네비·에디터·그리드 회귀 없음(높이 적응 외).

## 7. 이후
- 2단계: 진입점 통일(트리=단일 네비, 중복 버튼 제거), TreeVisualization을 메인 둘러보기로 정식화, 워크스페이스 헤더와 셸 브레드크럼 정합.
- 3단계: 글로벌 검색(자산/변전소 점프), 대시보드, 상세 패널 단일 컴포넌트 통합, 브레드크럼 cold deep-link 보강.
- 그 후 단계 C(계통도 자동생성)로 복귀.
