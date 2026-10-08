import { fiberLineName, type OpticalPath, type PathEnd, type PathHop, type Side } from '@twin/core';
import type { NetworkView } from './networkSelectors';
import { EMPTY } from '../../../components/ui/format';

/** 선번장 블록 하나 — 그 국에서 연다. */
export interface BlockAt { substationId: string; lineId: string; side: Side }

/** 사슬이 끊긴 까닭 — 연결 없음 · 데이터 고리 · 범위 데이터가 깊이 상한에서 잘림. */
export type BreakCause = 'open' | 'loop' | 'truncated';
export const BREAK_TEXT: Record<BreakCause, string> = {
  open: '연결이 없습니다',
  loop: '경로가 같은 코어로 되돌아옵니다',
  truncated: '경로가 길어 일부만 불러왔습니다',
};

/** 세로 사슬의 한 줄(현장 표기 순). */
export type ChainStep =
  /** 경로 끝 설비 — `북춘천S/S · RTU 광스위치 · FX-TX:1`. 국 이름을 누르면 그 끝 코어의 블록. */
  | { kind: 'end'; station: string; equipment: string; port: string | null; at: BlockAt }
  /**
   * 광선로 끝 — `OFD · 슬롯 2 · 어댑터 9 · 코어 9`. 국이 바뀌는 자리(광선로를 건너온 쪽)면 국 이름을 앞에 보인다
   * (`showStation`). 국 이름은 늘 싣는다 — 코어 단추의 설명(title)에 쓴다.
   */
  | { kind: 'terminal'; station: string; showStation: boolean; place: string; adapter: number; coreNo: number; at: BlockAt }
  /** 광선로 — `154kV 춘천수력T/L (8.5 km)`. */
  | { kind: 'line'; text: string }
  /** 같은 국 안 코어 ↔ 코어. */
  | { kind: 'patch' }
  /** 사슬이 설비에 닿지 못한 자리 — 그 코어 끝의 블록으로 가는 길과 까닭. */
  | { kind: 'broken'; station: string; coreNo: number; cause: BreakCause; at: BlockAt };

/**
 * 국 이름 줄임 — 현장 회선현황 표기(`북춘천(OFD:9)-춘천HP(OFD:20)-…`, `신춘천-…-구춘천`).
 * 규칙: 끝의 `S/S`(변전소)·`S/Y`(개폐소)는 뗀다(`열병합S/Y` → `열병합`), 그 밖의 끝 약어 `X/Y`(H/P 수력발전소 등)는
 * 빗금만 뗀다(`춘천HP`). 앞의 `(구)`·`(신)` 은 괄호만 뗀다(`구춘천`) — 같은 이름의 두 국을 가르는 말이라 남긴다.
 * 떼고 나서 비면 원래 이름.
 */
export function shortStationName(name: string): string {
  const s = name.trim()
    .replace(/^\((구|신)\)\s*/, '$1')
    .replace(/\s*S\/[SY]$/, '')
    .replace(/([A-Za-z])\/([A-Za-z])$/, '$1$2')
    .trim();
  return s || name;
}

const sideSub = (v: NetworkView, lineId: string, side: Side) => {
  const l = v.line(lineId);
  return l ? (side === 'A' ? l.aSubstationId : l.bSubstationId) : '';
};

/** 광선로 끝의 접속 설비 이름 — 없으면 null. */
function terminalName(v: NetworkView, lineId: string, side: Side): string | null {
  const l = v.line(lineId);
  const eqId = l ? (side === 'A' ? l.aEquipmentId : l.bEquipmentId) : null;
  return eqId ? (v.equipmentName(eqId) ?? EMPTY) : null;
}

/** 어댑터 번호 — 그 끝의 시작 번호 + 코어 − 1(선번장 「어댑터」 열과 같다). */
function adapterNo(v: NetworkView, lineId: string, side: Side, coreNo: number): number {
  const l = v.line(lineId);
  const start = l ? (side === 'A' ? l.aStartNo : l.bStartNo) : 1;
  return start + coreNo - 1;
}

/** 광선로 끝 자리 — 선번장 블록 머리와 같은 꼴 `OFD · 슬롯 2`(접속 설비가 비면 「접속 설비 미지정」). */
export function place(v: NetworkView, lineId: string, side: Side): string {
  const l = v.line(lineId);
  const name = terminalName(v, lineId, side);
  if (!name) return '접속 설비 미지정';
  const panel = l ? (side === 'A' ? l.aPanel : l.bPanel) : null;
  return [name, panel != null ? `슬롯 ${panel}` : null].filter(Boolean).join(' · ');
}

/** 코어 끝 한 자리 — `OFD · 슬롯 2 · 어댑터 33 · 코어 9`. */
function corePlace(v: NetworkView, lineId: string, side: Side, coreNo: number): string {
  return `${place(v, lineId, side)} · 어댑터 ${adapterNo(v, lineId, side, coreNo)} · 코어 ${coreNo}`;
}

function lineText(v: NetworkView, lineId: string): string {
  const l = v.line(lineId);
  if (!l) return EMPTY;
  const name = fiberLineName(l.name, v.substationName(l.aSubstationId), v.substationName(l.bSubstationId));
  return l.lengthKm != null ? `${name} (${l.lengthKm} km)` : name;
}

