/**
 * Floating edge — 노드 중심을 향한 직선이 박스 경계와 만나는 점을 endpoint 로.
 *
 * 박스 사방에 핸들을 4개 두면 React Flow 가 임의로 골라 선이 부자연스럽게 꺾인다.
 * 여기선 노드의 *중심* 과 *크기* 만 보고 경계점을 직접 계산 → 항상 박스 중심을 향한 선.
 *
 * Reference: https://reactflow.dev/examples/edges/floating-edges
 */

import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react';

/** 노드 중심점. width/height 가 측정되기 전(undefined)이면 position 만 사용. */
function nodeCenter(node: ReturnType<typeof useInternalNode>) {
  if (!node) return { x: 0, y: 0 };
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  return { x: x + w / 2, y: y + h / 2 };
}

/**
 * 두 노드 중심을 잇는 직선이 from 노드의 경계 (축정렬 사각형) 와 만나는 점.
 * — center → 반대편 노드 방향으로 박스 절반 만큼 나간 지점에서 경계와 만남.
 */
function intersectionPoint(
  from: ReturnType<typeof useInternalNode>,
  to: ReturnType<typeof useInternalNode>,
) {
  if (!from || !to) return { x: 0, y: 0 };
  const c1 = nodeCenter(from);
  const c2 = nodeCenter(to);
  const w = (from.measured?.width ?? 0) / 2;
  const h = (from.measured?.height ?? 0) / 2;
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  if (dx === 0 && dy === 0) return c1;
  // 박스를 unit square 로 정규화한 좌표 — 큰 쪽이 1에 닿는 변에서 만남.
  const scale = Math.min(w / Math.abs(dx || 1e-9), h / Math.abs(dy || 1e-9));
  return { x: c1.x + dx * scale, y: c1.y + dy * scale };
}

export function FloatingEdge({ id, source, target, style, label, labelStyle, labelBgStyle, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sp = intersectionPoint(sourceNode, targetNode);
  const tp = intersectionPoint(targetNode, sourceNode);

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
