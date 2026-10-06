import type { LinkEndRef } from './types.js';
import { endRefKey } from './types.js';
import { rowsForCount } from './rows.js';
import { DEFAULT_CORE_STATUS } from './vocab.js';

/** 선번장 파생 — 국 끝마다 블록 하나, 코어 행은 1..N. 순수 함수(저장 없음). */
export type LineSide = 'A' | 'B';
export interface SheetMeasurement { measuredOn: string | null; loss1310: number | null; dist1310: number | null; loss1550: number | null; dist1550: number | null }
export interface SheetRow {
  no: number;
  jack: number;
  near: LinkEndRef | null;
  nearLinkId: string | null;
  far: LinkEndRef | null;
  farLinkId: string | null;
  status: string; role: string | null; purpose: string | null; note: string | null;
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

interface LineIn {
  id: string; cableTypeId: string; coreCount: number; name: string | null; lengthKm: number | null;
  aSubstationId: string; aEquipmentId: string | null; aPanel: number | null; aStartNo: number;
  bSubstationId: string; bEquipmentId: string | null; bPanel: number | null; bStartNo: number;
}
interface CoreIn { lineId: string; no: number; status: string; role: string | null; purpose: string | null; note: string | null }
interface MeasIn extends SheetMeasurement { lineId: string; coreNo: number; side: LineSide }

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
          lineId: line.id, no, status: DEFAULT_CORE_STATUS as string, role: null, purpose: null, note: null,
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
        let latest: MeasIn | null = null;
        for (const m of ms) {
          if (m.side !== side) continue;
          // 날짜 null 은 가장 오래된 것 — 같은 날짜면 먼저 온 것을 유지.
          if (!latest || (m.measuredOn !== null && (latest.measuredOn === null || m.measuredOn > latest.measuredOn))) latest = m;
        }
        return {
          no: c.no,
          jack: mine.start + c.no - 1,
          near: nearHit?.other ?? null,
          nearLinkId: nearHit?.id ?? null,
          far: farHit?.other ?? null,
          farLinkId: farHit?.id ?? null,
          status: c.status, role: c.role, purpose: c.purpose, note: c.note,
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
  return blocks.sort((x, y) => {
    if ((x.equipmentId === null) !== (y.equipmentId === null)) return x.equipmentId === null ? 1 : -1;
    if (x.equipmentId !== null && y.equipmentId !== null) {
      const e = cmp(equipmentOrder(x.equipmentId), equipmentOrder(y.equipmentId));
      if (e) return e;
      if ((x.panel === null) !== (y.panel === null)) return x.panel === null ? 1 : -1;
      if (x.panel !== null && y.panel !== null && x.panel !== y.panel) return x.panel - y.panel;
      if (x.startNo !== y.startNo) return x.startNo - y.startNo;
      return 0;
    }
    return cmp(x.peerSubstationId, y.peerSubstationId) || cmp(x.lineId, y.lineId);
  });
}
