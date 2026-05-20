/**
 * Network Topology Modal — cable trace 결과를 React Flow 로 시각화.
 *
 * 입력: useNetworkTopologyStore.traceResult (= cableTracer 결과).
 *   - nodes: 도달한 모든 OFD/모듈
 *   - edges: 모든 cable + fiberPath edge
 *   - rings: cycleDetection 결과 (level-0 소링, level-1 대링/composite)
 *
 * 시각화:
 *   - 변전소 = React Flow 노드 (그 변전소 안 OFD + 모듈 leaf list 요약)
 *   - FiberPath edge = 변전소 간 (트레이스가 도달한 FP 만 — 시드에서 hop 한 path)
 *   - 시드 cable 의 fiberPathId 강조 (빨강)
 *   - 그 시드가 속한 ring 강조 (파랑)
 *   - 대링 (level-1) 은 별도 색 (보라) — 사용자 "상위 ring" 표시
 */

import { useMemo } from 'react';
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
import type { TraceNode, TraceRing, TraceResult } from '../pathTrace/types';

// ── Topology tier → 색·굵기 (시드 cable/같은 ring/상위 ring/분기점/기본) ────────
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
  junction: { stroke: TIER_COLOR.junction, width: 1.5 }, // edge 에선 안 쓰임
  default: { stroke: TIER_COLOR.default, width: 1.5 },
};

// ── Custom substation node ─────────────────────────────────────────────────

type SubstationNodeData = {
  name: string;
  ofdName: string;
  modules: { id: string; name: string }[];
  isJunction: boolean;
  inSeedRing: boolean;
  inSuperRing: boolean;
};

