# 네트워크 토폴로지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추적이 자국 슬롯에서 끝나는 그 자리부터, 구간 케이블이 국들을 어떻게 이어 놓았는지를 모달 한 장으로 보여 준다.

**Architecture:** 서버는 「이 포트에서 케이블로 이어진 것 전부」(`POST /api/v2/reach`)를 국 경계 없이 돌려주기만 한다. 마디(=변전소)·줄(=양끝이 다심 포트인 케이블)·링·좌표는 전부 `packages/core/src/topology/` 의 순수 함수가 계산하고, 프론트는 그 결과를 HTML 마디 + SVG 줄로 그린다. 「내 코어가 간 길」은 같은 자료 위에서 기존 추적 엔진(`buildTraceGraph` + `traceFrom`)을 한 번 더 돌려 얻는다 — 토폴로지 전용 추적 규칙을 새로 만들지 않는다.

**Tech Stack:** TypeScript · Express + Prisma(backend) · React + react-query + Tailwind(frontend) · vitest · supertest

**설계 문서:** `docs/superpowers/specs/2026-08-31-network-topology-design.md`

## Global Constraints

- 개발 중에는 `docker compose -f docker-compose.dev.yml up -d` (DB) + `npm run dev` 만 쓴다. `docker compose build` / `docker compose up` 금지.
- 빌드 확인은 `npm run build` 로 한다.
- `packages/core` 를 고쳤으면 프론트/백엔드가 쓰기 전에 `npm run build -w @twin/core` 를 돌린다.
- UI 를 만들기 전에 `frontend/src/components/ui/CONVENTIONS.md` 를 읽고 그대로 따른다. 일회용 `<div className>` 카드/필드를 새로 만들지 않는다. 대화상자는 공용 `Modal` 하나로만 만든다.
- 타이포는 본문 `text-sm` / 라벨·메타 `text-xs`. `text-xs` 미만 금지. 색은 시맨틱 토큰만(하드코딩 hex 금지).
- **이름으로 판단하지 않는다.** 「OFD 인가」·「OPGW 인가」를 자산명·품목코드로 묻지 말고 선언(`isMultiCorePort` 등)으로 묻는다.
- **화면이 만들 수 없는 자료를 시드에 넣지 않는다.**
- 적용된 Prisma 마이그레이션은 고치지 않는다. 이 계획은 스키마를 바꾸지 않는다.
- 한 명령에 vitest 프로세스를 여러 개 이어 붙이지 않는다(한 번에 하나씩).
- 개발 로그인은 `admin` / `admin123`. 프론트 :5173, 백엔드 :3000.
- 모든 주석·화면 문구는 한국어로 쓴다(기존 코드와 같은 어조 — 무엇을 하는지가 아니라 **왜 그런지**를 적는다).

---

## 파일 구조

**새로 만든다**

| 파일 | 책임 |
|---|---|
| `packages/core/src/topology/types.ts` | `TopoNode`·`TopoMember`·`TopoEdge`·`TopologyInput`·`Ring`·`Point` — 세 모듈이 나눠 쓰는 말 |
| `packages/core/src/topology/graph.ts` | 국 단위 그래프 + 마디 안 목록 + 강조할 구간 |
| `packages/core/src/topology/rings.ts` | 링 인식(소링·대링) |
| `packages/core/src/topology/layout.ts` | 좌표 |
| `backend/src/v2/reach.routes.ts` | `POST /api/v2/reach` |
| `backend/src/v2/__tests__/reach.test.ts` | 위 라우트 시험 |
| `backend/scripts/seed-topology-cases.mjs` | 링 모양 시험 시드 |
| `frontend/src/v2/components/topology/TopologyModal.tsx` | 모달 + 자료 준비 |
| `frontend/src/v2/components/topology/TopologyCanvas.tsx` | 마디(HTML) + 줄(SVG) |
| `frontend/src/v2/__tests__/TopologyModal.test.tsx` | 모달 배선 시험 |

**고친다**

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/index.ts` | `topology/*` 내보내기 |
| `backend/src/v2/router.ts` | `reachRouter` 등록 |
| `frontend/src/v2/types.ts` | `V2Reach` |
| `frontend/src/v2/api.ts` | `fetchReach` |
| `frontend/src/v2/hooks.ts` | `useReach` |
| `frontend/src/v2/components/detail/ConnectionsTab.tsx` | 「토폴로지」 단추 |

---

## Task 1: 토폴로지 그래프 — 마디와 줄

**Files:**
- Create: `packages/core/src/topology/types.ts`
- Create: `packages/core/src/topology/graph.ts`
- Create: `packages/core/src/topology/graph.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `isMultiCorePort(positions)` from `../catalog/portKinds.js`, `TraceHop` from `../trace/graph.js`
- Produces: `TopoNode`·`TopoMember`·`TopoEdge`·`TopologyInput`·`Point` 타입, `buildTopologyGraph(input, seedPortId, hops) → { nodes, edges, litEdgeIds }`

- [ ] **Step 1: 말부터 정한다 (`types.ts`)**

```ts
/**
 * 토폴로지가 쓰는 말.
 *
 * 세 모듈(그래프·링·배치)이 나눠 쓰므로 한 곳에 둔다 — 그래프가 링을 import 하고 링이
 * 그래프를 import 하면 서로를 부르게 된다.
 */

export interface Point { x: number; y: number }

/** 마디 박스 안에 서는 장비 하나. */
export interface TopoMember {
  assetId: string;
  /** 이 장비를 담고 있는 설비 — `설비 - 장비` 로 부를 때 앞에 붙는다. */
  assemblyName: string | null;
  assetName: string;
  /** 그 국에 층이 둘 이상일 때만 채운다 — 평면도가 못 그리는 「층을 넘는 줄」이 여기서 보인다. */
  floorName: string | null;
}

export interface TopoNode {
  /** 변전소 id */
  id: string;
  name: string;
  /**
   * **내 코어의 길이 이 국에서 지나간 장비들**, 지나간 차례로.
   *
   * 「이 망에 걸린 장비 전부」가 아니다. 링의 다른 국은 케이블로는 이어져 있어도 내 코어와
   * 무관하므로 비어 있다(국 이름만 선다). 추적이 답한 것은 마디 안, 그 다음은 줄 — 그 규칙이
   * 목록의 내용과 차례를 둘 다 정한다.
   */
  members: TopoMember[];
}

export interface TopoEdge {
  /** 케이블 id */
  id: string;
  /** 변전소 id 둘 */
  source: string;
  target: string;
  /** 양끝 다심 포트가 달린 자산(경로슬롯)의 이름 — 줄에 마우스를 대면 이것이 뜬다. */
  sourceSlotName: string;
  targetSlotName: string;
}

/**
 * 입력 — `POST /api/v2/reach` 응답이 그대로 맞는 모양이되, core 는 프론트 타입을 모른다.
 * 그래서 core 가 필요한 것만 여기서 선언한다.
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

/** 링 하나 — `detectRings` 가 낸다. */
export interface Ring {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  /** 0 = 소링(기본 순환), 1 = 대링(간선을 공유하는 소링들의 바깥 테두리) */
  level: 0 | 1;
  /** 대링이면 그 안의 소링 id 들. 소링이면 빈 배열. */
  childRingIds: string[];
}
```

- [ ] **Step 2: 실패하는 시험을 쓴다 (`graph.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { buildTopologyGraph } from './graph.js';
import type { TopologyInput } from './types.js';
import type { TraceHop } from '../trace/graph.js';

/**
 * 마디는 국이고 줄은 구간 케이블이다.
 *
 * 「구간인가」를 자산 이름이나 케이블 품목으로 묻지 않는다 — 양끝이 다심 포트인가로 묻는다.
 * 옛 코드는 `isOpgwTwin`(IN-IN 쌍 케이블)으로 물었는데, 그건 대국을 슬롯으로 흉내 내던
 * 시절의 흔적이라 지금 모델에서는 답이 틀린다.
 */

/** 국 하나 = OFD 설비 + 슬롯(앞면 2 + OPGW 2심) + 장비 하나. */
function station(s: string): TopologyInput {
  return {
    substations: [{ id: `${s}`, name: `${s}국` }],
    floors: [{ id: `${s}-f1`, name: '1층', substationId: s }],
    assets: [
      { id: `${s}-ofd`, name: 'OFD', parentAssetId: null, substationId: s, floorId: `${s}-f1` },
      { id: `${s}-slot`, name: `${s}슬롯`, parentAssetId: `${s}-ofd`, substationId: s, floorId: null },
      { id: `${s}-dev`, name: `${s}단말`, parentAssetId: null, substationId: s, floorId: `${s}-f1` },
    ],
    ports: [
      { id: `${s}-front1`, assetId: `${s}-slot`, name: '광 1', medium: 'fiber', positions: 1 },
      { id: `${s}-front2`, assetId: `${s}-slot`, name: '광 2', medium: 'fiber', positions: 1 },
      { id: `${s}-opgw`, assetId: `${s}-slot`, name: 'OPGW', medium: 'fiber', positions: 2 },
      { id: `${s}-dev1`, assetId: `${s}-dev`, name: '광 1', medium: 'fiber', positions: 1 },
    ],
    cables: [{ id: `${s}-jumper`, aPortId: `${s}-dev1`, bPortId: `${s}-front1` }],
  };
}

function merge(...parts: TopologyInput[]): TopologyInput {
  return {
    substations: parts.flatMap((p) => p.substations),
    floors: parts.flatMap((p) => p.floors),
    assets: parts.flatMap((p) => p.assets),
    ports: parts.flatMap((p) => p.ports),
    cables: parts.flatMap((p) => p.cables),
  };
}

const cable = (id: string, a: string, b: string) => ({ id, aPortId: a, bPortId: b });
const hop = (from: string, to: string, cableId?: string, core?: number): TraceHop => ({
  kind: cableId ? 'cable' : 'internal', fromPortId: from, toPortId: to,
  ...(cableId ? { cableId } : {}), ...(core != null ? { core } : {}),
});

