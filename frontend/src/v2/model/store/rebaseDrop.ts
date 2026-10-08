import { expandDeletes, validateState, type DeleteRequest, type LinkEndRef, type ModelIssue, type ModelState, type Side } from '@twin/core';
import { stageDelete, stageUpdate, type Overlay } from '../../store/overlay';
import type { FiberLine } from '../types';
import { effectiveRows, substationName, toModelState } from './effective';
import { ROW_KINDS, emptyOverlays, type Overlays, type RowKind, type Saved } from './rows';

/** 충돌로 버린 손질 하나 — 화면이 이름을 붙여 알린다(키는 `Conflict.key` 와 같은 꼴). */
export interface DroppedEdit {
  key: string;
  kind: RowKind | 'circuits' | 'cores';
  /**
   * conflict = 서버가 충돌로 알린 키 · cascade = 충돌한 **지우기 묶음**에 함께 실려 있던 것(한 묶음은 함께 가고 함께 남는다) ·
   * orphan = 서버에서 사라진 행에 기대던 저장 안 된 손질.
   */
  reason: 'conflict' | 'cascade' | 'orphan';
  /** 버린 손질의 꼴 — `endClear` 는 지운 설비를 가리키던 광선로 끝 비우기. */
  op: 'create' | 'update' | 'delete' | 'endClear';
}

/** 버리고 나면 상태가 맞지 않는다 — 아무것도 버리지 않는다. 어느 국이 막는지와 첫 흠. */
export interface RebaseBlock { stations: string[]; message: string }

export interface DropResult { overlays: Overlays; dropped: DroppedEdit[]; blocked: RebaseBlock | null }

type CableTypes = readonly { id: string; medium: string }[];
type WC = { saved: Saved; overlays: Overlays };
type DelKind = 'racks' | 'equipment' | 'fiberLines' | 'links';
type Clear = { lineId: string; side: Side };

/** 오버레이 없는 저장본만의 모델 — 지우기 묶음을 **지우기 전** 모습으로 다시 펼치는 바탕. */
const plainModel = (saved: Saved, cableTypes: CableTypes): ModelState =>
  toModelState({ saved, overlays: emptyOverlays() }, [...cableTypes]);

const END_FIELDS = { A: ['aEquipmentId', 'aPanel'], B: ['bEquipmentId', 'bPanel'] } as const;

/**
 * 오버레이에 실린 **지우기 묶음** — `deleteRows` 가 한 번에 실은 것(설비·광선로·랙 지우기와 그것이 펼친 연결 지우기·광선로 끝 비우기).
 * 지우기 전 저장본으로 `expandDeletes` 를 다시 돌려 그 펼침 중 오버레이에 실려 있는 것만 묶는다. 같은 행을 나눠 가진 묶음은 하나로 합친다
 * (두 설비에 걸친 연결, 랙과 그 안의 설비).
 */
interface DeleteGroup { req: Required<DeleteRequest>; deletes: { kind: DelKind; id: string }[]; clears: Clear[] }

function deleteGroups(o: Overlays, before: ModelState): DeleteGroup[] {
  const staged = (k: DelKind, id: string) => o[k].deletes.includes(id);
  const clearStaged = ({ lineId, side }: Clear) => {
    const u = o.fiberLines.updates[lineId] as Record<string, unknown> | undefined;
    return !!u && END_FIELDS[side][0] in u && u[END_FIELDS[side][0]] === null;
  };
  const reqs: Required<DeleteRequest>[] = [
    ...o.racks.deletes.map((r) => ({
      racks: [r], fiberLines: [], links: [],
      equipment: before.equipment.filter((e) => e.rackId === r && staged('equipment', e.id)).map((e) => e.id),
    })),
    ...o.equipment.deletes.map((id) => ({ racks: [], equipment: [id], fiberLines: [], links: [] })),
    ...o.fiberLines.deletes.map((id) => ({ racks: [], equipment: [], fiberLines: [id], links: [] })),
  ];
  const groups: DeleteGroup[] = [];
  for (const req of reqs) {
    const plan = expandDeletes(before, req);
    const deletes = [
      ...req.racks.map((id) => ({ kind: 'racks' as const, id })),
      ...plan.equipment.map((id) => ({ kind: 'equipment' as const, id })),
      ...plan.fiberLines.map((id) => ({ kind: 'fiberLines' as const, id })),
      ...plan.links.map((id) => ({ kind: 'links' as const, id })),
    ].filter((d) => staged(d.kind, d.id));
    let g: DeleteGroup = { req, deletes, clears: plan.lineEndClears.filter(clearStaged) };
    const keysOf = (x: DeleteGroup) => new Set([...x.deletes.map((d) => `${d.kind}:${d.id}`), ...x.clears.map((c) => `clear:${c.lineId}:${c.side}`)]);
    const mine = keysOf(g);
    for (let i = groups.length - 1; i >= 0; i--) {
      const other = groups[i]!;
      if (![...keysOf(other)].some((k) => mine.has(k))) continue;
      groups.splice(i, 1);
      g = mergeGroups(g, other);
      for (const k of keysOf(other)) mine.add(k);
    }
    groups.push(g);
  }
  return groups;
}

