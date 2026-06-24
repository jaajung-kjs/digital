import { roleAt, other } from '../cables/cableEndpoint';

export interface TraceAsset { id: string; connectionKind?: 'distributor' | 'conduit' | null }
export interface TraceCable {
  id: string;
  cableType?: string | null;
  groupId?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  specParams?: Record<string, unknown> | null;
  categoryName?: string | null;
  categoryId?: string | null;
  displayColor?: string | null;
}
export interface TraceResult { nodeIds: string[]; cableIds: string[]; truncated?: boolean }

const MAX = 5000; // 폭주 가드

/**
 * 범용 케이블 추적 — 같은 cableType 으로 물리 연결된 경로(노드/엣지).
 * 노드 connectionKind 로 전이만 분기: passive=전부, distributor=OUT↔IN 수렴,
 * conduit=OUT#K→IN(OPGW, 채널 K)→대국 OUT#K. 방문 엣지로 사이클 안전.
 *
 * 전제조건(precondition):
 * - 시작 노드(startAssetId)는 단말(설비) 등 passive 노드여야 conduit 채널 짝이 끝까지
 *   이어진다. conduit(슬롯) 노드에서 시작하면 OPGW 건너편 출력은 채널 미정이라 도달하지
 *   않는다(설계상 — trace 진입점은 항상 설비).
 * - distributor 자산에 닿는 케이블은 sourceRole/targetRole(IN/OUT)이 채워져야 fan-out
 *   격리가 동작한다. 역할이 없으면 passive처럼 전부 순회(형제 OUT 누수). P4 데이터 생성 시
 *   역할 필수.
 */
export function cableTrace(
  startAssetId: string,
  groupId: string | null,
  assets: TraceAsset[],
  cables: TraceCable[],
): TraceResult {
  const kindOf = new Map(assets.map((a) => [a.id, a.connectionKind ?? null]));
  // 같은 사용자 그룹 케이블만 따라간다(과거 cableType 동질 경로 → 그룹 동질 경로).
  const typed = cables.filter((c) => (c.groupId ?? null) === groupId);
  const at = new Map<string, TraceCable[]>();
  const push = (k: string | null | undefined, c: TraceCable) => {
    if (!k) return;
    const arr = at.get(k);
    if (arr) arr.push(c); else at.set(k, [c]);
  };
  for (const c of typed) { push(c.sourceAssetId, c); push(c.targetAssetId, c); }


  const nodeIds = new Set<string>([startAssetId]);
  const cableIds = new Set<string>();
  const seen = new Set<string>(); // "cableId|towardAssetId"
  const stack: { a: string; via: TraceCable | null; ch: number | null }[] = [
    { a: startAssetId, via: null, ch: null },
  ];
  let guard = 0;

  while (stack.length && guard++ < MAX) {
    const { a, via, ch } = stack.pop()!;
    const kind = kindOf.get(a) ?? null;
    const here = (at.get(a) ?? []).filter((c) => c.id !== via?.id);
    const entryRole = via ? roleAt(via, a) : null;

    let exits: TraceCable[];
    let nextCh: (c: TraceCable) => number | null = () => null;
    if (kind === 'distributor') {
      if (entryRole === 'OUT') exits = here.filter((c) => roleAt(c, a) === 'IN');
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT');
      else exits = here;
    } else if (kind === 'conduit') {
      if (entryRole === 'OUT') { exits = here.filter((c) => roleAt(c, a) === 'IN'); nextCh = () => via!.number ?? null; }
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT' && (c.number ?? null) === ch);
      else exits = here;
    } else {
      exits = here;
    }

    for (const c of exits) {
      const nb = other(c, a);
      if (!nb) continue;
      const key = `${c.id}|${nb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cableIds.add(c.id);
      nodeIds.add(nb);
      stack.push({ a: nb, via: c, ch: nextCh(c) });
    }
  }
  return { nodeIds: [...nodeIds], cableIds: [...cableIds], truncated: guard >= MAX };
}
