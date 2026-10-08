import type { LinkEndRef } from './types.js';
import { endRefKey } from './types.js';
import { rowsForCount } from './rows.js';
import { DEFAULT_CORE_STATUS, type Side } from './vocab.js';
import { compareName } from './order.js';

/** 선번장 파생 — 국 끝마다 블록 하나, 코어 행은 1..N. 순수 함수(저장 없음). */
export type LineSide = Side;
export interface SheetMeasurement { measuredOn: string | null; loss1310: number | null; dist1310: number | null; loss1550: number | null; dist1550: number | null }
export interface SheetRow {
  no: number;
  jack: number;
  near: LinkEndRef | null;
  nearLinkId: string | null;
  far: LinkEndRef | null;
  farLinkId: string | null;
  status: string; role: string | null;
  /** 이 블록 끝의 용도·비고(끝별 저장). */
  purpose: string | null; note: string | null;
  /** 상대 끝의 용도 — 읽기 참고. */
  peerPurpose: string | null;
  latest: SheetMeasurement | null;
  measurementCount: number;
}
export interface SheetBlock {
  lineId: string;
  side: LineSide;
  equipmentId: string | null;
  panel: number | null; startNo: number;
  peerSubstationId: string;
  peerEquipmentId: string | null; peerPanel: number | null; peerStartNo: number;
  name: string | null; lengthKm: number | null; cableTypeId: string; coreCount: number;
  rows: SheetRow[];
}

/** 측정의 차례를 가리는 칸 — 저장된 측정은 서버가 찍은 `createdAt`, 아직 저장 안 한 측정은 워킹카피가 찍은 `stagedSeq`. */
export interface MeasureOrder {
  measuredOn: string | null;
  /** 서버가 넣은 시각(ISO). 없으면 아직 저장 안 한 측정이다. */
  createdAt?: string | null;
  /** 아직 저장 안 한 측정끼리의 넣은 차례 — 워킹카피가 단조 증가로 찍는다(서버로 보내지 않는다). */
  stagedSeq?: number;
}

/**
 * 측정을 **최근 먼저** — 측정일 내림차순(날짜 없는 것은 맨 뒤 = 가장 오래된 것). 같은 날짜면 **나중에 넣은 것이 먼저**이고,
 * 그 「나중」은 배열 차례가 아니라 데이터로 정한다:
 * 아직 저장 안 한 측정(`createdAt` 없음)이 저장된 어느 것보다 나중이고, 저장된 것끼리는 `createdAt`, 저장 안 한 것끼리는 `stagedSeq`.
 * 선번장의 최근 측정 칸과 측정 이력이 이 한 줄을 함께 쓴다 — 같은 날 다시 잰 값을 넣으면 곧바로, 그리고 저장한 뒤에도 그 값이 「최근」이다.
 */
export function newestFirst<T extends MeasureOrder>(ms: readonly T[]): T[] {
  return [...ms].sort((x, y) => {
    const a = x.measuredOn;
    const b = y.measuredOn;
    if (a !== b) {
      if (a === null) return 1;
      if (b === null) return -1;
      return a < b ? 1 : -1;
    }
    const xs = x.createdAt == null;
    const ys = y.createdAt == null;
    if (xs !== ys) return xs ? -1 : 1;
    if (!xs) return Date.parse(y.createdAt!) - Date.parse(x.createdAt!);
    return (y.stagedSeq ?? 0) - (x.stagedSeq ?? 0);
  });
}

interface LineIn {
  id: string; cableTypeId: string; coreCount: number; name: string | null; lengthKm: number | null;
  aSubstationId: string; aEquipmentId: string | null; aPanel: number | null; aStartNo: number;
  bSubstationId: string; bEquipmentId: string | null; bPanel: number | null; bStartNo: number;
}
interface CoreIn {
  lineId: string; no: number; status: string; role: string | null;
  aPurpose: string | null; aNote: string | null; bPurpose: string | null; bNote: string | null;
}
interface MeasIn extends SheetMeasurement, MeasureOrder { lineId: string; coreNo: number; side: LineSide }