describe('buildTopologyGraph', () => {
  it('줄은 양끝이 다심 포트인 케이블뿐 — 점퍼는 줄이 아니다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const { edges } = buildTopologyGraph(input, 'a-dev1', []);
    expect(edges).toEqual([
      { id: 'opgw', source: 'a', target: 'b', sourceSlotName: 'a슬롯', targetSlotName: 'b슬롯' },
    ]);
  });

  it('양끝이 같은 국이면 줄이 아니다 — 국 안 이야기는 추적의 몫', () => {
    const input = merge(station('a'));
    input.assets.push({ id: 'a-slot2', name: 'a슬롯2', parentAssetId: 'a-ofd', substationId: 'a', floorId: null });
    input.ports.push({ id: 'a-opgw2', assetId: 'a-slot2', name: 'OPGW', medium: 'fiber', positions: 2 });
    input.cables.push(cable('inner', 'a-opgw', 'a-opgw2'));
    expect(buildTopologyGraph(input, 'a-dev1', []).edges).toEqual([]);
  });

  it('두 국 사이 구간이 두 본이면 줄도 둘', () => {
    const input = merge(station('a'), station('b'));
    input.ports.push(
      { id: 'a-opgw-b', assetId: 'a-slot', name: 'OPGW 2', medium: 'fiber', positions: 2 },
      { id: 'b-opgw-b', assetId: 'b-slot', name: 'OPGW 2', medium: 'fiber', positions: 2 },
    );
    input.cables.push(cable('opgw1', 'a-opgw', 'b-opgw'), cable('opgw2', 'a-opgw-b', 'b-opgw-b'));
    expect(buildTopologyGraph(input, 'a-dev1', []).edges.map((e) => e.id)).toEqual(['opgw1', 'opgw2']);
  });

  it('마디 안 목록은 홉이 지나간 차례 — 시드 자산이 맨 앞', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [
      hop('a-dev1', 'a-front1', 'a-jumper'),
      hop('a-front1', 'a-opgw', undefined, 1),
      hop('a-opgw', 'b-opgw', 'opgw', 1),
      hop('b-opgw', 'b-front1'),
      hop('b-front1', 'b-dev1', 'b-jumper'),
    ];
    const { nodes } = buildTopologyGraph(input, 'a-dev1', hops);
    expect(nodes.find((n) => n.id === 'a')!.members.map((m) => m.assetName)).toEqual(['a단말', 'a슬롯']);
    expect(nodes.find((n) => n.id === 'b')!.members.map((m) => m.assetName)).toEqual(['b슬롯', 'b단말']);
  });

  it('코어가 안 지나가는 국은 마디만 서고 목록은 비어 있다', () => {
    const input = merge(station('a'), station('b'), station('c'));
    input.cables.push(cable('ab', 'a-opgw', 'b-opgw'), cable('bc', 'b-opgw', 'c-opgw'));
    const { nodes } = buildTopologyGraph(input, 'a-dev1', [hop('a-dev1', 'a-front1', 'a-jumper')]);
    expect(nodes.find((n) => n.id === 'c')!.members).toEqual([]);
  });

  it('litEdgeIds = 홉이 탄 구간 케이블만 — 점퍼는 아니다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [hop('a-dev1', 'a-front1', 'a-jumper'), hop('a-opgw', 'b-opgw', 'opgw', 1)];
    expect([...buildTopologyGraph(input, 'a-dev1', hops).litEdgeIds]).toEqual(['opgw']);
  });

  it('층 이름은 그 국에 층이 둘 이상일 때만 — 하나뿐이면 군더더기다', () => {
    const one = merge(station('a'), station('b'));
    one.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [hop('a-dev1', 'a-front1', 'a-jumper')];
    expect(buildTopologyGraph(one, 'a-dev1', hops).nodes[0]!.members[0]!.floorName).toBeNull();

    const two = merge(station('a'), station('b'));
    two.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    two.floors.push({ id: 'a-f2', name: '2층', substationId: 'a' });
    expect(buildTopologyGraph(two, 'a-dev1', hops).nodes[0]!.members[0]!.floorName).toBe('1층');
  });

  it('설비 이름을 함께 낸다 — 「광단말 A」는 송광치마다 하나씩 있다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const m = buildTopologyGraph(input, 'a-dev1', [hop('a-dev1', 'a-front1', 'a-jumper')])
      .nodes[0]!.members.find((x) => x.assetId === 'a-slot')!;
    expect(m.assemblyName).toBe('OFD');
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `npx vitest run --root packages/core src/topology/graph.test.ts`
Expected: FAIL — `Failed to resolve import "./graph.js"`

- [ ] **Step 4: 구현한다 (`graph.ts`)**

```ts
import { isMultiCorePort } from '../catalog/portKinds.js';
import type { TraceHop } from '../trace/graph.js';
import type { TopoEdge, TopoMember, TopoNode, TopologyInput } from './types.js';

/**
 * 국 단위 그래프 — **마디는 변전소, 줄은 구간 케이블**.
 *
 * 「구간인가」는 양끝이 다심 포트인가로 묻는다. 다심 한 가닥이 국과 국을 잇는 그 케이블이
 * 곧 추적이 못 넘던 경계이고, 토폴로지는 정확히 그 바깥을 그린다.
 *
 * 마디 안에 서는 것은 **추적이 그 국에서 지나간 장비**다. 「이 망에 걸린 것 전부」로 두면
 * 링의 다른 국까지 장비 목록이 채워져, 내 코어와 무관한 것이 답처럼 보인다.
 */
export function buildTopologyGraph(
  input: TopologyInput,
  seedPortId: string,
  hops: readonly TraceHop[],
): { nodes: TopoNode[]; edges: TopoEdge[]; litEdgeIds: Set<string> } {
  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const portById = new Map(input.ports.map((p) => [p.id, p]));
  const floorById = new Map(input.floors.map((f) => [f.id, f]));
  const subById = new Map(input.substations.map((s) => [s.id, s]));

  /* 층 이름을 적을 국 — 층이 하나뿐인 국에 「1층」을 붙이면 줄마다 같은 글자가 반복된다. */
  const floorCount = new Map<string, number>();
  for (const f of input.floors) floorCount.set(f.substationId, (floorCount.get(f.substationId) ?? 0) + 1);

  const subOf = (portId: string): string | null => {
    const asset = assetById.get(portById.get(portId)?.assetId ?? '');
    return asset?.substationId ?? null;
  };

  // ── 줄 ─────────────────────────────────────────────────────────────────
  const edges: TopoEdge[] = [];
  for (const c of input.cables) {
    const a = portById.get(c.aPortId);
    const b = portById.get(c.bPortId);
    if (!a || !b) continue;
    if (!isMultiCorePort(a.positions) || !isMultiCorePort(b.positions)) continue;
    const sa = subOf(c.aPortId);
    const sb = subOf(c.bPortId);
    if (!sa || !sb || sa === sb) continue;
    edges.push({
      id: c.id, source: sa, target: sb,
      sourceSlotName: assetById.get(a.assetId)?.name ?? '',
      targetSlotName: assetById.get(b.assetId)?.name ?? '',
    });
  }

  // ── 마디 안 목록 — 홉이 지나간 차례 ────────────────────────────────────
  const memberIds: string[] = [];
  const pushAsset = (portId: string) => {
    const assetId = portById.get(portId)?.assetId;
    if (assetId && !memberIds.includes(assetId)) memberIds.push(assetId);
  };
  pushAsset(seedPortId);
  for (const h of hops) pushAsset(h.toPortId);

  const membersBySub = new Map<string, TopoMember[]>();
  for (const assetId of memberIds) {
    const asset = assetById.get(assetId);
    if (!asset) continue;
    const list = membersBySub.get(asset.substationId) ?? [];
    list.push({
      assetId,
      assemblyName: asset.parentAssetId ? assetById.get(asset.parentAssetId)?.name ?? null : null,
      assetName: asset.name,
      floorName: (floorCount.get(asset.substationId) ?? 0) > 1
        ? floorById.get(asset.floorId ?? '')?.name ?? null
        : null,
    });
    membersBySub.set(asset.substationId, list);
  }

  // ── 마디 — 줄에 닿은 국 + 목록이 있는 국. 시드 국이 맨 앞, 나머지는 이름 차례. ──
  const nodeIds = new Set<string>([...edges.flatMap((e) => [e.source, e.target]), ...membersBySub.keys()]);
  const seedSub = subOf(seedPortId);
  if (seedSub) nodeIds.add(seedSub);
  const nodes: TopoNode[] = [...nodeIds]
    .map((id) => ({ id, name: subById.get(id)?.name ?? id, members: membersBySub.get(id) ?? [] }))
    .sort((a, b) => (a.id === seedSub ? -1 : b.id === seedSub ? 1 : a.name.localeCompare(b.name)));

  const edgeIds = new Set(edges.map((e) => e.id));
  const litEdgeIds = new Set(
    hops.flatMap((h) => (h.cableId !== undefined && edgeIds.has(h.cableId) ? [h.cableId] : [])),
  );

  return { nodes, edges, litEdgeIds };
}
```

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `npx vitest run --root packages/core src/topology/graph.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: 내보내고 빌드한다**

`packages/core/src/index.ts` 의 trace 내보내기 아래에 더한다:

```ts
export * from './topology/types.js';
export * from './topology/graph.js';
```

Run: `npm run build -w @twin/core`
Expected: 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/topology packages/core/src/index.ts
git commit -m "feat(topology): 국 단위 그래프 — 마디는 변전소, 줄은 양끝이 다심 포트인 케이블"
```

---

## Task 2: 링 인식 — 소링과 대링

**Files:**
- Create: `packages/core/src/topology/rings.ts`
- Create: `packages/core/src/topology/rings.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `TopoEdge`, `Ring` from `./types.js`
- Produces: `detectRings(edges: readonly TopoEdge[]) → Ring[]`

**참고**: 옛 구현이 `git show 2419e6ae^:frontend/src/utils/graph/cycleDetection.ts` 에 있다(227줄). 알고리즘은 순수 그래프 계산이라 그대로 쓸 수 있고, 옮기면서 다음 셋을 바꾼다 — ① 타입을 `TraceEdge`/`TraceNode` → `TopoEdge` 로, ② `label`(변전소명 이어 붙이기)을 **버린다**(화면이 링 이름을 쓰지 않는다), ③ 인자에서 `adjacency`·`nodeMap` 을 없애고 간선 목록 하나만 받는다(인접은 안에서 만든다).

- [ ] **Step 1: 실패하는 시험을 쓴다 (`rings.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { detectRings } from './rings.js';
import type { TopoEdge } from './types.js';

const e = (id: string, source: string, target: string): TopoEdge =>
  ({ id, source, target, sourceSlotName: '', targetSlotName: '' });

/** 링 하나를 마디 이름 집합으로 견준다 — 차례는 뜻이 없다. */
const nodesOf = (r: { nodeIds: string[] }) => [...r.nodeIds].sort();
const edgesOf = (r: { edgeIds: string[] }) => [...r.edgeIds].sort();

describe('detectRings', () => {
  it('닫힌 링 하나 — 마디 넷이 소링 하나로', () => {
    const rings = detectRings([e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A')]);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.level).toBe(0);
    expect(nodesOf(rings[0]!)).toEqual(['A', 'B', 'C', 'D']);
    expect(edgesOf(rings[0]!)).toEqual(['1', '2', '3', '4']);
  });

  /* 구간 하나가 빠지면 링이 아니라 사슬이다 — 그림도 원이 아니라 줄로 서야 한다. */
  it('안 닫힌 링은 링이 아니다', () => {
    expect(detectRings([e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D')])).toEqual([]);
  });

  it('마디 하나를 공유하는 링 둘(8자) — 소링 둘, 대링 없음', () => {
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'D'), e('5', 'D', 'E'), e('6', 'E', 'C'),
    ]);
    expect(rings.filter((r) => r.level === 0)).toHaveLength(2);
    /* 간선을 공유하지 않으므로 바깥 테두리가 따로 생기지 않는다 — 두 원이 한 점에서 접할 뿐이다. */
    expect(rings.filter((r) => r.level === 1)).toHaveLength(0);
  });

  it('구간 하나를 공유하는 링 둘 — 소링 둘 + 대링 하나(바깥 테두리)', () => {
    /* A-B-C-D-A 와 A-D-E-F-A 가 간선 4(D-A)를 공유한다. */
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ]);
    const small = rings.filter((r) => r.level === 0);
    const big = rings.filter((r) => r.level === 1);
    expect(small).toHaveLength(2);
    expect(big).toHaveLength(1);
    /* 바깥 테두리 = 공유 간선을 뺀 나머지(XOR). 4번이 빠져야 한다. */
    expect(edgesOf(big[0]!)).toEqual(['1', '2', '3', '5', '6', '7']);
    expect(nodesOf(big[0]!)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect([...big[0]!.childRingIds].sort()).toEqual(small.map((r) => r.id).sort());
  });

  /* 두 국 사이 구간이 두 본인 것은 이중화이지 링이 아니다 — 원으로 그릴 것이 없다. */
  it('평행 구간(마디 둘)은 링으로 세지 않는다', () => {
    expect(detectRings([e('1', 'A', 'B'), e('2', 'A', 'B')])).toEqual([]);
  });

  it('줄이 없으면 링도 없다', () => {
    expect(detectRings([])).toEqual([]);
  });

  /* 대링을 원으로 놓을 것이므로 마디가 **테두리를 도는 차례**로 나와야 한다.
     차례가 뒤섞이면 원 위에 놓았을 때 줄이 서로를 가로지른다. */
  it('대링의 마디는 테두리를 도는 차례로 나온다', () => {
    const rings = detectRings([
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ]);
    const ids = rings.find((r) => r.level === 1)!.nodeIds;
    /* A-B-C-D-E-F 를 도는 차례 — 어디서 시작하든, 어느 방향이든 좋다. */
    const cycle = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rotations = cycle.flatMap((_, i) => {
      const fwd = [...cycle.slice(i), ...cycle.slice(0, i)];
      return [fwd, [...fwd].reverse()];
    });
    expect(rotations.some((r) => r.join() === ids.join())).toBe(true);
  });

  /* 링이 셋 이상 한 마디에서 만나면 테두리가 단일 순환이 아니다 — 그릴 원이 없으므로
     대링을 내지 않는다. 한때 걷기가 시작점으로 먼저 돌아오며 멈춰, 간선은 열둘인데 마디는
     여섯만 담긴 대링이 **오류 없이** 나왔다. */
  it('링 셋이 한 허브에서 만나면 대링을 내지 않는다', () => {
    /* A와 Z 를 잇는 마디가 안 겹치는 경로 넷 — 소링 셋이 A·Z 를 공유한다. */
    const paths = [['P1'], ['P2'], ['P3'], ['P4']];
    const edges = paths.flatMap((mid, i) => [
      e(`${i}a`, 'A', mid[0]!),
      e(`${i}b`, mid[0]!, 'Z'),
    ]);
    const rings = detectRings(edges);
    expect(rings.filter((r) => r.level === 1)).toHaveLength(0);
    expect(rings.filter((r) => r.level === 0).length).toBeGreaterThan(0);
    /* 낸 링은 무엇이든 마디와 간선이 아귀가 맞아야 한다. */
    for (const r of rings) expect(r.nodeIds.length).toBe(r.edgeIds.length);
  });

  it('같은 입력이면 같은 답 — 링 id 까지', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A')];
    expect(detectRings(edges)).toEqual(detectRings(edges));
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --root packages/core src/topology/rings.test.ts`
Expected: FAIL — `Failed to resolve import "./rings.js"`

- [ ] **Step 3: 옛 파일을 꺼내 옮긴다**

```bash
git show 2419e6ae^:frontend/src/utils/graph/cycleDetection.ts > /tmp/cycleDetection.ts
```

`packages/core/src/topology/rings.ts` 를 만들고 그 알고리즘을 옮긴다. 서명은 이것 하나다:

```ts
import type { Ring, TopoEdge } from './types.js';

/**
 * 링 인식 — **소링과 대링**.
 *
 * 1. BFS 신장트리를 세워 트리 간선과 chord(트리에 안 든 간선)를 가른다
 * 2. chord 하나가 기본 순환 하나를 만든다(양 끝에서 LCA 까지 올라간 두 길 + chord)
 * 3. 간선을 공유하는 순환들을 Union-Find 로 묶는다
 * 4. 묶음에 순환이 둘 이상이면 **대링**을 하나 더 낸다 — 간선을 홀수 번 쓴 것만 남기면
 *    (XOR) 그것이 바깥 테두리다. 배치가 그 테두리를 원으로 놓으면 공유 구간은 저절로
 *    그 원을 가로지르는 현이 된다(옛 SPQR 레이아웃 529줄이 하던 일이다).
 *
 * 마디 둘짜리 순환(평행 간선)은 세지 않는다. 이중화이지 원으로 그릴 링이 아니다.
 */
export function detectRings(edges: readonly TopoEdge[]): Ring[];
```

옮길 때 지킬 것:
- 옛 코드의 `edge.sourceAssetId`/`edge.targetAssetId` → `edge.source`/`edge.target`
- 옛 코드의 `buildLabel`·`label` 필드 — **삭제한다**(화면이 안 쓴다)
- 옛 코드의 `adjacency`·`nodeMap` 매개변수 — 삭제하고 `edges` 에서 안에서 만든다
- 링 id 는 `ring-1`, `ring-2` … 로 매긴다(옛 코드와 같다). 순회 차례가 `edges` 배열 차례에서만 나오므로 같은 입력이면 같은 id 가 나온다
- `cycleNodeIds.length >= 3` 조건을 그대로 둔다 — 이것이 평행 간선을 거르는 자리다
- **대링의 `nodeIds` 는 옛 코드처럼 Set 을 펴서 내지 말고, 테두리 간선을 따라 걸어 담는다.**
  옛 코드는 `outerNodeIds` 를 Set 으로 모았는데 그러면 차례가 간선 목록 차례일 뿐이다.
  배치가 그 차례대로 원 위에 놓으므로, 도는 차례가 아니면 줄이 서로를 가로지른다.
  걷는 법: 테두리 간선으로 인접 목록을 만들고, 아무 마디에서 시작해 「아직 안 쓴 간선」을
  따라 제자리로 돌아올 때까지 걷는다.
- **걷고 나서 「단일 순환이었나」를 검사한다 — 아니면 그 묶음은 대링을 내지 않는다.**
  「테두리는 차수 2인 순환」은 소링이 **둘**일 때만 참이다. 링이 셋 이상 한 마디에서 만나면
  XOR 결과에서 그 마디의 차수가 4가 되고, 걷기는 시작점으로 먼저 돌아오며 멈춰 나머지를
  통째로 빠뜨린다(마디가 안 겹치는 네 경로로 재현: 간선 12개인데 마디 6개만 담겼다).
  대링은 **원을 하나 그리려고** 있는 것이므로, 그릴 원이 없으면 없다고 말하는 것이 답이다 —
  걷기가 XOR 간선을 다 덮지 못했으면 그 묶음은 소링만 낸다. 배치는 소링들을 공유 마디에서
  접하게 놓는다. (테두리 간선이 아예 없는 경우도 같은 검사에 걸린다.)

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --root packages/core src/topology/rings.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 내보내고 빌드한다**

`packages/core/src/index.ts` 에 더한다:

```ts
export * from './topology/rings.js';
```

Run: `npm run build -w @twin/core`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/topology packages/core/src/index.ts
git commit -m "feat(topology): 링 인식 — 소링(기본 순환)과 대링(간선 공유 묶음의 바깥 테두리)"
```

---

## Task 3: 배치 — 링은 원으로, 나머지는 방사로

**Files:**
- Create: `packages/core/src/topology/layout.ts`
- Create: `packages/core/src/topology/layout.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `TopoNode`·`TopoEdge`·`Ring`·`Point` from `./types.js`
- Produces: `computeLayout(nodes, edges, rings) → Map<string, Point>`, `NODE_GAP`, `ringRadius(n)`

**규칙 넷이 지켜야 하는 것 — 「마디는 겹치지 않는다」**

리뷰가 아래 Step 3 참조 코드에서 그 불변식을 깨는 자리 넷을 찾았다(사용자 판정: **넷 다 고친다**).
Step 3 의 코드를 옮기되 이 넷은 고쳐서 쓴다.

- **부채꼴은 각을 고정하지 말고 거리를 민다.** 폭 120°를 고정하면 한 마디에 가지가 다섯이면
  형제 사이가 91.5px(여섯이면 76.4)로 좁아져 실제로 겹친다. 잎 수에 비례한 몫은 그대로 두고,
  **가장 좁은 이웃 각(`minGap`)에서 거리가 `NODE_GAP` 이 되도록** 부채꼴 전체를 밀어낸다:
  `radius = Math.max(NODE_GAP, NODE_GAP / (2 * Math.sin(minGap / 2)))`. 링 반지름과 같은 셈법이다.
- **뿌리는 덩어리마다 고른다.** 뿌리를 한 번만 고르면 끊어진 두 번째 덩어리는 이웃 관계가
  통째로 버려지고 x축에 한 줄로 늘어선다. 남은 마디가 있으면 그중에서 다시 뿌리를 골라
  (이웃이 가장 많은 것, 같으면 id 차례) 이미 그린 것 오른쪽에 놓고 또 뻗는다.
- **인접 목록에서 평행 간선을 겹쳐 세지 않는다.** 두 국 사이 구간이 두 본이면(이중화 —
  Task 7 시드가 만드는 바로 그 모양) 이웃 목록에 같은 마디가 두 번 들어가 **형제 전부의**
  부채꼴 몫이 틀어진다. 이웃은 마디 하나당 한 번이다.
- **`outward` 는 「나 자신」을 id 로 거른다.** 좌표값으로 거르면 다른 두 마디가 우연히 같은
  자리에 놓였을 때 둘 다 무게중심에서 빠져, 그 뒤 배치가 연쇄로 어긋난다.

- [ ] **Step 1: 실패하는 시험을 쓴다 (`layout.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { NODE_GAP, computeLayout, ringRadius } from './layout.js';
import { detectRings } from './rings.js';
import type { TopoEdge, TopoNode } from './types.js';

const e = (id: string, source: string, target: string): TopoEdge =>
  ({ id, source, target, sourceSlotName: '', targetSlotName: '' });
const n = (id: string): TopoNode => ({ id, name: id, members: [] });

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** 어느 두 마디도 겹치지 않는가 — 겹치면 그림이 거짓말을 한다. */
function noOverlap(pos: Map<string, { x: number; y: number }>) {
  const pts = [...pos.values()];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      expect(dist(pts[i]!, pts[j]!)).toBeGreaterThan(NODE_GAP * 0.5);
    }
  }
}

describe('ringRadius', () => {
  /* 마디 N 개가 서로 NODE_GAP 만큼 떨어지려면 정다각형 한 변이 NODE_GAP 이어야 한다. */
  it('한 변이 NODE_GAP 인 정다각형의 반지름', () => {
    expect(ringRadius(4)).toBeCloseTo(NODE_GAP / (2 * Math.sin(Math.PI / 4)), 6);
    expect(ringRadius(6)).toBeCloseTo(NODE_GAP, 6); // 정육각형은 반지름 = 한 변
  });
});

describe('computeLayout', () => {
  it('링 넷은 원 위에 같은 간격으로 선다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A')];
    const nodes = ['A', 'B', 'C', 'D'].map(n);
    const pos = computeLayout(nodes, edges, detectRings(edges));
    const cx = [...pos.values()].reduce((s, p) => s + p.x, 0) / 4;
    const cy = [...pos.values()].reduce((s, p) => s + p.y, 0) / 4;
    const radii = [...pos.values()].map((p) => dist(p, { x: cx, y: cy }));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    /* 이웃한 두 마디의 거리가 곧 한 변 — NODE_GAP 이다. */
    expect(dist(pos.get('A')!, pos.get('B')!)).toBeCloseTo(NODE_GAP, 6);
    noOverlap(pos);
  });

  it('링이 없으면(사슬) 뿌리에서 방사로 뻗는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C')];
    const pos = computeLayout(['A', 'B', 'C'].map(n), edges, []);
    expect(pos.size).toBe(3);
    noOverlap(pos);
  });

  it('링에 매달린 가지도 자리를 얻는다', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'X'), e('5', 'X', 'Y'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'X', 'Y'].map(n), edges, detectRings(edges));
    expect(pos.size).toBe(5);
    noOverlap(pos);
  });

  it('마디를 공유하는 링 둘 — 다섯 마디가 다 자리를 얻고 겹치지 않는다', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'D'), e('5', 'D', 'E'), e('6', 'E', 'C'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E'].map(n), edges, detectRings(edges));
    expect(pos.size).toBe(5);
    noOverlap(pos);
  });

  it('구간을 공유하는 링 둘 — 여섯 마디가 한 원 위에 선다(공유 구간은 현이 된다)', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E', 'F'].map(n), edges, detectRings(edges));
    const cx = [...pos.values()].reduce((s, p) => s + p.x, 0) / 6;
    const cy = [...pos.values()].reduce((s, p) => s + p.y, 0) / 6;
    const radii = [...pos.values()].map((p) => dist(p, { x: cx, y: cy }));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    noOverlap(pos);
  });

  it('따로 노는 마디도 자리를 얻는다 — 줄이 하나도 없는 국', () => {
    const pos = computeLayout([n('A')], [], []);
    expect(pos.get('A')).toEqual({ x: 0, y: 0 });
  });

  /* 폭을 고정하면 가지가 다섯만 되어도 형제 사이가 NODE_GAP 아래로 좁아진다 —
     몫은 그대로 두고 부채꼴 전체를 밀어내야 한다. */
  it('한 마디에 가지가 여섯이어도 겹치지 않는다', () => {
    const kids = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
    const edges = kids.map((k, i) => e(`${i}`, 'H', k));
    const pos = computeLayout([n('H'), ...kids.map(n)], edges, []);
    expect(pos.size).toBe(7);
    noOverlap(pos);
  });

  /* 뿌리를 한 번만 고르면 두 번째 덩어리는 이웃 관계가 통째로 버려진다. */
  it('끊어진 덩어리가 둘이면 각각 제 이웃대로 놓인다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'D', 'E'), e('4', 'E', 'F')];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E', 'F'].map(n), edges, []);
    expect(pos.size).toBe(6);
    /* 이어진 두 마디는 NODE_GAP 만큼 떨어져 선다 — 한 줄로 흩뿌려진 것이 아니다. */
    expect(dist(pos.get('D')!, pos.get('E')!)).toBeCloseTo(NODE_GAP, 6);
    expect(dist(pos.get('E')!, pos.get('F')!)).toBeCloseTo(NODE_GAP, 6);
    noOverlap(pos);
  });

  /* 두 국 사이 구간이 두 본이면 이웃 목록에 같은 마디가 두 번 들어간다 — 그러면 형제
     전부의 몫이 틀어져, 무게가 같은 B 와 C 가 대칭으로 서지 않는다. */
  it('평행 구간이 있어도 형제의 부채꼴 몫이 틀어지지 않는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'A', 'B'), e('3', 'A', 'C')];
    const pos = computeLayout(['A', 'B', 'C'].map(n), edges, []);
    const b = pos.get('B')!;
    const c = pos.get('C')!;
    expect(b.x).toBeCloseTo(c.x, 6);
    expect(b.y).toBeCloseTo(-c.y, 6);
  });

  it('빈 입력이면 빈 답', () => {
    expect(computeLayout([], [], []).size).toBe(0);
  });

  it('같은 입력이면 같은 좌표 — 그림이 열 때마다 달라지지 않는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'), e('4', 'C', 'X')];
    const nodes = ['A', 'B', 'C', 'X'].map(n);
    const rings = detectRings(edges);
    expect([...computeLayout(nodes, edges, rings)]).toEqual([...computeLayout(nodes, edges, rings)]);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --root packages/core src/topology/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout.js"`

