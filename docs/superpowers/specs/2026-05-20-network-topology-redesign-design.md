# 네트워크 토폴로지 재설계 — 설계 문서

**날짜**: 2026-05-20
**상태**: 사용자 승인 (구현 진입)
**대상**: 외부 네트워크망 시각화 (ring topology) — 로컬 연결도 미수정

## 1. 문제 진단

현 코드의 누적된 문제:

- `cableTracer.ts` 가 한 함수에 4가지 책임 (BFS path traversal + ring detection + segments + 휴리스틱 5종) 을 끌어안음
- 그 위에 *외부 네트워크망* 시각화까지 욱여넣기 위해 추측성 패치 5개 누적:
  - `ignorePortIsolation` 옵션
  - `traverseFiberPaths` 의 `fp.ports` 기반 fallback
  - `addNode` fallback name 인자
  - `ofdIds` 빌드에 fiberPath endpoint 추가
  - `roomContext.substationName` lookup
- `pathHighlightStore` 가 cable trace 와 network trace 를 같은 흐름에서 처리 → 회귀 발생 (모달 열면 `traceResult` 덮어쓰기)
- `TopologyModal` + `layoutEngine` 이 cable trace 결과를 ring 으로 시각화하려 하지만 BFS 순서와 layout 알고리즘이 mismatch → 노드 위치와 edge 라벨 불일치

**근본 원인**: 로컬 cable trace (port-isolated path) 와 네트워크 토폴로지 (FP graph + cycle) 는 본질이 다른 두 시각인데 한 함수/한 store 에서 처리.

## 2. 도메인 본질

```
[ 변전소 ]                                     [ 변전소 ]
   ┌────────────────┐                          ┌────────────────┐
   │   OFD          │ ──── FiberPath ──── ──── │   OFD          │
   │   ├ port 1 ────┼─cable─┐                  │   ├ port 1     │
   │   ├ port 2     │       │                  │   ├ port 2     │
   │   └ port N     │     [모듈]               │   └ port N     │
   └────────────────┘                          └────────────────┘
```

- 변전소 = 노드. OFD = 변전소 안 단일 장치.
- FiberPath = 두 OFD 간 물리 광케이블 (= edge of the network).
- 모듈 = OFD 의 특정 port 에 cable 로 꽂힌 leaf.
- 링/단일선 = FiberPath graph 위의 cycle/path. 인제 = 두 ring 의 공유 노드.
- 로컬 연결도 = cable trace, port-isolated.
- 네트워크 토폴로지 = **cable trace 와 무관한 정적 FP graph 구조**.

## 3. 설계

### 3.1 책임 분리

```
[utils/graph/cycleDetection.ts]   (NEW, ~250줄 — cableTracer 에서 추출)
  detectRings(nodes, edges, adjacency): TraceRing[]
  cable trace 와 network topology 둘 다 사용.

[utils/cableTracer.ts]   (cleaned)
  순수 cable BFS + segments. cycleDetection 한 줄 호출.
  휴리스틱 5개 제거. kind==='OFD' fix 유지.

[features/network/store.ts]   (NEW)
  useNetworkTopologyStore:
    state:
      graph: NetworkGraph | null
      highlightedFpId: string | null
      modalOpen: boolean
      savedFiberPaths: FiberPathDetail[] | null  (cable trace 도 이 source 사용)
    actions:
      loadAndOpen(seedFpId?: string): fetch + merge + cycleDetection
      close()

[features/network/NetworkTopologyModal.tsx]   (NEW, @xyflow/react)
  변전소 = React Flow node (커스텀 컴포넌트)
  FiberPath = React Flow edge (라벨: "춘천-남춘천 24코어, 사용 1/24")
  자체 ring 원형 배치 (~30줄, 외부 layout 라이브러리 미사용)
  시드 FP 와 그 ring 강조

[features/pathTrace/stores/pathHighlightStore.ts]   (cleaned)
  cable trace 만. networkTraceResult/openFullNetwork/BFS expansion 폐기.
  startTrace 의 fiberPaths fetch 도 useNetworkTopologyStore.savedFiberPaths 에서 가져옴 (단일 source).
```

### 3.2 진입점 통일

```
[A] ConnectionDiagram cable card 클릭 → startTrace
                                       ↓
                              캔버스 하이라이트 + PathTraceDetail (path-only)
                                                  ↓
                                              "상세" 버튼
                                                  ↓
                                  useNetworkTopologyStore.loadAndOpen(seedFpId)
                                                  ↓
                                       NetworkTopologyModal

[B] OFD 경로탭 → 포트 grid 의 포트 클릭 → PortDetail cable card
                                              ↓
                                       카드 클릭 → startTrace
                                              ↓
                                  [A] 와 동일 흐름 → "상세" → 모달

OFD 경로탭의 "토폴로지 보기" 버튼 (별도 진입점) 폐기.
```

