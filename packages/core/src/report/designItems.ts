import type { LaborSpec } from '../catalog/laborSpec.js';
import { assetReportItem, cableReportItem, type ReportItem, type ReportKind, type UnitReportKind } from './computeReport.js';

/**
 * 설계서 산출 내역 — 변경안 **전/후의 최종 차이**에서 줄을 만든다. 순수 함수(저장 없음).
 *
 * - 신설 = 후에만 있는 id, 철거 = 전에만 있는 id. 만들었다 지운 것은 어느 쪽에도 없어 0 줄이다.
 * - 둘 다 있으면 **이설만** 본다 — 랙은 국·층·좌표, 설비는 랙. 그 밖의 값 변경(이름·길이·품목)은
 *   산출하지 않는다(철거+신설로 세지 않는다).
 * - 랙째 옮겨도 안 설비의 `rackId` 는 그대로이므로 설비 이설은 생기지 않는다 — 랙 이설 1건.
 * - 설비 삭제가 펼친 연결 삭제도 후에 없으니 케이블 철거로 잡힌다.
 */

/** 품목(랙·설비·케이블) — 공량·단가 칸은 `LaborSpec` 이 선언한다. */
export interface LaborType extends LaborSpec { id: string; name: string }

export interface DRack { id: string; name: string; substationId: string; rackTypeId: string; floorId: string | null; x: number | null; y: number | null }
export interface DEquipment { id: string; name: string; substationId: string; rackId: string; typeId: string }
/** label = 화면용 「A ↔ B」. */
export interface DLink { id: string; substationId: string; cableTypeId: string | null; lengthM: number | null; label: string }
export interface DLine { id: string; name: string | null; cableTypeId: string; lengthKm: number | null; aSubstationId: string; bSubstationId: string }

interface DesignSide { racks: DRack[]; equipment: DEquipment[]; links: DLink[]; fiberLines: DLine[] }

export interface DesignInput {
  before: DesignSide;
  after: DesignSide;
  rackTypes: LaborType[];
  equipmentTypes: LaborType[];
  cableTypes: LaborType[];
  substationName: (id: string) => string;
}

export type DesignItem = ReportItem & { substationIds: string[] };

/** 품목을 못 찾은 줄 — 지우지 않고 남긴다(공량 0). 대로 세는 것은 1대, 케이블은 길이를 셀 수 없어 0. */
function unresolvedItem(kind: ReportKind, name: string): ReportItem {
  const cable = kind === 'cable-install' || kind === 'cable-remove';
  return {
    kind,
    name,
    typeName: '—',
    laborCode: null,
    qty: cable ? 0 : 1,
    unit: cable ? 'm' : '대',
    manDays: 0,
    unitPrice: null,
    note: '품목 미지정',
  };
}

/** 구분 차례 — 랙 → 설비 → 케이블 → 광선로. */
const GROUP = { rack: 0, equipment: 1, link: 2, line: 3 } as const;
/** 작업 차례 — 신설 → 철거 → 이설. */
const WORK: Record<ReportKind, number> = {
  'rack-install': 0, 'asset-install': 0, 'cable-install': 0,
  'rack-remove': 1, 'asset-remove': 1, 'cable-remove': 1,
  'rack-relocate': 2, 'asset-relocate': 2,
};

/** 이름 자연 순서 — 한 번 만들어 모든 비교가 함께 쓴다. */
const NAME_ORDER = new Intl.Collator('ko', { numeric: true });
const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Row { group: number; id: string; place: string; item: DesignItem }

/** 전/후를 id 로 맞춰 신설·철거·유지 쌍으로 가른다. */
function diff<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const was = new Map(before.map((x) => [x.id, x]));
  const now = new Map(after.map((x) => [x.id, x]));
  return {
    added: after.filter((x) => !was.has(x.id)),
    removed: before.filter((x) => !now.has(x.id)),
    kept: after.flatMap((x) => {
      const prev = was.get(x.id);
      return prev ? [[prev, x] as const] : [];
    }),
  };
}

const uniq = (ids: string[]) => [...new Set(ids)];