- [ ] **Step 3: 구현한다 (`layout.ts`)**

```ts
import type { Point, Ring, TopoEdge, TopoNode } from './types.js';

/**
 * 좌표 — **링은 원으로, 나머지는 방사로**. 매개변수 0개, 같은 자료면 같은 그림.
 *
 * 규칙 넷이면 전부 덮인다:
 *
 * 1. 바깥 테두리(대링이 있으면 대링, 없으면 소링)를 정다각형으로 놓는다
 * 2. 테두리 안을 가르는 구간은 **그대로 현이 된다** — 두 끝이 이미 원 위에 있으니 계산할
 *    것이 없다. 옛 SPQR 레이아웃 529줄이 하던 일이 이 한 줄로 대체된다
 * 3. 링 덩어리가 여럿이고 마디 하나를 공유하면 그 점에서 접하게 놓는다
 * 4. 링에 안 든 마디는 놓인 이웃에서 방사로 뻗는다 — 자식 가지의 잎 수에 비례해 부채꼴을
 *    나눈다(균등하게 나누면 잎이 많은 가지끼리 겹친다)
 */

/** 이웃한 두 마디의 중심 거리 — 마디 상자 폭 + 여백. */
export const NODE_GAP = 220;

/** 링에서 뻗어 나가는 가지가 펴지는 각 — 바깥 방향을 가운데 두고 ±60°. */
const BRANCH_SPREAD = (Math.PI * 2) / 3;

/** 마디 N 개가 서로 `NODE_GAP` 만큼 떨어져 원 위에 서려면 반지름이 이만큼. */
export function ringRadius(n: number): number {
  if (n < 3) return NODE_GAP;
  return NODE_GAP / (2 * Math.sin(Math.PI / n));
}

export function computeLayout(
  nodes: readonly TopoNode[], edges: readonly TopoEdge[], rings: readonly Ring[],
): Map<string, Point> {
  const pos = new Map<string, Point>();
  const neighbors = adjacency(nodes, edges);

  for (const ring of outerRings(rings)) placeRing(ring, pos);
  placeBranches(nodes, neighbors, pos);
  return pos;
}

/**
 * 그릴 링 — 대링에 든 소링은 그리지 않는다.
 *
 * 대링을 원으로 놓으면 그 안의 소링은 공유 구간(현)으로 저절로 나뉜다. 소링까지 각각
 * 원으로 놓으려 들면 두 원을 겹치지 않게 미는 일이 필요해지고, 그것이 옛 SPQR 이었다.
 */
function outerRings(rings: readonly Ring[]): Ring[] {
  const composed = new Set(rings.filter((r) => r.level === 1).flatMap((r) => r.childRingIds));
  return rings
    .filter((r) => r.level === 1 || !composed.has(r.id))
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length || (a.id < b.id ? -1 : 1));
}

function adjacency(nodes: readonly TopoNode[], edges: readonly TopoEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    map.get(e.source)?.push(e.target);
    map.get(e.target)?.push(e.source);
  }
  /* 차례를 못 박는다 — 같은 자료면 같은 그림이어야 한다. */
  for (const list of map.values()) list.sort();
  return map;
}

function placeRing(ring: Ring, pos: Map<string, Point>): void {
  const ids = ring.nodeIds;
  const radius = ringRadius(ids.length);
  const anchor = ids.find((id) => pos.has(id));

  if (anchor === undefined) {
    /* 처음 놓는 덩어리는 원점에, 그 다음부터는 이미 그린 것 오른쪽에 나란히. */
    const cx = pos.size === 0 ? 0 : maxX(pos) + NODE_GAP + radius;
    placeOnCircle(ids, { x: cx, y: 0 }, radius, -Math.PI / 2, pos);
    return;
  }

  /* 이미 놓인 마디를 공유한다 — 그 점에서 접하게. 중심을 바깥쪽으로 반지름만큼 밀고,
     공유 마디가 제자리에 오도록 시작각을 맞춘다. */
  const p = pos.get(anchor)!;
  const dir = outward(p, pos);
  const center = { x: p.x + dir.x * radius, y: p.y + dir.y * radius };
  const start = Math.atan2(p.y - center.y, p.x - center.x);
  placeOnCircle(rotateToFirst(ids, anchor), center, radius, start, pos);
}

function placeOnCircle(
  ids: readonly string[], center: Point, radius: number, start: number, pos: Map<string, Point>,
): void {
  const step = (2 * Math.PI) / ids.length;
  ids.forEach((id, i) => {
    if (pos.has(id)) return;
    const angle = start + step * i;
    pos.set(id, { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  });
}

/** 이 마디에서 **밖으로** 가는 방향 — 이미 놓인 것들의 무게중심 반대편. */
function outward(p: Point, pos: Map<string, Point>): Point {
  let sx = 0, sy = 0, n = 0;
  for (const q of pos.values()) {
    if (q.x === p.x && q.y === p.y) continue;
    sx += q.x; sy += q.y; n++;
  }
  if (n === 0) return { x: 1, y: 0 };
  const dx = p.x - sx / n;
  const dy = p.y - sy / n;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

function rotateToFirst(ids: readonly string[], first: string): string[] {
  const at = ids.indexOf(first);
  return at <= 0 ? [...ids] : [...ids.slice(at), ...ids.slice(0, at)];
}

function maxX(pos: Map<string, Point>): number {
  let m = -Infinity;
  for (const p of pos.values()) m = Math.max(m, p.x);
  return m === -Infinity ? 0 : m;
}

/** 링에 안 든 마디 — 놓인 이웃에서 부채꼴로 뻗는다. */
function placeBranches(
  nodes: readonly TopoNode[], neighbors: Map<string, string[]>, pos: Map<string, Point>,
): void {
  const remaining = nodes.filter((n) => !pos.has(n.id));
  if (remaining.length === 0) return;

  if (pos.size === 0) {
    /* 링이 하나도 없다 — 이웃이 가장 많은 마디를 뿌리로(같으면 id 차례). */
    const root = [...remaining].sort(
      (a, b) => (neighbors.get(b.id)?.length ?? 0) - (neighbors.get(a.id)?.length ?? 0)
        || (a.id < b.id ? -1 : 1),
    )[0]!;
    pos.set(root.id, { x: 0, y: 0 });
  }

  const queue = [...pos.keys()];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const kids = (neighbors.get(id) ?? []).filter((k) => !pos.has(k));
    if (kids.length === 0) continue;
    const base = pos.get(id)!;
    const dir = outward(base, pos);
    const baseAngle = Math.atan2(dir.y, dir.x);
    const weights = kids.map((k) => subtreeLeaves(k, id, neighbors, pos));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    kids.forEach((k, i) => {
      const share = weights[i]! / total;
      const angle = baseAngle - BRANCH_SPREAD / 2 + (acc + share / 2) * BRANCH_SPREAD;
      acc += share;
      pos.set(k, { x: base.x + NODE_GAP * Math.cos(angle), y: base.y + NODE_GAP * Math.sin(angle) });
      queue.push(k);
    });
  }

  /* 어느 덩어리에도 안 붙은 마디(줄이 하나도 없는 국) — 오른쪽에 나란히 세운다. */
  for (const node of nodes) {
    if (!pos.has(node.id)) pos.set(node.id, { x: maxX(pos) + NODE_GAP, y: 0 });
  }
}

/** 이 가지에 잎이 몇이나 되나 — 부채꼴을 나누는 몫이 된다. */
function subtreeLeaves(
  start: string, parent: string, neighbors: Map<string, string[]>, placed: Map<string, Point>,
): number {
  const visited = new Set([parent, start]);
  const stack = [start];
  let leaves = 0;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = (neighbors.get(cur) ?? []).filter((k) => !visited.has(k) && !placed.has(k));
    if (kids.length === 0) { leaves++; continue; }
    for (const k of kids) { visited.add(k); stack.push(k); }
  }
  return Math.max(1, leaves);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --root packages/core src/topology/layout.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: core 전체 시험 + 빌드**

Run: `npx vitest run --root packages/core`
Expected: PASS (기존 174 + 새 23 = 197 안팎)

Run: `npm run build -w @twin/core`
Expected: 오류 없음

- [ ] **Step 6: 내보내고 커밋**

`packages/core/src/index.ts` 에 더한다:

```ts
export * from './topology/layout.js';
```

```bash
git add packages/core/src/topology packages/core/src/index.ts
git commit -m "feat(topology): 배치 — 바깥 테두리를 원으로, 공유 구간은 현으로, 가지는 잎 수만큼 부채꼴로"
```

---

## Task 4: 서버 — 이어진 것 전부

**Files:**
- Create: `backend/src/v2/reach.routes.ts`
- Create: `backend/src/v2/__tests__/reach.test.ts`
- Modify: `backend/src/v2/router.ts`
- Modify: `backend/src/v2/__tests__/helpers.ts` (스윕 prefix 추가)

**Interfaces:**
- Consumes: `nextDb`, `authenticate`, `HttpError` (다른 v2 라우트와 같다)
- Produces: `POST /api/v2/reach` — 요청 `{ portId }`, 응답 `{ substations, floors, assets, ports, cables, truncated }`

- [ ] **Step 1: 실패하는 시험을 쓴다 (`reach.test.ts`)**

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

/**
 * `/reach` — 이 포트에서 케이블로 이어진 것 **전부**를 국 경계 없이.
 *
 * 워킹카피는 한 국만 든다. 그래서 추적이 대국을 못 본다 — 토폴로지가 그리려는 것이 정확히
 * 그 바깥이므로, 자료를 따로 받아 와야 한다.
 */
const app = makeApp();
const uniq = `t7-rh-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };

