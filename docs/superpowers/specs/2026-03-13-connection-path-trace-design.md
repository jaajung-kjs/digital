# Connection Path Trace & Topology Visualization

## Goal

Any equipment's connection tab에서 케이블을 클릭하면, 해당 케이블 타입으로 연결된 전체 경로를 추적하고 시각화한다. 같은 방 내 경로는 캔버스 하이라이트, 크로스 변전소 경로는 SVG 토폴로지 모달로 표현한다.

## Background

- 기존 `pathTrace.service.ts`는 FIBER 전용이며, 프론트엔드 `pathTrace/` 컴포넌트는 미마운트 상태
- 모든 cableType (AC/DC/LAN/FIBER/GROUND)에 대해 동일한 경로 추적이 필요
- OFD 절체, OFD간 내부 연결, 중간 설비 분기, 대규모 링 등 복잡한 토폴로지 지원 필수

## Migration Strategy

- 기존 `pathTrace.service.ts` (FIBER 전용, equipment 기반)는 **새 서비스로 교체**
- 기존 엔드포인트 `GET /api/equipment/:equipmentId/paths` → 유지 (하위 호환), 내부적으로 새 서비스 호출하도록 리팩토링
- 새 엔드포인트 `GET /api/cables/:cableId/trace` 추가 (cable 기반, 모든 cableType)
- 기존 프론트엔드 `pathTrace/` 컴포넌트 (PathTracePanel, PathDiagram, RingDiagram) → 새 토폴로지 컴포넌트로 대체, 기존 파일 삭제
- 기존 `pathTrace/types.ts` → 새 타입으로 교체 (graph 기반: nodes/edges/rings)
- 비 FIBER 타입의 BFS: 포트 수준 라우팅 없음. 동일 cableType 케이블이 연결된 설비를 단순 pass-through로 취급

---

## Section 1: Universal Path Trace Algorithm

### 트레이싱 규칙

1. 클릭한 케이블의 `cableType`만 따라감 (AC 클릭 → AC 체인만)
2. source/target 양방향 BFS
3. 각 설비에서 동일 cableType 케이블만 탐색
4. FIBER일 때 OFD 도달 → 해당 OFD의 **모든 FiberPath** 순회 (절체 포함) → 반대편 OFD에서 계속
5. `visited` Set으로 사이클 감지 → rings 배열에 분리

### 지원 시나리오

```
[케이스 1: 단순 체인]
분전반 --AC-- UPS --AC-- PITR5000

[케이스 2: FIBER 크로스 변전소]
춘천-PITR5000 --FIBER-- 춘천-OFD-2 ~~fiberPath~~ 화천-OFD-1 --FIBER-- 화천-SW-1

[케이스 3: 중간 설비 분기]
화천-SW-1 --FIBER-- 화천-OFD-3 ~~fiberPath~~ 양구-OFD-1 --FIBER-- 양구-RTU-1

[케이스 4: 동일 변전소 내 OFD-to-OFD]
춘천-OFD-2 --FIBER-- 춘천-OFD-3

[케이스 5: OFD 절체]
춘천-OFD-2 ~~fiberPath-A~~ 화천-OFD-1
춘천-OFD-2 ~~fiberPath-B~~ 양구-OFD-5
```

---

## Section 2: Backend API

### Endpoint

`GET /api/cables/:cableId/trace`

### Response

```typescript
interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
}

interface TraceNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;       // 같은 방 감지용
  category: string;
  isSource: boolean;           // 클릭한 케이블의 source 설비
  isTarget: boolean;           // 클릭한 케이블의 target 설비
}

interface TraceEdge {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  type: 'cable' | 'fiberPath';
  cableType?: CableType;
  label?: string;
  length?: number;
  fiberPathId?: string;
  portCount?: number;
}

interface TraceRing {
  id: string;
  label: string;        // "춘천↔화천↔원주"
  nodeIds: string[];
  edgeIds: string[];
}
```

### 로직

1. `cableId`로 케이블 조회 → cableType, sourceEquipmentId, targetEquipmentId 확인
2. source/target 양방향 BFS (동일 cableType만)
3. FIBER + OFD 도달 시 → FiberPath 전체 순회 (절체 대응)
4. visited set 기반 사이클 감지 → rings 분리
5. 모든 경유 설비의 변전소 정보 join

---

## Section 3: Same-Room Canvas Highlight

trace 결과의 모든 노드가 현재 편집 중인 방 소속일 때 캔버스에서 직접 하이라이트.

### 동작

1. ConnectionDiagram에서 케이블 행 클릭
2. `GET /api/cables/:cableId/trace` 호출
3. 모든 노드가 현재 방 → 캔버스 하이라이트 모드
4. 경로 설비: 파란 글로우 + 원래 색상
5. 경로 케이블: 굵게 + cableType 색상
6. 나머지: 30% opacity 디밍
7. ESC 또는 닫기 버튼으로 해제

크로스 변전소 경로가 하나라도 포함되면 → 오버레이 모달로 전환.

---

## Section 4: Overlay Modal — SVG Topology Diagram

크로스 변전소 경로일 때 표시되는 모달.

