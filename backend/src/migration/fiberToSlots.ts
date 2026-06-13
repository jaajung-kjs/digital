export interface FiberPathRow { id: string; ofdAId: string; ofdBId: string; portCount?: number }
export interface FiberCableRow { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; fiberPathId?: string | null; fiberPortNumber?: number | null }
export interface FiberCoreRow { fiberPathId: string; coreNumber: number; purpose?: string | null; circuitText?: string | null; spliceType?: string | null; usageOverride?: string | null }
export interface OfdInfo { substationId: string; name: string }

export interface SlotSpec { tempKey: string; parentAssetId: string; substationId: string; name: string }
export interface OpgwSpec { fromSlot: string; toSlot: string }
export interface OutSpec { fromCableId: string; slotKey: string; equipmentAssetId: string; number: number | null; specParams: Record<string, unknown> | null }
export interface MigrationPlan { slots: SlotSpec[]; opgwCables: OpgwSpec[]; outCables: OutSpec[] }

const slotKey = (fpId: string, side: 'A' | 'B') => `slot:${fpId}:${side}`;

/** 광 데이터 → 통일 모델 생성 스펙(결정적, 순수). fiberAdapter 와 같은 변환을 *영속용 스펙*으로. */
export function planFiberMigration(
  fiberPaths: FiberPathRow[],
  fiberCables: FiberCableRow[],
  fiberCores: FiberCoreRow[],
  ofdInfo: Map<string, OfdInfo>,
): MigrationPlan {
  const slots: SlotSpec[] = [];
  const opgwCables: OpgwSpec[] = [];
  const outCables: OutSpec[] = [];
  const byPath = new Map<string, FiberPathRow>();
  const coreOf = new Map<string, FiberCoreRow>();
  for (const fc of fiberCores) coreOf.set(`${fc.fiberPathId}|${fc.coreNumber}`, fc);

  for (const fp of fiberPaths) {
    byPath.set(fp.id, fp);
    const aInfo = ofdInfo.get(fp.ofdAId);
    const bInfo = ofdInfo.get(fp.ofdBId);
    if (!aInfo || !bInfo) continue;
    slots.push({ tempKey: slotKey(fp.id, 'A'), parentAssetId: fp.ofdAId, substationId: aInfo.substationId, name: bInfo.name });
    slots.push({ tempKey: slotKey(fp.id, 'B'), parentAssetId: fp.ofdBId, substationId: bInfo.substationId, name: aInfo.name });
    opgwCables.push({ fromSlot: slotKey(fp.id, 'A'), toSlot: slotKey(fp.id, 'B') });
  }

  for (const c of fiberCables) {
    if (!c.fiberPathId) continue;
    const fp = byPath.get(c.fiberPathId);
    if (!fp) continue;
    if (!ofdInfo.get(fp.ofdAId) || !ofdInfo.get(fp.ofdBId)) continue; // 고아 path 의 케이블도 skip
    let side: 'A' | 'B' | null = null;
    let equip: string | null = null;
    if (c.sourceAssetId === fp.ofdAId) { side = 'A'; equip = c.targetAssetId ?? null; }
    else if (c.targetAssetId === fp.ofdAId) { side = 'A'; equip = c.sourceAssetId ?? null; }
    else if (c.sourceAssetId === fp.ofdBId) { side = 'B'; equip = c.targetAssetId ?? null; }
    else if (c.targetAssetId === fp.ofdBId) { side = 'B'; equip = c.sourceAssetId ?? null; }
    if (!side || !equip) continue;
    const core = c.fiberPortNumber != null ? coreOf.get(`${c.fiberPathId}|${c.fiberPortNumber}`) : undefined;
    const specParams = core
      ? { purpose: core.purpose ?? null, circuitText: core.circuitText ?? null, spliceType: core.spliceType ?? null, usageOverride: core.usageOverride ?? null }
      : null;
    outCables.push({ fromCableId: c.id, slotKey: slotKey(fp.id, side), equipmentAssetId: equip, number: c.fiberPortNumber ?? null, specParams });
  }

  return { slots, opgwCables, outCables };
}
