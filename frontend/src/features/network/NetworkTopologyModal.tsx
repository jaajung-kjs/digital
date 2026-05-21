/**
 * Network Topology Modal — cable trace 결과를 React Flow 로 시각화.
 *
 * 입력 = useNetworkTopologyStore.traceResult (cableTracer 결과). 변전소 단위로 노드 그룹화 후,
 * BC-tree (vertex 공유) 또는 SPQR (edge 공유) layout 으로 좌표 계산. fiberPath edge 만 그림.
 *
 * 시드 cable 의 fiberPathId 강조 (빨강), 시드가 속한 ring (파랑), 그 ring 을 포함하는 composite
 * ring (보라), 분기점 (호박색 테두리). highlightedFpId 만 바뀌어도 layout 은 재계산 안 함.
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
import { computeLayoutBCTree } from './layout/bcTreeLayout';
import { computeLayoutSPQR } from './layout/spqrLayout';
import { FloatingEdge } from './edges/FloatingEdge';
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

type NodeTier = Exclude<Tier, 'seed'>;

type SubstationNodeData = {
  name: string;
  ofdName: string;
  modules: { id: string; name: string }[];
  tier: NodeTier;
};

function SubstationNode({ data }: NodeProps<Node<SubstationNodeData>>) {
  const { name, ofdName, modules, tier } = data;
  const borderColor = TIER_COLOR[tier];
  const borderWidth = tier === 'seedRing' || tier === 'junction' ? 2 : 1;

  return (
    <div
      className="rounded-lg bg-white shadow-sm overflow-hidden"
      style={{ border: `${borderWidth}px solid ${borderColor}`, minWidth: 160 }}
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

export function NetworkTopologyModal() {
  const modalOpen = useNetworkTopologyStore((s) => s.modalOpen);
  const traceResult = useNetworkTopologyStore((s) => s.traceResult);
  const highlightedFpId = useNetworkTopologyStore((s) => s.highlightedFiberPathId);
  const isLoading = useNetworkTopologyStore((s) => s.isLoading);
  const error = useNetworkTopologyStore((s) => s.error);
  const close = useNetworkTopologyStore((s) => s.close);

  // Layout 은 traceResult 만으로 결정 — highlightedFpId 변경 시 재계산 안 함.
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

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!traceResult || !layoutData) return { nodes: [], edges: [] };
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
        type: 'floating',
        label: e.fiberPathLabel ? e.fiberPathLabel.split('-').slice(0, 2).join('-') : undefined,
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
        style: { stroke, strokeWidth },
      });
    }
    return { nodes: nodes as Node[], edges };
  }, [traceResult, layoutData, highlightedFpId]);

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
              edgeTypes={edgeTypes}
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
