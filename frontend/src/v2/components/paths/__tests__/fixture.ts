import type { LinkEndRef } from '@twin/core';
import type { Network, NetworkLine } from '../../../model/networkApi';
import { emptyOverlays, workingCopyStore as store, type Saved } from '../../../model/store/workingCopy';
import type { Equipment, FiberLine, Link, OrgTree } from '../../../model/types';

/**
 * RTU 예비회선 — 북춘천S/S RTU 광스위치 → 춘천H/P → 화천H/P → 화천S/S → 철원S/S RTU
 * (현장 회선현황 G7 꼴 `북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원` — 이 픽스처는 화천 쪽을 코어 37 로 둔다). 코어는 모두 예비.
 */
export const SUBS: Record<string, string> = { BC: '북춘천S/S', CHP: '춘천H/P', HHP: '화천H/P', HC: '화천S/S', CW: '철원S/S' };

const nl = (id: string, name: string, a: [string, string, number], b: [string, string, number], lengthKm: number | null = null): NetworkLine => ({
  id, name, lengthKm, cableTypeId: 'opgw', coreCount: 48,
  aSubstationId: a[0], aEquipmentId: a[1], aPanel: a[2], aStartNo: 1,
  bSubstationId: b[0], bEquipmentId: b[1], bPanel: b[2], bStartNo: 1,
});
export const LINES: NetworkLine[] = [
  nl('L1', '154kV 춘천수력T/L', ['BC', 'ofd-bc', 2], ['CHP', 'ofd-chp', 3], 8.5),
  nl('L2', '154kV 북춘천-화천HPT/L', ['CHP', 'ofd-chp', 1], ['HHP', 'ofd-hhp', 2]),
  nl('L3', '154kV 화천수력T/L', ['HC', 'ofd-hc', 1], ['HHP', 'ofd-hhp', 2]),
  nl('L4', '154kV 철원-화천T/L', ['CW', 'ofd-cw', 1], ['HC', 'ofd-hc', 2], 35.231),
];
const core = (lineId: string, no: number, side: 'A' | 'B'): LinkEndRef => ({ kind: 'core', lineId, no, side });
export const LINKS: Network['links'] = [
  { id: 'k1', substationId: 'BC', a: { kind: 'equipment', equipmentId: 'rtu-bc', label: 'FX-TX:1' }, b: core('L1', 9, 'A') },
  { id: 'k2', substationId: 'CHP', a: core('L1', 9, 'B'), b: core('L2', 20, 'A') },
  { id: 'k3', substationId: 'HHP', a: core('L2', 20, 'B'), b: core('L3', 1, 'B') },
  { id: 'k4', substationId: 'HC', a: core('L3', 1, 'A'), b: core('L4', 37, 'B') },
  { id: 'k5', substationId: 'CW', a: core('L4', 37, 'A'), b: { kind: 'equipment', equipmentId: 'rtu-cw', label: null } },
];
const EQ: [string, string, string][] = [
  ['rtu-bc', 'RTU 광스위치', 'BC'], ['ofd-bc', 'OFD', 'BC'], ['ofd-chp', 'OFD', 'CHP'], ['ofd-hhp', 'OFD', 'HHP'],
  ['ofd-hc', 'OFD', 'HC'], ['ofd-cw', 'OFD', 'CW'], ['rtu-cw', 'RTU', 'CW'],
];

/** 서버 범위 데이터 — 빼고 싶은 연결 id 를 주면 그것 없이. */
export function serverNetwork(without: string[] = []): Network {
  return {
    substations: Object.entries(SUBS).map(([id, name]) => ({ id, name, inScope: true })),
    lines: LINES,
    cores: LINES.flatMap((l) => [9, 20, 1, 37].map((no) => ({ lineId: l.id, no, status: 'ok' as const, role: 'backup' as const }))),
    links: LINKS.filter((l) => !without.includes(l.id)),
    equipment: EQ.map(([id, name, substationId]) => ({ id, name, substationId, typeName: name })),
    truncated: false,
    truncatedCores: [],
  };
}

export const ORG: OrgTree = {
  headquarters: [{
    id: 'HQ', name: '강원본부', sortOrder: 0,
    branches: [{ id: 'BR', name: '직할', sortOrder: 0, headquartersId: 'HQ', substations: Object.entries(SUBS).map(([id, name], i) => ({ id, name, sortOrder: i, branchId: 'BR', floors: [] })) }],
  }],
};

const eqRow = (id: string, name: string, substationId: string): Equipment => ({
  id, substationId, rackId: 'r', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: 'v',
});
const fiberRow = (l: NetworkLine): FiberLine => ({ ...l, segments: [], aSubstationName: SUBS[l.aSubstationId]!, bSubstationName: SUBS[l.bSubstationId]!, updatedAt: 'v' });
const linkRow = (l: Network['links'][number]): Link => ({ ...l, cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], updatedAt: 'v' });

/**
 * 워킹카피에 국을 「들른」 것처럼 싣는다 — 그 국에 닿은 광선로·그 국 연결·설비를 저장본으로(서버 사본과 같게).
 * `withoutLinks` 는 저장본에서도 뺀다(아직 없는 패치).
 */
export function loadSubstations(ids: string[], withoutLinks: string[] = []): void {
  store.getState().reset();
  const lines = LINES.filter((l) => ids.includes(l.aSubstationId) || ids.includes(l.bSubstationId));
  const saved: Saved = {
    ...store.getState().saved,
    substations: Object.fromEntries(ids.map((id) => [id, { id, name: SUBS[id]! }])),
    equipment: EQ.filter(([, , sid]) => ids.includes(sid)).map(([id, name, sid]) => eqRow(id, name, sid)),
    fiberLines: lines.map(fiberRow),
    cores: lines.flatMap((l) => [9, 20, 1, 37].map((no) => ({
      lineId: l.id, no, status: 'ok' as const, role: 'backup' as const, aPurpose: null, aNote: null, bPurpose: null, bNote: null, updatedAt: 'v',
    }))),
    links: LINKS.filter((l) => ids.includes(l.substationId) && !withoutLinks.includes(l.id)).map(linkRow),
  };
  store.setState({ loaded: ids, saved, overlays: emptyOverlays() });
}

export { linkRow };
