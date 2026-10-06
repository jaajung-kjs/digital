import type { OrgTree } from './model/types';

export type OrgNodeKind = 'hq' | 'branch' | 'substation';
export interface FlatOrgNode { kind: OrgNodeKind; id: string; name: string; depth: number; parentId: string | null }

export function flattenTree(tree: OrgTree): FlatOrgNode[] {
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

/**
 * 뿌리에서 이 마디까지 — **화면 제목줄이 「어디의 무엇인가」를 말하는 데 쓴다**.
 *
 * 업무 시스템의 머리줄은 이름만 적지 않는다: 「강원본부 › 직할 › (구)춘천S/S」처럼 어디에
 * 속한 것인지가 함께 선다. 조직이 깊어져도 이 함수만 보면 되도록 `parentId` 를 거슬러
 * 오른다 — 층수를 손으로 세지 않는다.
 *
 * 고리가 생긴 자료에서도 멈춘다(본 것은 다시 안 본다) — 화면이 얼어붙는 것보다 낫다.
 */
export function ancestorPath(flat: readonly FlatOrgNode[], id: string | null): FlatOrgNode[] {
  if (id == null) return [];
  const byId = new Map(flat.map((n) => [n.id, n]));
  const out: FlatOrgNode[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId == null ? undefined : byId.get(cur.parentId);
  }
  return out;
}