let subAId: string, subBId: string, subCId: string;
let slotAId: string, slotBId: string, loneId: string;

const trunkOf = (assetId: string) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'TRUNK' } }).then((p) => p.id);
const coreOf = (assetId: string, index: number) =>
  nextDb.port.findFirstOrThrow({ where: { assetId, group: 'FIBER', index } }).then((p) => p.id);

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const [a, b, c] = await Promise.all([
    nextDb.substation.create({ data: { name: `${uniq}-A`, branchId: br.id } }),
    nextDb.substation.create({ data: { name: `${uniq}-B`, branchId: br.id } }),
    nextDb.substation.create({ data: { name: `${uniq}-C`, branchId: br.id } }),
  ]);
  subAId = a.id; subBId = b.id; subCId = c.id;

  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
  slotAId = randomUUID(); slotBId = randomUUID(); loneId = randomUUID();
  const ofdAId = randomUUID();
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
    assets: {
      creates: [
        { id: ofdAId, name: `${uniq}-OFD`, typeId: null },
        { id: slotAId, name: `${uniq}-슬롯A`, typeId: slotType.id, parentAssetId: ofdAId },
      ],
    },
  }).expect(200);
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
    assets: { creates: [{ id: slotBId, name: `${uniq}-슬롯B`, typeId: slotType.id }] },
  }).expect(200);
  await request(app).put(`/api/v2/substations/${subCId}/commit`).set(admin).send({
    assets: { creates: [{ id: loneId, name: `${uniq}-외딴슬롯`, typeId: slotType.id }] },
  }).expect(200);

  const g = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
    cables: {
      creates: [{
        id: randomUUID(), aPortId: await trunkOf(slotAId), bPortId: await trunkOf(slotBId),
        categoryId: g.categories[0]!.id,
      }],
    },
  }).expect(200);
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('POST /api/v2/reach', () => {
  it('국을 넘어 이어진 자산을 모은다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    const ids = res.body.assets.map((a: { id: string }) => a.id);
    expect(ids).toContain(slotAId);
    expect(ids).toContain(slotBId);
    expect(res.body.substations.map((s: { id: string }) => s.id).sort())
      .toEqual([subAId, subBId].sort());
  });

  it('따로 노는 망은 안 섞인다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    expect(res.body.assets.map((a: { id: string }) => a.id)).not.toContain(loneId);
  });

  /* 끝점을 `설비 - 장비` 로 부르려면 부모가 있어야 한다 — 케이블은 부모에 안 닿는다. */
  it('조상(설비)까지 함께 싣는다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    const slot = res.body.assets.find((a: { id: string }) => a.id === slotAId);
    expect(res.body.assets.map((a: { id: string }) => a.id)).toContain(slot.parentAssetId);
  });

  it('그 국의 층도 싣는다 — 마디 안에 층 이름을 적으려면 필요하다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(slotAId, 1) }).expect(200);
    expect(Array.isArray(res.body.floors)).toBe(true);
  });

  it('케이블이 하나도 없는 포트도 제 자산만 담아 돌려준다', async () => {
    const res = await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: await coreOf(loneId, 1) }).expect(200);
    expect(res.body.assets.map((a: { id: string }) => a.id)).toEqual([loneId]);
    expect(res.body.cables).toEqual([]);
    expect(res.body.truncated).toBe(false);
  });

  it('없는 포트는 404', async () => {
    await request(app).post('/api/v2/reach').set(admin)
      .send({ portId: randomUUID() }).expect(404);
  });

  it('portId 가 없으면 400', async () => {
    await request(app).post('/api/v2/reach').set(admin).send({}).expect(400);
  });

  it('로그인 없이는 401', async () => {
    await request(app).post('/api/v2/reach').send({ portId: randomUUID() }).expect(401);
  });
});
```

- [ ] **Step 2: 스윕 prefix 를 더한다**

`backend/src/v2/__tests__/helpers.ts` 의 `nameStartsWith` 배열에 `'t7-rh-'` 를 더한다. 안 그러면 시험 픽스처가 DB 에 남는다.

```ts
const nameStartsWith = ['t4-cb-', 't2a-', 't5-rc-', 't6-bg-', 't7-rh-'];
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `npx vitest run --root backend src/v2/__tests__/reach.test.ts`
Expected: FAIL — 404 (라우트가 없다)

