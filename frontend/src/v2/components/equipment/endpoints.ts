import { endRefKey, sameEndRef, type LinkEndRef } from '@twin/core';
import { bySubstation, effectiveCircuits, effectiveRows, equipmentName, linesTouching } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;
export interface EndpointOption { ref: LinkEndRef; label: string; group: '설비' | '회로' | '코어'; taken: boolean }

const lineName = (s: S, lineId: string) => {
  const l = effectiveRows(s, 'fiberLines').find((x) => x.id === lineId);
  return l ? (l.name ?? `${l.aSubstationName}–${l.bSubstationName}`) : '선로';
};

/** 끝 이름 — 「분전반 회로 3」「송광치 AC IN」「북춘천–춘천HP 코어 5」. */
export function endLabel(s: S, ref: LinkEndRef): string {
  switch (ref.kind) {
    case 'equipment': return [equipmentName(s, ref.equipmentId) ?? '—', ref.label].filter(Boolean).join(' ');
    case 'circuit': return `${equipmentName(s, ref.equipmentId) ?? '—'} 회로 ${ref.no}`;
    case 'core': return `${lineName(s, ref.lineId)} 코어 ${ref.no}`;
  }
}

/** 이 국에서 고를 수 있는 끝 — 설비, 그 회로, 이 국 쪽 코어 끝. 이미 쓰인 회로·코어 끝은 taken. */
export function endpointOptions(s: S, substationId: string): EndpointOption[] {
  const taken = new Set(effectiveRows(s, 'links').flatMap((l) => [l.a, l.b]).filter((r) => r.kind !== 'equipment').map(endRefKey));
  const out: EndpointOption[] = [];
  const eq = bySubstation(effectiveRows(s, 'equipment'), substationId);
  for (const e of eq) out.push({ ref: { kind: 'equipment', equipmentId: e.id }, label: e.name, group: '설비', taken: false });
  for (const e of eq) for (const c of effectiveCircuits(s, e.id)) {
    const ref: LinkEndRef = { kind: 'circuit', equipmentId: e.id, no: c.no };
    out.push({ ref, label: endLabel(s, ref), group: '회로', taken: taken.has(endRefKey(ref)) });
  }
  for (const l of linesTouching(s, substationId)) {
    const sides = ([['A', l.aSubstationId], ['B', l.bSubstationId]] as const).filter(([, sub]) => sub === substationId);
    for (const [side] of sides) for (let no = 1; no <= l.coreCount; no++) {
      const ref: LinkEndRef = { kind: 'core', lineId: l.id, no, side };
      out.push({ ref, label: endLabel(s, ref), group: '코어', taken: taken.has(endRefKey(ref)) });
    }
  }
  return out;
}

/** 설비와 그 회로에 닿은 effective 연결. */
export function linksOfEquipment(s: S, equipmentId: string): Link[] {
  const touches = (r: LinkEndRef) => (r.kind === 'equipment' || r.kind === 'circuit') && r.equipmentId === equipmentId;
  return effectiveRows(s, 'links').filter((l) => touches(l.a) || touches(l.b));
}

/** 회로 한 줄의 끝 칸 — 연결이 있으면 반대쪽 이름, 없으면 「잇기」. */
export function circuitLink(links: Link[], equipmentId: string, no: number): { link: Link; far: LinkEndRef } | null {
  const ref: LinkEndRef = { kind: 'circuit', equipmentId, no };
  for (const l of links) {
    if (sameEndRef(l.a, ref)) return { link: l, far: l.b };
    if (sameEndRef(l.b, ref)) return { link: l, far: l.a };
  }
  return null;
}
