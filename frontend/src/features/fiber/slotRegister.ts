import { traceRemoteEndpoints, type TraceGraph } from '../trace/traceGraph';
import { roleAt, other } from '../cables/cableEndpoint';

export interface SlotCoreRow {
  coreNumber: number;
  cableId: string | null;     // 점유 코어의 OUT 케이블 id (메타 편집 대상)
  occupied: boolean;
  nearAssetId: string | null; // slot 반대편(이 변전소 설비)
  farName: string | null;     // 대국측 설비 이름(trace 투영)
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usageOverride: string | null;
  usage: '사용' | '미사용';
}

interface SlotLike { id: string; name?: string; parentAssetId?: string | null; attributes?: Record<string, unknown> | null }
export interface CableLike {
  id: string; cableType?: string | null;
  sourceAssetId?: string | null; targetAssetId?: string | null;
  sourceRole?: 'IN' | 'OUT' | null; targetRole?: 'IN' | 'OUT' | null;
  number?: number | null; specParams?: Record<string, unknown> | null;
}

export { roleAt, other }; // 공용 유틸 re-export(기존 임포터 호환)
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** 한 OFD-SLOT 의 코어 행(점유 OUT 케이블 + 용량까지 빈 코어). graph 있으면 far 투영. */
export function buildSlotCoreRows(slot: SlotLike, localCables: CableLike[], graph: TraceGraph | null): SlotCoreRow[] {
  const fiber = localCables.filter((c) => c.cableType === 'FIBER' && (c.sourceAssetId === slot.id || c.targetAssetId === slot.id));
  const outs = fiber.filter((c) => roleAt(c, slot.id) === 'OUT');
  const opgw = fiber.find((c) => roleAt(c, slot.id) === 'IN');

  // 용량 우선순위: OPGW 케이블 cores → 슬롯 자체 cores(attributes, OPGW 없는 외부 슬롯) → 최대 점유코어.
  const opgwCores = Number((opgw?.specParams as Record<string, unknown> | undefined)?.cores ?? 0);
  const slotCores = Number((slot.attributes as Record<string, unknown> | undefined)?.cores ?? 0);
  const occupiedNums = [...new Set(outs.map((c) => c.number ?? 0).filter((n) => n > 0))];
  const capacity = Math.max(opgwCores, slotCores, occupiedNums.length ? Math.max(...occupiedNums) : 0);

  const byNum = new Map<number, CableLike>();
  for (const c of outs) if (c.number != null) byNum.set(c.number, c);

  const rows: SlotCoreRow[] = [];
  for (let n = 1; n <= capacity; n++) {
    const c = byNum.get(n);
    if (c) {
      const sp = (c.specParams ?? {}) as Record<string, unknown>;
      const nearAssetId = other(c, slot.id);
      const usageOverride = str(sp.usageOverride);
      const farIds = graph && nearAssetId ? traceRemoteEndpoints(nearAssetId, graph) : [];
      const farName = graph && nearAssetId
        ? (farIds.map((id) => graph.nameById.get(id) ?? id).join(', ') || null)
        : null;
      rows.push({
        coreNumber: n, cableId: c.id, occupied: true,
        nearAssetId, farName,
        purpose: str(sp.purpose), circuitText: str(sp.circuitText),
        spliceType: str(sp.spliceType), usageOverride,
        usage: (usageOverride as '사용' | '미사용' | null) ?? '사용',
      });
    } else {
      rows.push({
        coreNumber: n, cableId: null, occupied: false,
        nearAssetId: null, farName: null,
        purpose: null, circuitText: null, spliceType: null, usageOverride: null,
        usage: '미사용',
      });
    }
  }
  return rows;
}