- [ ] **Step 4: 구현한다 (`reach.routes.ts`)**

```ts
import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const reachRouter = Router();
reachRouter.use(authenticate);

/**
 * 이 포트에서 **케이블로 이어진 것 전부** — 국 경계를 넘어서.
 *
 * 워킹카피는 한 국만 든다. 그래서 추적은 대국 자산이 아예 없어 「자국 슬롯 앞면」에서
 * 끝난다. 토폴로지가 그리려는 것이 정확히 그 바깥이므로, 자료를 여기서 따로 받아 온다.
 *
 * **서버는 자료만 준다.** 마디·줄·링·좌표는 core 의 순수 함수가 계산한다 — 그래야 시험이
 * 쉽고, 화면과 서버가 다른 답을 낼 수 없다.
 *
 * 걷는 단위는 **자산**이다(포트가 아니다). 토폴로지의 줄은 구간 케이블 한 본이라 코어
 * 대응을 따질 일이 없다. 코어를 지키는 일은 이 자료 위에서 추적 엔진이 다시 한다.
 */

/** 한 번에 모을 자산 수 — 넘으면 거기서 멈추고 「일부만」이라고 알린다. */
const MAX_ASSETS = 5000;

reachRouter.post('/reach', async (req, res, next) => {
  try {
    const portId = typeof req.body?.portId === 'string' ? req.body.portId : null;
    if (!portId) throw new HttpError(400, 'BAD_REQUEST', '포트를 지정하세요');

    const seed = await nextDb.port.findUnique({ where: { id: portId }, select: { assetId: true } });
    if (!seed) throw new HttpError(404, 'NOT_FOUND', '없는 포트입니다');

    // ── 케이블로 이어진 자산을 너비 우선으로 모은다 ──────────────────────
    const assetIds = new Set<string>([seed.assetId]);
    const cableIds = new Set<string>();
    let frontier = [seed.assetId];
    let truncated = false;

    while (frontier.length > 0 && !truncated) {
      const cables = await nextDb.cable.findMany({
        where: {
          OR: [{ aPort: { assetId: { in: frontier } } }, { bPort: { assetId: { in: frontier } } }],
        },
        select: { id: true, aPort: { select: { assetId: true } }, bPort: { select: { assetId: true } } },
      });
      const next: string[] = [];
      for (const c of cables) {
        cableIds.add(c.id);
        for (const side of [c.aPort.assetId, c.bPort.assetId]) {
          if (assetIds.has(side)) continue;
          if (assetIds.size >= MAX_ASSETS) { truncated = true; break; }
          assetIds.add(side);
          next.push(side);
        }
        if (truncated) break;
      }
      frontier = next;
    }

    /* 조상(설비)까지 — 끝점을 「설비 - 장비」로 부르려면 부모 이름이 있어야 하는데,
       케이블은 부모에 닿지 않으므로 걷기만으로는 절대 들어오지 않는다. */
    let pending = [...assetIds];
    while (pending.length > 0) {
      const rows = await nextDb.asset.findMany({
        where: { id: { in: pending } },
        select: { parentAssetId: true },
      });
      const parents = rows
        .map((r) => r.parentAssetId)
        .filter((id): id is string => id != null && !assetIds.has(id));
      for (const id of parents) assetIds.add(id);
      pending = parents;
    }

    const ids = [...assetIds];
    const [assets, ports, cables] = await Promise.all([
      nextDb.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, typeId: true, parentAssetId: true, substationId: true, floorId: true },
        orderBy: { name: 'asc' },
      }),
      nextDb.port.findMany({
        where: { assetId: { in: ids } },
        select: {
          id: true, assetId: true, group: true, index: true,
          name: true, medium: true, direction: true, positions: true,
        },
        orderBy: [{ assetId: 'asc' }, { group: 'asc' }, { index: 'asc' }],
      }),
      nextDb.cable.findMany({
        where: { id: { in: [...cableIds] } },
        select: { id: true, aPortId: true, bPortId: true, categoryId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const substationIds = [...new Set(assets.map((a) => a.substationId))];
    const [substations, floors] = await Promise.all([
      nextDb.substation.findMany({
        where: { id: { in: substationIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      nextDb.floor.findMany({
        where: { substationId: { in: substationIds } },
        select: { id: true, name: true, substationId: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    res.json({ substations, floors, assets, ports, cables, truncated });
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 5: 라우트를 등록한다**

`backend/src/v2/router.ts` 에서 import 를 더하고(알파벳 차례로 `photos.routes.js` 아래),

```ts
import { reachRouter } from './reach.routes.js';
```

`v2Router.use('/', searchRouter);` 위에 더한다:

```ts
v2Router.use('/', reachRouter);
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `npx vitest run --root backend src/v2/__tests__/reach.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: 백엔드 전체 시험 + 커밋**

Run: `npx vitest run --root backend`
Expected: PASS (기존 231 + 8)

```bash
git add backend/src/v2/reach.routes.ts backend/src/v2/router.ts backend/src/v2/__tests__
git commit -m "feat(reach): 이 포트에서 케이블로 이어진 것 전부 — 국 경계 없이, 판단 없이"
```

---

## Task 5: 프론트 — 자료를 받아 모달을 연다

**Files:**
- Modify: `frontend/src/v2/types.ts`
- Modify: `frontend/src/v2/api.ts`
- Modify: `frontend/src/v2/hooks.ts`
- Create: `frontend/src/v2/components/topology/TopologyModal.tsx`
- Modify: `frontend/src/v2/components/detail/ConnectionsTab.tsx`
- Create: `frontend/src/v2/__tests__/TopologyModal.test.tsx`

**Interfaces:**
- Consumes: `buildTopologyGraph`·`detectRings`·`computeLayout`·`buildTraceGraph`·`traceFrom` from `@twin/core`, `buildTraceInputs` from `../../traceSelectors`
- Produces: `V2Reach` 타입, `fetchReach(portId)`, `useReach(portId, enabled)`, `<TopologyModal open seedPortId onClose />`

- [ ] **Step 1: 타입을 더한다 (`types.ts`)**

`V2Workingcopy` 선언 아래에 더한다:

```ts
/**
 * 이 포트에서 케이블로 이어진 것 전부 — `POST /api/v2/reach` 의 답.
 *
 * 워킹카피와 달리 **국 경계가 없다**. 토폴로지는 추적이 못 넘던 그 바깥을 그리는 일이라
 * 대국 자산이 있어야 한다.
 */
