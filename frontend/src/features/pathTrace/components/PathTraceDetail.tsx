import { useMemo } from 'react';
import { usePathHighlightStore } from '../stores/pathHighlightStore';
import { CABLE_TYPE_COLORS } from '../../equipment/types/equipment';
import type { TraceNode, TraceEdge } from '../types';

/**
 * Build an ordered path chain from trace nodes and edges.
 * Returns nodes in traversal order: source → ... → target
 */
function buildPathChain(
  nodes: TraceNode[],
  edges: TraceEdge[],
): { node: TraceNode; edge: TraceEdge | null }[] {
  if (nodes.length === 0) return [];

  // Build adjacency: equipmentId -> [{neighborId, edge}]
  const adj = new Map<string, { neighborId: string; edge: TraceEdge }[]>();
  for (const n of nodes) adj.set(n.equipmentId, []);
  for (const e of edges) {
    adj.get(e.sourceEquipmentId)?.push({ neighborId: e.targetEquipmentId, edge: e });
    adj.get(e.targetEquipmentId)?.push({ neighborId: e.sourceEquipmentId, edge: e });
  }

  const nodeMap = new Map(nodes.map((n) => [n.equipmentId, n]));

  // Find source node (isSource = true), fallback to first node
  const startNode = nodes.find((n) => n.isSource) ?? nodes[0];
  const chain: { node: TraceNode; edge: TraceEdge | null }[] = [{ node: startNode, edge: null }];
  const visited = new Set<string>([startNode.equipmentId]);

  // Walk the chain
  let current = startNode.equipmentId;
  while (true) {
    const neighbors = adj.get(current) ?? [];
    const next = neighbors.find((n) => !visited.has(n.neighborId));
    if (!next) break;
    visited.add(next.neighborId);
    const nextNode = nodeMap.get(next.neighborId);
    if (!nextNode) break;
    chain.push({ node: nextNode, edge: next.edge });
    current = next.neighborId;
  }

  return chain;
}

export function PathTraceDetail() {
  const active = usePathHighlightStore((s) => s.active);
  const traceResult = usePathHighlightStore((s) => s.traceResult);
  const mode = usePathHighlightStore((s) => s.mode);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const chain = useMemo(() => {
    if (!traceResult) return [];
    return buildPathChain(traceResult.nodes, traceResult.edges);
  }, [traceResult]);

  if (!active || !traceResult) return null;

  const cableType = traceResult.edges[0]?.cableType ?? '';
  const totalLength = traceResult.edges
    .filter((e) => e.type === 'cable' && e.length)
    .reduce((sum, e) => sum + (e.length ?? 0), 0);
  const substations = [...new Set(traceResult.nodes.map((n) => n.substationName))];
  const cableCount = traceResult.edges.filter((e) => e.type === 'cable').length;
  const fiberPathCount = traceResult.edges.filter((e) => e.type === 'fiberPath').length;

  return (
    <div className="border-t border-gray-200 bg-blue-50/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700">경로 추적 결과</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              CABLE_TYPE_COLORS[cableType] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {cableType}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); clearHighlight(); }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          닫기
        </button>
      </div>

      {/* Summary */}
      <div className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>설비 {traceResult.nodes.length}개</span>
        <span>케이블 {cableCount}개</span>
        {fiberPathCount > 0 && <span>FiberPath {fiberPathCount}개</span>}
        {totalLength > 0 && <span>총 {totalLength}m</span>}
        {substations.length > 1 && (
          <span className="text-amber-600">
            {substations.length}개 변전소
          </span>
        )}
        {traceResult.rings.length > 0 && (
          <span className="text-purple-600">
            링 {traceResult.rings.length}개
          </span>
        )}
      </div>

      {/* Path chain */}
      <div className="px-3 pb-3 max-h-48 overflow-y-auto">
        {chain.map((step, i) => (
          <div key={step.node.equipmentId}>
            {/* Edge (connector line) */}
            {step.edge && (
              <div className="flex items-center gap-1.5 pl-3 py-0.5">
                <div className="w-px h-3 bg-gray-300" />
                <span className="text-[10px] text-gray-400">
                  {step.edge.type === 'fiberPath' ? '┈┈' : '──'}
                  {' '}
                  {step.edge.type === 'fiberPath'
                    ? `FiberPath${step.edge.portCount ? ` (${step.edge.portCount}코어)` : ''}`
                    : step.edge.label || cableType}
                  {step.edge.length ? ` ${step.edge.length}m` : ''}
                </span>
              </div>
            )}

            {/* Node */}
            <div
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                step.node.isSource || step.node.isTarget
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'text-gray-700'
              }`}
            >
              <span className="shrink-0 w-4 text-center text-[10px] text-gray-400">
                {i === 0 ? '●' : i === chain.length - 1 ? '◎' : '·'}
              </span>
              <span className="truncate">{step.node.equipmentName}</span>
              {substations.length > 1 && (
                <span className="shrink-0 text-[10px] text-gray-400">
                  {step.node.substationName}
                </span>
              )}
              <span className="shrink-0 text-[10px] text-gray-300">
                {step.node.category}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Mode indicator */}
      <div className="px-3 pb-2 text-[10px] text-gray-400">
        {mode === 'canvas' ? '캔버스에서 하이라이트 중 · ESC로 해제' : '토폴로지 모달 표시 중'}
      </div>
    </div>
  );
}
