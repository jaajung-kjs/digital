# 단계 A — 뷰 스위처 + 공유 선택 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 통합 현황관리 아키텍처(`2026-06-05-unified-status-management-architecture.md`)의 **단계 A**. 변전소 워크스페이스를 "두 탭"에서 "하나의 모델 위 여러 뷰 + 공유 선택"으로 진화시켜 도면/현황 분열을 직접 해소.

---

## 1. 배경 / 문제

(나) 워크스페이스는 `[도면][현황]` 두 탭을 나란히 놓았을 뿐, 여전히 두 패러다임이다: 선택이 공유되지 않고, 진입점도 분열돼 있다. 업계 표준은 **단일 진입 + 뷰 전환 + 공유 선택**(select-once, see-everywhere). 단계 A는 이 골격을 만든다.

핵심 사실(코드 확인):
- 에디터 선택은 **전역 `editorStore`**(`detailPanelEquipmentId`/`selectedIds`/`focusTick`)에 있어 **워크스페이스가 관찰·구동 가능** → 에디터 자체 무수정.
- 그리드 선택은 **로컬 state**(`selectedId`) → 공유 컨텍스트로 리프트(작은 변경).

## 2. 목표 / 비목표

### 목표
1. **공유 선택** — 워크스페이스 단위 `selectedAssetId`. 표에서 선택→배치도에서 선택·센터, 배치도에서 클릭→표에서 행 선택. (지속 — 버튼 안 눌러도)
2. **뷰 스위처 프레임워크** — (나) 탭바를 뷰 레지스트리로. 이번 단계 뷰: `표`·`배치도`(+`토폴로지` — §scope-risk). 이후 `실장도`·`전원계통도` 추가가 descriptor 1개.
3. **진입 일원화** — 트리 변전소/층 액션이 워크스페이스로. 중복 진입(TreeVisualization "현황표") 정리.

### 비목표 (후속 단계)
- 연결성 1급화(B), 전원계통도 자동생성(C), 커밋 통합(D), 실장도 최상위 뷰화.
- 토폴로지/계통도 **편집** — 읽기전용.
- 옛 라우트(`/floors/:id/plan`, `/substations/:id/assets`) 제거 — 딥링크 호환 위해 유지.
- 자동 선택 동기화의 cross-floor 자동 층전환 — 기존 "도면에서 보기"(gotoFloor) 버튼으로 처리(아래 §3C).

## 3. 설계

### A. SelectionContext
신규 `frontend/src/features/workspace/SelectionContext.tsx`:
```tsx
interface Selection { selectedAssetId: string | null; setSelectedAssetId: (id: string | null) => void; }
const Ctx = createContext<Selection | null>(null);
export const useSelection = () => useContext(Ctx);  // 워크스페이스 밖이면 null
```
- 워크스페이스 셸이 `useState`로 `selectedAssetId`를 들고 Provider 제공.
- `WorkspaceNavContext`와 별도(네비 vs 선택 책임 분리) 또는 합쳐도 됨 — 구현 시 결정(둘 다 워크스페이스 셸이 제공).

### B. 그리드 → 공유 선택 리프트
- `SubstationAssetGrid`: 로컬 `selectedId` 대신 **`useSelection()` 있으면 공유 선택을 read/write**, 없으면(옛 단독 라우트) 기존 로컬 state 폴백.
- 행 클릭 → `setSelectedAssetId(a.id)`. 상세 패널은 `selectedAssetId` 기준. (기존 `?assetId=` 딥링크 핸들러는 마운트 시 `setSelectedAssetId`로.)

### C. 에디터 ↔ 공유 선택 브리지 (에디터 무수정)
워크스페이스 셸(또는 배치도 뷰 래퍼)에 양방향 동기화. **루프 가드 필수**(값이 실제로 다를 때만 전파):
- **에디터 → 공유** (관찰): `editorStore` 의 `detailPanelEquipmentId` 변화를 구독 → `id && id !== selectedAssetId` 이면 `setSelectedAssetId(id)`. (Zustand `subscribeWithSelector` 있으면 셀렉터 구독, 없으면 전체구독+이전값 비교 — 구현 시 확인.)
- **공유 → 에디터** (구동, 같은 층 한정): `selectedAssetId` 변화 시, 배치도 뷰 활성 & `editorStore.getState().localEquipment` 에 그 자산이 있으면(=현재 층에 배치됨) `setSelectedIds([id]) + setDetailPanelEquipmentId(id) + bumpFocusTick()`. 이미 같으면 skip(루프 가드).
- **cross-floor**(선택 자산이 다른 층): 자동 층전환은 비목표 — 사용자가 표의 "도면에서 보기"(기존 `gotoFloor(asset.floorId, asset.id)`)로 이동(그러면 그 층 로드 후 공유 선택이 같은-층 경로로 선택·센터). 즉 cross-floor 는 기존 버튼, same-floor 는 자동 동기화.

