export interface TraceAsset { id: string; connectionKind?: 'distributor' | 'conduit' | null }
export interface TraceCable {
  id: string;
  cableType?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
}
export interface TraceResult { nodeIds: string[]; cableIds: string[] }

const MAX = 5000; // 폭주 가드

/**
 * 범용 케이블 추적 — 같은 cableType 으로 물리 연결된 경로(노드/엣지).
 * 노드 connectionKind 로 전이만 분기: passive=전부, distributor=OUT↔IN 수렴,
 * conduit=OUT#K→IN(OPGW, 채널 K)→대국 OUT#K. 방문 엣지로 사이클 안전.
 */
export function cableTrace(
  startAssetId: string,
  cableType: string,
  assets: TraceAsset[],
  cables: TraceCable[],
): TraceResult {
  const kindOf = new Map(assets.map((a) => [a.id, a.connectionKind ?? null]));
  const typed = cables.filter((c) => c.cableType === cableType);
  const at = new Map<string, TraceCable[]>();
  const push = (k: string | null | undefined, c: TraceCable) => {
    if (!k) return;
    const arr = at.get(k);
    if (arr) arr.push(c); else at.set(k, [c]);
  };
  for (const c of typed) { push(c.sourceAssetId, c); push(c.targetAssetId, c); }

  const roleAt = (c: TraceCable, a: string) => (c.sourceAssetId === a ? c.sourceRole : c.targetRole) ?? null;
  const other = (c: TraceCable, a: string) => (c.sourceAssetId === a ? c.targetAssetId : c.sourceAssetId) ?? null;

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
  return { nodeIds: [...nodeIds], cableIds: [...cableIds] };
}