export interface V2Reach {
  substations: { id: string; name: string }[];
  floors: { id: string; name: string; substationId: string }[];
  assets: {
    id: string; name: string; typeId: string | null;
    parentAssetId: string | null; substationId: string; floorId: string | null;
  }[];
  ports: {
    id: string; assetId: string; group: string; index: number;
    name: string; medium: string; direction: 'IN' | 'OUT' | 'BI'; positions: number;
  }[];
  cables: { id: string; aPortId: string; bPortId: string; categoryId: string | null }[];
  /** 컴포넌트가 한계를 넘어 잘렸는가 — 그림이 「일부만」임을 알린다. */
  truncated: boolean;
}
```

- [ ] **Step 2: 부르는 자리를 더한다 (`api.ts`)**

`fetchNodeAssets` 아래에 더하고, import 타입 목록에 `V2Reach` 를 넣는다:

```ts
export async function fetchReach(portId: string): Promise<V2Reach> {
  return (await api.post('/v2/reach', { portId })).data;
}
```

- [ ] **Step 3: 훅을 더한다 (`hooks.ts`)**

`fetchReach` 를 import 목록에 넣고, `useV2NodeAssets` 아래에 더한다:

```ts
/**
 * 이어진 것 전부 — **모달이 열릴 때만** 부른다.
 *
 * 국 경계를 넘는 조회라 워킹카피보다 무겁다. 상세 패널을 여는 것만으로 이걸 부르면
 * 아무도 안 볼 그림을 매번 계산하는 셈이다.
 */
