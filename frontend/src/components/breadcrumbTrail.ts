export interface TrailNode { id: string; name: string; type: string; parentId: string | null }
export interface TrailItem { id: string; name: string; type: string }

export function buildTrail(
  getNode: (id: string) => TrailNode | undefined,
  nodeId: string | null,
): TrailItem[] {
  const trail: TrailItem[] = [];
  const seen = new Set<string>();
  let cur = nodeId ? getNode(nodeId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift({ id: cur.id, name: cur.name, type: cur.type });
    cur = cur.parentId ? getNode(cur.parentId) : undefined;
  }
  return trail;
}