### 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  연결 경로 상세 — FIBER (춘천-PITR5000 기준)        [X] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ 춘천변전소 ──────────────┐   ┌─ 화천변전소 ───────┐ │
│  │                            │   │                     │ │
│  │  [PITR5000]──[OFD-2]─ ─ ─ │─ ─│──[OFD-1]──[SW-1]  │ │
│  │              │             │   │               │     │ │
│  │         [OFD-3]            │   │          [OFD-3]    │ │
│  │              │             │   │               │     │ │
│  └──────────────│─────────────┘   └───────────────│─────┘ │
│                 │                                 │       │
│  ┌─ 양구변전소 ─│──────────┐   ┌─ 원주변전소 ────│───┐   │
│  │              │           │   │                 │    │   │
│  │  [OFD-5]─ ─ ┘  [RTU-1] │   │  [OFD-1]─ ─ ─ ─┘   │   │
│  │     │              │     │   │     │               │   │
│  │     └──────────────┘     │   │     └──[SW-2]       │   │
│  └──────────────────────────┘   └─────────────────────┘   │
│                                                          │
│  ── 케이블    ─ ─ FiberPath    ● 시작설비               │
├──────────────────────────────────────────────────────────┤
│  🔄 감지된 링 (2)                                        │
│  ┌───────────────────────┐ ┌───────────────────────────┐ │
│  │ 링 1: 춘천↔화천↔원주  │ │ 링 2: 춘천↔양구          │ │
│  └───────────────────────┘ └───────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 시각 규칙

| 요소 | 표현 |
|------|------|
| 변전소 | 둥근 모서리 회색 박스, 헤더에 변전소명 |
| 설비 노드 | 박스 내부 pill, `설비명` 표시 |
| 시작 설비 | 파란 테두리 + 펄스 애니메이션 |
| 케이블 | 실선 (cableType 색상) |
| FiberPath | 점선 (보라색), 코어수 라벨 |
| OFD 내부 연결 | 같은 변전소 박스 안 실선 |
| OFD 절체 | 하나의 OFD에서 여러 점선 분기 |
| 링 경로 | 선택시 해당 경로 하이라이트, 나머지 50% 투명도 |

### 인터랙션

- 노드 호버: 설비 상세 툴팁 (이름, 카테고리, 변전소)
- 엣지 호버: 케이블/FiberPath 상세 정보
- 줌/패닝: SVG viewBox 조작
- 링 클릭: 해당 링 경로만 하이라이트

### 링 감지 및 선택

- 하단에 감지된 링 리스트
- 각 링: 경유 변전소 요약 (예: "춘천↔화천↔원주↔춘천")
- 클릭 → 해당 링 하이라이트, 나머지 50% 투명도
- 중첩/상위 링 별도 항목

---

## Section 5: State Management

### usePathHighlightStore (Zustand)

```typescript
interface PathHighlightState {
  active: boolean;
  mode: 'canvas' | 'modal';
  traceResult: TraceResult | null;
  selectedRingId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  startTrace: (cableId: string) => Promise<void>;
  selectRing: (ringId: string | null) => void;
  clearHighlight: () => void;
}
### 소비 컴포넌트

- `ConnectionOverlay.tsx`: `active && mode === 'canvas'`일 때 highlightedNodeIds/EdgeIds로 렌더링 분기
- `ConnectionDiagram.tsx`: trace 진행 상태 표시 (로딩, 선택된 행)
- `TopologyModal.tsx` (신규): `active && mode === 'modal'`일 때 SVG 토폴로지 렌더링
- mode 판단: traceResult의 모든 노드의 `roomId`가 현재 편집 roomId와 같으면 'canvas', 아니면 'modal'
```

---

## Section 6: ConnectionDiagram Click Entry Point

기존 `ConnectionDiagram.tsx`에 클릭 핸들러 추가.

- 각 케이블 행: `onClick` → trace API 호출
- 호버: 커서 포인터 + 연한 배경색
- 선택 상태: 좌측 파란 바
- 로딩: 행 내 스피너

### 진입 흐름

```
EquipmentDetailPanel → ConnectionsTab → ConnectionDiagram
  → 케이블 행 클릭
  → GET /api/cables/:cableId/trace
  → 모두 같은 방? → canvas highlight
     크로스 변전소? → overlay modal
```

---

## Section 7: Tech Stack & Constraints

| 항목 | 선택 |
|------|------|
| SVG | 순수 SVG + React (외부 라이브러리 없음) |
| 레이아웃 | 변전소 그룹 그리드 배치 |
| 줌/패닝 | SVG viewBox + wheel/drag |
| 상태관리 | Zustand |
| API | REST + React Query |
| 애니메이션 | CSS transition + SVG animate |

### 제약사항

- 최대 노드 100개 초과 시 경고 + 변전소 축소 모드
- FiberPath 없는 FIBER 케이블: 직접 연결로 표시
- pending 케이블(changeSet): trace 대상 제외 — 프론트엔드에서 temp ID 감지 시 trace 버튼 비활성화 + "저장 후 추적 가능" 메시지
- 0개 링 + 크로스 변전소: 모달에서 링 섹션 숨김, 노드/엣지만 표시
- TraceEdge의 source/target 방향: BFS 탐색 순서가 아닌 DB 저장 방향 유지
