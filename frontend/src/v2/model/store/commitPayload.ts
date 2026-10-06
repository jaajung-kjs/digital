import {
  circuitKey, coreKey,
  type CircuitPatch, type CommitOps, type CommitPayload, type CorePatch, type LineEndInput, type LinkPatch,
} from '@twin/core';
import type { Overlay } from '../../store/overlay';
import type { Circuit, Core, FiberLine } from '../types';
import { effectiveRows } from './effective';
import type { RowOf, WorkingCopyState } from './workingCopy';

/** 서버가 받는 칸만 고른다 — 읽기 칸(updatedAt·이름 덧붙임·하위 행)은 싣지 않는다. 없는 칸은 싣지 않는다. */
function pick<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) as Pick<T, K>;
}

const FIELDS = {
  floors: { create: ['id', 'substationId', 'name', 'sortOrder'], update: ['name', 'sortOrder', 'backgroundDrawing', 'backgroundOpacity'] },
  racks: { create: ['id', 'substationId', 'name', 'rackTypeId', 'floorId', 'x', 'y', 'width', 'height', 'facing'], update: ['name', 'rackTypeId', 'floorId', 'x', 'y', 'width', 'height', 'facing'] },
  equipment: {
    create: ['id', 'substationId', 'rackId', 'name', 'typeId', 'status', 'model', 'maker', 'madeOn', 'serial', 'installDate', 'manager', 'note', 'circuitCount', 'panelCount'],
    update: ['rackId', 'name', 'typeId', 'status', 'model', 'maker', 'madeOn', 'serial', 'installDate', 'manager', 'note', 'circuitCount', 'panelCount'],
  },
  coreMeasurements: {
    create: ['id', 'lineId', 'coreNo', 'measuredOn', 'side', 'loss1310', 'dist1310', 'loss1550', 'dist1550', 'measuredBy'],
    update: ['measuredOn', 'side', 'loss1310', 'dist1310', 'loss1550', 'dist1550', 'measuredBy'],
  },
} as const satisfies { [K in 'floors' | 'racks' | 'equipment' | 'coreMeasurements']: { create: readonly (keyof RowOf[K])[]; update: readonly (keyof RowOf[K])[] } };
type RecordKind = 'maintenance' | 'inspections' | 'photos';
const LINK_FIELDS = ['cableTypeId', 'lengthM', 'spec', 'note', 'pathPoints'] as const;
const LINE_FIELDS = ['cableTypeId', 'coreCount', 'name', 'lengthKm', 'segments'] as const;
const CIRCUIT_FIELDS = ['label', 'current', 'voltage', 'capacity', 'phase', 'switch', 'purpose'] as const satisfies readonly (keyof Circuit & keyof CircuitPatch)[];
const CORE_FIELDS = ['status', 'role', 'purpose', 'note'] as const satisfies readonly (keyof Core & keyof CorePatch)[];

function ops<T, C, P extends object>(o: Overlay<T>, toCreate: (r: T) => C, toPatch: (p: Partial<T>) => P): CommitOps<C, P> | undefined {
  const creates = Object.values(o.creates).map(toCreate);
  const updates = Object.entries(o.updates)
    .map(([id, p]) => ({ id, patch: toPatch(p) }))
    .filter((u) => Object.keys(u.patch).length > 0);
  const out: CommitOps<C, P> = {};
  if (creates.length) out.creates = creates;
  if (updates.length) out.updates = updates;
  if (o.deletes.length) out.deletes = [...o.deletes];
  return Object.keys(out).length ? out : undefined;
}

/** 광선로 한 끝 — 고치기에서는 바뀐 칸만. */
function lineEnd(side: 'a' | 'b', l: Partial<FiberLine>): LineEndInput {
  const end: LineEndInput = {};
  const eq = side === 'a' ? 'aEquipmentId' : 'bEquipmentId';
  const panel = side === 'a' ? 'aPanel' : 'bPanel';
  const start = side === 'a' ? 'aStartNo' : 'bStartNo';
  if (eq in l) end.equipmentId = l[eq];
  if (panel in l) end.panel = l[panel];
  if (start in l) end.startNo = l[start];
  return end;
}

/**
 * 오버레이 → `PUT /commit` 본문. 서버 스키마(backend/src/v2/commit/schema.ts)와 칸 이름이 같다.
 * 지운 설비에 딸린 기록 고치기·지우기는 싣지 않는다(서버가 함께 지운다).
 */
