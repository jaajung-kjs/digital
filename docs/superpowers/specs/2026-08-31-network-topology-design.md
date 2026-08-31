# 네트워크 토폴로지 — 추적이 못 보는 국 밖을 그린다

**한 줄**: 추적이 자국 슬롯에서 끝나는 그 자리부터, 구간 케이블이 국들을 어떻게 이어 놓았는지를 모달 한 장으로 보여 준다.

## 왜

지금 추적은 **한 국 안**에서만 답한다. 층은 넘지만(`buildTraceInputs` 는 그 국의 자산 전부를 받는다 — 층 필터가 없다) 국은 못 넘는다. 워킹카피가 한 국만 들고 오기 때문에 대국 자산이 그래프에 아예 없다. 그래서 광 추적은 「자국 슬롯 앞면」에서 끝난다.

그런데 내부망은 실제로 **국들이 링으로 얽혀** 있다. 그 얽힘이 지금 어디에도 안 보인다.

**토폴로지는 추적의 여집합이다.** 추적이 답한 것은 마디 안에 들어가고, 그 다음이 줄로 그려진다. 경계는 층이 아니라 국이다 — 추적이 층은 이미 넘으므로.

## 범위

**한다**: 구간 케이블 그래프의 시각화, 링 인식(소링·대링), 배치, 모달, 시험 시드.

**안 한다**: 경로찾기(끝점 두 개를 정해 그 사이 길을 찾는 것). 별도 설계로 나중에. 이 그림 위에 끝점만 얹으면 되도록 자리를 남겨 둔다.

**안 한다**: 어휘 `signal` 칸. 그것은 경로찾기가 장비 안을 지날 때만 필요했다. 토폴로지는 구간 케이블만 따라가므로 필요 없다.

## 무엇이 마디이고 무엇이 줄인가

- **마디 = 변전소.** 추적이 답하는 범위가 정확히 한 국이므로 여집합의 경계와 맞는다.
- **줄 = 구간 케이블 = 양끝이 다심 포트인 케이블.** 판정은 `isMultiCorePort(port.positions)` 두 번이면 끝난다. 옛 코드의 `isOpgwTwin`(IN-IN 쌍 케이블 판정)은 대국을 슬롯으로 흉내 내던 시절의 휴리스틱이라 버린다.
- 두 국 사이에 구간 케이블이 두 본이면 **줄도 둘**이다. 이중화가 그림으로 드러난다.

## 구조

```
서버                     core                        프론트
POST /api/v2/reach  →   topology/graph.ts       →   TopologyModal.tsx
(이어진 컴포넌트)         topology/rings.ts            (SVG + HTML 마디)
                        topology/layout.ts
```

**서버는 자료만 주고 판단하지 않는다.** 토폴로지·링·배치는 전부 core 가 계산한다. 그래야 순수 함수로 시험할 수 있고, 화면과 서버가 다른 답을 낼 수 없다.

---

## 1. 서버 — 이어진 것 전부

### `POST /api/v2/reach`

**요청**: `{ portId: string }`

**응답**:
```ts
interface ReachResult {
  substations: { id: string; name: string }[];
  assets: {
    id: string; name: string; typeId: string | null;
    parentAssetId: string | null; substationId: string; floorId: string | null;
  }[];
  floors: { id: string; name: string; substationId: string }[];
  ports: {
    id: string; assetId: string; group: string; index: number;
    name: string; medium: string; direction: 'IN' | 'OUT' | 'BI'; positions: number;
  }[];
  cables: { id: string; aPortId: string; bPortId: string; categoryId: string | null }[];
  /** 컴포넌트가 한계를 넘어 잘렸는가 — 그림이 「일부만」임을 알린다. */
  truncated: boolean;
}
```

**계산**: `portId` 의 자산에서 시작해 **케이블로 이어진 자산**을 BFS 로 모은다(국 경계 무시). 자산을 모으면서 그 자산의 포트·케이블을 함께 싣는다. 부모 자산(설비)은 이름을 부르는 데 필요하므로 조상까지 포함한다.

- 걷는 단위는 **자산**이다(포트가 아니다). 토폴로지는 코어 단위가 아니라 구간 단위이므로 코어 대응을 따질 필요가 없다.
- 한계: 자산 5000개. 넘으면 거기서 멈추고 `truncated: true`.
- 라우트 파일 `backend/src/v2/reach.routes.ts`, `router.ts` 에 `v2Router.use('/', reachRouter)` 로 등록.
- 인증은 다른 v2 라우트와 같다.

지금 전체가 자산 159·케이블 55라 통째로 읽어도 즉시다. 규모가 커지면 재귀 CTE 로 바꿀 자리이고, 그때도 응답 모양은 그대로다.

---

## 2. core — 그래프, 링, 배치

### `packages/core/src/topology/graph.ts`