export function useReach(portId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['v2', 'reach', portId],
    queryFn: () => fetchReach(portId!),
    enabled: enabled && portId != null,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: 실패하는 시험을 쓴다 (`TopologyModal.test.tsx`)**

```tsx
/**
 * TopologyModal — 배선 시험.
 *
 * core 의 순수 함수는 따로 시험한다(`packages/core/src/topology`). 여기서 잡는 것은
 * **콜사이트가 그것들을 옳게 이어 놓았는가**다 — 인자를 하나 빠뜨려도 셀렉터 시험은
 * 통과하고 화면만 조용히 빈다(예전에 실제로 그랬다).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { V2Reach } from '../types';
import { TopologyModal } from '../components/topology/TopologyModal';

const reach: V2Reach = {
  substations: [{ id: 'sa', name: '가국' }, { id: 'sb', name: '나국' }],
  floors: [{ id: 'fa', name: '1층', substationId: 'sa' }],
  assets: [
    { id: 'a-ofd', name: 'OFD', typeId: null, parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    { id: 'a-slot', name: '가슬롯', typeId: 'slot', parentAssetId: 'a-ofd', substationId: 'sa', floorId: null },
    { id: 'a-dev', name: '가단말', typeId: 'dev', parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    { id: 'b-slot', name: '나슬롯', typeId: 'slot', parentAssetId: null, substationId: 'sb', floorId: null },
  ],
  ports: [
    /* 앞면 2심 + OPGW 2심 — 「앞면 i 번은 코어 i」가 유도되는 최소 모양이다.
       앞면이 없는 나슬롯은 추적이 거기서 끝난다(대국 성단이 아직 없는 국). */
    { id: 'a-front1', assetId: 'a-slot', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'a-front2', assetId: 'a-slot', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'a-opgw', assetId: 'a-slot', group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI', positions: 2 },
    { id: 'a-dev1', assetId: 'a-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'b-opgw', assetId: 'b-slot', group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI', positions: 2 },
  ],
  cables: [
    { id: 'jumper', aPortId: 'a-dev1', bPortId: 'a-front1', categoryId: null },
    { id: 'opgw', aPortId: 'a-opgw', bPortId: 'b-opgw', categoryId: null },
  ],
  truncated: false,
};

/* 이 상자가 부르는 훅은 `useReach` 하나뿐이다 — 카탈로그를 안 쓴다(모달 주석 참조). */
vi.mock('../hooks', () => ({
  useReach: () => ({ data: reach, isLoading: false, error: null }),
}));

describe('TopologyModal', () => {
  it('국이 마디로 선다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.getByText('가국')).toBeInTheDocument();
    expect(screen.getByText('나국')).toBeInTheDocument();
  });

  /* 마디 안 목록은 추적이 지나간 것 — 배선이 끊기면 여기가 빈다. */
  it('시드 국의 마디 안에 추적이 지나간 장비가 선다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.getByText(/가단말/)).toBeInTheDocument();
    expect(screen.getByText(/OFD - 가슬롯/)).toBeInTheDocument();
  });

  /* 공용 `Modal` 은 `createPortal(document.body)` 로 그린다 — `render()` 가 돌려주는
     지역 container 는 포털 밖이라 아무것도 안 잡힌다. 그림을 찾을 곳은 body 다. */
  it('구간 케이블이 줄로 그려진다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(document.body.querySelectorAll('svg line')).toHaveLength(1);
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<TopologyModal open={false} seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.queryByText('가국')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 시험이 실패하는지 본다**

Run: `npx vitest run --root frontend src/v2/__tests__/TopologyModal.test.tsx`
Expected: FAIL — `Failed to resolve import ".../TopologyModal"`

- [ ] **Step 6: 모달을 만든다 (`TopologyModal.tsx`)**

`TopologyCanvas` 는 다음 Task 에서 만든다. 이 Task 에서는 모달이 자료를 준비해 그것에 넘기는 데까지 한다 — 그래서 이 파일이 먼저 `TopologyCanvas` 를 부른다.

```tsx
/**
 * TopologyModal — **추적이 못 보는 국 밖**을 한 장으로.
 *
 * 추적은 한 국 안에서만 답한다(워킹카피가 한 국만 들기 때문이다). 그런데 내부망은 국들이
 * 링으로 얽혀 있고, 그 얽힘이 지금 어디에도 안 보인다. 이 상자가 그 여집합이다 —
 * **추적이 답한 것은 마디 안에, 그 다음은 줄로.**
 *
 * 판단은 하나도 여기 없다. 자료는 서버(`/reach`)가, 마디·줄·링·좌표는 core 가 낸다.
 */
import { useMemo } from 'react';
import { Modal } from '../../../components/ui';
import { buildTopologyGraph, buildTraceGraph, computeLayout, detectRings, traceFrom } from '@twin/core';
import { useReach } from '../../hooks';
import { TopologyCanvas } from './TopologyCanvas';

interface TopologyModalProps {
  open: boolean;
  /** 추적을 시작한 포트 — 이 그림의 시드다. */
  seedPortId: string | null;
  /** 머리에 적을 자리 이름(「광링A S/S · 광단말 A#2」). */
  seedLabel?: string;
  onClose: () => void;
}

export function TopologyModal({ open, seedPortId, seedLabel, onClose }: TopologyModalProps) {
  const reach = useReach(seedPortId, open);

  const view = useMemo(() => {
    if (!reach.data || !seedPortId) return null;
    const data = reach.data;

    /* 「내 코어가 간 길」은 **추적 엔진이 그대로** 낸다 — 이번엔 자료에 대국이 다 있으므로
       코어가 국을 넘어 끝까지 간다. 토폴로지 전용 추적 규칙을 새로 만들지 않는다.

       품목 명세(`types`)는 넘기지 않아도 된다: 자산 안의 통과는 **포트 인스턴스**에서
       유도되므로(`internalLinkMap`), `buildTraceGraph` 는 `types` 를 실제로 읽지 않는다.
       그래서 이 상자는 카탈로그를 부르지 않는다 — 안 쓰는 것을 기다리면 그림만 늦어진다. */
    const graph = buildTraceGraph({
      types: {},
      assets: data.assets.map((a) => ({
        id: a.id, typeKey: a.typeId ?? '', name: a.name, parentAssetId: a.parentAssetId,
      })),
      ports: data.ports.map((p) => ({
        id: p.id, assetId: p.assetId, group: p.group, index: p.index,
        name: p.name, direction: p.direction, medium: p.medium, positions: p.positions,
      })),
      cables: data.cables.map((c) => ({ id: c.id, aPortId: c.aPortId, bPortId: c.bPortId, categoryKey: null })),
    });
    const hops = traceFrom(graph, seedPortId);

    const { nodes, edges, litEdgeIds } = buildTopologyGraph(data, seedPortId, hops);
    const rings = detectRings(edges);
    const positions = computeLayout(nodes, edges, rings);
    return { nodes, edges, litEdgeIds, positions };
  }, [reach.data, seedPortId]);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`토폴로지${seedLabel ? ` — ${seedLabel}` : ''}`}>
      {reach.isLoading && <p className="p-4 text-sm text-content-muted">이어진 곳을 찾는 중…</p>}
      {reach.error != null && <p className="p-4 text-sm text-danger">이어진 곳을 가져오지 못했습니다.</p>}
      {view && (
        <>
          {reach.data?.truncated && (
            <p className="mb-2 text-xs text-content-muted">
              이어진 곳이 너무 많아 일부만 그렸습니다.
            </p>
          )}
          <TopologyCanvas
            nodes={view.nodes}
            edges={view.edges}
            litEdgeIds={view.litEdgeIds}
            positions={view.positions}
          />
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 7: 단추를 단다 (`ConnectionsTab.tsx`)**

`import { TopologyModal } from '../topology/TopologyModal';` 를 더하고, 컴포넌트 안에 상태를 하나 둔다:

```tsx
/* 토폴로지는 **추적을 한 뒤에만** 열 수 있다 — 그릴 시드가 있어야 한다. */
const [topologyOpen, setTopologyOpen] = useState(false);
```

추적 머리줄(`{traceTree.children.length > 0 ? '추적 경로' : '연결된 경로가 없습니다'}` 옆의 「지우기」 단추가 있는 자리)에서 단추 둘을 나란히 둔다:

```tsx
<div className="flex shrink-0 items-center gap-1">
  <Button variant="secondary" size="sm" onClick={() => setTopologyOpen(true)}>
    토폴로지
  </Button>
  <Button variant="secondary" size="sm" onClick={clearTrace}>
    지우기
  </Button>
</div>
```

그리고 컴포넌트가 돌려주는 것의 맨 끝(바깥 `</div>` 직전)에 상자를 둔다:

```tsx
<TopologyModal
  open={topologyOpen}
  seedPortId={tracedPortId}
  seedLabel={tracedPortId ? traceLabel(tracedPortId).primary : undefined}
  onClose={() => setTopologyOpen(false)}
/>
```

- [ ] **Step 8: 다음 Task 를 기다리지 않도록 캔버스 자리만 만든다**

이 Task 의 시험이 돌려면 `TopologyCanvas` 가 있어야 한다. Task 6 에서 제대로 그리므로, 여기서는 **마디와 줄을 자리에 놓는 최소한**만 만든다 — 다음 Task 가 이 파일을 이어서 다듬는다.

`frontend/src/v2/components/topology/TopologyCanvas.tsx`:

```tsx
import type { Point, TopoEdge, TopoNode } from '@twin/core';

interface TopologyCanvasProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  litEdgeIds: Set<string>;
  positions: Map<string, Point>;
}

export function TopologyCanvas({ nodes, edges, litEdgeIds, positions }: TopologyCanvasProps) {
  return (
    <div className="relative h-[60vh] overflow-auto">
      <svg className="absolute inset-0 h-full w-full">
        {edges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              className={litEdgeIds.has(e.id) ? 'stroke-primary' : 'stroke-line'}
              strokeWidth={litEdgeIds.has(e.id) ? 3 : 1.5}
            />
          );
        })}
      </svg>
      {nodes.map((node) => {
        const p = positions.get(node.id);
        if (!p) return null;
        return (
          <div key={node.id} className="absolute" style={{ left: p.x, top: p.y }}>
            <div className="text-sm font-medium text-content">{node.name}</div>
            {node.members.map((m) => (
              <div key={m.assetId} className="text-xs text-content-muted">
                {m.assemblyName ? `${m.assemblyName} - ${m.assetName}` : m.assetName}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9: 시험이 통과하는지 본다**

Run: `npx vitest run --root frontend src/v2/__tests__/TopologyModal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 10: 프론트 전체 시험 + 빌드 + 커밋**

Run: `npx vitest run --root frontend`
Expected: PASS (기존 451 + 4)

Run: `npm run build`
Expected: 오류 없음

```bash
git add frontend/src/v2
git commit -m "feat(topology): 연결 탭에서 토폴로지 상자를 연다 — /reach 자료 위에서 추적 엔진이 국을 넘는다"
```

---

## Task 6: 그림 — 읽히게 만든다

**Files:**
- Modify: `frontend/src/v2/components/topology/TopologyCanvas.tsx`
- Modify: `frontend/src/v2/__tests__/TopologyModal.test.tsx`

**Interfaces:**
- Consumes: Task 5 의 `TopologyCanvas` props (그대로)
- Produces: 같은 컴포넌트, 제대로 그린다

**먼저 읽는다**: `frontend/src/components/ui/CONVENTIONS.md` — 특히 타이포 스케일과 시맨틱 색 토큰. 이 캔버스는 공용 카드로 표현할 수 없는 그림이므로 새 컴포넌트를 두되, **색과 글자 크기는 토큰만** 쓴다.

- [ ] **Step 1: 시험을 더한다**

`TopologyModal.test.tsx` 에 더한다:

```tsx
/* 상자는 `document.body` 에서 찾는다 — 공용 `Modal` 이 포털로 그리기 때문이다. */
it('마디 상자가 좌표에 놓이고 서로 겹치지 않는다', () => {
  render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
  const boxes = [...document.body.querySelectorAll('[data-topo-node]')];
  expect(boxes).toHaveLength(2);
  const at = boxes.map((b) => (b as HTMLElement).style.transform);
  expect(new Set(at).size).toBe(2);
});

/* 코어가 지나간 줄만 굵다 — 강조는 두 단계뿐이다. */
it('내 코어가 간 구간만 강조된다', () => {
  render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
  expect(document.body.querySelectorAll('line[data-lit="true"]')).toHaveLength(1);
});

it('줄에 대고 물으면 양끝 경로슬롯 이름이 나온다', () => {
  render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
  expect(document.body.querySelector('line title')?.textContent).toBe('가슬롯 ↔ 나슬롯');
});

it('층 이름은 층이 둘 이상인 국에만 — 여기서는 안 나온다', () => {
  render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
  expect(screen.queryByText('1층')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --root frontend src/v2/__tests__/TopologyModal.test.tsx`
Expected: FAIL — `data-topo-node` 를 못 찾는다

- [ ] **Step 3: 캔버스를 제대로 만든다**

```tsx
/**
 * TopologyCanvas — **마디는 HTML, 줄만 SVG**.
 *
 * 마디를 SVG 안에 넣으면 글자 줄바꿈·말줄임을 손으로 계산해야 하고, 공용 컴포넌트의 색·
 * 글자 크기가 안 먹는다. 줄은 반대로 HTML 로 그릴 수 없다. 그래서 갈라 놓고, 좌표만 둘이
 * 나눠 쓴다.
 *
 * `@xyflow/react` 는 다시 넣지 않았다. 마디가 수십 개고 조작이 호버뿐이라 쓸 이유가 없다.
 */
import { useMemo } from 'react';
import { cn } from '../../../components/ui/cn';
import type { Point, TopoEdge, TopoNode } from '@twin/core';

/** 마디 상자의 폭·높이 어림 — 줄이 상자 테두리에서 시작하도록 잡아 준다. */
const BOX_W = 180;
const BOX_H = 76;
/** 그림 둘레 여백 — 상자가 판 가장자리에 붙지 않게. */
const PAD = 120;
/** 한 마디에 늘어놓을 장비 줄 수 — 넘으면 접는다. */
const MAX_MEMBERS = 8;

interface TopologyCanvasProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  litEdgeIds: Set<string>;
  positions: Map<string, Point>;
}

export function TopologyCanvas({ nodes, edges, litEdgeIds, positions }: TopologyCanvasProps) {
  /* 좌표를 판 안으로 옮긴다 — core 는 원점을 가운데 두고 음수도 낸다. */
  const { shift, width, height } = useMemo(() => {
    const pts = [...positions.values()];
    if (pts.length === 0) return { shift: { x: PAD, y: PAD }, width: PAD * 2, height: PAD * 2 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return {
      shift: { x: PAD - minX, y: PAD - minY },
      width: maxX - minX + PAD * 2,
      height: maxY - minY + PAD * 2,
    };
  }, [positions]);

  const at = (id: string): Point | null => {
    const p = positions.get(id);
    return p ? { x: p.x + shift.x, y: p.y + shift.y } : null;
  };

  return (
    <div className="h-[60vh] overflow-auto rounded-md bg-surface-2">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute left-0 top-0" width={width} height={height}>
          {edges.map((e, i) => {
            const a = at(e.source);
            const b = at(e.target);
            if (!a || !b) return null;
            const lit = litEdgeIds.has(e.id);
            /* 같은 두 국을 잇는 줄이 여럿이면(이중화) 나란히 벌려 둘로 보이게 한다. */
            const parallel = edges.filter((o) => sameEnds(o, e));
            const offset = (parallel.indexOf(e) - (parallel.length - 1) / 2) * 14;
            const [p, q] = shifted(edgeAt(a, b), offset);
            return (
              <line
                key={e.id ?? i}
                x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                data-lit={lit}
                strokeWidth={lit ? 3 : 1.5}
                className={lit ? 'stroke-primary' : 'stroke-line'}
              >
                <title>{`${e.sourceSlotName} ↔ ${e.targetSlotName}`}</title>
              </line>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const p = at(node.id);
          if (!p) return null;
          const shown = node.members.slice(0, MAX_MEMBERS);
          const hidden = node.members.length - shown.length;
          return (
            <div
              key={node.id}
              data-topo-node={node.id}
              className={cn(
                'absolute rounded-md border bg-surface px-2.5 py-1.5 shadow-sm',
                node.members.length > 0 ? 'border-primary' : 'border-line',
              )}
              style={{ left: 0, top: 0, width: BOX_W, transform: `translate(${p.x - BOX_W / 2}px, ${p.y - BOX_H / 2}px)` }}
            >
              <div className="truncate text-sm font-medium text-content">{node.name}</div>
              {shown.map((m) => (
                <div key={m.assetId} className="truncate text-xs text-content-muted">
                  {m.floorName ? `[${m.floorName}] ` : ''}
                  {m.assemblyName ? `${m.assemblyName} - ${m.assetName}` : m.assetName}
                </div>
              ))}
              {hidden > 0 && <div className="text-xs text-content-faint">외 {hidden}개</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sameEnds = (a: TopoEdge, b: TopoEdge) =>
  (a.source === b.source && a.target === b.target) || (a.source === b.target && a.target === b.source);

/** 줄은 상자 **테두리**에서 시작한다 — 중심에서 그으면 글자를 가로지른다. */
function edgeAt(a: Point, b: Point): [Point, Point] {
  const clip = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return from;
    const tx = dx === 0 ? Infinity : (BOX_W / 2) / Math.abs(dx);
    const ty = dy === 0 ? Infinity : (BOX_H / 2) / Math.abs(dy);
    const t = Math.min(tx, ty);
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  return [clip(a, b), clip(b, a)];
}

/** 줄을 제 방향의 수직으로 `d` 만큼 옮긴다 — 평행 줄을 갈라 놓는 데 쓴다. */
function shifted([p, q]: [Point, Point], d: number): [Point, Point] {
  if (d === 0) return [p, q];
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len * d;
  const ny = (q.x - p.x) / len * d;
  return [{ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }];
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --root frontend src/v2/__tests__/TopologyModal.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: 프론트 전체 시험 + 빌드**

Run: `npx vitest run --root frontend`
Expected: PASS

Run: `npm run build`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/v2
git commit -m "feat(topology): 그림 — 마디는 HTML 카드, 줄은 SVG. 강조는 두 단계, 평행 구간은 갈라 놓는다"
```

---

## Task 7: 시험 시드 — 어긋날 만한 모양을 다 만든다

**Files:**
- Create: `backend/scripts/seed-topology-cases.mjs`

**Interfaces:**
- Consumes: `POST /api/v2/auth/login`, `PUT /api/v2/substations/:id/commit`, `GET /api/v2/catalog`, `GET /api/v2/org-tree` (기존 시드 스크립트와 같은 길)
- Produces: 변전소 `토폴로지-T1` … `토폴로지-T20`, 각 국에 OFD 설비 + 경로슬롯

**먼저 읽는다**: `backend/scripts/seed-fiber-network-demo.mjs` — 로그인·카탈로그 조회·commit 호출·`--clean` 의 삭제 차례가 다 거기 있다. 그대로 따른다.

- [ ] **Step 1: 시드를 쓴다**

머리에 이 주석을 단다:

```js
/**
 * 토폴로지 시험 시드 — **그림이 어긋날 만한 모양을 다 만든다.**
 *
 * 링 하나만 있는 자료로는 배치가 옳은지 알 수 없다. 실제로 옛 구현이 무너진 자리가
 * 「마디를 공유하는 링 둘」과 「구간을 공유하는 링 둘」이었고, 그 둘을 그리려다 레이아웃이
 * 978줄이 됐다. 지금 배치는 「바깥 테두리를 원으로 놓으면 공유 구간이 저절로 현이 된다」로
 * 그 일을 대신하므로, 그 가정이 맞는지 눈으로 확인할 자료가 있어야 한다.
 *
 * 국 하나 = OFD 설비 + 경로슬롯 몇. 국 사이는 OPGW(구간 케이블) 한 본.
 *
 *   node backend/scripts/seed-topology-cases.mjs
 *   node backend/scripts/seed-topology-cases.mjs --clean
 */
```

만들 모양(변전소 이름은 전부 `토폴로지-` 로 시작해 `--clean` 이 한 번에 걷는다):

| 모양 | 국 | 구간 케이블 |
|---|---|---|
| 닫힌 링 넷 | T1 T2 T3 T4 | T1–T2, T2–T3, T3–T4, T4–T1 |
| 평행 구간 | T1 T2 | T1–T2 를 **한 본 더** (모두 두 본) |
| 마디 공유(8자) | T4 T5 T6 | T4–T5, T5–T6, T6–T4 |
| 구간 공유(내부·외부 링) | T7 T8 T9 T10 T11 | T7–T8, T8–T9, T9–T10, T10–T7, T7–T11, T11–T9 (T7–T9 대신 T9–T10–T7 과 T7–T11–T9 가 T9…T7 을 사이에 두고 붙는다) |
| 링에 매달린 사슬 | T3 T12 T13 | T3–T12, T12–T13 |
| 안 닫힌 링 | T14 T15 T16 T17 | T14–T15, T15–T16, T16–T17 (T17–T14 없음) |
| 따로 노는 망 | T18 T19 T20 | T18–T19, T19–T20 |

성단(앞면 ↔ 장비)은 **T1 과 T2 에만** 만든다 — 나머지 국은 코어가 안 지나가는 마디가 어떻게 보이는지(국 이름만 서는지) 확인하는 자리다.

- 국 하나에 슬롯이 여럿 필요하다(링에서 두 방향, 8자에서 세 방향). 슬롯 이름은 시드가 짓지 말고 **경로슬롯 자동 이름**을 그대로 쓴다 — 케이블을 이으면 「제 국 - 상대 국 - 순번」이 붙는다.
- OPGW 케이블 품목은 `GET /api/v2/catalog` 의 `cableGroups` 에서 `key === 'fiber'` 인 그룹의 첫 품목을 쓴다.
- 자산 생성은 화면과 같은 길(`PUT /api/v2/substations/:id/commit`)로만 한다.

- [ ] **Step 2: 시드를 넣는다**

Run: `node backend/scripts/seed-topology-cases.mjs`
Expected: 국 20개와 구간 케이블이 만들어졌다는 출력

- [ ] **Step 3: 시드가 만든 그래프를 확인한다**

Run:
```bash
docker exec ict-twin-postgres psql -U postgres -d digital_next -tAc \
"select sa.name, sb.name from \"Cable\" c
 join \"Port\" pa on pa.id=c.\"aPortId\" join \"Asset\" aa on aa.id=pa.\"assetId\" join \"Substation\" sa on sa.id=aa.\"substationId\"
 join \"Port\" pb on pb.id=c.\"bPortId\" join \"Asset\" ab on ab.id=pb.\"assetId\" join \"Substation\" sb on sb.id=ab.\"substationId\"
 where pa.positions>1 and pb.positions>1 and sa.name like '토폴로지-%' order by 1,2;"
```
Expected: 위 표와 같은 국 쌍들이 나온다

- [ ] **Step 4: 브라우저로 본다**

`npm run dev` 가 떠 있는 상태에서 `http://localhost:5173` 에 `admin`/`admin123` 로 들어가, `토폴로지-T1` 의 장비 포트에서 추적 → 「토폴로지」 를 누른다. 다음을 눈으로 확인한다:

1. 닫힌 링 넷이 **원**으로 선다
2. T1–T2 의 평행 구간이 **두 줄**로 갈라져 보인다
3. 8자(T4·T5·T6)가 T4 에서 **접해** 있고 마디가 겹치지 않는다
4. 구간 공유 링(T7…T11)이 **한 원 위에** 서고 공유 구간이 **현**으로 지난다
5. 사슬(T3–T12–T13)이 링에서 **뻗어** 나오고 줄이 다른 마디를 관통하지 않는다
6. 안 닫힌 링(T14…T17)이 **원이 아니라 줄**로 선다
7. 따로 노는 망(T18…T20)은 **안 나온다**
8. 코어가 안 지나가는 국은 **국 이름만** 서고 장비 목록이 비어 있다

어긋나는 것이 있으면 core 단위 시험에 그 모양을 먼저 넣고 고친다 — 눈으로 고치면 다음에 또 무너진다.

- [ ] **Step 5: 커밋**

```bash
git add backend/scripts/seed-topology-cases.mjs
git commit -m "test(topology): 링 모양 시험 시드 — 닫힌 링·평행 구간·8자·구간 공유·사슬·안 닫힌 링·따로 노는 망"
```

---

## 마무리

- [ ] **전체 시험**

한 번에 하나씩 돌린다:

```bash
npx vitest run --root packages/core
```
```bash
npx vitest run --root backend
```
```bash
npx vitest run --root frontend
```

- [ ] **빌드**

```bash
npm run build
```

- [ ] **시험 시드를 걷을지 정한다**

`토폴로지-T*` 20개국은 개발용이다. 남길지 걷을지는 사람이 정한다 — `node backend/scripts/seed-topology-cases.mjs --clean` 으로 걷는다.