export function buildCommitPayload(s: Pick<WorkingCopyState, 'saved' | 'overlays' | 'baseVersions'>): CommitPayload {
  const o = s.overlays;
  const p: CommitPayload = {};

  /* 살아 있는 설비·광선로의 번호 안쪽만 — 줄였거나 지운 것의 값 고치기는 서버가 거절한다. */
  const eqCount = new Map(effectiveRows(s, 'equipment').map((e) => [e.id, e.circuitCount]));
  const lineCount = new Map(effectiveRows(s, 'fiberLines').map((l) => [l.id, l.coreCount]));
  const lineGone = new Set(o.fiberLines.deletes);

  const floors = ops(o.floors, (r) => pick(r, FIELDS.floors.create), (patch) => pick(patch, FIELDS.floors.update));
  const racks = ops(o.racks, (r) => pick(r, FIELDS.racks.create), (patch) => pick(patch, FIELDS.racks.update));
  const equipment = ops(o.equipment, (r) => pick(r, FIELDS.equipment.create), (patch) => pick(patch, FIELDS.equipment.update));
  if (floors) p.floors = floors;
  if (racks) p.racks = racks;
  if (equipment) p.equipment = equipment;
  /* 지운 광선로의 측정은 서버가 함께 지운다 — 싣지 않는다. */
  const cm = o.coreMeasurements;
  const lineOf = (id: string) => (cm.creates[id] ?? s.saved.coreMeasurements.find((m) => m.id === id))?.lineId;
  const mAlive = (id: string) => { const l = lineOf(id); return !l || !lineGone.has(l); };
  const cmLive: Overlay<RowOf['coreMeasurements']> = {
    creates: Object.fromEntries(Object.entries(cm.creates).filter(([id]) => mAlive(id))), updates: Object.fromEntries(Object.entries(cm.updates).filter(([id]) => mAlive(id))), deletes: cm.deletes.filter(mAlive),
  };
  const cmOps = ops(cmLive,
    (r) => pick(r, FIELDS.coreMeasurements.create), (patch) => pick(patch, FIELDS.coreMeasurements.update));
  if (cmOps) p.coreMeasurements = cmOps;
  const fiberLines = ops(o.fiberLines,
    (l) => ({
      id: l.id, ...pick(l, LINE_FIELDS),
      a: { substationId: l.aSubstationId, ...lineEnd('a', l) },
      b: { substationId: l.bSubstationId, ...lineEnd('b', l) },
    }),
    (patch) => {
      const a = lineEnd('a', patch);
      const b = lineEnd('b', patch);
      return { ...pick(patch, LINE_FIELDS), ...(Object.keys(a).length ? { a } : {}), ...(Object.keys(b).length ? { b } : {}) };
    });
  if (fiberLines) p.fiberLines = fiberLines;
  const links = ops(o.links,
    (l) => ({ id: l.id, substationId: l.substationId, ...pick(l, LINK_FIELDS), a: l.a, b: l.b }),
    (patch) => {
      const out: LinkPatch = pick(patch, LINK_FIELDS);
      /* 끝 대상은 바꾸지 않는다(① 규칙) — 설비 끝의 표기만 aLabel/bLabel 로. */
      if (patch.a?.kind === 'equipment') out.aLabel = patch.a.label ?? null;
      if (patch.b?.kind === 'equipment') out.bLabel = patch.b.label ?? null;
      return out;
    });
  if (links) p.links = links;

  const circuits = Object.entries(o.circuits).map(([k, patch]) => {
    const [, equipmentId, no] = k.split(':');
    return { equipmentId: equipmentId!, no: Number(no), patch: pick(patch, CIRCUIT_FIELDS) };
  }).filter((c) => c.no <= (eqCount.get(c.equipmentId) ?? 0));
  if (circuits.length) p.circuits = { updates: circuits };
  const cores = Object.entries(o.cores).map(([k, patch]) => {
    const [, lineId, no] = k.split(':');
    return { lineId: lineId!, no: Number(no), patch: pick(patch, CORE_FIELDS) };
  }).filter((c) => c.no <= (lineCount.get(c.lineId) ?? 0));
  if (cores.length) p.cores = { updates: cores };

  /* 기록 — 지운 설비의 것은 뺀다. */
  const eqGone = new Set(o.equipment.deletes);
  const ownerOf = (kind: RecordKind, id: string) =>
    (o[kind].creates[id] ?? (s.saved[kind] as { id: string; equipmentId: string }[]).find((r) => r.id === id))?.equipmentId;
  const recordOps = <K extends RecordKind, C extends keyof RowOf[K], U extends keyof RowOf[K]>(kind: K, createKeys: readonly C[], patchKeys: readonly U[]) => {
    const ov = o[kind] as Overlay<RowOf[K]>;
    const alive = (id: string) => { const e = ownerOf(kind, id); return !e || !eqGone.has(e); };
    const out: CommitOps<Pick<RowOf[K], C>, Pick<Partial<RowOf[K]>, U>> = {};
    const creates = Object.entries(ov.creates).filter(([id]) => alive(id)).map(([, r]) => pick(r, createKeys));
    const updates = Object.entries(ov.updates).filter(([id]) => alive(id)).map(([id, patch]) => ({ id, patch: pick(patch, patchKeys) }));
    const deletes = ov.deletes.filter(alive);
    if (creates.length) out.creates = creates;
    if (updates.length) out.updates = updates;
    if (deletes.length) out.deletes = deletes;
    return Object.keys(out).length ? out : undefined;
  };
  const records: NonNullable<CommitPayload['records']> = {};
  const m = recordOps('maintenance', ['id', 'equipmentId', 'occurredAt', 'content', 'action'], ['occurredAt', 'content', 'action']);
  const i = recordOps('inspections', ['id', 'equipmentId', 'inspectedAt', 'content', 'result'], ['inspectedAt', 'content', 'result']);
  const ph = recordOps('photos', ['id', 'equipmentId', 'caption'], ['caption']);
  if (m) records.maintenance = m;
  if (i) records.inspections = i;
  if (ph) records.photos = ph;
  if (Object.keys(records).length) p.records = records;

  /* 기준 버전 — 고치거나 지우는, 이미 저장된 행만. */
  const bv: Record<string, string> = {};
  const want = (key: string) => { if (s.baseVersions[key]) bv[key] = s.baseVersions[key]; };
  for (const k of ['floors', 'racks', 'equipment', 'fiberLines', 'links', 'maintenance', 'inspections', 'photos'] as const) {
    for (const id of Object.keys(o[k].updates)) want(id);
    for (const id of o[k].deletes) want(id);
  }
  for (const id of [...Object.keys(cm.updates), ...cm.deletes]) if (mAlive(id)) want(id);
  for (const c of circuits) want(circuitKey(c.equipmentId, c.no));
  for (const c of cores) want(coreKey(c.lineId, c.no));
  if (Object.keys(bv).length) p.baseVersions = bv;
  return p;
}
