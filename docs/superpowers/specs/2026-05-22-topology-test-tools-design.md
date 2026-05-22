# 네트워크 토폴로지 테스트 도구 설계

날짜: 2026-05-22
상태: 승인됨

## 1. 목적

네트워크 토폴로지 모달(`NetworkTopologyModal`)에 세 가지 테스트 도구를 추가한다:

1. **경로찾기** — 시작/종료 노드를 선택하면 둘 사이 최단 경로를 하이라이트
2. **경로 삭제(테스트)** — 특정 fiberPath 엣지를 끊어 경로찾기 우회를 검증
3. **경로 추가(테스트)** — 두 노드 사이에 가상 엣지를 추가해 새 경로를 검증

세 도구 모두 **테스트 전용**이다. 실제 케이블/fiberPath 데이터나 백엔드를 변경하지 않으며,
모달을 닫으면 모두 사라진다.

## 2. 핵심 원칙: 레이아웃 불변

초기 `traceResult` 기반 base 레이아웃은 절대 재계산하지 않는다. `detectRings`,
`computeLayoutBCTree`, `computeLayoutSPQR`를 다시 실행하지 않는다.

삭제·추가는 고정된 화면 위에 **시각적 오버레이**로 표시된다. 노드 위치가 움직이지 않으므로
사용자가 before/after(끊은 경로·추가한 경로)를 직관적으로 비교할 수 있다 — 사용자가 명시적으로
요구한 점.

## 3. 그래프 모델 (기존 코드 기준)

`NetworkTopologyModal`이 그리는 그래프는:

- **노드** = 변전소 그룹. React Flow 노드 `id` = `groupBySubstation()`의 그룹 id
  (`substationName || substationId || equipmentId`). equipmentId가 아님.
- **엣지** = `type === 'fiberPath'`인 `TraceEdge`만. cable 엣지는 변전소 내부 표현이라
  그래프에서 생략됨. React Flow 엣지 `id` = `TraceEdge.id`, `source`/`target` = OFD가
  속한 그룹 id.

→ 경로찾기·삭제·추가는 모두 이 **그룹 노드 / fiberPath 엣지** 그래프 위에서 동작한다.

## 4. 상태 모델

테스트 상태는 `NetworkTopologyModal` 컴포넌트의 로컬 `useState`로 보관한다 (모달 한정).

```ts
cutEdgeIds: Set<string>     // 끊은 base 엣지 id (TraceEdge.id)
addedEdges: TestEdge[]      // 추가한 테스트 엣지
pathStart: string | null   // 경로찾기 시작 노드 (그룹 id)
pathEnd: string | null     // 경로찾기 종료 노드 (그룹 id)
addMode: boolean           // '경로 추가' 진행 중 여부
addAnchor: string | null   // 경로 추가 시 클릭한 첫 노드 (그룹 id)
```

```ts
type TestEdge = { id: string; source: string; target: string }; // id = `test-add-${n}`
```

**초기화 시점:** `NetworkTopologyModal`은 `modalOpen=false`여도 언마운트되지 않고 `null`만
반환한다(부모 `FloorPlanEditor`가 상시 렌더). 따라서 로컬 state는 자동으로 비워지지 않는다.
→ `traceResult`를 의존성으로 하는 `useEffect`에서 테스트 state 전체를 리셋한다. `close()`가
`traceResult`를 `null`로, 다음 `loadAndOpen()`이 새 객체로 바꾸므로 닫기·재열기 모두 커버된다.

### 파생 값 (useMemo)

- `effectiveEdges` = base fiberPath 엣지 + `addedEdges`
- `routableEdges` = `effectiveEdges` − `cutEdgeIds` → 경로찾기 그래프
- `foundPathEdgeIds: Set<string>` = `pathStart`/`pathEnd`가 모두 있으면 BFS 최단경로 결과,
  없으면 빈 집합

## 5. 기능 명세

### 5.1 경로찾기

- **조작:** 기본 모드에서 노드 클릭 — 1번째=시작, 2번째=종료, 둘 다 차면 즉시 BFS 실행.
  이미 둘 다 선택된 상태에서 노드 클릭 = 리셋 후 그 노드를 새 시작으로.
  (`addMode`일 때는 노드 클릭이 경로 추가용으로 쓰이며 경로찾기 선택을 하지 않는다 — 5.3 참고.)
- **알고리즘:** `routableEdges`를 무방향 그래프로 보고 BFS — 홉 수 기준 최단경로.
  `pathfinding.ts`의 순수 함수.