export function lineSheet(input: {
  substationId: string;
  lines: LineIn[];
  cores: CoreIn[];
  measurements: MeasIn[];
  links: { id: string; a: LinkEndRef; b: LinkEndRef }[];
  equipmentOrder: (equipmentId: string) => string;
}): SheetBlock[] {
  const { substationId, lines, cores, measurements, links, equipmentOrder } = input;

  // 코어 끝 키 → 연결(끝마다 최대 하나, 첫 일치).
  const byEnd = new Map<string, { id: string; other: LinkEndRef }>();
  for (const l of links) {
    const ka = endRefKey(l.a);
    const kb = endRefKey(l.b);
    if (!byEnd.has(ka)) byEnd.set(ka, { id: l.id, other: l.b });
    if (!byEnd.has(kb)) byEnd.set(kb, { id: l.id, other: l.a });
  }
  const coresByLine = new Map<string, CoreIn[]>();
  for (const c of cores) {
    const arr = coresByLine.get(c.lineId);
    if (arr) arr.push(c); else coresByLine.set(c.lineId, [c]);
  }
  const measByCore = new Map<string, MeasIn[]>();
  for (const m of measurements) {
    const k = `${m.lineId}:${m.coreNo}`;
    const arr = measByCore.get(k);
    if (arr) arr.push(m); else measByCore.set(k, [m]);
  }

  const blocks: SheetBlock[] = [];
  for (const line of lines) {
    const own = [...(coresByLine.get(line.id) ?? [])].sort((a, b) => a.no - b.no);
    const coreRows: CoreIn[] = own.length > 0
      ? own
      : rowsForCount([], line.coreCount).create.map((no) => ({
          lineId: line.id, no, status: DEFAULT_CORE_STATUS, role: null, aPurpose: null, aNote: null, bPurpose: null, bNote: null,
        }));

    for (const side of ['A', 'B'] as const) {
      const mine = side === 'A'
        ? { sub: line.aSubstationId, eq: line.aEquipmentId, panel: line.aPanel, start: line.aStartNo }
        : { sub: line.bSubstationId, eq: line.bEquipmentId, panel: line.bPanel, start: line.bStartNo };
      if (mine.sub !== substationId) continue;
      const peerSide: LineSide = side === 'A' ? 'B' : 'A';
      const peer = side === 'A'
        ? { sub: line.bSubstationId, eq: line.bEquipmentId, panel: line.bPanel, start: line.bStartNo }
        : { sub: line.aSubstationId, eq: line.aEquipmentId, panel: line.aPanel, start: line.aStartNo };

      const rows: SheetRow[] = coreRows.map((c) => {
        const nearHit = byEnd.get(endRefKey({ kind: 'core', lineId: line.id, no: c.no, side }));
        const farHit = byEnd.get(endRefKey({ kind: 'core', lineId: line.id, no: c.no, side: peerSide }));
        const ms = measByCore.get(`${line.id}:${c.no}`) ?? [];
        const latest = newestFirst(ms.filter((m) => m.side === side))[0] ?? null;
        return {
          no: c.no,
          jack: mine.start + c.no - 1,
          near: nearHit?.other ?? null,
          nearLinkId: nearHit?.id ?? null,
          far: farHit?.other ?? null,
          farLinkId: farHit?.id ?? null,
          status: c.status, role: c.role,
          purpose: side === 'A' ? c.aPurpose : c.bPurpose,
          note: side === 'A' ? c.aNote : c.bNote,
          peerPurpose: side === 'A' ? c.bPurpose : c.aPurpose,
          latest: latest
            ? { measuredOn: latest.measuredOn, loss1310: latest.loss1310, dist1310: latest.dist1310, loss1550: latest.loss1550, dist1550: latest.dist1550 }
            : null,
          measurementCount: ms.length,
        };
      });

      blocks.push({
        lineId: line.id, side,
        equipmentId: mine.eq, panel: mine.panel, startNo: mine.start,
        peerSubstationId: peer.sub, peerEquipmentId: peer.eq, peerPanel: peer.panel, peerStartNo: peer.start,
        name: line.name, lengthKm: line.lengthKm, cableTypeId: line.cableTypeId, coreCount: line.coreCount,
        rows,
      });
    }
  }

  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  /* 사람이 읽는 이름은 **자연 순서**로 — 글자 차례면 OFD10 이 OFD2 앞에 선다. 같은 이름이면 id 로 갈라 묶음이 섞이지 않게. */
  return blocks.sort((x, y) => {
    if ((x.equipmentId === null) !== (y.equipmentId === null)) return x.equipmentId === null ? 1 : -1;
    if (x.equipmentId === null || y.equipmentId === null) {
      return cmp(x.peerSubstationId, y.peerSubstationId) || cmp(x.lineId, y.lineId);
    }
    const e = compareName(equipmentOrder(x.equipmentId), equipmentOrder(y.equipmentId)) || cmp(x.equipmentId, y.equipmentId);
    if (e) return e;
    if ((x.panel === null) !== (y.panel === null)) return x.panel === null ? 1 : -1;
    if (x.panel !== null && y.panel !== null && x.panel !== y.panel) return x.panel - y.panel;
    return x.startNo - y.startNo;
  });
}
