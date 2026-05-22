# 네트워크 토폴로지 테스트 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네트워크 토폴로지 모달에 경로찾기·테스트용 경로 삭제·테스트용 경로 추가 세 도구를 추가한다.

**Architecture:** 초기 `traceResult` 기반 레이아웃은 절대 재계산하지 않는다. 삭제·추가는 고정된 화면 위 시각적 오버레이로만 표시한다(before/after 비교 가능). 테스트 상태는 모달 컴포넌트 로컬 `useState`로 보관하고, `traceResult` 변경 시 `useEffect`로 초기화한다. 경로찾기는 순수 BFS 함수로 분리해 단위 테스트한다.

**Tech Stack:** React 18 + TypeScript, `@xyflow/react` v12 (React Flow), Zustand, Vitest, Tailwind CSS.

설계 문서: `docs/superpowers/specs/2026-05-22-topology-test-tools-design.md`

---

## File Structure

| 파일 | 역할 |
|---|---|
| `frontend/src/features/network/pathfinding.ts` (신규) | 순수 BFS 최단경로 함수 |
| `frontend/src/features/network/pathfinding.test.ts` (신규) | 경로찾기 단위 테스트 |
| `frontend/src/features/network/TopologyTestControls.tsx` (신규) | 컨트롤 바 컴포넌트 |
| `frontend/src/features/network/edges/FloatingEdge.tsx` (수정) | 호버 시 × 오버레이 |
| `frontend/src/features/network/NetworkTopologyModal.tsx` (수정) | 테스트 상태·핸들러·스타일 통합 |

모든 명령은 `frontend/` 디렉터리에서 실행한다.

---

## Task 1: 경로찾기 순수 함수 (pathfinding.ts)

**Files:**
- Create: `frontend/src/features/network/pathfinding.ts`
- Test: `frontend/src/features/network/pathfinding.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/network/pathfinding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findShortestPath, type GraphEdge } from './pathfinding';

// A-B-C 직선 + A-C 직결로 삼각형(링).
const triangle: GraphEdge[] = [
  { id: 'AB', source: 'A', target: 'B' },
  { id: 'BC', source: 'B', target: 'C' },
  { id: 'CA', source: 'C', target: 'A' },
];

describe('findShortestPath', () => {
  it('직선 경로의 엣지 id 를 순서대로 반환', () => {
    const line: GraphEdge[] = [
      { id: 'AB', source: 'A', target: 'B' },
      { id: 'BC', source: 'B', target: 'C' },
    ];
    expect(findShortestPath(line, 'A', 'C')).toEqual(['AB', 'BC']);
  });

  it('링에서 더 짧은(직결) 경로를 고른다', () => {
    expect(findShortestPath(triangle, 'A', 'C')).toEqual(['CA']);
  });

  it('직결 엣지가 끊기면 우회 경로를 찾는다', () => {
    const detour = triangle.filter((e) => e.id !== 'CA');
    expect(findShortestPath(detour, 'A', 'C')).toEqual(['AB', 'BC']);
  });

  it('연결이 없으면 null', () => {
    const line: GraphEdge[] = [{ id: 'AB', source: 'A', target: 'B' }];
    expect(findShortestPath(line, 'A', 'Z')).toBeNull();
  });

  it('시작과 종료가 같으면 빈 배열', () => {
    expect(findShortestPath(triangle, 'A', 'A')).toEqual([]);
  });

  it('추가 엣지가 더 짧은 경로를 만들면 그 엣지를 쓴다', () => {
    const line: GraphEdge[] = [
      { id: 'AB', source: 'A', target: 'B' },
      { id: 'BC', source: 'B', target: 'C' },
      { id: 'CD', source: 'C', target: 'D' },
    ];
    const withShortcut: GraphEdge[] = [...line, { id: 'test-add-0', source: 'A', target: 'D' }];
    expect(findShortestPath(withShortcut, 'A', 'D')).toEqual(['test-add-0']);
  });

  it('엣지 정의 방향과 무관하게 탐색한다 (무방향)', () => {
    const reversed: GraphEdge[] = [
      { id: 'CB', source: 'C', target: 'B' },
      { id: 'BA', source: 'B', target: 'A' },
    ];
    expect(findShortestPath(reversed, 'A', 'C')).toEqual(['BA', 'CB']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/features/network/pathfinding.test.ts`
Expected: FAIL — `Failed to resolve import "./pathfinding"` (아직 파일 없음).

- [ ] **Step 3: 최소 구현 작성**

`frontend/src/features/network/pathfinding.ts`:

```ts
/**
 * 토폴로지 그래프 위에서 두 노드 사이 최단 경로(홉 수)를 찾는다.
 * 무방향 BFS — 끊긴 엣지는 호출 측에서 edges 에서 미리 제외한다.
 */

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * start 에서 end 까지 홉 수 최단 경로를 이루는 엣지 id 배열을 반환.
 * 경로가 없으면 null, start === end 면 빈 배열.
 * 같은 길이의 경로가 여럿이면 BFS 가 먼저 도달한 것을 쓴다.
 */
export function findShortestPath(
  edges: GraphEdge[],
  start: string,
  end: string,
): string[] | null {
  if (start === end) return [];

  // 인접 리스트 — 각 노드에서 (이웃 노드, 그 엣지 id).
  const adjacency = new Map<string, { node: string; edgeId: string }[]>();
  const link = (a: string, b: string, edgeId: string) => {
    const list = adjacency.get(a);
    if (list) list.push({ node: b, edgeId });
    else adjacency.set(a, [{ node: b, edgeId }]);
  };
  for (const e of edges) {
    link(e.source, e.target, e.id);
    link(e.target, e.source, e.id);
  }

  // BFS — 방문 노드마다 도달에 쓴 엣지를 기록해 경로를 역추적.
  const cameFrom = new Map<string, { prev: string; edgeId: string }>();
  const visited = new Set<string>([start]);
  const queue: string[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === end) {
      const path: string[] = [];
      let node = end;
      while (node !== start) {
        const step = cameFrom.get(node)!;
        path.push(step.edgeId);
        node = step.prev;
      }
      return path.reverse();
    }
    for (const { node, edgeId } of adjacency.get(current) ?? []) {
      if (visited.has(node)) continue;
      visited.add(node);
      cameFrom.set(node, { prev: current, edgeId });
      queue.push(node);
    }
  }
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/features/network/pathfinding.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/features/network/pathfinding.ts src/features/network/pathfinding.test.ts
git commit -m "$(cat <<'EOF'
feat(network): 토폴로지 최단경로 BFS 순수 함수 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 엣지 호버 × 오버레이 (FloatingEdge.tsx)

**Files:**
- Modify: `frontend/src/features/network/edges/FloatingEdge.tsx` (전체 교체)

`data.onRemove` 콜백이 주입되면 엣지 호버 시 중점에 × 버튼을 띄운다. × 클릭은 해당 엣지 id로 콜백을 호출한다(끊기/복원 또는 추가 엣지 제거 — 판단은 모달이 담당). 단위 테스트는 React Flow 컨텍스트 의존성 때문에 생략하고 빌드 + 수동 검증으로 확인한다.

- [ ] **Step 1: FloatingEdge.tsx 전체 교체**

`frontend/src/features/network/edges/FloatingEdge.tsx`:

```tsx
/**
 * Floating edge — 노드 중심을 향한 직선이 박스 경계와 만나는 점을 endpoint 로.
 *
 * 박스 사방에 핸들을 4개 두면 React Flow 가 임의로 골라 선이 부자연스럽게 꺾인다.
 * 여기선 노드의 중심과 크기만 보고 경계점을 직접 계산 → 항상 박스 중심을 향한 선.
 *
 * data.onRemove 가 주입되면 엣지 호버 시 중점에 × 버튼 — 토폴로지 테스트용
 * 경로 끊기/복원, 추가 엣지 제거에 쓰인다.
 *
 * Reference: https://reactflow.dev/examples/edges/floating-edges
 */

import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react';

type InternalNode = ReturnType<typeof useInternalNode>;

/** 모달이 edge.data 로 주입 — × 클릭 시 해당 edge id 로 호출. */
type FloatingEdgeData = { onRemove?: (edgeId: string) => void };

/**
 * 두 노드 중심을 잇는 직선이 각 박스 경계와 만나는 점 한 쌍.
 * 두 endpoint 를 같은 (dx, dy) 로 한 번에 계산 — 좌우 따로 호출하면 center/크기 중복 계산.
 */