### D. 뷰 스위처 프레임워크
- (나)의 `?tab=plan|register` → **`?view=<key>`** + 뷰 레지스트리:
  ```ts
  const VIEWS = [
    { key: 'register', label: '표',   render: () => <SubstationAssetGrid substationId={id} /> },
    { key: 'plan',     label: '배치도', render: () => <PlanView ... /> },  // 층 드롭다운 + FloorPlanEditor
    // { key: 'topology', label: '토폴로지', render: () => <TopologyView substationId={id} /> },  // §scope-risk
  ];
  ```
  탭바가 VIEWS 를 렌더, 활성 뷰만 본문에. 새 뷰 = 배열 항목 1개.
- 하위호환: 기존 `?tab=` 도 읽어 `?view=` 로 매핑(또는 일괄 `?view=` 전환 + (나)에서 만든 gotoFloor/gotoRegister 의 `tab` 세팅을 `view` 로 갱신).

### E. 진입 일원화
- 트리 변전소 더블클릭 → 워크스페이스(이미 (나)에서 됨). 층 더블클릭(`TreePanel`) → 워크스페이스 `?view=plan&floor=<id>`(현재는 `/floors/:id/plan` 단독). StatsSidePanel 랙 클릭 → 워크스페이스 `?view=plan&floor=<id>&equipmentId=<id>`.
- TreeVisualization "현황표" 버튼 → 워크스페이스 `?view=register`(현재 `/substations/:id/assets`).
- 옛 라우트는 유지(직접/외부 링크). 즉 *기본 진입*을 워크스페이스로 모으되 라우트는 남김.

## 4. 크로스뷰 동작 (UX)
- 표에서 행 선택 → 상세 패널. 배치도로 전환 → (같은 층이면) 그 장비 선택·센터.
- 배치도에서 장비 클릭 → 공유 선택 갱신 → 표로 전환 시 그 행 선택·패널.
- 표에서 "도면에서 보기" → 그 자산 층의 배치도로 이동 + 선택·센터(cross-floor 포함, 기존 gotoFloor).
- (토폴로지 뷰 포함 시) 선택 노드 하이라이트.

## 5. Scope-risk — 토폴로지 뷰 승격
토폴로지(`NetworkTopologyModal`)는 현재 **에디터 컨텍스트에 결합**(editorStore overlay 머지 + snapshot 모드)돼 있고, 저장 fiber-paths/cables 는 React Query(`queryClient.fetchQuery`)로 가져온다(2026-06-02 centralization). 변전소-단위 **읽기전용** 뷰로 승격하려면 시각화를 에디터 결합에서 분리해 저장 데이터로 렌더해야 한다.
- **이 분리가 가벼우면 단계 A에 포함**(VIEWS 에 'topology' 추가, read-only).
- **무거우면 단계 C(계통도)로 이월** — 프레임워크가 drop-in 을 보장하므로 손실 없음. 계획 수립 시 분리 난이도를 먼저 평가해 결정.

## 6. 영향 받는 파일
**신규**: `features/workspace/SelectionContext.tsx`, `features/workspace/useEditorSelectionBridge.ts`(브리지 훅), (토폴로지 포함 시) `features/workspace/TopologyView.tsx`
**수정**: `pages/SubstationWorkspacePage.tsx`(뷰 레지스트리·Selection Provider·브리지·`?view=`), `features/assets/components/SubstationAssetGrid.tsx`(공유 선택 리프트), `features/workspace/WorkspaceNavContext` 호출부(`tab`→`view`), `components/tree/TreePanel.tsx`·`StatsSidePanel.tsx`·`TreeVisualization.tsx`(진입 일원화)

## 7. 테스트
- **단위(RTL)**: `useSelection` Provider 안/밖, 그리드가 공유 선택 read/write. 브리지 루프 가드(같은 값이면 setState 안 함) 순수 로직.
- **수동(dev)**: ① 표 행 선택 → 배치도 전환 → 같은 층이면 선택·센터. ② 배치도 장비 클릭 → 표 전환 → 행 선택. ③ 표 "도면에서 보기"(다른 층) → 이동+선택. ④ 트리 층/랙/현황표 진입이 모두 워크스페이스로. ⑤ 옛 라우트 단독 동작(Selection null 폴백) 회귀 없음.

## 8. 성공 기준
1. 한 변전소 워크스페이스에서 뷰 전환(표/배치도[/토폴로지]).
2. `selectedAssetId` 가 뷰 간 공유 — 표↔배치도 선택 반영(same-floor 자동, cross-floor 버튼).
3. 트리 진입이 워크스페이스로 일원화(옛 라우트 폴백 유지).
4. 에디터 무수정(전역 스토어 브리지), 그리드는 공유 선택 리프트, 회귀 없음.

## 9. 이후
- 단계 B 연결성 1급화 → C 계통도 자동생성(전원계통도+토폴로지 정식) → D 커밋 통합.
