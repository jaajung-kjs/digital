import type { TraceEdge } from '../types';
import type { LayoutNode } from '../utils/layoutEngine';
import { CABLE_COLORS } from '../../../types/connection';

interface TopologyEdgeProps {
  edge: TraceEdge;
  nodeMap: Map<string, LayoutNode>;
  isHighlighted: boolean;
}

export function TopologyEdge({ edge, nodeMap, isHighlighted }: TopologyEdgeProps) {
  const source = nodeMap.get(edge.sourceEquipmentId);
  const target = nodeMap.get(edge.targetEquipmentId);
  if (!source || !target) return null;

  const x1 = source.x + source.width / 2;
  const y1 = source.y + source.height / 2;
  const x2 = target.x + target.width / 2;
  const y2 = target.y + target.height / 2;

  const isFiber = edge.type === 'fiberPath';
  const color = isFiber ? '#8b5cf6' : CABLE_COLORS[edge.cableType ?? ''] ?? '#6b7280';
  const strokeWidth = isHighlighted ? 2.5 : 1.5;
  const opacity = isHighlighted ? 1 : 0.2;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g opacity={opacity}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={isFiber ? '6 3' : undefined}
      />
      {isFiber && (
        <text
          x={midX}
          y={midY - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#7c3aed"
        >
          {edge.fiberPathLabel ?? 'FiberPath'}
          {edge.fiberPortNumber ? ` #${edge.fiberPortNumber}` : ''}
        </text>
      )}
    </g>
  );
}
