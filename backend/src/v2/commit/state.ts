import type { LinkEndRef, ModelState, Side } from '@twin/core';
import { Prisma } from '../../generated/next-client/index.js';

type Tx = Prisma.TransactionClient;

type EndRow = {
  end: string; equipmentId: string | null; label: string | null;
  circuitEquipmentId: string | null; circuitNo: number | null;
  coreLineId: string | null; coreNo: number | null; coreSide: string | null;
};

/** DB 의 끝 행 → core 의 끝 참조. CHECK 제약이 「정확히 하나」를 보장한다. */
export function endRefOf(e: EndRow): LinkEndRef {
  if (e.equipmentId) return { kind: 'equipment', equipmentId: e.equipmentId, label: e.label };
  if (e.circuitEquipmentId && e.circuitNo !== null) return { kind: 'circuit', equipmentId: e.circuitEquipmentId, no: e.circuitNo };
  return { kind: 'core', lineId: e.coreLineId!, no: e.coreNo!, side: e.coreSide as Side };
}

/**
 * 건드린 국들의 **최종 상태** — `validateState` 의 입력.
 *
 * 국 안의 랙·설비·연결은 전부, 광선로는 그 국에 닿은 것 전부. 광선로의 다른 끝 단자 설비가
 * 건드리지 않은 국에 있으면 그 설비 행도 싣는다 — 안 실으면 「없는 설비」로 잘못 판정된다.
 */
export async function loadState(tx: Tx, substationIds: readonly string[]): Promise<ModelState> {
  const subs = [...substationIds];
  const [racks, equipment, links, fiberLines, cableTypes] = await Promise.all([
    tx.rack.findMany({ where: { substationId: { in: subs } }, select: { id: true, substationId: true, name: true } }),
    tx.equipment.findMany({ where: { substationId: { in: subs } }, select: { id: true, substationId: true, rackId: true, name: true, circuitCount: true, panelCount: true } }),
    tx.link.findMany({ where: { substationId: { in: subs } }, include: { ends: true } }),
    tx.fiberLine.findMany({
      where: { OR: [{ aSubstationId: { in: subs } }, { bSubstationId: { in: subs } }] },
      select: {
        id: true, cableTypeId: true, coreCount: true,
        aSubstationId: true, aEquipmentId: true, aPanel: true, aStartNo: true,
        bSubstationId: true, bEquipmentId: true, bPanel: true, bStartNo: true,
      },
    }),
    tx.cableType.findMany({ select: { id: true, medium: true } }),
  ]);
  const known = new Set(equipment.map((e) => e.id));
  const farIds = fiberLines.flatMap((l) => [l.aEquipmentId, l.bEquipmentId]).filter((x): x is string => !!x && !known.has(x));
  const far = farIds.length
    ? await tx.equipment.findMany({ where: { id: { in: farIds } }, select: { id: true, substationId: true, rackId: true, name: true, circuitCount: true, panelCount: true } })
    : [];
  /* 먼 설비의 랙도 싣는다 — 안 실으면 「랙이 없는 설비」로 잘못 판정된다. */
  const farRacks = far.length
    ? await tx.rack.findMany({ where: { id: { in: far.map((e) => e.rackId) } }, select: { id: true, substationId: true, name: true } })
    : [];
  return {
    racks: [...racks, ...farRacks],
    /* 다른 국의 설비는 이름 겹침 판정에 섞이지 않는다 — 국이 다르면 이름이 같아도 된다. */
    equipment: [...equipment, ...far],
    fiberLines,
    links: links.map((l) => {
      const a = l.ends.find((e) => e.end === 'A')!;
      const b = l.ends.find((e) => e.end === 'B')!;
      return { id: l.id, substationId: l.substationId, cableTypeId: l.cableTypeId, a: endRefOf(a), b: endRefOf(b) };
    }),
    cableTypes,
  };
}
