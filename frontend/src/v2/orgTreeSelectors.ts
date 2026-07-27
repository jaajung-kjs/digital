import type { V2OrgTree } from './types';

export type OrgNodeKind = 'hq' | 'branch' | 'substation';
export interface FlatOrgNode { kind: OrgNodeKind; id: string; name: string; depth: number; parentId: string | null }

export function flattenTree(tree: V2OrgTree): FlatOrgNode[] {
  const out: FlatOrgNode[] = [];
  for (const hq of tree.headquarters) {
    out.push({ kind: 'hq', id: hq.id, name: hq.name, depth: 0, parentId: null });
    for (const br of hq.branches) {
      out.push({ kind: 'branch', id: br.id, name: br.name, depth: 1, parentId: hq.id });
      for (const ss of br.substations) {
        out.push({ kind: 'substation', id: ss.id, name: ss.name, depth: 2, parentId: br.id });
      }
    }
  }
  return out;
}