function floatingEndpoints(
  from: InternalNode,
  to: InternalNode,
): { sp: { x: number; y: number }; tp: { x: number; y: number } } {
  const zero = { x: 0, y: 0 };
  if (!from || !to) return { sp: zero, tp: zero };
  const fx = from.internals.positionAbsolute.x + (from.measured?.width ?? 0) / 2;
  const fy = from.internals.positionAbsolute.y + (from.measured?.height ?? 0) / 2;
  const tx = to.internals.positionAbsolute.x + (to.measured?.width ?? 0) / 2;
  const ty = to.internals.positionAbsolute.y + (to.measured?.height ?? 0) / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 0 && dy === 0) return { sp: { x: fx, y: fy }, tp: { x: tx, y: ty } };
  const fw = (from.measured?.width ?? 0) / 2;
  const fh = (from.measured?.height ?? 0) / 2;
  const tw = (to.measured?.width ?? 0) / 2;
  const th = (to.measured?.height ?? 0) / 2;
  // 박스를 unit square 로 정규화 — 큰 축이 1 에 닿는 변에서 경계와 만남.
  const adx = Math.abs(dx) || 1e-9;
  const ady = Math.abs(dy) || 1e-9;
  const fs = Math.min(fw / adx, fh / ady);
  const ts = Math.min(tw / adx, th / ady);
  return {
    sp: { x: fx + dx * fs, y: fy + dy * fs },
    tp: { x: tx - dx * ts, y: ty - dy * ts },
  };
}

