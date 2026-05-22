# 토폴로지 경로찾기 UI/UX 개선 설계

날짜: 2026-05-22
상태: 승인됨
관련: `2026-05-22-topology-test-tools-design.md` (이 기능을 개선)

## 1. 목적

토폴로지 모달의 경로찾기를 도면(floor plan)의 기존 경로 하이라이트와 시각·UX
통일한다. 두 가지 문제를 해결한다:

- 경로 하이라이트가 연해서 직관적으로 안 보임
- 경로찾기 선택을 풀거나 다른 경로를 탐색하기 번거로움

## 2. 기준: 도면 경로 하이라이트 시각 언어

도면의 경로 trace(`features/pathTrace/stores/pathHighlightStore.ts` + canvas
렌더러)가 쓰는 기법:

- **포커스 디밍** — 경로 아닌 장비를 불투명도 0.2로 흐림 (`globalAlpha = 0.2`)
- **glow** — 경로 케이블에 광 (canvas `shadowBlur`)
- 실선 본선
- **ESC / "닫기"** 로 해제

이 시각 언어를 토폴로지 모달(React Flow / SVG)로 옮긴다.

## 3. A. 경로 하이라이트 개선

### A1. 실선화
path 엣지의 `animated` 를 제거한다. React Flow 의 `animated` 는 점선 + 스크롤로
렌더되어 "끊긴 선"으로 읽힌다 — 이게 "연함"의 주범.

### A2. path 엣지 스타일
`TEST_EDGE_STYLE.path` 를 다음으로 변경:

```ts
path: { stroke: '#16a34a', strokeWidth: 5, filter: 'drop-shadow(0 0 4px #16a34a)' }
```

`filter` 는 엣지 `style` 로 전달되어 React Flow `BaseEdge` 의 SVG `<path>` 에
적용된다 → 도면의 `shadowBlur` 와 같은 glow 인상. `FloatingEdge` 수정 불필요.

### A3. 포커스 디밍
경로가 표시 중일 때(`pathActive = foundPathEdgeIds.size > 0`):

- 경로에 없는 모든 엣지(base·끊김·추가) → 불투명도 `0.2`
- 경로상 노드가 아닌 모든 노드 → 불투명도 `0.2`
- 경로 해제(또는 경로 없음) 시 원상복구

"경로상 노드" = `foundPath` 엣지들의 양 끝 노드 합집합 — 시작·종료·중간 노드 포함.
모달에서 `pathNodeIds: Set<string>` 로 파생한다(엣지 id → 양끝 lookup).

끊김 엣지는 평소 불투명도 0.4 이지만, `pathActive` 동안은 0.2 로 덮어쓴다(끊김
엣지는 경로에 포함될 수 없으므로). 경로 해제 시 0.4 로 복귀한다.

### A4. 시작/종료 노드 배지
현행 배지(시작=녹색, 종료=적색)를 유지한다 — 포커스 디밍 덕에 충분히 두드러진다.

## 4. B. 경로찾기 인터랙션 모델

### B1. 노드 클릭 (addMode 아닐 때)
- 클릭한 노드가 현재 **시작점** → 시작점 해제
- 클릭한 노드가 현재 **종료점** → 종료점 해제
- 미선택 노드 → 빈 슬롯 채우기: 시작점 없으면 시작점, 없으면 종료점,
  **둘 다 차 있으면 무동작**

→ 새 노드 클릭이 완성된 쌍을 절대 흩뜨리지 않는다. 엣드포인트를 바꾸려면 그
노드(또는 칩 ✕)를 클릭해 푼 뒤 새 노드를 클릭한다.

### B2. 빈 캔버스 클릭
React Flow `onPaneClick` → 시작·종료 해제 + addMode 취소(중립 상태로).

### B3. ESC
addMode 중이면 addMode 취소, 아니면 시작·종료 해제. 도면의 ESC=해제와 통일.
기존 ESC effect(addMode 전용)를 `addMode || pathStart || pathEnd` 일 때 동작하도록
확장한다. 모달 자체를 닫지는 않는다(닫기는 × / 배경 클릭 유지).

### B4. 컨트롤 바 시작/종료 칩
선택된 엣드포인트를 노드명 칩으로 표시하고 각 칩에 ✕ 버튼을 둔다. 칩 ✕ = 그
엣드포인트 해제(노드 재클릭과 동일 동작). 큰 토폴로지에서 노드를 다시 찾지 않고도
콕 집어 해제할 수 있다.

칩 색은 캔버스 시작/종료 배지와 같은 항목을 가리키므로 색을 일치시킨다 — 시작
녹색, 종료 적색(모달 내부 일관성). 도면과의 통일감은 포커스 디밍 + glow 기법으로
달성한다.

`TopologyTestControls` props 확장: `startLabel: string | null`,
`endLabel: string | null`, `onClearStart: () => void`, `onClearEnd: () => void`.
모달은 노드 id → 이름 lookup 으로 라벨을 채운다.

기존 안내 문구(`hintText`)는 유지한다 — 칩은 무엇이 선택됐는지, 안내 문구는 다음
동작/상태를 알려주므로 역할이 다르다.

## 5. C. 영향 파일

| 파일 | 변경 |
|---|---|
| `network/NetworkTopologyModal.tsx` | `TEST_EDGE_STYLE.path` 변경, `pathNodeIds` 파생, `rfEdges`/`rfNodes` 디밍, `handleNodeClick` 재작성, `handlePaneClick` 추가, ESC effect 확장, `onPaneClick` 연결, 칩 props 전달 |
| `network/TopologyTestControls.tsx` | 시작/종료 칩 props + 렌더 |
| `network/edges/FloatingEdge.tsx` | 변경 없음 (glow 는 엣지 style 로 처리) |

## 6. 테스트

순수 로직 추가 없음(`findShortestPath` 그대로). `npm run build`(타입체크) + 수동 검증:

- path 가 실선·굵게·glow 로 선명하고, 경로 외 엣지·노드가 0.2 로 흐려진다
- 빈 캔버스 클릭 / ESC 로 경로찾기가 해제되고 끊김·추가 경로는 유지된다
- 둘 다 선택된 상태에서 새 노드 클릭 시 무동작, 선택된 엣드포인트 노드 클릭 시
  그 엣드포인트만 해제
- 컨트롤 바 칩이 시작/종료를 노드명으로 표시하고 ✕ 가 해당 엣드포인트를 해제

## 7. 범위 밖 (YAGNI)

- 도면처럼 경로 노드에 파란 박스 — 토폴로지는 녹/적 배지로 시작·종료를 구분
- 다중 경로 동시 표시
- `초기화` 버튼은 전체 리셋(끊김+추가+경로)으로 그대로 유지
