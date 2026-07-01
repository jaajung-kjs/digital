# 추적 SSOT + 단일 scope 경계 설계 — 방향 그래프 1회 추적, 뷰는 범용 투영

## 1. 배경 / 목표

연결 추적(케이블 선택 → 경로/하이라이트/토폴로지)이 리팩토링을 거치며 흔들렸다. 원인은 **물리·표시 규칙이 여러 함수에 흩어져(buildInternalPath 의 타입별 추적, projectTrace 의 재순회, OPGW 전용 분기)** 매번 재구현된 것. 그 결과:

- 연결탭 "경로"가 선택 케이블 한 가닥이 아니라 같은 도면의 **평행 경로까지** 표시.
- "어디서 보느냐(상위 IN / 하위 OUT)"에 따른 **시점**이 깨짐.
- OPGW 에서만 동작하는 **타입 전용 휴리스틱**이 곳곳에 잔존.

**목표:** 추적을 **방향까지 기록하는 단일 엔진**으로 모으고(=물리 1곳), 연결탭·하이라이트·토폴로지를 그 결과 위의 **선언적 scope(범용 그래프 조회)** 로 통일한다. 새 순회 로직·타입 규칙·뷰 전용 휴리스틱을 추가하지 않는다.

**핵심 불변(사용자 확정):**
- **경계는 단 하나 — `in-scope`(현재 도면에 표현 가능한 그 경로) vs `out-of-scope`(그 외 전부).** floor/변전소 같은 별도 휴리스틱 경계 없음.
- **scope = 연결탭에 그리는 그 경로**(선택 케이블의 도면-내 경로). **토폴로지 = 그 외 모든 경로**(현재 도면에 표현 못 하는 것 — 다른 층 입력전원, OPGW 너머 등).
- **링 구조 등 기존 복잡한 토폴로지 시각화는 그대로 동작**(렌더링 보존).

**비목표:** 케이블/코어 스키마 변경, SPQR/BC 링 레이아웃 알고리즘 자체 변경.

## 2. 핵심 결정

- **D1. 추적은 방향 무제한 탐색.** `cableTrace(선택 케이블)` 은 연결된 그래프를 **양방향 전부** 탐색한다(흐름으로 탐색을 제한하지 않음 — 하위 케이블을 골라도 상위까지 도달해야 하므로). 물리(OPGW 코어 연속성)는 **여기 한 곳에서만** 해소한다.
- **D2. 출력 = 연결 컴포넌트(방향 미저장).** 평평하지 않은 컴포넌트(nodes + cables + 인접)를 낸다. **방향은 저장하지 않는다** — 케이블의 IN/OUT 역할이 곧 방향이므로, 뷰(`slice`)가 **조회 시 그 자리에서 읽는다**. (방향을 trace 출력에 박으면 결합·토폴로지 동치 위험만 커짐. 데이터에 있는 걸 다시 저장하지 않는다.)
- **D3. 단일 scope 경계.** `scope(node) → boolean` = "현재 도면(평면도)에 표현 가능한가". 이 하나로 in/out 을 가른다. 구현은 노드의 도면 소속(floorId 등 배치 정보)로 판정하되, **로직은 추상 술어 하나**다(타입·OPGW 무관, 어떤 도면 경계에도 동일).
- **D4. 뷰 = 선언적 투영(순회 로직 0).**
  - **하이라이트** = TraceComponent 노드 전부 칠함 → 현재 도면이 가진 것만 자동 표시(경계 코드 없음).
  - **연결탭** = `slice(선택 엣지)` = ancestors(루트까지 단일 줄기) + descendants(분기 트리), `in-scope` 로 clip. 루트부터 top-down, 선택 구간 강조.
  - **토폴로지** = `out-of-scope` 전부 + 도면-경계 케이블. 도면 단위로 collapse 한 노드 + 도면간 엣지 → 기존 링/레이아웃 렌더 그대로.
- **D5. buildInternalPath/projectTrace 의 분산 로직 흡수.** 둘 다 TraceComponent 위 scope 투영으로 대체. `slice` 는 연결탭과 토폴로지 내부노드가 **공유하는 단일 범용 함수**(IN/OUT·scope 만 읽음, 타입 분기 0).

## 3. 데이터 구조

