import type { DiagramNode } from '../connectionDiagram';

function Chip({ node }: { node: DiagramNode }) {
  const base = 'rounded px-1.5 py-0.5 text-xs leading-tight';
  if (node.kind === 'boundary') return <span className={`${base} border border-dashed border-line bg-surface-2 text-content-muted`}>{node.label}</span>;
  return <span className={`${base} ${node.isSelf ? 'bg-info-bg text-primary font-medium ring-1 ring-primary' : node.isOrigin ? 'bg-info-bg text-primary' : 'bg-surface-2 text-content-muted'}`}>{node.label}</span>;
}
function Sep({ fiber }: { fiber: boolean }) {
  return <span className={`mx-1 text-xs ${fiber ? 'text-purple-400' : 'text-content-faint'}`}>{fiber ? '┄' : '→'}</span>;
}
function Branch({ node }: { node: DiagramNode }) {
  const chain: DiagramNode[] = [node];
  let cur = node;
  while (cur.children.length === 1) { cur = cur.children[0]; chain.push(cur); }
  const branches = cur.children.length > 1 ? cur.children : null;
  return (
    <div className="flex flex-wrap items-start gap-y-1">
      {chain.map((n, i) => {
        const tail = i === chain.length - 1 && branches;
        if (tail) {
          return (
            <span key={`${n.id}-${i}`} className="inline-flex items-start">
              {i > 0 && <Sep fiber={n.edgeFiber} />}
              <span className="flex flex-col gap-1">
                <Chip node={n} />
                <span className="ml-1 flex flex-col gap-1 border-l border-line pl-2">
                  {branches.map((c, j) => (
                    <span key={`${c.id}-${j}`} className="flex items-start">
                      <span className={`mr-1 mt-0.5 text-xs ${c.edgeFiber ? 'text-purple-400' : 'text-content-faint'}`}>↳</span>
                      <Branch node={c} />
                    </span>
                  ))}
                </span>
              </span>
            </span>
          );
        }
        return (
          <span key={`${n.id}-${i}`} className="inline-flex items-center">
            {i > 0 && <Sep fiber={n.edgeFiber} />}
            <Chip node={n} />
          </span>
        );
      })}
    </div>
  );
}

export function DiagramTree({ root }: { root: DiagramNode }) {
  return <Branch node={root} />;
}