```ts
export interface TopoNode {
  /** 변전소 id */
  id: string;
  name: string;
  /**
   * 마디 박스 안에 서는 것 — **내 코어의 길이 이 국에서 지나간 장비들**, 지나간 차례로.
   *
   * 「이 망에 걸린 장비 전부」가 아니다. 링의 다른 국은 케이블로는 이어져 있어도 내 코어와
   * 무관하므로 비어 있다(국 이름만 선다). 추적이 답한 것은 마디 안, 그 다음은 줄 — 이 규칙이
   * 목록의 내용과 차례를 둘 다 정한다.
   */
  members: TopoMember[];
}

export interface TopoMember {
  assetId: string;
  /** `설비 - 장비#번호` 로 부를 재료. */
  assemblyName: string | null;
  assetName: string;
  /** 그 국에 층이 둘 이상일 때만 채운다 — 평면도가 못 그리는 「층을 넘는 줄」이 여기서 보인다. */
  floorName: string | null;
}

export interface TopoEdge {
  /** 케이블 id */
  id: string;
  /** 변전소 id 둘 */
  source: string;
  target: string;
  /** 양끝 다심 포트의 자산 이름(경로슬롯) — 줄에 대고 물으면 나온다. */
  sourceSlotName: string;
  targetSlotName: string;
}

/**
 * 입력 — `reach` 응답이 그대로 맞는 모양이되, core 는 프론트 타입을 모른다.
 * 그래서 core 가 필요한 것만 여기서 선언하고, 프론트는 그 모양으로 넘긴다.
 */
export interface TopologyInput {
  substations: { id: string; name: string }[];
  floors: { id: string; name: string; substationId: string }[];
  assets: {
    id: string; name: string; parentAssetId: string | null;
    substationId: string; floorId: string | null;
  }[];
  ports: { id: string; assetId: string; name: string; medium: string; positions: number }[];
  cables: { id: string; aPortId: string; bPortId: string }[];
}

/**
 * @param hops `traceFrom` 이 준 홉들 — 마디 안 목록의 내용과 차례가 여기서 나온다.
 *             강조할 구간 케이블도 이 홉들이 지나간 것이다.
 */
export function buildTopologyGraph(
  input: TopologyInput, hops: readonly TraceHop[],
): { nodes: TopoNode[]; edges: TopoEdge[]; litEdgeIds: Set<string> };
```

- 줄은 `isMultiCorePort` 가 양끝 다 참인 케이블만.
- 두 끝이 같은 국이면 줄로 세우지 않는다(국 안 이야기는 추적의 몫).
- 마디는 줄에 닿은 국들 + 시드가 선 국.
- `litEdgeIds` = 홉이 지나간 구간 케이블 — 화면이 굵게 그릴 것. 화면이 홉을 다시 훑지 않게 여기서 한 번에 낸다.
- 마디 안 목록은 홉의 `toPortId` 가 가리키는 자산을 국별로 모은 것이다. 경로슬롯(다심 포트를 가진 자산)도 목록에 넣는다 — 거기서 줄로 나가는 자리가 곧 국 안과 국 밖의 이음매다.

### `packages/core/src/topology/rings.ts`

옛 `frontend/src/utils/graph/cycleDetection.ts`(227줄)를 옮긴다. 알고리즘은 그대로 — 순수 그래프 계산이라 휴리스틱이 없다.

```ts
export interface Ring {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  /** 0 = 소링(기본 순환), 1 = 대링(간선을 공유하는 소링들의 바깥 테두리) */
  level: 0 | 1;
  childRingIds: string[];
}