export function FloatingEdge({ id, source, target, data, style, label, labelStyle, labelBgStyle, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const [hovered, setHovered] = useState(false);
  if (!sourceNode || !targetNode) return null;

  const { sp, tp } = floatingEndpoints(sourceNode, targetNode);
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: sp.x,
    sourceY: sp.y,
    targetX: tp.x,
    targetY: tp.y,
  });
  const onRemove = (data as FloatingEdgeData | undefined)?.onRemove;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {/* 호버 감지용 투명 굵은 path — × 버튼 노출 트리거. */}
      {onRemove && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      {/* 라벨 — 호버해서 × 가 뜰 때는 가린다(같은 위치). */}
      {label && !(onRemove && hovered) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: (labelBgStyle as { fill?: string })?.fill ?? '#ffffff',
              padding: '1px 4px',
              borderRadius: 3,
              pointerEvents: 'all',
              ...labelStyle,
            }}
            className="nodrag nopan"
          >
            {label as React.ReactNode}
          </div>
        </EdgeLabelRenderer>
      )}
      {onRemove && hovered && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="nodrag nopan"
            aria-label="테스트 경로 끊기/복원"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              width: 18,
              height: 18,
              padding: 0,
              borderRadius: 9,
              border: '1px solid #dc2626',
              background: '#ffffff',
              color: '#dc2626',
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (타입체크 + vite build 통과). FloatingEdge 단독으로는 `onRemove` 가 주입되지 않아 동작 변화 없음 — 회귀 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/features/network/edges/FloatingEdge.tsx
git commit -m "$(cat <<'EOF'
feat(network): FloatingEdge 호버 시 × 버튼 오버레이 추가

data.onRemove 주입 시에만 노출 — 토폴로지 테스트 경로 끊기/제거용.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 컨트롤 바 컴포넌트 (TopologyTestControls.tsx)

**Files:**
- Create: `frontend/src/features/network/TopologyTestControls.tsx`

상태를 갖지 않는 표현 컴포넌트. props 로 받은 현황으로 "경로 추가" 토글 버튼, "초기화" 버튼, 현황 텍스트, 모드 안내 문구를 그린다. ReactFlow 내부 좌상단 `Panel` 로 표시한다.

- [ ] **Step 1: TopologyTestControls.tsx 작성**

`frontend/src/features/network/TopologyTestControls.tsx`:

```tsx
/**
 * 토폴로지 테스트 도구 컨트롤 바 — 경로 추가 토글, 초기화, 모드/현황 안내.
 * ReactFlow 내부 좌상단 Panel 로 표시. 상태는 NetworkTopologyModal 이 소유한다.
 */

import { Panel } from '@xyflow/react';

interface TopologyTestControlsProps {
  addMode: boolean;
  addAnchor: string | null;
  hasStart: boolean;
  hasEnd: boolean;
  pathFound: boolean;
  cutCount: number;
  addCount: number;
  onToggleAddMode: () => void;
  onReset: () => void;
}

/** 현재 상태에 맞는 안내 문구 — error tone 이면 빨강. */
function hintText(p: TopologyTestControlsProps): { text: string; error: boolean } {
  if (p.addMode) {
    return {
      text: p.addAnchor ? '경로 추가: 연결할 노드를 클릭하세요' : '경로 추가: 시작 노드를 클릭하세요',
      error: false,
    };
  }
  if (!p.hasStart) return { text: '노드를 클릭해 경로찾기 시작점을 선택하세요', error: false };
  if (!p.hasEnd) return { text: '종료 노드를 클릭하세요', error: false };
  return p.pathFound
    ? { text: '최단 경로 표시됨', error: false }
    : { text: '경로 없음 — 두 노드가 끊겨 있습니다', error: true };
}

export function TopologyTestControls(props: TopologyTestControlsProps) {
  const { addMode, cutCount, addCount, onToggleAddMode, onReset } = props;
  const hint = hintText(props);

  return (
    <Panel position="top-left">
      <div className="bg-white/95 rounded-md shadow border border-gray-200 px-3 py-2 flex flex-col gap-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAddMode}
            className={`px-2 py-1 rounded border text-[11px] font-medium ${
              addMode
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {addMode ? '추가 취소' : '경로 추가'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 text-[11px] font-medium hover:bg-gray-50"
          >
            초기화
          </button>
          <span className="text-gray-400">
            끊은 경로 {cutCount} · 추가 경로 {addCount}
          </span>
        </div>
        <span className={hint.error ? 'text-red-600' : 'text-gray-500'}>{hint.text}</span>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. 아직 어디서도 import 하지 않으므로 동작 변화 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/features/network/TopologyTestControls.tsx
git commit -m "$(cat <<'EOF'
feat(network): 토폴로지 테스트 컨트롤 바 컴포넌트 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 모달 통합 (NetworkTopologyModal.tsx)

**Files:**
- Modify: `frontend/src/features/network/NetworkTopologyModal.tsx` (전체 교체)

테스트 상태(`useState` 6개 + `useRef`), 초기화/ESC `useEffect`, 노드 클릭·엣지 제거 핸들러, 끊김>경로>추가>tier 우선순위 엣지 스타일, `SubstationNode` 경로 배지, 컨트롤 바·범례 연결을 한 번에 통합한다. `tsconfig` 의 `noUnusedLocals` 때문에 이 파일은 한 단위로 교체해야 빌드가 통과한다.

- [ ] **Step 1: NetworkTopologyModal.tsx 전체 교체**

`frontend/src/features/network/NetworkTopologyModal.tsx`:

```tsx
/**
 * Network Topology Modal — cable trace 결과를 React Flow 로 시각화.
 *
 * 입력 = useNetworkTopologyStore.traceResult (cableTracer 결과). 변전소 단위로 노드 그룹화 후,
 * BC-tree (vertex 공유) 또는 SPQR (edge 공유) layout 으로 좌표 계산. fiberPath edge 만 그림.
 *
 * 시드 cable 의 fiberPathId 강조 (빨강), 시드가 속한 ring (파랑), 그 ring 을 포함하는 composite
 * ring (보라), 분기점 (호박색 테두리). highlightedFpId 만 바뀌어도 layout 은 재계산 안 함.
 *
 * 테스트 도구 (모달 한정 — 닫으면 초기화): 노드 클릭으로 최단경로(홉 수) 찾기, 엣지 호버 × 로
 * 경로 끊기, '경로 추가' 로 가상 엣지 추가. base 레이아웃은 절대 재계산하지 않고 — 변경은
 * 고정 화면 위 오버레이로만 표시해 before/after 비교가 가능하게 한다.
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNetworkTopologyStore } from './store';
import { computeLayoutBCTree } from './layout/bcTreeLayout';
import { computeLayoutSPQR } from './layout/spqrLayout';
import { FloatingEdge } from './edges/FloatingEdge';
import { TopologyTestControls } from './TopologyTestControls';
import { findShortestPath, type GraphEdge } from './pathfinding';
import type { TraceNode, TraceRing } from '../pathTrace/types';

const TIER_COLOR = {
  seed: '#dc2626',
  seedRing: '#2563eb',
  superRing: '#7c3aed',
  junction: '#f59e0b',
  default: '#9ca3af',
} as const;
type Tier = keyof typeof TIER_COLOR;

const EDGE_STYLE: Record<Tier, { stroke: string; width: number }> = {
  seed: { stroke: TIER_COLOR.seed, width: 3 },
  seedRing: { stroke: TIER_COLOR.seedRing, width: 2.5 },
  superRing: { stroke: TIER_COLOR.superRing, width: 2 },
  junction: { stroke: TIER_COLOR.junction, width: 1.5 },
  default: { stroke: TIER_COLOR.default, width: 1.5 },
};

// 테스트 오버레이 엣지 스타일 — 우선순위 끊김 > 경로 > 추가 (기존 tier 위).
const TEST_EDGE_STYLE = {
  cut: { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.4 },
  path: { stroke: '#16a34a', strokeWidth: 4 },
  added: { stroke: '#0d9488', strokeWidth: 2, strokeDasharray: '6 3' },
} as const;

type NodeTier = Exclude<Tier, 'seed'>;
type PathRole = 'start' | 'end' | 'anchor';

const ROLE_BADGE: Record<PathRole, { text: string; color: string }> = {
  start: { text: '시작', color: '#16a34a' },
  end: { text: '종료', color: '#dc2626' },
  anchor: { text: '추가 시작', color: '#0d9488' },
};

type SubstationNodeData = {
  name: string;
  ofdName: string;
  modules: { id: string; name: string }[];
  tier: NodeTier;
  pathRole?: PathRole;
};

function SubstationNode({ data }: NodeProps<Node<SubstationNodeData>>) {
  const { name, ofdName, modules, tier, pathRole } = data;
  const borderColor = TIER_COLOR[tier];
  const borderWidth = tier === 'seedRing' || tier === 'junction' ? 2 : 1;
  const role = pathRole ? ROLE_BADGE[pathRole] : null;

  return (
    <div className="relative" style={{ minWidth: 160 }}>
      {role && (
        <span
          style={{
            position: 'absolute',
            top: -9,
            right: -6,
            zIndex: 1,
            background: role.color,
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 8,
          }}
        >
          {role.text}
        </span>
      )}
      <div
        className="rounded-lg bg-white shadow-sm overflow-hidden"
        style={{
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow: role ? `0 0 0 3px ${role.color}` : undefined,
        }}
      >
        {/* Floating edge 가 노드 중심 기준 경계점을 계산하므로 핸들 위치 무관 — 단일 (hidden) 핸들 한 쌍만 둠. */}
        <Handle type="target" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%' }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, top: '50%', left: '50%' }} />
        <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800 truncate">{name}</span>
            {tier === 'junction' && (
              <span className="ml-1 shrink-0 text-[10px] text-amber-600 font-medium">분기점</span>
            )}
          </div>
        </div>
        <div className="px-2.5 py-1.5">
          <div className="text-[11px] text-gray-600 truncate">{ofdName}</div>
          {modules.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {modules.slice(0, 3).map((m) => (
                <div key={m.id} className="text-[10px] text-gray-500 truncate">
                  · {m.name}
                </div>
              ))}
              {modules.length > 3 && (
                <div className="text-[10px] text-gray-400">+ {modules.length - 3}개</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { substation: SubstationNode };
const edgeTypes = { floating: FloatingEdge };

interface SubstationGroup {
  id: string;
  name: string;
  ofdNode: TraceNode | null;
  modules: TraceNode[];
}

function groupBySubstation(nodes: TraceNode[]): SubstationGroup[] {
  const groups = new Map<string, SubstationGroup>();
  for (const n of nodes) {
    const key = n.substationName || n.substationId || n.equipmentId;
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: n.substationName || n.equipmentName, ofdNode: null, modules: [] });
    }
    const g = groups.get(key)!;
    if (n.materialCategoryCode === 'EQP-OFD') g.ofdNode = n;
    else g.modules.push(n);
  }
  return Array.from(groups.values());
}

function computeRingHighlights(
  rings: TraceRing[],
  highlightedFpId: string | null,
): { seedRingNodes: Set<string>; seedRingEdges: Set<string>; superRingNodes: Set<string>; superRingEdges: Set<string> } {
  const seedRingNodes = new Set<string>();
  const seedRingEdges = new Set<string>();
  const superRingNodes = new Set<string>();
  const superRingEdges = new Set<string>();
  if (!highlightedFpId) return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };

  const seedRing = rings.find((r) => r.level === 0 && r.edgeIds.includes(highlightedFpId));
  if (seedRing) {
    for (const id of seedRing.nodeIds) seedRingNodes.add(id);
    for (const id of seedRing.edgeIds) seedRingEdges.add(id);
    const superRing = rings.find((r) => r.level === 1 && r.childRingIds.includes(seedRing.id));
    if (superRing) {
      for (const id of superRing.nodeIds) superRingNodes.add(id);
      for (const id of superRing.edgeIds) superRingEdges.add(id);
    }
  }
  return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };
}

/** base fiberPath edge — 그래프 위상 + tier 스타일 메타. */
type GraphEdgeMeta = { id: string; source: string; target: string; tier: Tier; label?: string };

export function NetworkTopologyModal() {
  const modalOpen = useNetworkTopologyStore((s) => s.modalOpen);
  const traceResult = useNetworkTopologyStore((s) => s.traceResult);
  const highlightedFpId = useNetworkTopologyStore((s) => s.highlightedFiberPathId);
  const isLoading = useNetworkTopologyStore((s) => s.isLoading);
  const error = useNetworkTopologyStore((s) => s.error);
  const close = useNetworkTopologyStore((s) => s.close);

  // ── 테스트 상태 (모달 한정) ───────────────────────────────────────────────
  const [cutEdgeIds, setCutEdgeIds] = useState<Set<string>>(new Set<string>());
  const [addedEdges, setAddedEdges] = useState<GraphEdge[]>([]);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [pathEnd, setPathEnd] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addAnchor, setAddAnchor] = useState<string | null>(null);
  const addCounter = useRef(0);

  const resetTestState = useCallback(() => {
    setCutEdgeIds(new Set<string>());
    setAddedEdges([]);
    setPathStart(null);
    setPathEnd(null);
    setAddMode(false);
    setAddAnchor(null);
  }, []);

  // traceResult 가 바뀌면(닫기→null, 재열기→새 객체) 테스트 상태 초기화.
  useEffect(() => {
    resetTestState();
  }, [traceResult, resetTestState]);

  // 경로 추가 모드 중 ESC → 취소.
  useEffect(() => {
    if (!addMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddMode(false);
        setAddAnchor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode]);

  // Layout 은 traceResult 만으로 결정 — highlightedFpId/테스트 상태 변경 시 재계산 안 함.
  const layoutData = useMemo(() => {
    if (!traceResult) return null;
    const groups = groupBySubstation(traceResult.nodes);
    const ofdToGroup = new Map<string, string>();
    for (const g of groups) if (g.ofdNode) ofdToGroup.set(g.ofdNode.equipmentId, g.id);

    const hasSPQR = traceResult.rings.some((r) => r.level === 1);
    const layoutInput = { nodeIds: groups.map((g) => g.id), ofdToGroup, edges: traceResult.edges, rings: traceResult.rings };
    const positions = hasSPQR ? computeLayoutSPQR(layoutInput) : computeLayoutBCTree(layoutInput);

    // 분기점 = OFD 가 2개 이상의 level-0 ring 에 포함. ring 통계도 동일 loop 에서.
    const ringCount = new Map<string, number>();
    let fundamental = 0;
    let composite = 0;
    for (const r of traceResult.rings) {
      if (r.level === 0) {
        fundamental++;
        for (const nid of r.nodeIds) ringCount.set(nid, (ringCount.get(nid) ?? 0) + 1);
      } else {
        composite++;
      }
    }
    return { groups, ofdToGroup, positions, ringCount, fundamental, composite };
  }, [traceResult]);

  // base 그래프 — 노드 + fiberPath 엣지(위상·tier). 테스트 상태와 무관.
  const baseGraph = useMemo<{ nodes: Node<SubstationNodeData>[]; graphEdges: GraphEdgeMeta[] }>(() => {
    if (!traceResult || !layoutData) return { nodes: [], graphEdges: [] };
    const { groups, ofdToGroup, positions, ringCount } = layoutData;
    const { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges } = computeRingHighlights(
      traceResult.rings,
      highlightedFpId,
    );

    const nodes: Node<SubstationNodeData>[] = groups.map((g) => {
      const ofdId = g.ofdNode?.equipmentId;
      let tier: NodeTier = 'default';
      if (ofdId) {
        if (seedRingNodes.has(ofdId)) tier = 'seedRing';
        else if (superRingNodes.has(ofdId)) tier = 'superRing';
        else if ((ringCount.get(ofdId) ?? 0) >= 2) tier = 'junction';
      }
      return {
        id: g.id,
        type: 'substation',
        position: positions.get(g.id) ?? { x: 0, y: 0 },
        data: {
          name: g.name,
          ofdName: g.ofdNode?.equipmentName ?? '',
          modules: g.modules.map((m) => ({ id: m.equipmentId, name: m.equipmentName })),
          tier,
        },
      };
    });

    // FiberPath edge 만 그림 — cable edge 는 변전소 안 표현이라 그래프에서 생략.
    const graphEdges: GraphEdgeMeta[] = [];
    for (const e of traceResult.edges) {
      if (e.type !== 'fiberPath') continue;
      const source = ofdToGroup.get(e.sourceEquipmentId);
      const target = ofdToGroup.get(e.targetEquipmentId);
      if (!source || !target) continue;
      const tier: Tier = e.fiberPathId === highlightedFpId
        ? 'seed'
        : seedRingEdges.has(e.id)
          ? 'seedRing'
          : superRingEdges.has(e.id)
            ? 'superRing'
            : 'default';
      // Label = 포트번호 (#N) 만 — 변전소명은 양 끝 노드 박스에 이미 표시됨.
      const label = e.fiberPortNumber != null ? `#${e.fiberPortNumber}` : undefined;
      graphEdges.push({ id: e.id, source, target, tier, label });
    }
    return { nodes, graphEdges };
  }, [traceResult, layoutData, highlightedFpId]);

  // 경로찾기 그래프 = (base + 추가) − 끊김.
  const routableEdges = useMemo<GraphEdge[]>(() => {
    const all: GraphEdge[] = [
      ...baseGraph.graphEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      ...addedEdges,
    ];
    return all.filter((e) => !cutEdgeIds.has(e.id));
  }, [baseGraph, addedEdges, cutEdgeIds]);

  // 최단 경로(홉 수) — start/end 둘 다 선택됐을 때만.
  const foundPath = useMemo<string[] | null>(() => {
    if (!pathStart || !pathEnd) return null;
    return findShortestPath(routableEdges, pathStart, pathEnd);
  }, [routableEdges, pathStart, pathEnd]);
  const foundPathEdgeIds = useMemo(() => new Set(foundPath ?? []), [foundPath]);

  // ── 엣지 제거 (× 클릭) — 추가 엣지는 완전 삭제, base 엣지는 끊김 토글 ────────
  const handleRemoveEdge = useCallback((edgeId: string) => {
    if (edgeId.startsWith('test-add-')) {
      setAddedEdges((prev) => prev.filter((e) => e.id !== edgeId));
      return;
    }
    setCutEdgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) next.delete(edgeId);
      else next.add(edgeId);
      return next;
    });
  }, []);

  // ── 노드 클릭 — addMode 면 경로 추가, 아니면 경로찾기 시작/종료 ──────────────
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (addMode) {
        if (!addAnchor) {
          setAddAnchor(nodeId);
        } else if (nodeId !== addAnchor) {
          const id = `test-add-${addCounter.current++}`;
          setAddedEdges((prev) => [...prev, { id, source: addAnchor, target: nodeId }]);
          setAddMode(false);
          setAddAnchor(null);
        }
        return;
      }
      if (!pathStart) {
        setPathStart(nodeId);
      } else if (!pathEnd) {
        if (nodeId !== pathStart) setPathEnd(nodeId);
      } else {
        setPathStart(nodeId);
        setPathEnd(null);
      }
    },
    [addMode, addAnchor, pathStart, pathEnd],
  );

  const handleToggleAddMode = useCallback(() => {
    setAddMode((prev) => !prev);
    setAddAnchor(null);
  }, []);

  // ── 렌더용 노드 — pathRole 배지 주입 ──────────────────────────────────────
  const rfNodes = useMemo<Node[]>(() => {
    return baseGraph.nodes.map((n) => {
      let pathRole: PathRole | undefined;
      if (n.id === pathStart) pathRole = 'start';
      else if (n.id === pathEnd) pathRole = 'end';
      else if (n.id === addAnchor) pathRole = 'anchor';
      return (pathRole ? { ...n, data: { ...n.data, pathRole } } : n) as Node;
    });
  }, [baseGraph, pathStart, pathEnd, addAnchor]);

  // ── 렌더용 엣지 — 끊김 > 경로 > 추가 > 기존 tier ──────────────────────────
  const rfEdges = useMemo<Edge[]>(() => {
    const labelStyle = { fontSize: 10, fill: '#6b7280' };
    const labelBgStyle = { fill: '#ffffff', fillOpacity: 0.85 };
    const data = { onRemove: handleRemoveEdge };
    const result: Edge[] = [];

    for (const e of baseGraph.graphEdges) {
      let style: Edge['style'];
      let animated = false;
      if (cutEdgeIds.has(e.id)) {
        style = { ...TEST_EDGE_STYLE.cut };
      } else if (foundPathEdgeIds.has(e.id)) {
        style = { ...TEST_EDGE_STYLE.path };
        animated = true;
      } else {
        const s = EDGE_STYLE[e.tier];
        style = { stroke: s.stroke, strokeWidth: s.width };
      }
      result.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'floating',
        label: e.label,
        labelStyle,
        labelBgStyle,
        style,
        animated,
        data,
      });
    }

    // 추가 엣지 — 끊김 대상 아님(× 누르면 완전 삭제). 경로상이면 경로 스타일.
    for (const e of addedEdges) {
      const onPath = foundPathEdgeIds.has(e.id);
      result.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'floating',
        label: '추가',
        labelStyle: { fontSize: 10, fill: '#0d9488' },
        labelBgStyle,
        style: onPath ? { ...TEST_EDGE_STYLE.path } : { ...TEST_EDGE_STYLE.added },
        animated: onPath,
        data,
      });
    }
    return result;
  }, [baseGraph, addedEdges, cutEdgeIds, foundPathEdgeIds, handleRemoveEdge]);

  if (!modalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="bg-white rounded-lg shadow-xl w-[min(1200px,95vw)] h-[min(800px,90vh)] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">네트워크 토폴로지</h3>
            {traceResult && layoutData && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {traceResult.nodes.length}개 노드 · {layoutData.fundamental}개 링 · 상위링 {layoutData.composite}개
              </p>
            )}
          </div>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="닫기">
            ×
          </button>
        </div>

        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <span className="text-sm text-gray-500">불러오는 중...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-red-500">{error}</span>
            </div>
          )}
          {!isLoading && !error && rfNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-gray-400">표시할 네트워크 토폴로지가 없습니다.</span>
            </div>
          )}
          {!isLoading && !error && rfNodes.length > 0 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.02}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              onNodeClick={(_, node) => handleNodeClick(node.id)}
            >
              <Background gap={20} size={1} color="#e5e7eb" />
              <Controls showInteractive={false} />
              <TopologyTestControls
                addMode={addMode}
                addAnchor={addAnchor}
                hasStart={pathStart != null}
                hasEnd={pathEnd != null}
                pathFound={foundPath != null}
                cutCount={cutEdgeIds.size}
                addCount={addedEdges.length}
                onToggleAddMode={handleToggleAddMode}
                onReset={resetTestState}
              />
            </ReactFlow>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-red-600" /> 시드 경로
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-blue-600" /> 같은 링
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-purple-600" /> 상위 링
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border-2 border-amber-500 bg-white" /> 분기점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-1 bg-green-600" /> 찾은 경로
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-teal-600" /> 추가
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-gray-400" /> 끊김
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (타입체크 + vite build 통과). 실패 시 — `noUnusedLocals`/`noUnusedParameters` 위반이 가장 흔하므로 미사용 식별자부터 확인.

