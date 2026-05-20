/**
 * Network Topology Modal — 변전소망 그래프 시각화.
 *
 * @xyflow/react 위에 자체 ring 원형 배치 알고리즘. cycleDetection 결과의 level-0 ring 들을
 * 각 원 위 균등 분포 + junction 노드는 ring 간 공유 좌표.
 *
 * 진입점: PathTraceDetail "상세" 버튼 (시드 FP 강조)
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
import type { NetworkGraph, NetworkSubstation } from './store';
import type { TraceRing } from '../pathTrace/types';

// ── Custom substation node ─────────────────────────────────────────────────

type SubstationNodeData = {
  name: string;
  ofdName: string;
  modules: { id: string; name: string }[];
  isJunction: boolean;
  inHighlightedRing: boolean;
};

function SubstationNode({ data }: NodeProps<Node<SubstationNodeData>>) {
  const { name, ofdName, modules, isJunction, inHighlightedRing } = data;
  const borderColor = inHighlightedRing
    ? '#2563eb'
    : isJunction
      ? '#f59e0b'
      : '#9ca3af';
  const borderWidth = inHighlightedRing || isJunction ? 2 : 1;

  return (
    <div
      className="rounded-lg bg-white shadow-sm overflow-hidden"
      style={{
        border: `${borderWidth}px solid ${borderColor}`,
        minWidth: 160,
      }}
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

// ── Layout: ring 별 원형 배치 ───────────────────────────────────────────────

const RING_RADIUS = 220;
const RING_GAP = 480; // ring 중심 사이 거리

/**
 * 각 substation 의 좌표를 계산.
 *   - rings (level 0) 의 nodeIds (OFD id 순서, cycle traversal) 를 원 위 균등 분포
 *   - 이미 다른 ring 에서 배치된 junction 노드를 만나면 그 좌표를 시작각으로 사용
 *     → ring 들이 자연스럽게 junction 에서 이어짐
 *   - non-ring substation (시드엔 없지만 미래 대비) 은 그래프 좌측 상단에 grid 배치
 */
function computeLayout(graph: NetworkGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ofdToSubId = new Map<string, string>();
  for (const sub of graph.substations) ofdToSubId.set(sub.ofdId, sub.id);

  const rings = graph.rings.filter((r) => r.level === 0);

  rings.forEach((ring, ringIdx) => {
    const cx = 400 + ringIdx * RING_GAP;
    const cy = 400;
    const nodeIds = ring.nodeIds; // OFD ids in cycle order
    const N = nodeIds.length;
    if (N === 0) return;

    // 이미 다른 ring 에서 배치된 노드 (junction) 찾기 — 그 노드의 좌표를 기준 각도로
    let startAngle = -Math.PI / 2;
    let startIdx = 0;
    for (let i = 0; i < N; i++) {
      const subId = ofdToSubId.get(nodeIds[i]);
      if (subId && positions.has(subId)) {
        startIdx = i;
        const p = positions.get(subId)!;
        startAngle = Math.atan2(p.y - cy, p.x - cx);
        break;
      }
    }

    for (let i = 0; i < N; i++) {
      const idx = (startIdx + i) % N;
      const subId = ofdToSubId.get(nodeIds[idx]);
      if (!subId) continue;
      if (positions.has(subId)) continue; // junction — keep existing
      const angle = startAngle + (i * 2 * Math.PI) / N;
      positions.set(subId, {
        x: cx + RING_RADIUS * Math.cos(angle),
        y: cy + RING_RADIUS * Math.sin(angle),
      });
    }
  });

  // ring 에 속하지 않은 substation 들 — 좌측 상단 grid
  let stragglerIdx = 0;
  for (const sub of graph.substations) {
    if (!positions.has(sub.id)) {
      positions.set(sub.id, {
        x: -200 + (stragglerIdx % 4) * 180,
        y: -200 + Math.floor(stragglerIdx / 4) * 100,
      });
      stragglerIdx++;
    }
  }

  return positions;
}

/** OFD 가 2개 이상의 ring 에 참여하면 junction */
function findJunctionOfdIds(rings: TraceRing[]): Set<string> {
  const count = new Map<string, number>();
  for (const r of rings.filter((r) => r.level === 0)) {
    for (const nid of r.nodeIds) count.set(nid, (count.get(nid) ?? 0) + 1);
  }
  const result = new Set<string>();
  for (const [nid, c] of count) if (c >= 2) result.add(nid);
  return result;
}

