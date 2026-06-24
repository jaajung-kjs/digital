import { traceRemoteEndpoints, type TraceGraph } from '../trace/traceGraph';
import { roleAt, other } from '../cables/cableEndpoint';

export interface SlotCoreRow {
  coreNumber: number;
  opgwId: string | null;      // 코어정보(선번장)의 소유자 = OPGW 케이블. 메타 편집 대상. 없으면 경로 미생성.
  occupied: boolean;          // 이 코어에 설비 패치(OUT 케이블) 존재 여부
  nearAssetId: string | null; // 자국 설비(OUT 케이블 반대편)
  farName: string | null;     // 대국 설비 이름(trace 투영)
  // 선번장 측정/점검 필드 — OPGW.specParams.coreMeta[n] 소유(자국·대국 공유). 값 없으면 null.
  loss1310: string | null;
  dist1310: string | null;
  loss1550: string | null;
  dist1550: string | null;
  inspectDate: string | null;
}

interface SlotLike { id: string; name?: string; parentAssetId?: string | null }
export interface CableLike {
  id: string; cableType?: string | null;
  sourceAssetId?: string | null; targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null; targetRole?: 'IN' | 'OUT' | null;
  number?: number | null; specParams?: Record<string, unknown> | null;
}

export { roleAt, other }; // 공용 유틸 re-export(기존 임포터 호환)
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * 한 OFD-SLOT 의 코어 행. **선번(코어정보)은 OPGW 케이블이 소유**(coreMeta) — 자국·대국 슬롯이 같은
 * OPGW 를 공유하므로 같은 정보를 본다. 설비 패치(OUT 케이블)는 연결/토폴로지 전용(메타 미보유).
 * 용량(1..N)도 OPGW.cores 소유 → 경로 생성 즉시 빈 코어가 N개 보이고 메타 편집 가능.
 */
export function buildSlotCoreRows(slot: SlotLike, localCables: CableLike[], graph: TraceGraph | null): SlotCoreRow[] {
  const fiber = localCables.filter((c) => c.sourceAssetId === slot.id || c.targetAssetId === slot.id);
  const outs = fiber.filter((c) => roleAt(c, slot.id) === 'OUT');
  const opgw = fiber.find((c) => roleAt(c, slot.id) === 'IN');

  const opgwSp = (opgw?.specParams ?? {}) as Record<string, unknown>;
  const opgwCores = Number(opgwSp.cores ?? 0);
  const coreMeta = (opgwSp.coreMeta ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const occupiedNums = [...new Set(outs.map((c) => c.number ?? 0).filter((n) => n > 0))];
  const capacity = Math.max(opgwCores, occupiedNums.length ? Math.max(...occupiedNums) : 0);

  const byNum = new Map<number, CableLike>();
  for (const c of outs) if (c.number != null) byNum.set(c.number, c);

  const rows: SlotCoreRow[] = [];
  for (let n = 1; n <= capacity; n++) {
    const c = byNum.get(n); // 설비 패치(연결) — 없으면 빈 코어
    const nearAssetId = c ? other(c, slot.id) : null;
    const farIds = graph && nearAssetId ? traceRemoteEndpoints(nearAssetId, graph) : [];
    const farName = graph && nearAssetId
      ? (farIds.map((id) => graph.nameById.get(id) ?? id).join(', ') || null)
      : null;
    const m = coreMeta[String(n)] ?? {}; // 코어정보 — OPGW 소유(빈 코어도 존재)
    rows.push({
      coreNumber: n, opgwId: opgw?.id ?? null, occupied: !!c,
      nearAssetId, farName,
      loss1310: str(m.loss1310), dist1310: str(m.dist1310),
      loss1550: str(m.loss1550), dist1550: str(m.dist1550),
      inspectDate: str(m.inspectDate),
    });
  }
  return rows;
}