- [ ] **Step 3: 린트 확인**

Run: `npm run lint`
Expected: 0 warnings, 0 errors (`--max-warnings 0`). `react-hooks/exhaustive-deps` 경고가 나면 해당 `useMemo`/`useCallback`/`useEffect` 의존성 배열을 점검.

- [ ] **Step 4: 수동 검증**

개발 서버로 토폴로지 모달을 연다 (`docker compose -f docker-compose.dev.yml up -d` + `npm run dev`, 케이블 "상세" 클릭). 아래를 확인:

1. 노드를 클릭하면 "시작" 배지가 붙고, 다른 노드를 클릭하면 "종료" 배지 + 둘 사이 최단 경로가 굵은 초록 점선으로 강조된다.
2. 경로상 엣지에 호버하면 × 가 뜨고, 클릭하면 회색 점선으로 끊기며 경로가 우회로 다시 그려진다. 다시 × 를 누르면 복원된다.
3. "경로 추가" 버튼 → 노드 A → 노드 B 클릭 시 청록 점선 "추가" 엣지가 생긴다. ESC 또는 "추가 취소" 로 취소된다.
4. 추가 엣지가 더 짧으면 경로찾기가 그 엣지를 쓴다. 추가 엣지 호버 × 는 엣지를 완전히 제거한다.
5. "초기화" 버튼은 끊김·추가·경로 선택을 모두 되돌린다.
6. 모달을 닫았다 다시 열면 테스트 상태가 모두 사라져 있다.
7. 노드 위치는 삭제·추가 중에도 움직이지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/network/NetworkTopologyModal.tsx
git commit -m "$(cat <<'EOF'
feat(network): 토폴로지 경로찾기·테스트 삭제/추가 도구 통합

노드 클릭으로 최단경로(홉 수) 하이라이트, 엣지 × 로 경로 끊기,
'경로 추가' 로 가상 엣지 추가. 레이아웃은 재계산하지 않고 오버레이로만
표시 — 모달 닫으면 초기화.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 완료 기준

- `npx vitest run src/features/network/pathfinding.test.ts` — 7 tests 통과
- `npm run build` — 통과
- `npm run lint` — 0 warnings
- Task 4 Step 4 수동 검증 7항목 통과
