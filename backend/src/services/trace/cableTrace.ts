import type { AssetRole } from '@prisma/client';

// Inlined helpers (same implementation as frontend/src/features/cables/cableEndpoint.ts)
const roleAt = (c: { sourceAssetId?: string | null; targetAssetId?: string | null; sourceRole?: string | null; targetRole?: string | null }, assetId: string): string | null =>
  (c.sourceAssetId === assetId ? c.sourceRole : c.targetRole) ?? null;

const other = (c: { sourceAssetId?: string | null; targetAssetId?: string | null }, assetId: string): string | null =>
  (c.sourceAssetId === assetId ? c.targetAssetId : c.sourceAssetId) ?? null;

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
 * - 설비(passive) 시작: slot 채널 짝이 코어별로 끝까지 이어진다(코어 정밀 trace).
 * - slot(슬롯) 시작: 특정 코어 미지정(ch=null) → OPGW 건너 대국 슬롯의 *모든* OUT 코어를
 *   포함한다(트렁크/전체-코어 component). 토폴로지가 슬롯 시드로 component 를 받아도 대국
 *   OUT 이 담겨, projectTrace(설비 시드)가 코어별로 좁힐 수 있다.
 * - feeder 자산에 닿는 케이블은 sourceRole/targetRole(IN/OUT)이 채워져야 fan-out
 *   격리가 동작한다. 역할이 없으면 passive처럼 전부 순회(형제 OUT 누수). P4 데이터 생성 시
 *   역할 필수.
 */
export function cableTrace(
  startAssetId: string,
  groupId: string | null,
  assets: TraceAsset[],
  cables: TraceCable[],
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
    if (kind === 'feeder') {
      if (entryRole === 'OUT') exits = here.filter((c) => roleAt(c, a) === 'IN');
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT');
      else exits = here;
    } else if (kind === 'slot') {
      if (entryRole === 'OUT') { exits = here.filter((c) => roleAt(c, a) === 'IN'); nextCh = () => via!.number ?? null; }
      // OPGW(IN)로 들어옴: 채널(ch)이 정해졌으면 같은 코어 OUT 만(코어 누수 방지). ch===null
      // (슬롯에서 시작한 component 트레이스 — 특정 코어 미지정)이면 대국 슬롯의 모든 OUT 코어 포함.
      // 슬롯-시드 component 가 대국 OUT 을 담아야 토폴로지 projectTrace(설비-시드, 코어 정밀)가
      // 코어별로 좁힐 수 있다(전역 피드 없이도 server component 자족).
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT' && (ch === null || (c.number ?? null) === ch));
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
