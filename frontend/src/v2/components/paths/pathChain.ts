import type { OpticalPath, PathEnd, PathHop, Side } from '@twin/core';
import type { NetworkView } from './networkSelectors';

/** 선번장 블록 하나 — 그 국에서 연다. */
export interface BlockAt { substationId: string; lineId: string; side: Side }

/** 세로 사슬의 한 줄(현장 표기 순). */
export type ChainStep =
  /** 경로 끝 설비 — `북춘천S/S · RTU 광스위치 · FX-TX:1`. 국 이름을 누르면 그 끝 코어의 블록. */
  | { kind: 'end'; station: string; equipment: string; port: string | null; at: BlockAt }
  /** 광선로 끝(접속 설비 · 슬롯 · 코어) — 국이 바뀌는 자리(광선로를 건너온 쪽)면 국 이름도. */
  | { kind: 'terminal'; station: string | null; place: string; coreNo: number; at: BlockAt }
  /** 광선로 — `154kV 춘천수력T/L (8.5 km)`. */
  | { kind: 'line'; text: string }
  /** 같은 국 안 코어 ↔ 코어. */
  | { kind: 'patch' }
  /** 사슬이 설비에 닿지 못한 자리 — 그 코어 끝의 블록으로 가는 길. */
  | { kind: 'broken'; station: string; coreNo: number; at: BlockAt };

/**
 * 국 이름 줄임 — 현장 회선현황 표기(`북춘천-(9)-춘천HP`).
 * 규칙: 끝의 `S/S`(변전소)는 뗀다, 그 밖의 끝 약어 `X/Y`(H/P 수력발전소·S/Y 개폐소)는 빗금만 뗀다(`춘천HP`, `열병합SY`).
 * 앞의 `(구)`·`(신)` 은 둔다 — 같은 이름의 두 국을 가르는 말이다. 떼고 나서 비면 원래 이름.
 */
export function shortStationName(name: string): string {
  const s = name.trim().replace(/\s*S\/S$/, '').replace(/([A-Za-z])\/([A-Za-z])$/, '$1$2').trim();
  return s || name;
}

const sideSub = (v: NetworkView, lineId: string, side: Side) => {
  const l = v.line(lineId);
  return l ? (side === 'A' ? l.aSubstationId : l.bSubstationId) : '';
};

/** 광선로 끝 자리 — `OFD 슬롯 2`(접속 설비가 비면 「접속 설비 미지정」). */
function place(v: NetworkView, lineId: string, side: Side): string {
  const l = v.line(lineId);
  const eqId = l ? (side === 'A' ? l.aEquipmentId : l.bEquipmentId) : null;
  const panel = l ? (side === 'A' ? l.aPanel : l.bPanel) : null;
  if (!eqId) return '접속 설비 미지정';
  return [v.equipmentName(eqId) ?? '—', panel != null ? `슬롯 ${panel}` : null].filter(Boolean).join(' ');
}

function lineText(v: NetworkView, lineId: string): string {
  const l = v.line(lineId);
  if (!l) return '—';
  const name = l.name ?? `${v.substationName(l.aSubstationId)} ↔ ${v.substationName(l.bSubstationId)}`;
  return l.lengthKm != null ? `${name} (${l.lengthKm} km)` : name;
}

const at = (v: NetworkView, h: PathHop, side: Side): BlockAt => ({ substationId: sideSub(v, h.lineId, side), lineId: h.lineId, side });

function endStep(v: NetworkView, e: PathEnd, near: BlockAt): ChainStep {
  return { kind: 'end', station: v.substationName(e.substationId), equipment: v.equipmentName(e.equipmentId) ?? '—', port: e.port, at: near };
}

/**
 * 경로 → 세로 사슬. 홉마다 「이 국 끝(슬롯·코어) → 광선로 → 저 국 끝(국 · 슬롯 · 코어)」, 홉 사이는 「중계 패치」.
 * 끝이 비면(경로 미완결) 그 자리에 「broken」 — 사슬이 끊긴 코어 끝이다.
 */
export function pathSteps(v: NetworkView, p: OpticalPath): ChainStep[] {
  const out: ChainStep[] = [];
  const first = p.hops[0];
  const last = p.hops[p.hops.length - 1];
  if (!first || !last) return out;
  const startAt = at(v, first, first.from);
  if (p.start) out.push(endStep(v, p.start, startAt));
  else out.push({ kind: 'broken', station: v.substationName(startAt.substationId), coreNo: first.coreNo, at: startAt });
  p.hops.forEach((h, i) => {
    const near = at(v, h, h.from);
    const far = at(v, h, h.to);
    /* 첫 홉의 이 국 끝은 국 이름이 위(끝 설비 줄)에 이미 있다 — 중계 패치 뒤도 같은 국이다. 끊긴 채 시작하면 국을 적는다. */
    out.push({ kind: 'terminal', station: i === 0 && !p.start ? v.substationName(near.substationId) : null, place: place(v, h.lineId, h.from), coreNo: h.coreNo, at: near });
    out.push({ kind: 'line', text: lineText(v, h.lineId) });
    out.push({ kind: 'terminal', station: v.substationName(far.substationId), place: place(v, h.lineId, h.to), coreNo: h.coreNo, at: far });
    if (i < p.hops.length - 1) out.push({ kind: 'patch' });
  });
  const endAt = at(v, last, last.to);
  if (p.end) out.push(endStep(v, p.end, endAt));
  else out.push({ kind: 'broken', station: v.substationName(endAt.substationId), coreNo: last.coreNo, at: endAt });
  return out;
}

/**
 * 머리 요약 한 줄 — 현장 회선현황 표기 `북춘천-(9)-춘천HP-(20)-화천HP-(1)-화천-(37)-철원`.
 * 국은 지나는 차례(첫 홉의 출발 국, 그다음 홉마다 도착 국), 괄호 수는 그 홉의 코어 번호.
 */
export function pathSummary(v: NetworkView, p: OpticalPath): string {
  const first = p.hops[0];
  if (!first) return '';
  const name = (lineId: string, side: Side) => shortStationName(v.substationName(sideSub(v, lineId, side)));
  return p.hops.reduce((acc, h) => `${acc}-(${h.coreNo})-${name(h.lineId, h.to)}`, name(first.lineId, first.from));
}

/** 창 제목 — `중계경로 — RTU 광스위치 · FX-TX:1`. 시작 설비가 없으면 물은 코어 끝(`OFD 슬롯 2 · 코어 9`). */
export function pathTitle(v: NetworkView, p: OpticalPath, asked: { lineId: string; coreNo: number; side: Side }): string {
  if (p.start) return `중계경로 — ${[v.equipmentName(p.start.equipmentId) ?? '—', p.start.port].filter(Boolean).join(' · ')}`;
  return `중계경로 — ${place(v, asked.lineId, asked.side)} · 코어 ${asked.coreNo}`;
}
