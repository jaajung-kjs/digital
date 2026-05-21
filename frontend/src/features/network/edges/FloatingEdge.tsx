/**
 * Floating edge — 노드 중심을 향한 직선이 박스 경계와 만나는 점을 endpoint 로.
 *
 * 박스 사방에 핸들을 4개 두면 React Flow 가 임의로 골라 선이 부자연스럽게 꺾인다.
 * 여기선 노드의 중심과 크기만 보고 경계점을 직접 계산 → 항상 박스 중심을 향한 선.
 *
 * Reference: https://reactflow.dev/examples/edges/floating-edges
 */

import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react';

type InternalNode = ReturnType<typeof useInternalNode>;

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

export function FloatingEdge({ id, source, target, style, label, labelStyle, labelBgStyle, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sp, tp } = floatingEndpoints(sourceNode, targetNode);
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: sp.x,
    sourceY: sp.y,
    targetX: tp.x,
    targetY: tp.y,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
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
    </>
  );
}
