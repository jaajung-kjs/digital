import { useMemo } from 'react';
import { usePathHighlightStore } from '../stores/pathHighlightStore';
import { CABLE_BADGE_CLASSES } from '../../../types/connection';
import type { TraceNode, TraceEdge, SegmentNode } from '../types';

/** Resolved segment node with full objects for rendering */
interface ResolvedStep {
  node: TraceNode;
  edge: TraceEdge | null;
}

function getPortForStep(step: ResolvedStep, prevStep: ResolvedStep | null): number | null {
  if (step.edge?.type === 'fiberPath' && step.edge.fiberPortNumber != null) {
    return step.edge.fiberPortNumber;
  }
  if (prevStep?.edge?.type === 'fiberPath' && prevStep.edge.fiberPortNumber != null) {
    return prevStep.edge.fiberPortNumber;
  }
  return null;
}

function NodeChip({ step, prevStep }: { step: ResolvedStep; prevStep: ResolvedStep | null }) {
  const isOfd = step.node.category === 'OFD';
  const port = isOfd ? getPortForStep(step, prevStep) : null;
  const isEndpoint = step.node.isSource || step.node.isTarget;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs leading-tight ${
        isEndpoint
          ? 'bg-blue-100 text-blue-700 font-medium'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {step.node.equipmentName}
      {port != null && (
        <span className="text-purple-500 font-medium">:{port}</span>
      )}
    </span>
  );
}

function EdgeArrow({ edge }: { edge: TraceEdge | null }) {
  const isFiberEdge = edge?.type === 'fiberPath';
  return (
    <span className={`mx-1 text-xs ${isFiberEdge ? 'text-purple-400' : 'text-gray-300'}`}>
      {isFiberEdge ? '~~' : '→'}
    </span>
  );
}

function SegmentLine({ steps }: { steps: ResolvedStep[] }) {
  return (
    <>
      {steps.map((step, i) => {
        const prevStep = i > 0 ? steps[i - 1] : null;
        return (
          <span key={`${step.node.equipmentId}-${i}`} className="inline-flex items-center">
            {i > 0 && <EdgeArrow edge={step.edge} />}
            <NodeChip step={step} prevStep={prevStep} />
          </span>
        );
      })}
    </>
  );
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

export function PathTraceDetail() {
  const active = usePathHighlightStore((s) => s.active);
  const traceResult = usePathHighlightStore((s) => s.traceResult);
  const segments = usePathHighlightStore((s) => s.segments);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const openModal = usePathHighlightStore((s) => s.openModal);

  const { nodeMap, edgeMap } = useMemo(() => {
    if (!traceResult) return { nodeMap: new Map(), edgeMap: new Map() };
    return {
      nodeMap: new Map(traceResult.nodes.map((n) => [n.equipmentId, n])),
      edgeMap: new Map(traceResult.edges.map((e) => [e.id, e])),
    };
  }, [traceResult]);

  if (!active || !traceResult || segments.length === 0) return null;

  const cableType = traceResult.edges[0]?.cableType ?? '';
  const mainSteps = resolveSegment(segments[0].nodes, nodeMap, edgeMap);
  const branches = segments.filter((s) => s.branchPointId !== null);

  return (
    <div className="border-t border-gray-200 bg-blue-50/50 px-3 py-2">
      {/* Header */}
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

      {/* Path */}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {/* Main segment */}
        <div className="flex flex-wrap items-center gap-y-1">
          <SegmentLine steps={mainSteps} />
        </div>

        {/* Branches */}
        {branches.map((branch, bIdx) => {
          const bpName = nodeMap.get(branch.branchPointId!)?.equipmentName ?? '?';
          const branchSteps = resolveSegment(branch.nodes, nodeMap, edgeMap);
          return (
            <div key={bIdx} className="flex flex-wrap items-center gap-y-1 pl-2">
              <span className="text-xs text-gray-400 mr-1">{bpName} ↳</span>
              <SegmentLine steps={branchSteps} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
