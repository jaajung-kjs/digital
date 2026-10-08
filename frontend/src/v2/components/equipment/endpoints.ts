import { endRefKey, fiberLineName, sameEndRef, type LinkEndRef } from '@twin/core';
import { bySubstation, effectiveCircuits, effectiveRows, equipmentName, linesTouching } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';
import { EMPTY } from '../../../components/ui/format';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;
export interface EndpointOption { ref: LinkEndRef; label: string; group: '설비' | '차단기' | '코어'; taken: boolean }

/**
 * 광선로 이름 — 들른 국의 광선로, 없으면 연결 끝이 가리키는 참조 광선로(`refLines`, 상대 국 점퍼가 물린 남의 선로).
 * 이름이 없으면 「A국–B국」, 정말 모르면 「광선로」.
 */
const lineName = (s: S, lineId: string) => {
  const l = effectiveRows(s, 'fiberLines').find((x) => x.id === lineId) ?? s.saved.refLines.find((x) => x.id === lineId);
  return l ? fiberLineName(l.name, l.aSubstationName, l.bSubstationName) : '광선로';
};

/** 끝 이름 — 「분전반 차단기 3」「송광치 AC IN」「북춘천–춘천HP 코어 5」(모델의 회로 = 화면의 차단기). */
export function endLabel(s: S, ref: LinkEndRef): string {
  switch (ref.kind) {
    case 'equipment': return [equipmentName(s, ref.equipmentId) ?? EMPTY, ref.label].filter(Boolean).join(' ');
    case 'circuit': return `${equipmentName(s, ref.equipmentId) ?? EMPTY} 차단기 ${ref.no}`;
    case 'core': return `${lineName(s, ref.lineId)} 코어 ${ref.no}`;
  }
}

/**
 * 이쪽 끝의 짧은 이름 — 설비 이름 없이 「차단기 3」·표기(「AC IN」). 표기 없는 설비 끝은 `null`(건너뛴다).
 * 이쪽 설비는 패널 머리에 이미 있다 — 줄마다 다시 적으면 정작 상대 끝이 밀려난다.
 */
export function nearLabel(ref: LinkEndRef): string | null {
  switch (ref.kind) {
    case 'equipment': return ref.label || null;
    case 'circuit': return `차단기 ${ref.no}`;
    case 'core': return `코어 ${ref.no}`;
  }
}

/** 연결 한 건을 이 설비 쪽에서 읽는다 — `near` 는 이 설비(또는 그 차단기)에 닿은 끝, `far` 는 상대 끝. */
export function sidesOf(l: Link, equipmentId: string): { near: 'a' | 'b'; far: LinkEndRef } {
  const near: 'a' | 'b' = touchesEquipment(l.a, equipmentId) ? 'a' : 'b';
  return { near, far: near === 'a' ? l.b : l.a };
}

const touchesEquipment = (r: LinkEndRef, equipmentId: string) => (r.kind === 'equipment' || r.kind === 'circuit') && r.equipmentId === equipmentId;

/** 이 국에서 고를 수 있는 끝 — 설비, 그 차단기, 이 국 쪽 코어 끝. 이미 쓰인 차단기·코어 끝은 taken. */
export function endpointOptions(s: S, substationId: string): EndpointOption[] {
  const taken = new Set(effectiveRows(s, 'links').flatMap((l) => [l.a, l.b]).filter((r) => r.kind !== 'equipment').map(endRefKey));
  const out: EndpointOption[] = [];
  const eq = bySubstation(effectiveRows(s, 'equipment'), substationId);
  for (const e of eq) out.push({ ref: { kind: 'equipment', equipmentId: e.id }, label: e.name, group: '설비', taken: false });
  for (const e of eq) for (const c of effectiveCircuits(s, e.id)) {
    const ref: LinkEndRef = { kind: 'circuit', equipmentId: e.id, no: c.no };
    out.push({ ref, label: endLabel(s, ref), group: '차단기', taken: taken.has(endRefKey(ref)) });
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

/** 설비와 그 차단기에 닿은 effective 연결. */
export function linksOfEquipment(s: S, equipmentId: string): Link[] {
  return effectiveRows(s, 'links').filter((l) => touchesEquipment(l.a, equipmentId) || touchesEquipment(l.b, equipmentId));
}

/** 차단기 한 줄의 끝 칸 — 연결이 있으면 반대쪽 이름, 없으면 「잇기」. */
export function circuitLink(links: Link[], equipmentId: string, no: number): { link: Link; far: LinkEndRef } | null {
  const ref: LinkEndRef = { kind: 'circuit', equipmentId, no };
  for (const l of links) {
    if (sameEndRef(l.a, ref)) return { link: l, far: l.b };
    if (sameEndRef(l.b, ref)) return { link: l, far: l.a };
  }
  return null;
}