```ts
// cableTrace 출력 — 연결 컴포넌트(방향 미저장). 기존 TraceGraph 에 drawingId 만 추가.
interface TraceComponent {
  nodes: Map<string, TraceNode>;  // id → 노드
  cables: TraceCable[];           // 무방향 컴포넌트 엣지(sourceRole/targetRole 보유=방향정보)
  adj: Map<string, TraceCable[]>; // 노드 → 닿는 케이블(투영 가속용)
}
interface TraceNode {
  id: string;
  drawingId: string | null;  // 도면(평면도) 식별 — scope 판정 단일 소스(floorId 매핑)
  role: AssetRole | null;
  name: string;
  // 표시 보조(기존 보존): parentAssetId(슬롯→OFD collapse), slotIndex, substationName
  parentAssetId: string | null;
  slotIndex: number | null;
  groupSubName: string | null;
}
// TraceCable 는 기존 그대로(sourceAssetId/targetAssetId/sourceRole/targetRole/number).
// 방향은 별도 저장 안 함 — slice 가 roleAt(c, node) 로 그때그때 읽는다.
```

- **방향 미저장**: 케이블의 `sourceRole/targetRole`(IN/OUT)이 곧 방향. `slice` 가 조회 시 읽는다.
- `drawingId`(=floorId): 자산이 그려지는 평면도. 서버 trace 응답에 **floorId 를 추가**해 채운다(현재 미포함). scope 판정의 유일 소스.

## 4. 방향 = slice 가 IN/OUT 로 조회 (저장 안 함)

추적(cableTrace)은 방향 무제한 탐색만. 방향은 **`slice` 가 케이블 역할로 그 자리에서** 읽는다:

- **상류(ancestors)**: 노드가 **IN/그외 끝**인 케이블을 거슬러(그 케이블의 OUT 끝 = 상류 노드). 공급원까지 단일 줄기.
- **하류(descendants)**: 노드가 **OUT 끝**인 케이블을 따라(IN 끝 = 하류 노드). 분기 트리.
- **루트** = 상류가 없는 노드(자기가 받는 IN 케이블이 없는 끝) = 흐름 최상단.

**전원 vs 광 — 같은 규칙, 다른 모양(특별처리 없음):**
- 전원: OUT→IN 이 진짜 공급 흐름 → 공급 트리(분기). 시점(상위=아래 전부, 하위=내 줄기)이 물리적.
- 광: 코어는 양방향이라 "상/하류"는 물리 진실이 아니라 **관례** — 다만 패치 `slot=OUT` 역할 덕에 슬롯이 상류로 자연히 잡혀 도면 안에선 방향이 정해진다. 진짜 무방향인 OPGW(IN-IN)는 **도면 밖(scope 밖) = 토폴로지 경계 엣지**라 흐름이 필요 없다. 광 경로는 분기 없이 **직선으로 degenerate** — 광 전용 코드 0.

> 역할이 양끝 다 없거나(완전 무방향) 양끝 다 OUT/IN 인 케이블은 도면 안 흐름엔 거의 안 나오며(대개 OPGW=경계), 나오면 무방향 인접으로 처리(직선).

## 5. scope 와 뷰 투영 (전부 범용, 순회 로직 0)

```ts
// 단일 경계 술어 — "현재 도면에 표현 가능한가"
type Scope = (n: TraceNode) => boolean;
const drawingScope = (currentDrawingId: string): Scope =>
  (n) => n.drawingId === currentDrawingId;
```

### 5.1 하이라이트
```
칠할 자산 = [...g.nodes.keys()]   // 전부
```
현재 도면 컴포넌트가 가진 자산만 실제로 렌더 → 자동 clip. **경계 코드 없음.**

### 5.2 연결탭 경로 = `slice(c, 선택엣지) ∩ scope`
```
slice(comp, e):                          // e = 선택 케이블, roleAt 로 방향 조회
  upEnd, downEnd = e 의 OUT끝(상류), IN/그외끝(하류)
  up   = upEnd 에서 IN-케이블 거슬러 루트까지   (단일 줄기 — ancestors)
  down = downEnd 에서 OUT-케이블 따라 잎까지    (분기 트리 — descendants)
  return up ∪ {e} ∪ down                 // 방향은 comp 에 저장 안 됨, 여기서 IN/OUT 읽음
경로트리 = slice 를 in-scope(drawingId) 로 자른 뒤, 루트부터 top-down 트리화. 선택 엣지 구간 강조.
```
- **시점 자동**: 상위(IN) 선택 → down(subtree) 큼 = 아래 전부. 하위(OUT) 선택 → up(lineage) 길고 down 작음 = 내 줄기만.
- **평행 슬롯 자동 제외**: 한 설비의 다른 상류 슬롯은 선택 엣지의 ancestor 도 descendant 도 아님 → slice 밖.
- **scope 밖(다른 도면) 자동 제외**: clip 으로 끊김 → 그 경계 너머는 토폴로지가 담당.

