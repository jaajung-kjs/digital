import { roleAt, other } from '../cables/cableEndpoint';
import type { AssetRole } from '../../types/asset';

export interface TraceAsset { id: string; role?: AssetRole | null }
export interface TraceCable {
  id: string;
  groupId?: string | null;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  specParams?: Record<string, unknown> | null;
  categoryName?: string | null;
  categoryId?: string | null;
}
export interface TraceResult { nodeIds: string[]; cableIds: string[]; truncated?: boolean }

const MAX = 5000; // 폭주 가드

/**
 * 범용 케이블 추적 — 같은 그룹(groupId)으로 물리 연결된 경로(노드/엣지).
 * 노드 role 로 전이만 분기: passive=전부, feeder=OUT↔IN 수렴,
 * slot=OUT#K→IN(OPGW, 채널 K)→대국 OUT#K. 방문 엣지로 사이클 안전.
 *
 * 전제조건(precondition):
 * - 케이블-시드 모드(seedCable 전달 시): trace.service 가 시드 케이블의 양쪽 끝점을 모두
 *   스택에 올리므로 startAssetId 는 단말 설비일 필요가 없다. 코어 번호 격리(형제 누수 차단)는
 *   번호 인식 passive 규칙이 담당하며, 단말 설비 시작을 전제하지 않는다.
 * - 레거시 노드-시드 모드(seedCable 없이 startAssetId 만 전달 시): 시작 노드가 단말(설비) 등
 *   passive 노드여야 slot 채널 짝이 끝까지 이어진다. slot 에서 시작하면 OPGW 건너편 채널이
 *   미정이라 도달하지 않는다(설계상).
 * - feeder 자산에 닿는 케이블은 sourceRole/targetRole(IN/OUT)이 채워져야 fan-out
 *   격리가 동작한다. 역할이 없으면 passive처럼 전부 순회(형제 OUT 누수). P4 데이터 생성 시
 *   역할 필수.
 */
export function cableTrace(
  startAssetId: string,
  groupId: string | null,
  assets: TraceAsset[],
  cables: TraceCable[],
  seedCable?: TraceCable,
): TraceResult {
  const kindOf = new Map(assets.map((a) => [a.id, a.role ?? null]));
  // 같은 사용자 그룹 케이블만 따라간다(과거 cableType 동질 경로 → 그룹 동질 경로).
  const typed = cables.filter((c) => (c.groupId ?? null) === groupId);
  const at = new Map<string, TraceCable[]>();
  const push = (k: string | null | undefined, c: TraceCable) => {
    if (!k) return;
    const arr = at.get(k);
    if (arr) arr.push(c); else at.set(k, [c]);
  };
  for (const c of typed) { push(c.sourceAssetId, c); push(c.targetAssetId, c); }

  const seedEnds = seedCable
    ? ([seedCable.sourceAssetId, seedCable.targetAssetId].filter(Boolean) as string[])
    : [startAssetId];
  const nodeIds = new Set<string>(seedEnds);
  const cableIds = new Set<string>(seedCable ? [seedCable.id] : []);
  const seen = new Set<string>(seedCable ? seedEnds.map((e) => `${seedCable.id}|${e}`) : []); // "cableId|towardAssetId"
  // 케이블-시드: 양쪽 끝점 모두 스택에 올림(passive-passive 케이블 지원 — 번호 인식 passive 규칙이 형제 코어 누수 차단)
  const stack: { a: string; via: TraceCable | null; ch: number | null }[] = seedCable
    ? seedEnds
        .map((e) => ({ a: e, via: seedCable, ch: seedCable.number ?? null }))
    : [{ a: startAssetId, via: null, ch: null }];
  let guard = 0;

  while (stack.length && guard++ < MAX) {
    const { a, via, ch } = stack.pop()!;
    const kind = kindOf.get(a) ?? null;
    const here = (at.get(a) ?? []).filter((c) => c.id !== via?.id);
    const entryRole = via ? roleAt(via, a) : null;

    let exits: TraceCable[];
    let nextCh: (c: TraceCable) => number | null = () => null;
    if (kind === 'feeder') {
      if (entryRole === 'OUT') exits = here.filter((c) => roleAt(c, a) === 'IN');
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT');
      else exits = here;
    } else if (kind === 'slot') {
      if (entryRole === 'OUT') { exits = here.filter((c) => roleAt(c, a) === 'IN'); nextCh = () => via!.number ?? null; }
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT' && (c.number ?? null) === ch);
      else exits = here;
    } else {
      exits = (via && via.number != null)
        ? here.filter((c) => (c.number ?? null) == null || c.number === via.number)
        : here;
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