function SubstationNode({ data }: NodeProps<Node<SubstationNodeData>>) {
  const { name, ofdName, modules, isJunction, inSeedRing, inSuperRing } = data;
  const tier: Tier = inSeedRing ? 'seedRing' : inSuperRing ? 'superRing' : isJunction ? 'junction' : 'default';
  const borderColor = TIER_COLOR[tier];
  const borderWidth = tier === 'seedRing' || tier === 'junction' ? 2 : 1;

  return (
    <div
      className="rounded-lg bg-white shadow-sm overflow-hidden"
      style={{ border: `${borderWidth}px solid ${borderColor}`, minWidth: 160 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-800 truncate">{name}</span>
          {isJunction && (
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
  );
}

const nodeTypes = { substation: SubstationNode };

// ── Substation 그룹화 + layout ─────────────────────────────────────────────

interface SubstationGroup {
  id: string;
  name: string;
  ofdNode: TraceNode | null;
  modules: TraceNode[]; // OFD 가 아닌 노드들 (모듈/회로)
}

/** traceResult.nodes 를 substationName 기준으로 그룹화. */
function groupBySubstation(nodes: TraceNode[]): SubstationGroup[] {
  const groups = new Map<string, SubstationGroup>();
  for (const n of nodes) {
    const key = n.substationName || n.substationId || n.equipmentId; // fallback
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: n.substationName || n.equipmentName, ofdNode: null, modules: [] });
    }
    const g = groups.get(key)!;
    if (n.materialCategoryCode === 'EQP-OFD') {
      g.ofdNode = n;
    } else {
      g.modules.push(n);
    }
  }
  return Array.from(groups.values());
}

const RING_RADIUS = 220;
const RING_GAP = 480;

/**
 * 변전소 그룹의 좌표 계산.
 *   level-0 ring 마다 원형 배치, junction (이전 ring 에서 배치된 노드) 좌표 재사용.
 */
function computeLayout(
  groups: SubstationGroup[],
  rings: TraceRing[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // OFD id → substation group id 매핑
  const ofdToGroup = new Map<string, string>();
  for (const g of groups) if (g.ofdNode) ofdToGroup.set(g.ofdNode.equipmentId, g.id);

  const fundamental = rings.filter((r) => r.level === 0);

  fundamental.forEach((ring, ringIdx) => {
    const cx = 400 + ringIdx * RING_GAP;
    const cy = 400;
    const nodeIds = ring.nodeIds;
    const N = nodeIds.length;
    if (N === 0) return;

    // 이미 다른 ring 에서 배치된 노드를 기준 각도로
    let startAngle = -Math.PI / 2;
    let startIdx = 0;
    for (let i = 0; i < N; i++) {
      const groupId = ofdToGroup.get(nodeIds[i]);
      if (groupId && positions.has(groupId)) {
        startIdx = i;
        const p = positions.get(groupId)!;
        startAngle = Math.atan2(p.y - cy, p.x - cx);
        break;
      }
    }

    for (let i = 0; i < N; i++) {
      const idx = (startIdx + i) % N;
      const groupId = ofdToGroup.get(nodeIds[idx]);
      if (!groupId) continue;
      if (positions.has(groupId)) continue;
      const angle = startAngle + (i * 2 * Math.PI) / N;
      positions.set(groupId, {
        x: cx + RING_RADIUS * Math.cos(angle),
        y: cy + RING_RADIUS * Math.sin(angle),
      });
    }
  });

  // ring 에 속하지 않은 그룹 — 좌측 상단 grid (트레이스의 leaf/단일선)
  let stragglerIdx = 0;
  for (const g of groups) {
    if (!positions.has(g.id)) {
      positions.set(g.id, {
        x: -200 + (stragglerIdx % 4) * 180,
        y: -200 + Math.floor(stragglerIdx / 4) * 100,
      });
      stragglerIdx++;
    }
  }
  return positions;
}

// ── Ring 강조 set 계산 ──────────────────────────────────────────────────────

function computeRingHighlights(
  rings: TraceRing[],
  highlightedFpId: string | null,
): { seedRingNodes: Set<string>; seedRingEdges: Set<string>; superRingNodes: Set<string>; superRingEdges: Set<string> } {
  const seedRingNodes = new Set<string>();
  const seedRingEdges = new Set<string>();
  const superRingNodes = new Set<string>();
  const superRingEdges = new Set<string>();

  if (!highlightedFpId) return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };

  // 시드 FP 가 속한 level-0 ring
  const seedRing = rings.find((r) => r.level === 0 && r.edgeIds.includes(highlightedFpId));
  if (seedRing) {
    for (const id of seedRing.nodeIds) seedRingNodes.add(id);
    for (const id of seedRing.edgeIds) seedRingEdges.add(id);

    // 그 ring 을 포함하는 composite ring (level-1) 도 찾음 = "상위 ring"
    const superRing = rings.find((r) => r.level === 1 && r.childRingIds.includes(seedRing.id));
    if (superRing) {
      for (const id of superRing.nodeIds) superRingNodes.add(id);
      for (const id of superRing.edgeIds) superRingEdges.add(id);
    }
  }
  return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export function NetworkTopologyModal() {
  const modalOpen = useNetworkTopologyStore((s) => s.modalOpen);
  const traceResult = useNetworkTopologyStore((s) => s.traceResult);
  const highlightedFpId = useNetworkTopologyStore((s) => s.highlightedFiberPathId);
  const isLoading = useNetworkTopologyStore((s) => s.isLoading);
  const error = useNetworkTopologyStore((s) => s.error);
  const close = useNetworkTopologyStore((s) => s.close);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!traceResult) return { nodes: [], edges: [] };

    const groups = groupBySubstation(traceResult.nodes);
    const positions = computeLayout(groups, traceResult.rings);
    const { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges } = computeRingHighlights(
      traceResult.rings,
      highlightedFpId,
    );

    const ofdToGroup = new Map<string, string>();
    for (const g of groups) if (g.ofdNode) ofdToGroup.set(g.ofdNode.equipmentId, g.id);

    // 분기점 = OFD 가 2개 이상의 level-0 ring 에 포함
    const ringCount = new Map<string, number>();
    for (const r of traceResult.rings.filter((r) => r.level === 0)) {
      for (const nid of r.nodeIds) ringCount.set(nid, (ringCount.get(nid) ?? 0) + 1);
    }
    const isJunction = (ofdId: string) => (ringCount.get(ofdId) ?? 0) >= 2;

    const nodes: Node<SubstationNodeData>[] = groups.map((g) => ({
      id: g.id,
      type: 'substation',
      position: positions.get(g.id) ?? { x: 0, y: 0 },
      data: {
        name: g.name,
        ofdName: g.ofdNode?.equipmentName ?? '',
        modules: g.modules.map((m) => ({ id: m.equipmentId, name: m.equipmentName })),
        isJunction: g.ofdNode ? isJunction(g.ofdNode.equipmentId) : false,
        inSeedRing: g.ofdNode ? seedRingNodes.has(g.ofdNode.equipmentId) : false,
        inSuperRing: g.ofdNode ? superRingNodes.has(g.ofdNode.equipmentId) && !seedRingNodes.has(g.ofdNode.equipmentId) : false,
      },
    }));

    // FiberPath edge 만 (변전소 간). cable edge 는 변전소 안 표현이라 그래프에서 생략.
    const edges: Edge[] = [];
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
      const { stroke, width: strokeWidth } = EDGE_STYLE[tier];
      edges.push({
        id: e.id,
        source,
        target,
        label: e.fiberPathLabel ? e.fiberPathLabel.split('-').slice(0, 2).join('-') : undefined,
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
        style: { stroke, strokeWidth },
      });
    }

    return { nodes: nodes as Node[], edges };
  }, [traceResult, highlightedFpId]);

  const ringCounts = useMemoRingStats(traceResult);

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
            {traceResult && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {traceResult.nodes.length}개 노드 · {ringCounts.fundamental}개 링 · 상위링 {ringCounts.composite}개
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
          {!isLoading && !error && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-gray-400">표시할 네트워크 토폴로지가 없습니다.</span>
            </div>
          )}
          {!isLoading && !error && nodes.length > 0 && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={true}
            >
              <Background gap={20} size={1} color="#e5e7eb" />
              <Controls showInteractive={false} />
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
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function useMemoRingStats(traceResult: TraceResult | null): { fundamental: number; composite: number } {
  return useMemo(() => {
    if (!traceResult) return { fundamental: 0, composite: 0 };
    let f = 0;
    let c = 0;
    for (const r of traceResult.rings) {
      if (r.level === 0) f++;
      else c++;
    }
    return { fundamental: f, composite: c };
  }, [traceResult]);
}
