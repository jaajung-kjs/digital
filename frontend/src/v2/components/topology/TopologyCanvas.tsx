import type { Point, TopoEdge, TopoNode } from '@twin/core';

interface TopologyCanvasProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  litEdgeIds: Set<string>;
  positions: Map<string, Point>;
}

export function TopologyCanvas({ nodes, edges, litEdgeIds, positions }: TopologyCanvasProps) {
  return (
    <div className="relative h-[60vh] overflow-auto">
      <svg className="absolute inset-0 h-full w-full">
        {edges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              className={litEdgeIds.has(e.id) ? 'stroke-primary' : 'stroke-line'}
              strokeWidth={litEdgeIds.has(e.id) ? 3 : 1.5}
            />
          );
        })}
      </svg>
      {nodes.map((node) => {
        const p = positions.get(node.id);
        if (!p) return null;
        return (
          <div key={node.id} className="absolute" style={{ left: p.x, top: p.y }}>
            <div className="text-sm font-medium text-content">{node.name}</div>
            {node.members.map((m) => (
              <div key={m.assetId} className="text-xs text-content-muted">
                {m.assemblyName ? `${m.assemblyName} - ${m.assetName}` : m.assetName}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
