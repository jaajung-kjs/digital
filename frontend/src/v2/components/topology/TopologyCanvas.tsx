/**
 * TopologyCanvas — **마디는 HTML, 줄만 SVG**.
 *
 * 마디를 SVG 안에 넣으면 글자 줄바꿈·말줄임을 손으로 계산해야 하고, 공용 컴포넌트의 색·
 * 글자 크기가 안 먹는다. 줄은 반대로 HTML 로 그릴 수 없다. 그래서 갈라 놓고, 좌표만 둘이
 * 나눠 쓴다.
 *
 * `@xyflow/react` 는 다시 넣지 않았다. 마디가 수십 개고 조작이 호버뿐이라 쓸 이유가 없다.
 */
import { useMemo } from 'react';
import { cn } from '../../../components/ui/cn';
import type { Point, TopoEdge, TopoNode } from '@twin/core';

/** 마디 상자의 폭·높이 어림 — 줄이 상자 테두리에서 시작하도록 잡아 준다. */
const BOX_W = 180;
const BOX_H = 76;
/** 그림 둘레 여백 — 상자가 판 가장자리에 붙지 않게. */
const PAD = 120;

interface TopologyCanvasProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  litEdgeIds: Set<string>;
  positions: Map<string, Point>;
}

export function TopologyCanvas({ nodes, edges, litEdgeIds, positions }: TopologyCanvasProps) {
  /* 좌표를 판 안으로 옮긴다 — core 는 원점을 가운데 두고 음수도 낸다. */
  const { shift, width, height } = useMemo(() => {
    const pts = [...positions.values()];
    if (pts.length === 0) return { shift: { x: PAD, y: PAD }, width: PAD * 2, height: PAD * 2 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return {
      shift: { x: PAD - minX, y: PAD - minY },
      width: maxX - minX + PAD * 2,
      height: maxY - minY + PAD * 2,
    };
  }, [positions]);

  const at = (id: string): Point | null => {
    const p = positions.get(id);
    return p ? { x: p.x + shift.x, y: p.y + shift.y } : null;
  };

  return (
    <div className="h-[60vh] overflow-auto rounded-md bg-surface-2">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute left-0 top-0" width={width} height={height}>
          {edges.map((e, i) => {
            const a = at(e.source);
            const b = at(e.target);
            if (!a || !b) return null;
            const lit = litEdgeIds.has(e.id);
            /* 같은 두 국을 잇는 줄이 여럿이면(이중화) 나란히 벌려 둘로 보이게 한다. */
            const parallel = edges.filter((o) => sameEnds(o, e));
            const offset = (parallel.indexOf(e) - (parallel.length - 1) / 2) * 14;
            const [p, q] = shifted(edgeAt(a, b), offset);
            return (
              <line
                key={e.id ?? i}
                x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                data-lit={lit}
                strokeWidth={lit ? 3 : 1.5}
                className={lit ? 'stroke-primary' : 'stroke-line'}
              >
                <title>{`${e.sourcePortName} ↔ ${e.targetPortName}`}</title>
              </line>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const p = at(node.id);
          if (!p) return null;
          /* 마디 = 장비 하나. 자리·꾸밈은 다음 태스크(장비 그림)가 다시 그린다 — 여기서는
             바뀐 자료 모양(TopoNode)에 맞춰 컴파일만 되게 최소로 둔다. */
          return (
            <div
              key={node.id}
              data-topo-node={node.id}
              className={cn(
                'absolute rounded-md border bg-surface px-2.5 py-1.5 shadow-sm',
                node.isSeed ? 'border-primary' : 'border-line',
              )}
              style={{ left: 0, top: 0, width: BOX_W, transform: `translate(${p.x - BOX_W / 2}px, ${p.y - BOX_H / 2}px)` }}
            >
              <div className="truncate text-sm font-medium text-content">{node.name}</div>
              <div className="truncate text-xs text-content-muted">
                {node.floorName ? `[${node.floorName}] ` : ''}
                {node.substationName}
                {node.assemblyName ? ` · ${node.assemblyName}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sameEnds = (a: TopoEdge, b: TopoEdge) =>
  (a.source === b.source && a.target === b.target) || (a.source === b.target && a.target === b.source);

/** 줄은 상자 **테두리**에서 시작한다 — 중심에서 그으면 글자를 가로지른다. */
function edgeAt(a: Point, b: Point): [Point, Point] {
  const clip = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return from;
    const tx = dx === 0 ? Infinity : (BOX_W / 2) / Math.abs(dx);
    const ty = dy === 0 ? Infinity : (BOX_H / 2) / Math.abs(dy);
    const t = Math.min(tx, ty);
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  return [clip(a, b), clip(b, a)];
}

/** 줄을 제 방향의 수직으로 `d` 만큼 옮긴다 — 평행 줄을 갈라 놓는 데 쓴다. */
function shifted([p, q]: [Point, Point], d: number): [Point, Point] {
  if (d === 0) return [p, q];
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len * d;
  const ny = (q.x - p.x) / len * d;
  return [{ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }];
}