- **표시:** 시작 노드 = 초록 배지("시작"), 종료 노드 = 빨강 배지("종료"),
  경로상 엣지 = 굵은 초록 강조(애니메이션).
- **경로 없음:** `pathStart`/`pathEnd`는 있으나 BFS 실패 → 컨트롤 바에 "경로 없음" 표시.
- **같은 노드:** 두번째 클릭이 시작과 같으면 무시.

### 5.2 경로 삭제 (테스트)

- **조작:** 엣지에 호버 → 중점에 × 버튼 → 클릭하면 `cutEdgeIds` 토글(다시 누르면 복원).
  base 엣지에만 해당.
- **표시:** 끊긴 엣지는 그대로 그려지되 회색 점선 + 흐림 + 빨강 × 표식.
- **효과:** `routableEdges`에서만 제외 → 경로찾기가 우회. 레이아웃·링 표시·tier 색은 불변.

### 5.3 경로 추가 (테스트)

- **조작:** "경로 추가" 버튼 → `addMode=true`. 노드 A 클릭 → `addAnchor` 설정.
  노드 B 클릭 → `addedEdges`에 `{source:A, target:B}` 추가, `addMode=false`.
  버튼 재클릭 또는 ESC로 취소.
- **표시:** 추가 엣지는 두 노드의 기존 위치 사이 직선(FloatingEdge). 청록 점선 + "추가" 라벨.
- **효과:** `effectiveEdges`/`routableEdges`에 포함 → 경로찾기에 즉시 반영. 레이아웃 불변.
- **삭제:** 추가 엣지 호버 시 × = 완전 제거(`addedEdges`에서 빼냄).
- **중복:** 이미 직접 연결된 두 노드도 허용(테스트용 평행 엣지).

### 5.4 초기화 / 종료

- **"초기화" 버튼:** `cutEdgeIds`, `addedEdges`, `pathStart`, `pathEnd`, `addMode`,
  `addAnchor` 전부 클리어 → 원본 토폴로지.
- **모달 닫기:** 위 `useEffect` 리셋으로 테스트 상태 자동 소멸.

## 6. 엣지 스타일 우선순위

하나의 엣지에 여러 상태가 겹칠 수 있다. 우선순위(높→낮):

1. **끊김** (`cutEdgeIds`) — 회색 점선, 흐림, 빨강 ×
2. **경로** (`foundPathEdgeIds`) — 굵은 초록 강조
3. **추가** (`addedEdges`) — 청록 점선, "추가" 라벨
4. **기존 tier** — seed(빨강)/seedRing(파랑)/superRing(보라)/default(회색)

끊긴 엣지는 `routableEdges`에서 빠지므로 경로상에 올 수 없다 → 1·2는 실제로 겹치지 않음.

## 7. UI 구성

- **컨트롤 바:** ReactFlow 내부 `<Panel position="top-left">`에 `TopologyTestControls`
  컴포넌트 — "경로 추가" 토글 버튼, "초기화" 버튼, 현황 텍스트(`끊은 경로 N · 추가 경로 M`),
  모드 안내 텍스트("시작 노드를 클릭하세요" 등).
- **하단 범례:** 기존 범례에 끊김/추가/경로 항목 추가.

## 8. 파일 구조

| 파일 | 역할 |
|---|---|
| `network/pathfinding.ts` (신규) | 순수 BFS 최단경로 함수. 단위 테스트 대상 |
| `network/pathfinding.test.ts` (신규) | 경로찾기 단위 테스트 |
| `network/TopologyTestControls.tsx` (신규) | 컨트롤 바 컴포넌트 |
| `network/NetworkTopologyModal.tsx` (수정) | 테스트 state, 노드/엣지 클릭 핸들러, 스타일 파생, 리셋 useEffect, 범례 |
| `network/edges/FloatingEdge.tsx` (수정) | 호버 시 × 오버레이(EdgeLabelRenderer), 점선/강조 스타일 지원 |

## 9. 테스트 전략

- `pathfinding.ts` — 순수 함수, TDD로 작성. 케이스: 직선 경로, 링 우회, 경로 없음,
  시작=종료, 추가 엣지 포함 경로.
- 모달 상호작용 — 수동 검증(dev 서버 HMR). 자동 E2E는 범위 외.
- `npm run build`로 타입체크.

## 10. 범위 밖 (YAGNI)

- 케이블 길이 가중 경로 (홉 수만 사용)
- 다중 경로 동시 표시
- 추가 시 레이아웃 재계산
- 테스트 변경 저장/영속화
- cable 타입 엣지 경로찾기 (fiberPath 그래프만)