export function detectRings(nodes: TopoNode[], edges: TopoEdge[]): Ring[];
```

1. BFS 신장트리 → 트리 간선과 chord 분리
2. chord 하나가 소링 하나를 만든다(LCA 까지 양쪽 경로 + chord)
3. 간선을 공유하는 소링들을 Union-Find 로 묶는다
4. 묶음에 소링이 둘 이상이면 대링 하나 추가(간선 XOR = 바깥 테두리)

옛 코드는 `TraceEdge`/`TraceNode` 타입에 묶여 있었다. 옮기면서 `TopoNode`/`TopoEdge` 로 갈아 끼운다.

### `packages/core/src/topology/layout.ts`

```ts
export function computeLayout(
  nodes: TopoNode[], edges: TopoEdge[], rings: Ring[],
): Map<string, { x: number; y: number }>;
```

규칙 넷. 매개변수 0개, 같은 자료면 같은 그림.

1. **바깥 테두리를 원으로.** 대링이 있으면 대링을, 없으면 소링을 정다각형으로 놓는다. 마디 N 개가 서로 `GAP` 만큼 떨어지려면 반지름은 `R = GAP / (2·sin(π/N))` 이다(정다각형 한 변 = `2R·sin(π/N)`). `GAP` 은 마디 상자 폭 + 여백 하나로 고정한다.
2. **테두리 안을 가르는 구간은 그대로 현이 된다.** 계산할 것이 없다 — 두 끝이 이미 원 위에 있다. 옛 SPQR 529줄이 하던 일이 이것으로 대체된다.
3. **링 덩어리가 여럿이고 마디 하나를 공유하면** 그 점에서 접하게 놓는다(공유 마디를 원점 삼아 두 원의 중심을 반대 방향으로).
4. **링에 안 속한 마디**는 붙은 마디에서 방사로 뻗는다. 한 마디에서 K 갈래가 나가면 360/K 로 나누고, 자식 서브트리의 잎 수에 비례해 부채꼴을 나눈다(줄이 다른 마디를 관통하지 않게).

링이 하나도 없으면(사슬·트리) 4번만으로 그려진다 — 안 닫힌 링이 그 경우다.

**안 하는 것**: 간선을 공유하는 링을 각각 원으로 그려 겹치지 않게 미는 일(SPQR). 2번으로 충분하고, 실제 자료에서 겹쳐 보이는 모양이 나오면 그때 얹는다.

---

## 3. 프론트 — 모달

### 여는 자리

`ConnectionsTab` 의 추적 결과 머리줄(「추적 경로 / 지우기」)에 **「토폴로지」** 단추를 더한다. 추적을 한 상태에서만 선다 — 시드 포트가 있어야 열 수 있다.

### 모달

공용 `Modal` 을 쓴다(`size="xl"`). 스크림·Esc·포커스 가둠·바깥 클릭이 이미 들어 있다(CONVENTIONS §대화상자). 손으로 다시 만들지 않는다.

```
┌────────────────────────────────────────────── ✕ ┐
│ 토폴로지 — 광링A S/S · 광단말 A#2 에서              │
├─────────────────────────────────────────────────┤
│         ┌─광링A─┐ ━━━━━━━ ┌─광링B─┐               │
│         │ …    │         │ …    │               │
│         └──────┘         └──────┘               │
│             │                │                   │
│         ┌─광링D─┐ ─────── ┌─광링C─┐               │
├─────────────────────────────────────────────────┤
│ ━ 내 코어가 간 길    ─ 그 밖의 구간                  │
└─────────────────────────────────────────────────┘
```

### 마디

```
┌─ 광링A S/S ──────────┐
│ [1층] 통합단말#1        │
│  └ L3 스위치 1#7        │
│  └ 광컨버터 상단#1       │
│  └ OFD 슬롯1           │
└────────────────────┘
```

- 장비 줄은 `TopoMember` 를 `설비 - 장비` 로 부른다(`endpointLabel` 과 같은 어법).
- 층 이름은 그 국에 층이 둘 이상일 때만.
- 마디가 열 줄을 넘으면 접는다(「외 N개」).

### 줄

- 강조는 **두 단계**. 내 코어가 지나는 줄은 굵고 진하게, 나머지는 흐리게. 옛 모달의 네 단계(시드/소링/대링/분기점)는 색이 많아 오히려 안 읽혔다.
- 링은 색이 아니라 **배치**(원)로 드러낸다.
- 두 국 사이 평행 줄은 살짝 벌려 둘로 보이게 한다.
- 줄에 마우스를 대면 양끝 경로슬롯 이름이 뜬다.

### 그리는 방법

- **마디는 HTML**(절대 배치), **줄만 그 뒤에 SVG**. 마디에 공용 컴포넌트를 그대로 쓸 수 있고, 글자가 SVG 안에서 깨질 일이 없다.
- `@xyflow/react` 는 다시 넣지 않는다. 이미 의존성에서 빠졌고, 마디 수십 개에 조작이 호버뿐이라 쓸 이유가 없다.
- 줄은 마디 상자의 **테두리 접점**에서 시작한다(중심 → 중심 선분이 상자와 만나는 점). 옛 `FloatingEdge` 가 하던 계산이고 20줄이면 된다.

### 자료 흐름

```
시드 포트 ─→ useReach(portId) ─→ ReachResult
                                    │
                    buildTraceGraph + traceFrom      (국 밖까지 걷는다)
                                    │ hops
                    buildTopologyGraph ──→ nodes · edges · litEdgeIds
                                    │
                    detectRings ──→ rings
                                    │
                    computeLayout ──→ 좌표
                                    ↓
                              TopologyModal