### 3.3 Git-like 호환 (unsaved local 변경 반영)

```
Backend saved fiber-paths  →  store.savedFiberPaths
                              ↓
                      mergeWithLocal:
                        + editorStore.pendingFiberPaths (생성 중인 새 FP)
                        + editorStore.localEquipment 의 temp OFD (생성 중인 새 OFD)
                        − editorStore.deletedFiberPathIds (삭제 표시된 FP)
                              ↓
                         merged graph → React Flow
```

unsaved 새 ring 도 즉시 토폴로지에 반영, 삭제 표시 FP 는 사라짐. `usePortStatus.ts` 의 패턴과 동일.

### 3.4 Backend 변경

```
GET /api/fiber-paths   (NEW, list)
  fiberPath.service.ts:
    async getAll(): Promise<FiberPathDetail[]>
      prisma.fiberPath.findMany 와 기존 getByOfdId 의 include shape 그대로.
  controller.getAll, route '/fiber-paths'
  ~30줄 추가.
```

기존 `GET /api/equipment/:ofdId/fiber-paths` 는 유지 (OFD 상세 패널의 경로 슬롯이 사용).

## 4. 폐기 / 유지 표

| 항목 | 처리 |
|---|---|
| ConnectionDiagram, PathTraceDetail, 캔버스 trace 하이라이트 | 유지 |
| cableTracer.traceCable 본체 (BFS + segments) | 유지 (휴리스틱만 제거) |
| cableTracer.detectRings | 추출 (`utils/graph/cycleDetection.ts` 로 이동) |
| pathHighlightStore.startTrace | 유지 (fiberPaths fetch source 만 새 store 로 변경) |
| pathHighlightStore.openFullNetwork, networkTraceResult | 폐기 |
| pathHighlightStore.startTrace 안 BFS expansion fetch | 폐기 |
| TopologyModal.tsx | 폐기 |
| SubstationBox.tsx, TopologyEdge.tsx, RingSelector.tsx | 폐기 |
| layoutEngine.ts | 폐기 |
| OFD 경로탭의 "토폴로지 보기" 버튼 | 폐기 |
| `materialCategoryCode === 'EQP-OFD'` → `kind === 'OFD'` | 진짜 버그 fix (cableTracer 의 ofdIds 빌드) |
| @xyflow/react 의존성 | 추가 (~50KB gzipped) |
| 자체 ring 원형 배치 알고리즘 | NEW (~30줄, dagre/elkjs 미사용) |

## 5. 영향 정량

| | 추가 | 폐기 | 이동 | 수정 |
|---|---|---|---|---|
| Backend | +30줄 | 0 | 0 | 0 |
| Frontend | +400줄 (store + Modal + cycleDetection 파일) | ~720줄 (TopologyModal 274 + layoutEngine 443 + 부속) | ~250줄 (detectRings → cycleDetection) | cableTracer 청소, pathHighlightStore 청소, PathTraceDetail "상세" 핸들러, ConnectionDiagram "상세" 추가 |
| 의존성 | @xyflow/react | 0 | 0 | 0 |

**순 frontend 코드량**: 약 -300줄.

## 6. 검증 전략

각 step 후 직접 실행 검증:
- Step 1: curl `/api/fiber-paths` → 12개 응답 + ports[]
- Step 2: `npx tsx scripts/debug-trace.ts` → cable trace 가 cleaned cableTracer 로 정상 동작 (port-isolated)
- Step 3: store action 으로 graph 빌드 → console.log 결과 확인
- Step 4: 브라우저 모달 시각 확인 (사용자)
- Step 5: 전체 회귀 — cable card 클릭 → "상세" → 모달, 캔버스 highlight 유지

## 7. 위험 / 미해결

- React Flow 학습 곡선: API 검증 필요 (1일 내 흡수 가능)
- 자체 ring 원형 배치 알고리즘이 다중 ring junction 케이스에서 시각적으로 깔끔한지 — 시드(2 ring + junction) 로 검증 후 필요 시 보강
- 폐기 컴포넌트가 다른 곳에서 import 되는지 — Step 5 에서 grep 으로 확인

## 8. 단계별 구현 순서

1. Step 1 — Backend list endpoint
2. Step 2 — cycleDetection 추출 + cableTracer 청소
3. Step 3 — useNetworkTopologyStore + pathHighlightStore 청소
4. Step 4 — NetworkTopologyModal (React Flow)
5. Step 5 — 옛 코드 폐기 + 최종 검증

각 step 끝에 검증 통과 후 다음 진입. 마지막에 단일 commit.