function mergeGroups(a: DeleteGroup, b: DeleteGroup): DeleteGroup {
  const uniq = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];
  return {
    req: {
      racks: [...new Set([...a.req.racks, ...b.req.racks])], equipment: [...new Set([...a.req.equipment, ...b.req.equipment])],
      fiberLines: [...new Set([...a.req.fiberLines, ...b.req.fiberLines])], links: [],
    },
    deletes: uniq([...a.deletes, ...b.deletes], (d) => `${d.kind}:${d.id}`),
    clears: uniq([...a.clears, ...b.clears], (c) => `${c.lineId}:${c.side}`),
  };
}

/**
 * 묶음이 그대로 저장될 수 없는가 — 묶음의 한 행이라도 충돌했거나, **새 저장본으로 다시 펼친 것이 실린 것보다 크다**
 * (그사이 다른 사람이 그 설비에 연결을 달았다 · 랙에 설비를 넣었다). 줄어든 것(다른 사람이 연결을 먼저 지움)은 그 연결 키가
 * 서버 충돌(deleted)로 오므로 첫 조건이 잡는다.
 */
function groupHit(g: DeleteGroup, keys: ReadonlySet<string>, after: ModelState): boolean {
  if (g.deletes.some((d) => keys.has(d.id)) || g.clears.some((c) => keys.has(c.lineId))) return true;
  const plan = expandDeletes(after, g.req);
  if (plan.blocked.length > 0) return true;
  const links = new Set(g.deletes.filter((d) => d.kind === 'links').map((d) => d.id));
  const clears = new Set(g.clears.map((c) => `${c.lineId}:${c.side}`));
  return plan.links.some((id) => !links.has(id)) || plan.lineEndClears.some((c) => !clears.has(`${c.lineId}:${c.side}`));
}

function mergeIds<T extends { id: string }>(saved: T[], o: Overlay<T>): string[] {
  const gone = new Set(o.deletes);
  return [...saved.map((r) => r.id).filter((id) => !gone.has(id)), ...Object.keys(o.creates)];
}

const issueKey = (i: ModelIssue) => `${i.code}:${[...i.ids].sort().join(',')}`;

/**
 * 충돌(409) 뒤 걷기 — `before`(충돌 난 워킹카피)에서 충돌 키의 손질을 걷고, 새 저장본(`after`)에 맞춘다.
 *
 * 1. **지우기 묶음은 통째로** — 묶음의 한 행이 충돌하거나 새 저장본으로 펼친 것이 달라지면 묶음 전체(설비·광선로·랙 지우기,
 *    그것이 펼친 연결 지우기, 광선로 끝 비우기)를 걷는다. 반만 걷으면 「지우지 않는 설비의 연결만 끊긴」 상태나
 *    「지운 설비를 가리키는 연결」이 남는다.
 * 2. 나머지 충돌 키의 고치기·지우기(차단기·코어 값 포함)를 걷는다.
 * 3. **서버에서 사라진 행에 기대던 저장 안 된 손질**을 걷는다 — 고칠 행이 없는 고치기, 없는 층의 랙·없는 랙의 설비,
 *    없는 끝의 연결·광선로 단자, 없는 설비의 기록·사진, 없는 광선로의 측정, 지워진 국의 행. 걷힌 것이 또 다른 것을 고아로 만들 수 있어 다시 돈다.
 * 4. 남은 고치기 중 새 저장값과 같아진 칸은 접는다(다른 사람이 같은 값을 넣었다 — 변경이 아니다).
 * 5. 결과를 core `validateState` 로 본다 — 새 저장본에 원래 없던 흠이 생기면 **아무것도 버리지 않고** 막힌 국을 돌려준다
 *    (말없이 반쯤 맞은 상태를 남기지 않는다).
 */