/** 강조 ring 의 substation/edge id set */
function findHighlightedSets(
  graph: NetworkGraph,
  highlightedFpId: string | null,
): { subIds: Set<string>; edgeIds: Set<string> } {
  if (!highlightedFpId) return { subIds: new Set(), edgeIds: new Set() };
  const ofdToSubId = new Map<string, string>();
  for (const sub of graph.substations) ofdToSubId.set(sub.ofdId, sub.id);

  // 해당 FP 가 속한 level-0 ring 찾기. 없으면 그 FP 와 두 endpoint OFD 만 강조.
  const ring = graph.rings.find((r) => r.level === 0 && r.edgeIds.includes(highlightedFpId));
  if (ring) {
    const subIds = new Set<string>();
    for (const ofdId of ring.nodeIds) {
      const subId = ofdToSubId.get(ofdId);
      if (subId) subIds.add(subId);
    }
    return { subIds, edgeIds: new Set(ring.edgeIds) };
  }
  // FP 가 ring 일부가 아닌 경우 (단일선)
  const fp = graph.fiberPaths.find((f) => f.id === highlightedFpId);
  if (!fp) return { subIds: new Set(), edgeIds: new Set() };
  const subA = ofdToSubId.get(fp.ofdAId);
  const subB = ofdToSubId.get(fp.ofdBId);
  return {
    subIds: new Set([subA, subB].filter(Boolean) as string[]),
    edgeIds: new Set([highlightedFpId]),
  };
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export function NetworkTopologyModal() {
  const modalOpen = useNetworkTopologyStore((s) => s.modalOpen);
  const graph = useNetworkTopologyStore((s) => s.graph);
  const highlightedFpId = useNetworkTopologyStore((s) => s.highlightedFiberPathId);
  const isLoading = useNetworkTopologyStore((s) => s.isLoading);
  const error = useNetworkTopologyStore((s) => s.error);
  const close = useNetworkTopologyStore((s) => s.close);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!graph) return { nodes: [], edges: [] };
    const positions = computeLayout(graph);
    const junctionOfdIds = findJunctionOfdIds(graph.rings);
    const { subIds: highlightedSubIds, edgeIds: highlightedEdgeIds } = findHighlightedSets(
      graph,
      highlightedFpId,
    );

    const ofdToSubId = new Map<string, string>();
    for (const sub of graph.substations) ofdToSubId.set(sub.ofdId, sub.id);

    const nodes: Node<SubstationNodeData>[] = graph.substations.map((sub: NetworkSubstation) => ({
      id: sub.id,
      type: 'substation',
      position: positions.get(sub.id) ?? { x: 0, y: 0 },
      data: {
        name: sub.name,
        ofdName: sub.ofdName,
        modules: sub.modules,
        isJunction: junctionOfdIds.has(sub.ofdId),
        inHighlightedRing: highlightedSubIds.has(sub.id),
      },
    }));

    const edges: Edge[] = [];
    for (const fp of graph.fiberPaths) {
      const source = ofdToSubId.get(fp.ofdAId);
      const target = ofdToSubId.get(fp.ofdBId);
      if (!source || !target) continue;
      const isHighlighted = highlightedEdgeIds.has(fp.id);
      const isSeed = fp.id === highlightedFpId;
      edges.push({
        id: fp.id,
        source,
        target,
        label: `${fp.usedPortCount}/${fp.portCount}`,
        labelStyle: { fontSize: 11, fill: '#6b7280' },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
        style: {
          stroke: isSeed ? '#dc2626' : isHighlighted ? '#2563eb' : '#9ca3af',
          strokeWidth: isSeed ? 3 : isHighlighted ? 2.5 : 1.5,
          opacity: highlightedFpId && !isHighlighted ? 0.3 : 1,
        },
      });
    }

    return { nodes: nodes as Node[], edges };
  }, [graph, highlightedFpId]);

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
          <h3 className="text-sm font-semibold text-gray-800">네트워크 토폴로지</h3>
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

        <div className="px-4 py-2 border-t border-gray-200 flex items-center gap-4 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-red-600" /> 시드 경로
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-blue-600" /> 같은 ring
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border-2 border-amber-500 bg-white" /> 분기점 (2 ring 공유)
          </span>
        </div>
      </div>
    </div>
  );
}