```

`useReach` 는 react-query 훅. 모달이 열릴 때만 부른다(`enabled: open`).

**「내 코어가 간 길」은 어떻게 아나**: 시드 포트에서 `reach` 자료로 `buildTraceGraph` + `traceFrom` 을 한 번 더 돈다. 이번엔 자료에 대국이 다 있으므로 코어가 국을 넘어 끝까지 간다. **추적 엔진을 그대로 쓴다** — 토폴로지 전용 추적 규칙을 새로 만들지 않는다. 그래서 「구간 케이블은 코어를 가로지르지 않는다」 같은 규칙이 저절로 지켜지고, 한쪽만 고쳐져 두 화면이 갈릴 일이 없다.

---

## 4. 시험

### core 단위 시험

손으로 만든 그래프로 링 인식과 배치를 직접 확인한다. 자료가 작아 좌표까지 단언할 수 있다.

- `topology/graph.test.ts` — 구간 케이블만 줄이 된다 / 같은 국 안 케이블은 줄이 아니다 / 평행 케이블은 줄 둘 / 마디 안 목록은 홉이 지나간 차례 / 코어가 안 지나가는 국은 목록이 비어 있다 / `litEdgeIds` 는 홉이 탄 구간만
- `topology/rings.test.ts` — 닫힌 링 / 안 닫힌 사슬(링 0개) / 마디 공유 링 둘 / 간선 공유 링 둘 + 대링 1개 / 평행 간선이 만드는 2-링
- `topology/layout.test.ts` — 링 마디가 원 위에 같은 간격으로 / 두 마디가 같은 자리에 겹치지 않는다 / 같은 입력이면 같은 좌표

### 백엔드 시험

- `reach.test.ts` — 국을 넘어 컴포넌트를 모은다 / 따로 노는 망은 안 섞인다 / 조상(설비)이 포함된다 / 한계를 넘으면 `truncated`

### 시험 시드 — `backend/scripts/seed-topology-cases.mjs`

국마다 OFD 설비 + 경로슬롯이면 되므로 가볍다. 기존 `seed-fiber-network-demo.mjs` 와 같은 방식으로 API 를 통해 넣는다(화면이 만들 수 있는 것만 만든다).

| 모양 | 국 | 무엇을 잡나 |
|---|---|---|
| 닫힌 링 | T1–T4 | 원으로 서나 |
| 마디 하나 공유(8자) | T4–T7 | 두 원이 그 점에서 접하나, 마디가 겹치지 않나 |
| 구간 하나 공유(내부·외부 링) | T8–T12 | 대링이 인식되나, 공유 구간이 현으로 서나 |
| 링에 매달린 사슬 | T13–T14 | 방사 배치, 줄이 다른 마디를 관통하지 않나 |
| 안 닫힌 링 | T15–T18 | 링 0개로 인식되고 사슬로 그려지나 |
| 평행 OPGW 두 본 | T1–T2 사이 | 줄이 겹치지 않고 둘로 보이나 |
| 링에서 한 국만 성단 | T3 | 코어가 안 이어진 국도 마디로는 서나 |
| 따로 노는 망 | T19–T20 | 시드가 속한 쪽만 나오나 |

`--clean` 으로 되돌린다(케이블 → 자산 → 층 → 변전소 순서 — 앞선 시드에서 `HAS_CHILDREN` 으로 걸렸던 순서다).

### 브라우저 확인

이 시드를 넣고 각 모양에서 모달을 열어 눈으로 본다. 단위 시험이 좌표를 지키고, 브라우저가 「사람이 읽을 수 있나」를 지킨다.

---

## 파일

**새로 만든다**
- `backend/src/v2/reach.routes.ts`
- `backend/src/v2/__tests__/reach.test.ts`
- `backend/scripts/seed-topology-cases.mjs`
- `packages/core/src/topology/{graph,rings,layout}.ts` + 각 `.test.ts`
- `frontend/src/v2/components/topology/{TopologyModal,TopologyNode,TopologyEdges}.tsx`
- (훅은 새 파일을 만들지 않는다 — `frontend/src/v2/hooks.ts` 에 `useReach` 를 더한다. 그 파일이 v2 훅의 한 자리다)
- `frontend/src/v2/__tests__/TopologyModal.test.tsx`

**고친다**
- `backend/src/v2/router.ts` — 라우트 등록
- `frontend/src/v2/hooks.ts` — `useReach`
- `packages/core/src/index.ts` — topology 내보내기
- `frontend/src/v2/components/detail/ConnectionsTab.tsx` — 「토폴로지」 단추
- `frontend/src/v2/types.ts` — `ReachResult`

## 남기는 자리

경로찾기는 이 그림 위에 **끝점 하나**를 더하면 된다. 마디를 누르면 그 국의 장비 목록이 뜨고, 고른 장비까지의 길을 강조한다. 그때 필요한 것은 어휘 `signal` 칸(장비 안을 지날 때 신호끼리만)과 `trace/path.ts`(끝점을 아는 BFS)뿐이다. 이번 설계는 그 둘을 넣지 않고, **누를 수 있는 마디도 만들지 않는다** — 아무 일도 안 하는 단추는 눌러 본 사람에게 고장으로 읽힌다.