export function designItems(input: DesignInput): DesignItem[] {
  const { before, after, substationName } = input;
  const byId = (ts: LaborType[]) => new Map(ts.map((t) => [t.id, t]));
  const rackTypes = byId(input.rackTypes);
  const equipmentTypes = byId(input.equipmentTypes);
  const cableTypes = byId(input.cableTypes);

  const rows: Row[] = [];
  const push = (group: number, id: string, item: ReportItem, substationIds: string[]) => {
    const ids = uniq(substationIds);
    rows.push({ group, id, place: substationName(ids[0]!), item: { ...item, substationIds: ids } });
  };

  const unitItem = (kind: UnitReportKind, name: string, type: LaborType | undefined) =>
    type ? assetReportItem(kind, name, type.name, type, type.unitPrice) : unresolvedItem(kind, name);
  const cableItem = (kind: 'cable-install' | 'cable-remove', name: string, typeId: string | null, lengthM: number | null) => {
    const type = typeId === null ? undefined : cableTypes.get(typeId);
    return type ? cableReportItem(kind, name, type, lengthM) : unresolvedItem(kind, name);
  };

  /* 랙 */
  const racks = diff(before.racks, after.racks);
  for (const r of racks.added) push(GROUP.rack, r.id, unitItem('rack-install', r.name, rackTypes.get(r.rackTypeId)), [r.substationId]);
  for (const r of racks.removed) push(GROUP.rack, r.id, unitItem('rack-remove', r.name, rackTypes.get(r.rackTypeId)), [r.substationId]);
  for (const [p, r] of racks.kept) {
    const moved = p.substationId !== r.substationId || p.floorId !== r.floorId || p.x !== r.x || p.y !== r.y;
    if (moved) push(GROUP.rack, r.id, unitItem('rack-relocate', r.name, rackTypes.get(r.rackTypeId)), [p.substationId, r.substationId]);
  }

  /* 설비 */
  const eqs = diff(before.equipment, after.equipment);
  for (const e of eqs.added) push(GROUP.equipment, e.id, unitItem('asset-install', e.name, equipmentTypes.get(e.typeId)), [e.substationId]);
  for (const e of eqs.removed) push(GROUP.equipment, e.id, unitItem('asset-remove', e.name, equipmentTypes.get(e.typeId)), [e.substationId]);
  for (const [p, e] of eqs.kept) {
    if (p.rackId !== e.rackId) push(GROUP.equipment, e.id, unitItem('asset-relocate', e.name, equipmentTypes.get(e.typeId)), [p.substationId, e.substationId]);
  }

  /* 연결(케이블) — 값만 바뀐 것은 세지 않는다. */
  const links = diff(before.links, after.links);
  for (const l of links.added) push(GROUP.link, l.id, cableItem('cable-install', l.label, l.cableTypeId, l.lengthM), [l.substationId]);
  for (const l of links.removed) push(GROUP.link, l.id, cableItem('cable-remove', l.label, l.cableTypeId, l.lengthM), [l.substationId]);

  /* 광선로 — 두 국에 걸친다. 길이 = 긍장 km × 1000. */
  const lineName = (l: DLine) => l.name ?? `${substationName(l.aSubstationId)}–${substationName(l.bSubstationId)}`;
  const lineM = (l: DLine) => (l.lengthKm === null ? null : l.lengthKm * 1000);
  const lines = diff(before.fiberLines, after.fiberLines);
  for (const l of lines.added) push(GROUP.line, l.id, cableItem('cable-install', lineName(l), l.cableTypeId, lineM(l)), [l.aSubstationId, l.bSubstationId]);
  for (const l of lines.removed) push(GROUP.line, l.id, cableItem('cable-remove', lineName(l), l.cableTypeId, lineM(l)), [l.aSubstationId, l.bSubstationId]);

  return rows
    .sort((x, y) =>
      x.group - y.group
      || WORK[x.item.kind] - WORK[y.item.kind]
      || NAME_ORDER.compare(x.place, y.place)
      || NAME_ORDER.compare(x.item.name, y.item.name)
      || cmpId(x.id, y.id))
    .map((r) => r.item);
}
