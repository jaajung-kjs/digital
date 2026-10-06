import type { Catalog, NodeEquipmentRow } from '../../model/types';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';

/** 현황 표의 한 줄 — 설비 하나. 랙은 세지 않는다(랙 줄은 랙별 보기에서 따로 그린다). */
export interface StatusRow {
  id: string; substationId: string; substationName: string; rackId: string; rackName: string;
  typeName: string; categoryName: string; name: string; status: string;
  model: string | null; maker: string | null; installDate: string | null; lastInspectedAt: string | null;
}

/** 국 하나의 현황 행 — 워킹카피(저장본 ⊕ 변경안)에서. 설비만. */
export function rowsFromWorkingCopy(
  s: Pick<WorkingCopyState, 'saved' | 'overlays'>,
  substationId: string,
  catalog: Pick<Catalog, 'categories' | 'equipmentTypes'>,
): StatusRow[] {
  const racks = new Map(bySubstation(effectiveRows(s, 'racks'), substationId).map((r) => [r.id, r]));
  const types = new Map(catalog.equipmentTypes.map((t) => [t.id, t]));
  const cats = new Map(catalog.categories.map((c) => [c.id, c]));
  const lastInspected = new Map<string, string>();
  for (const i of effectiveRows(s, 'inspections')) {
    const prev = lastInspected.get(i.equipmentId);
    if (!prev || i.inspectedAt > prev) lastInspected.set(i.equipmentId, i.inspectedAt);
  }
  const substationName = s.saved.substations[substationId]?.name ?? '';
  return bySubstation(effectiveRows(s, 'equipment'), substationId).map((e) => {
    const t = types.get(e.typeId);
    return {
      id: e.id, substationId, substationName, rackId: e.rackId, rackName: racks.get(e.rackId)?.name ?? '—',
      typeName: t?.name ?? '—', categoryName: (t && cats.get(t.categoryId)?.name) ?? '—',
      name: e.name, status: e.status, model: e.model, maker: e.maker,
      installDate: e.installDate, lastInspectedAt: lastInspected.get(e.id) ?? null,
    };
  });
}

/** 본부·지사 범위 — 서버가 준 행을 그대로 옮긴다. */
export function rowsFromNode(rows: NodeEquipmentRow[]): StatusRow[] {
  return rows.map((r) => ({
    id: r.id, substationId: r.substationId, substationName: r.substationName, rackId: r.rackId, rackName: r.rackName,
    typeName: r.typeName, categoryName: r.categoryName, name: r.name, status: r.status,
    model: r.model, maker: r.maker, installDate: r.installDate, lastInspectedAt: r.lastInspectedAt,
  }));
}
