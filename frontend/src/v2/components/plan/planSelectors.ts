/**
 * 평면도가 보는 것 — **순수 함수**. 도면에 서는 것은 랙뿐이고, 설비는 그 랙 안에 든다.
 */
import type { LinkEndRef } from '@twin/core';
import type { PlacedRect } from '../../canvas/hitTest';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';
import type { Facing, Rack } from '../../model/types';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

const isPlaced = (r: Rack): r is Rack & { floorId: string; x: number; y: number; width: number; height: number } =>
  r.floorId != null && r.x != null && r.y != null && r.width != null && r.height != null;

/** 그 층에 놓인 랙. */
export function placedRacks(s: S, floorId: string): PlacedRect[] {
  return effectiveRows(s, 'racks')
    .filter(isPlaced)
    .filter((r) => r.floorId === floorId)
    .map((r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, width: r.width, height: r.height, facing: r.facing }));
}

/** 아직 어느 층에도 놓이지 않은 이 국의 랙 — 배치를 기다린다. */
export function unplacedRacks(s: S, substationId: string): Rack[] {
  return bySubstation(effectiveRows(s, 'racks'), substationId).filter((r) => !isPlaced(r));
}

export interface PlanLink {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

/** 끝이 매달린 설비 — 코어 끝은 랙에 있지 않으므로 그리지 않는다. */
const equipmentOf = (end: LinkEndRef): string | null => (end.kind === 'core' ? null : end.equipmentId);

/**
 * 랙 사이 연결선 — 양 끝 설비가 든 랙이 **둘 다 이 층에 있고 서로 다를 때** 랙 중심끼리 긋는다.
 * 같은 두 랙 사이 여러 줄은 묶지 않는다(겹쳐 그린다).
 */
export function planLinks(
  s: S,
  floorId: string,
  mediumOf: (cableTypeId: string | null) => string | null,
  colorOf: (medium: string | null) => string,
): PlanLink[] {
  const centers = new Map(placedRacks(s, floorId).map((r) => [r.id, { x: r.x + r.width / 2, y: r.y + r.height / 2 }]));
  const rackOf = new Map(effectiveRows(s, 'equipment').map((e) => [e.id, e.rackId]));
  const centerOf = (end: LinkEndRef) => {
    const eq = equipmentOf(end);
    const rackId = eq ? rackOf.get(eq) : undefined;
    return rackId ? { rackId, at: centers.get(rackId) } : null;
  };
  const out: PlanLink[] = [];
  for (const l of effectiveRows(s, 'links')) {
    const a = centerOf(l.a);
    const b = centerOf(l.b);
    if (!a?.at || !b?.at || a.rackId === b.rackId) continue;
    out.push({ id: l.id, from: a.at, to: b.at, color: colorOf(mediumOf(l.cableTypeId)) });
  }
  return out;
}

const FACING_CYCLE: readonly Facing[] = ['위', '오른쪽', '아래', '왼쪽'];

/** 정면을 90° 돌린다 — 네 방향만 돈다. 아직 없으면 「아래」(놓는 순간의 기본값). */
export function nextFacing(f: Facing | null): Facing {
  if (f == null) return '아래';
  return FACING_CYCLE[(FACING_CYCLE.indexOf(f) + 1) % FACING_CYCLE.length]!;
}