const at = (v: NetworkView, h: PathHop, side: Side): BlockAt => ({ substationId: sideSub(v, h.lineId, side), lineId: h.lineId, side });

function endStep(v: NetworkView, e: PathEnd, near: BlockAt): ChainStep {
  return { kind: 'end', station: v.substationName(e.substationId), equipment: v.equipmentName(e.equipmentId) ?? EMPTY, port: e.port, at: near };
}

/** 끊긴 끝의 까닭 — 고리면 loop, 그 코어가 깊이 상한에서 멈춘 코어면 truncated, 아니면 연결 없음. */
export function breakCause(v: NetworkView, p: OpticalPath, which: 'start' | 'end'): BreakCause {
  if ((which === 'start' ? p.startCut : p.endCut) === 'loop') return 'loop';
  const h = which === 'start' ? p.hops[0] : p.hops[p.hops.length - 1];
  return h && v.isTruncated(h.lineId, h.coreNo) ? 'truncated' : 'open';
}

/**
 * 경로 → 세로 사슬. 홉마다 「이 국 끝(슬롯·어댑터·코어) → 광선로 → 저 국 끝(국 · 슬롯 · 어댑터 · 코어)」,
 * 홉 사이는 「중계 패치」. 끝이 비면(경로 미완결) 그 자리에 「broken」 — 사슬이 끊긴 코어 끝과 까닭이다.
 */
export function pathSteps(v: NetworkView, p: OpticalPath): ChainStep[] {
  const out: ChainStep[] = [];
  const first = p.hops[0];
  const last = p.hops[p.hops.length - 1];
  if (!first || !last) return out;
  const startAt = at(v, first, first.from);
  if (p.start) out.push(endStep(v, p.start, startAt));
  else out.push({ kind: 'broken', station: v.substationName(startAt.substationId), coreNo: first.coreNo, cause: breakCause(v, p, 'start'), at: startAt });
  p.hops.forEach((h, i) => {
    const near = at(v, h, h.from);
    const far = at(v, h, h.to);
    /* 첫 홉의 이 국 끝은 국 이름이 위(끝 설비 줄)에 이미 있다 — 중계 패치 뒤도 같은 국이다. 끊긴 채 시작하면 국을 보인다. */
    out.push({
      kind: 'terminal', station: v.substationName(near.substationId), showStation: i === 0 && !p.start,
      place: place(v, h.lineId, h.from), adapter: adapterNo(v, h.lineId, h.from, h.coreNo), coreNo: h.coreNo, at: near,
    });
    out.push({ kind: 'line', text: lineText(v, h.lineId) });
    out.push({
      kind: 'terminal', station: v.substationName(far.substationId), showStation: true,
      place: place(v, h.lineId, h.to), adapter: adapterNo(v, h.lineId, h.to, h.coreNo), coreNo: h.coreNo, at: far,
    });
    if (i < p.hops.length - 1) out.push({ kind: 'patch' });
  });
  const endAt = at(v, last, last.to);
  if (p.end) out.push(endStep(v, p.end, endAt));
  else out.push({ kind: 'broken', station: v.substationName(endAt.substationId), coreNo: last.coreNo, cause: breakCause(v, p, 'end'), at: endAt });
  return out;
}

/**
 * 머리 요약 한 줄 — 현장 회선현황 표기(SCADA 「회선현황」 G7 `북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원`).
 * 국은 지나는 차례(홉마다 떠나는 국, 마지막에 닿는 국). 괄호 안은 **떠나는 끝의 접속 설비 : 어댑터 번호**
 * (시작 번호 + 코어 − 1). 경로 여럿(한 회선의 Tx/Rx)을 주면 홉마다 어댑터를 `1·2` 로 함께 적는다 — 같은 방향이어야 한다.
 */
export function pathSummary(v: NetworkView, paths: OpticalPath | readonly OpticalPath[]): string {
  const list: readonly OpticalPath[] = Array.isArray(paths) ? paths : [paths as OpticalPath];
  const p = list[0];
  const last = p?.hops[p.hops.length - 1];
  if (!p || !last) return '';
  const station = (lineId: string, side: Side) => shortStationName(v.substationName(sideSub(v, lineId, side)));
  const parts = p.hops.map((h, i) => {
    const nos = [...new Set(list.flatMap((q) => {
      const x = q.hops[i];
      return x ? [adapterNo(v, x.lineId, x.from, x.coreNo)] : [];
    }))].sort((x, y) => x - y);
    const eq = terminalName(v, h.lineId, h.from);
    return `${station(h.lineId, h.from)}(${eq ? `${eq}:` : ''}${nos.join('·')})`;
  });
  return [...parts, station(last.lineId, last.to)].join('-');
}

/** 창 제목 — `중계경로 — RTU 광스위치 · FX-TX:1`. 시작 설비가 없으면 물은 코어 끝(`OFD · 슬롯 2 · 어댑터 9 · 코어 9`). */
export function pathTitle(v: NetworkView, p: OpticalPath, asked: { lineId: string; coreNo: number; side: Side }): string {
  if (p.start) return `중계경로 — ${[v.equipmentName(p.start.equipmentId) ?? EMPTY, p.start.port].filter(Boolean).join(' · ')}`;
  return `중계경로 — ${corePlace(v, asked.lineId, asked.side, asked.coreNo)}`;
}
