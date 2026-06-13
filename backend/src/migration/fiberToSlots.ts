export interface FiberPathRow { id: string; ofdAId: string; ofdBId: string; portCount?: number }
export interface FiberCableRow { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; fiberPathId?: string | null; fiberPortNumber?: number | null }
export interface FiberCoreRow { fiberPathId: string; coreNumber: number; purpose?: string | null; circuitText?: string | null; spliceType?: string | null; usageOverride?: string | null }
export interface OfdInfo { substationId: string; name: string }

export interface MigrationMarker {
  __migration: 'fiberToSlots';
  __fiberPathId: string;
  __side?: 'A' | 'B';
  __fromCableId?: string;
}

export interface SlotSpec {
  tempKey: string;
  parentAssetId: string;
  substationId: string;
  name: string;
  /** merge into asset.attributes */
  attributes: MigrationMarker;
}
export interface OpgwSpec {
  fromSlot: string;
  toSlot: string;
  /** substationId of the A-end OFD */
  substationId: string;
  /** merge into cable.specParams */
  specParams: MigrationMarker;
}
export interface OutSpec {
  fromCableId: string;
  slotKey: string;
  equipmentAssetId: string;
  number: number | null;
  /** fiber-core metadata merged with migration marker */
  specParams: (Record<string, unknown> & MigrationMarker) | MigrationMarker;
}
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

    // A-slot: child of ofdA, named after ofdB (the remote end)
    slots.push({
      tempKey: slotKey(fp.id, 'A'),
      parentAssetId: fp.ofdAId,
      substationId: aInfo.substationId,
      name: bInfo.name,
      attributes: { __migration: 'fiberToSlots', __fiberPathId: fp.id, __side: 'A' },
    });
    // B-slot: child of ofdB, named after ofdA (the remote end)
    slots.push({
      tempKey: slotKey(fp.id, 'B'),
      parentAssetId: fp.ofdBId,
      substationId: bInfo.substationId,
      name: aInfo.name,
      attributes: { __migration: 'fiberToSlots', __fiberPathId: fp.id, __side: 'B' },
    });

    // OPGW cable: A-slot IN → B-slot IN; substationId = A-end OFD's substationId
    opgwCables.push({
      fromSlot: slotKey(fp.id, 'A'),
      toSlot: slotKey(fp.id, 'B'),
      substationId: aInfo.substationId,
      specParams: { __migration: 'fiberToSlots', __fiberPathId: fp.id },
    });
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

    // Fix I3: if the "equipment" end resolves to the OTHER OFD, this is the OFD↔OFD
    // direct cable (handled by OPGW) — skip it to avoid creating a spurious OUT cable.
    const otherOfdId = side === 'A' ? fp.ofdBId : fp.ofdAId;
    if (equip === otherOfdId) continue;

    const core = c.fiberPortNumber != null ? coreOf.get(`${c.fiberPathId}|${c.fiberPortNumber}`) : undefined;
    const marker: MigrationMarker = {
      __migration: 'fiberToSlots',
      __fiberPathId: fp.id,
      __fromCableId: c.id,
    };
    const specParams: Record<string, unknown> & MigrationMarker = core
      ? {
          purpose: core.purpose ?? null,
          circuitText: core.circuitText ?? null,
          spliceType: core.spliceType ?? null,
          usageOverride: core.usageOverride ?? null,
          ...marker,
        }
      : { ...marker };

    outCables.push({
      fromCableId: c.id,
      slotKey: slotKey(fp.id, side),
      equipmentAssetId: equip,
      number: c.fiberPortNumber ?? null,
      specParams,
    });
  }

  return { slots, opgwCables, outCables };
}
