import { useMemo } from 'react';
import { usePathHighlightStore } from '../stores/pathHighlightStore';
import { CABLE_BADGE_CLASSES } from '../../../types/connection';
import type { TraceNode, TraceEdge, SegmentNode } from '../types';

interface ResolvedStep {
  node: TraceNode;
  edge: TraceEdge | null;
}

function resolveSegment(
  nodes: SegmentNode[],
  nodeMap: Map<string, TraceNode>,
  edgeMap: Map<string, TraceEdge>,
): ResolvedStep[] {
  return nodes
    .map((sn) => {
      const node = nodeMap.get(sn.nodeId);
      if (!node) return null;
      return { node, edge: sn.edgeId ? edgeMap.get(sn.edgeId) ?? null : null };
    })
    .filter((s): s is ResolvedStep => s !== null);
}

interface DisplayItem {
  label: string;
  isEndpoint: boolean;
  /** Controls separator: true = ┄ (fiber), false = → (cable) */
  isFiberEdge: boolean;
  key: string;
}

/**
 * Build display items from resolved steps.
 *
 * OFD nodes are replaced by fiberPath labels derived from SSOT:
 *   - Direction: segment order → fromSubstation-toSubstation (NOT fiberPathLabel)
 *   - Port: edge.fiberPortNumber
 *
 * Terminal OFD (end of segment, incoming fiber but no outgoing fiber):
 *   looks up the closing fiberPath in allEdges to complete the ring display.
 */
function buildDisplayItems(
  steps: ResolvedStep[],
  allEdges: TraceEdge[],
  nodeMap: Map<string, TraceNode>,
): DisplayItem[] {
  // OFD equipmentId → fiberPath edges (for closing edge lookup)
  const fiberEdgesByEquip = new Map<string, TraceEdge[]>();
  for (const edge of allEdges) {
    if (edge.type !== 'fiberPath') continue;
    for (const eqId of [edge.sourceEquipmentId, edge.targetEquipmentId]) {
      if (!fiberEdgesByEquip.has(eqId)) fiberEdgesByEquip.set(eqId, []);
      fiberEdgesByEquip.get(eqId)!.push(edge);
    }
  }

  const visitedIds = new Set(steps.map((s) => s.node.equipmentId));
  const items: DisplayItem[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextStep = i + 1 < steps.length ? steps[i + 1] : null;
    const nextEdge = nextStep?.edge ?? null;
    const incomingIsFiber = step.edge?.type === 'fiberPath';
    const outgoingIsFiber = nextEdge?.type === 'fiberPath';

    if (step.node.category === 'OFD') {
      if (outgoingIsFiber && nextStep) {
        // OFD with outgoing fiberPath: derive label from substationNames (SSOT)
        const from = step.node.substationName;
        const to = nextStep.node.substationName;
        const port = nextEdge!.fiberPortNumber != null ? ` #${nextEdge!.fiberPortNumber}` : '';
        items.push({
          label: `${from}-${to}${port}`,
          isEndpoint: step.node.isSource || step.node.isTarget,
          isFiberEdge: !!incomingIsFiber,
          key: `${step.node.equipmentId}-${i}`,
        });
      } else if (incomingIsFiber) {
        // Terminal OFD: find the closing fiberPath (ring edge not in segment)
        const thisOfdId = step.node.equipmentId;
        const incomingEdgeId = step.edge?.id;
        const fiberEdges = fiberEdgesByEquip.get(thisOfdId) ?? [];
        const closingEdge = fiberEdges.find((e) => {
          if (e.id === incomingEdgeId) return false;
          const otherOfdId =
            e.sourceEquipmentId === thisOfdId ? e.targetEquipmentId : e.sourceEquipmentId;
          return visitedIds.has(otherOfdId);
        });

        if (closingEdge) {
          const from = step.node.substationName;
          const otherOfdId =
            closingEdge.sourceEquipmentId === thisOfdId
              ? closingEdge.targetEquipmentId
              : closingEdge.sourceEquipmentId;
          const otherNode = nodeMap.get(otherOfdId);
          const to = otherNode?.substationName ?? '';
          const port = closingEdge.fiberPortNumber != null ? ` #${closingEdge.fiberPortNumber}` : '';
          items.push({
            label: `${from}-${to}${port}`,
            isEndpoint: step.node.isSource || step.node.isTarget,
            isFiberEdge: true,
            key: `${step.node.equipmentId}-${i}`,
          });
        }
        // No closing edge → skip (already represented by previous label)
      } else {
        // OFD connected by cables only → show equipment name
        items.push({
          label: step.node.equipmentName,
          isEndpoint: step.node.isSource || step.node.isTarget,
          isFiberEdge: false,
          key: `${step.node.equipmentId}-${i}`,
        });
      }
    } else {
      // Non-OFD: show equipment name as-is
      items.push({
        label: step.node.equipmentName,
        isEndpoint: step.node.isSource || step.node.isTarget,
        isFiberEdge: !!incomingIsFiber,
        key: `${step.node.equipmentId}-${i}`,
      });
    }
  }

  return items;
}

export function PathTraceDetail() {
  const active = usePathHighlightStore((s) => s.active);
  const traceResult = usePathHighlightStore((s) => s.traceResult);
  const segments = usePathHighlightStore((s) => s.segments);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const openModal = usePathHighlightStore((s) => s.openModal);

  const { nodeMap, edgeMap } = useMemo(() => {
    if (!traceResult) return { nodeMap: new Map<string, TraceNode>(), edgeMap: new Map<string, TraceEdge>() };
    return {
      nodeMap: new Map(traceResult.nodes.map((n) => [n.equipmentId, n])),
      edgeMap: new Map(traceResult.edges.map((e) => [e.id, e])),
    };
  }, [traceResult]);

  const displayItems = useMemo(() => {
    if (!traceResult || segments.length === 0) return [];
    const steps = resolveSegment(segments[0].nodes, nodeMap, edgeMap);
    return buildDisplayItems(steps, traceResult.edges, nodeMap);
  }, [traceResult, segments, nodeMap, edgeMap]);

  if (!active || !traceResult || displayItems.length === 0) return null;

  const cableType = traceResult.edges[0]?.cableType ?? '';

  return (
    <div className="border-t border-gray-200 bg-blue-50/50 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-blue-700">경로</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              CABLE_BADGE_CLASSES[cableType] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {cableType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openModal(); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            상세
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearHighlight(); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            닫기
          </button>
        </div>
      </div>

      <div className="max-h-32 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-y-1">
          {displayItems.map((item, i) => (
            <span key={item.key} className="inline-flex items-center">
              {i > 0 && (
                <span className={`mx-1 text-xs ${item.isFiberEdge ? 'text-purple-400' : 'text-gray-300'}`}>
                  {item.isFiberEdge ? '┄' : '→'}
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-xs leading-tight ${
                  item.isEndpoint
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
