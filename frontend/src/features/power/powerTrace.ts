interface TraceAsset { id: string; connectionKind?: string | null }
interface TraceCable {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
}
export interface PowerTraceNode { assetId: string; cableId: string | null }

const MAX_DEPTH = 50;

/**
 * 전원 상류 추적 — distributor 자산을 IN 케이블 따라 거슬러 올라간다.
 *  - distributor 면: 그 자산 쪽 역할이 'IN' 인 케이블(= 들어오는 공급)로만 상류.
 *  - 아니면(부하 등): 닿은 케이블 상대편으로.
 *  - 다음이 또 distributor 면 반복. 입력 케이블 없는 distributor(=발전원)에서 종료.
 *  방문 집합으로 사이클 차단.
 */
export function tracePowerUpstream(
  startAssetId: string,
  cables: TraceCable[],
  assets: TraceAsset[],
): PowerTraceNode[] {
  const kindOf = new Map(assets.map((a) => [a.id, a.connectionKind ?? null]));
  const path: PowerTraceNode[] = [{ assetId: startAssetId, cableId: null }];
  const visited = new Set<string>([startAssetId]);
  let current = startAssetId;
  let depth = 0;

  while (depth++ < MAX_DEPTH) {
    const isDist = kindOf.get(current) === 'distributor';
    let next: { assetId: string; cableId: string } | null = null;
    for (const c of cables) {
      const isSource = c.sourceAssetId === current;
      const isTarget = c.targetAssetId === current;
      if (!isSource && !isTarget) continue;
      if (isDist) {
        const myRole = isSource ? c.sourceRole : c.targetRole;
        if (myRole !== 'IN') continue;
      }
      const other = isSource ? c.targetAssetId : c.sourceAssetId;
      if (!other || visited.has(other)) continue;
      next = { assetId: other, cableId: c.id };
      break;
    }
    if (!next) break;
    visited.add(next.assetId);
    path.push(next);
    current = next.assetId;
  }
  return path;
}