### 5.3 토폴로지 = `out-of-scope + 도면간 구조`
```
- 도면 단위 collapse: 각 drawingId 의 in-scope 세그먼트를 한 노드로 묶음
    그 노드의 내부 표시 = 그 도면 기준 slice (연결탭과 동일 범용 함수 재사용)
- 도면간 엣지 = edges.filter(isExternal)   // parent/child 도면 다름
- 슬롯→OFD collapse, 링(cycle) 검출·레이아웃 = 기존 spqrLayout/bcTreeLayout 그대로
```
**토폴로지 = 연결탭이 표현 못 하는 모든 경로**(다른 층·다른 변전소·OPGW 너머)를 도면-노드 + 도면간-엣지로. 링은 도면-그래프의 사이클로 그대로 나타남 → 기존 시각화 보존.

## 6. 기존 토폴로지 시각화 보존

- `NetworkTopologyModal` + `spqrLayout`/`bcTreeLayout`(링/BC-트리) = **변경 없음**. 입력(TraceProjection 의 nodes/edges/rings)을 동일 형태로 공급한다.
- 즉 새 구조는 **데이터 출처만** (분산 로직 → TraceComponent scope 투영) 바꾸고, projection 산출물 shape 와 렌더러는 보존한다. 링/collapse/정렬 결과 동치.

## 7. 마이그레이션

| 현재 | 변경 후 |
|---|---|
| `cableTrace` (평평한 nodeIds/cableIds) | `cableTrace` → TraceComponent(방향 미저장, drawingId 추가) |
| `buildInternalPath` (타입별 재추적) | `slice(g, edge)` (범용, IN/OUT·scope 만) |
| `projectTrace` (재순회+collapse+rings 혼재) | TraceComponent 위 scope 투영 + 기존 collapse/rings 호출 |
| 뷰의 `isOpgwTwin`/`inSub` 경계 코드 | 단일 `scope` 술어 + `isExternal` |
| 서버 trace 응답(floorId 없음) | floorId(drawingId) 추가 |

BE/FE cableTrace parity 유지.

## 8. 단계 분해 (각 독립 검증)

- **S1 — TraceComponent 출력.** cableTrace(BE/FE)가 연결 컴포넌트(+drawingId)를 내도록. 서버 응답에 floorId 추가. parity·단위테스트.
- **S2 — `slice` 범용 함수 + 연결탭.** buildInternalPath 를 `slice ∩ scope` 로 대체. 시점(상위/하위)·평행슬롯 제외·루트 top-down·선택강조 테스트.
- **S3 — 하이라이트.** TraceComponent 노드 전체 칠 + 도면 자동 clip. 경계 코드 제거.
- **S4 — 토폴로지.** projectTrace 를 scope 투영(도면 collapse + isExternal 엣지)으로. 기존 nodes/edges/rings shape 보존 → 렌더러 무변경. 링/멀티홉 동치 테스트(인제↔양구, 화천H/P 분기 등 실데이터 패턴).
- **S5 — 정리.** isOpgwTwin/inSub 분산 경계 코드 제거 게이트(grep), 전수 tsc·vitest, 스모크.

## 9. 리스크

- **방향 해소(역할 없는 엣지)**: 방향은 IN/OUT 역할에서만 읽고 저장하지 않음. 완전 무방향 케이블(양끝 역할 없음)은 도면 안 흐름에 거의 없음(대개 OPGW=경계). 나오면 무방향 인접(직선)으로 처리. 루트 = "상류(IN-케이블) 없는 노드"로 정의해 안정화, 테스트로 고정.
- **토폴로지 동치**: projection shape 를 보존하지 못하면 렌더 깨짐 → S4 에서 기존 출력과 스냅샷 동치 검증.
- **floorId 도입**: 서버 응답·TraceGraph 확장. 누락 시 scope 판정 불가 → 백필/기본값 정의.
- **DAG(복수 공급)**: 한 설비에 상류 여러 개면 slice 의 up 이 갈릴 수 있음 → ancestors 는 "선택 엣지의 parent 쪽 단일 줄기"로 한정.

## 10. 검증

- BE/FE cableTrace parity(코어 연속성, 방향은 slice가 IN/OUT로 조회) — 인제 port17/양구, 화천H/P 코어11 분기, 죽은 코어(빈 경로) 포함.
- `slice`: 상위선택=subtree 전부 / 하위선택=lineage만 / 평행 슬롯 제외 / 루트 top-down / 선택강조.
- 하이라이트: 경계 코드 없이 현재 도면만 표시.
- 토폴로지: 링/멀티홉 동치(기존 렌더 보존), 도면간 엣지 = isExternal, 다른 층 입력전원도 토폴로지에 포함.
- grep 게이트: 뷰 계층에 isOpgwTwin/inSub 잔재 0. tsc·vitest 양쪽 전수.