export function dropKeys(
  before: WC, keys: ReadonlySet<string>, after: Saved, cableTypes: CableTypes = [], goneStations: ReadonlySet<string> = new Set(),
): DropResult {
  const dropped: DroppedEdit[] = [];
  const push = (d: DroppedEdit) => { if (!dropped.some((x) => x.key === d.key && x.kind === d.kind && x.op === d.op)) dropped.push(d); };
  let o: Overlays = { ...before.overlays };

  /* 1. 지우기 묶음. */
  const afterModel = plainModel(after, cableTypes);
  for (const g of deleteGroups(o, plainModel(before.saved, cableTypes))) {
    if (!groupHit(g, keys, afterModel)) continue;
    for (const d of g.deletes) {
      o = { ...o, [d.kind]: { ...o[d.kind], deletes: o[d.kind].deletes.filter((x) => x !== d.id) } };
      push({ key: d.id, kind: d.kind, reason: keys.has(d.id) ? 'conflict' : 'cascade', op: 'delete' });
    }
    for (const c of g.clears) {
      const u = { ...o.fiberLines.updates[c.lineId] } as Record<string, unknown>;
      for (const f of END_FIELDS[c.side]) if (u[f] === null) delete u[f];
      const { [c.lineId]: _old, ...rest } = o.fiberLines.updates;
      const updates = Object.keys(u).length > 0 ? { ...rest, [c.lineId]: u as Partial<FiberLine> } : rest;
      o = { ...o, fiberLines: { ...o.fiberLines, updates } };
      push({ key: c.lineId, kind: 'fiberLines', reason: keys.has(c.lineId) ? 'conflict' : 'cascade', op: 'endClear' });
    }
  }

  /* 2. 충돌 키. */
  for (const kind of ROW_KINDS) {
    const ov = o[kind] as Overlay<unknown>;
    const upd = Object.keys(ov.updates).filter((id) => keys.has(id));
    const del = ov.deletes.filter((id) => keys.has(id));
    if (upd.length + del.length === 0) continue;
    const updates = Object.fromEntries(Object.entries(ov.updates).filter(([id]) => !keys.has(id)));
    o = { ...o, [kind]: { creates: ov.creates, updates, deletes: ov.deletes.filter((id) => !keys.has(id)) } };
    for (const key of upd) push({ key, kind, reason: 'conflict', op: 'update' });
    for (const key of del) push({ key, kind, reason: 'conflict', op: 'delete' });
  }
  for (const kind of ['circuits', 'cores'] as const) {
    const hit = Object.keys(o[kind]).filter((k) => keys.has(k));
    if (hit.length === 0) continue;
    o = { ...o, [kind]: Object.fromEntries(Object.entries(o[kind]).filter(([k]) => !keys.has(k))) };
    if (kind === 'circuits') o = { ...o, blankCircuits: Object.fromEntries(Object.entries(o.blankCircuits).filter(([k]) => !keys.has(k))) };
    for (const key of hit) push({ key, kind, reason: 'conflict', op: 'update' });
  }

  /* 3. 서버에서 사라진 행에 기대던 손질 — 걷힌 것이 다른 것을 고아로 만들면 다시 돈다. */
  for (let changed = true; changed;) {
    changed = false;
    const alive = (k: 'floors' | 'racks' | 'equipment' | 'fiberLines') => new Set(mergeIds(after[k] as { id: string }[], o[k] as Overlay<{ id: string }>));
    const floors = alive('floors');
    const racks = alive('racks');
    const eq = alive('equipment');
    const lines = alive('fiberLines');
    const endAlive = (ref: LinkEndRef) => (ref.kind === 'core' ? lines.has(ref.lineId) : eq.has(ref.equipmentId));
    /* 광선로 단자는 들른 국의 것만 안다 — 들르지 않은 국의 설비는 판정하지 않는다. */
    const terminalDead = (eqId: string | null | undefined, subId: string) => eqId != null && subId in after.substations && !eq.has(eqId);
    const dropCreate = (kind: RowKind, id: string) => {
      o = { ...o, [kind]: stageDelete(o[kind] as Overlay<unknown>, id) };
      push({ key: id, kind, reason: 'orphan', op: 'create' });
      changed = true;
    };
    const dropUpdate = (kind: RowKind, id: string) => {
      const { [id]: _gone, ...updates } = (o[kind] as Overlay<unknown>).updates;
      o = { ...o, [kind]: { ...o[kind], updates } };
      push({ key: id, kind, reason: 'orphan', op: 'update' });
      changed = true;
    };
    for (const kind of ROW_KINDS) {
      const have = new Set((after[kind] as { id: string }[]).map((r) => r.id));
      for (const id of Object.keys(o[kind].updates)) if (!have.has(id)) dropUpdate(kind, id);
    }
    const inGone = (r: { substationId?: string }) => r.substationId != null && goneStations.has(r.substationId);
    for (const r of Object.values(o.floors.creates)) if (inGone(r)) dropCreate('floors', r.id);
    for (const r of Object.values(o.racks.creates)) if (inGone(r) || (r.floorId != null && !floors.has(r.floorId))) dropCreate('racks', r.id);
    for (const [id, p] of Object.entries(o.racks.updates)) if (p.floorId != null && !floors.has(p.floorId)) dropUpdate('racks', id);
    for (const r of Object.values(o.equipment.creates)) if (inGone(r) || !racks.has(r.rackId)) dropCreate('equipment', r.id);
    for (const [id, p] of Object.entries(o.equipment.updates)) if (p.rackId != null && !racks.has(p.rackId)) dropUpdate('equipment', id);
    for (const r of Object.values(o.links.creates)) if (inGone(r) || !endAlive(r.a) || !endAlive(r.b)) dropCreate('links', r.id);
    for (const [id, p] of Object.entries(o.links.updates)) if ((p.a && !endAlive(p.a)) || (p.b && !endAlive(p.b))) dropUpdate('links', id);
    for (const l of Object.values(o.fiberLines.creates)) {
      if (terminalDead(l.aEquipmentId, l.aSubstationId) || terminalDead(l.bEquipmentId, l.bSubstationId)) dropCreate('fiberLines', l.id);
    }
    for (const [id, p] of Object.entries(o.fiberLines.updates)) {
      const l = after.fiberLines.find((x) => x.id === id);
      if (l && (terminalDead(p.aEquipmentId, l.aSubstationId) || terminalDead(p.bEquipmentId, l.bSubstationId))) dropUpdate('fiberLines', id);
    }
    for (const kind of ['maintenance', 'inspections', 'photos'] as const) {
      for (const r of Object.values(o[kind].creates)) if (!eq.has(r.equipmentId)) dropCreate(kind, r.id);
    }
    for (const m of Object.values(o.coreMeasurements.creates)) if (!lines.has(m.lineId)) dropCreate('coreMeasurements', m.id);
  }

  /* 4. 새 저장값과 같아진 칸은 접는다. */
  for (const kind of ROW_KINDS) {
    const ov = o[kind] as Overlay<{ id: string }>;
    let next = { ...ov, updates: {} } as Overlay<{ id: string }>;
    for (const [id, p] of Object.entries(ov.updates)) next = stageUpdate(next, id, p, (after[kind] as { id: string }[]).find((r) => r.id === id));
    o = { ...o, [kind]: next };
  }

  /* 5. 새 저장본에 원래 없던 흠이 생기면 버리지 않는다. */
  const baseline = new Set(validateState(afterModel).map(issueKey));
  const result = { saved: after, overlays: o };
  const fresh = validateState(toModelState(result, [...cableTypes])).filter((i) => !baseline.has(issueKey(i)));
  if (fresh.length > 0) {
    return { overlays: before.overlays, dropped: [], blocked: { stations: stationsOf(result, fresh), message: fresh[0]!.message } };
  }
  return { overlays: o, dropped, blocked: null };
}

/** 흠이 닿은 국의 이름 — 랙·설비·연결은 그 국, 광선로는 양 끝 국. */
function stationsOf(s: WC, issues: ModelIssue[]): string[] {
  const ids = new Set(issues.flatMap((i) => i.ids));
  const subs = new Set<string>();
  for (const k of ['racks', 'equipment', 'links'] as const) for (const r of effectiveRows(s, k)) if (ids.has(r.id)) subs.add(r.substationId);
  for (const l of effectiveRows(s, 'fiberLines')) if (ids.has(l.id)) { subs.add(l.aSubstationId); subs.add(l.bSubstationId); }
  return [...subs].map((id) => substationName(s, id) ?? id);
}
