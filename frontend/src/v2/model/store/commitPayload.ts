import { circuitKey, coreKey } from '@twin/core';
import type { Overlay } from '../../store/overlay';
import { effectiveRows } from './effective';
import type { CommitPayload } from '../types';
import type { RowOf, WorkingCopyState } from './workingCopy';

/** 서버가 받는 칸만 고른다 — 읽기 칸(updatedAt·이름 덧붙임·하위 행)은 싣지 않는다. */
function pick<T extends object>(o: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));
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
} as const;
const LINK_FIELDS = ['cableTypeId', 'lengthM', 'spec', 'note', 'pathPoints'] as const;
const LINE_FIELDS = ['cableTypeId', 'coreCount', 'name', 'lengthKm', 'segments'] as const;

function ops<T>(o: Overlay<T>, toCreate: (r: T) => unknown, toPatch: (p: Partial<T>) => Record<string, unknown>) {
  const creates = Object.values(o.creates).map(toCreate);
  const updates = Object.entries(o.updates)
    .map(([id, p]) => ({ id, patch: toPatch(p as Partial<T>) }))
    .filter((u) => Object.keys(u.patch).length > 0);
  const out: Record<string, unknown> = {};
  if (creates.length) out.creates = creates;
  if (updates.length) out.updates = updates;
  if (o.deletes.length) out.deletes = [...o.deletes];
  return Object.keys(out).length ? out : undefined;
}

const lineEnd = (side: 'a' | 'b', l: Record<string, unknown>, withSubstation: boolean) => {
  const end: Record<string, unknown> = {};
  if (withSubstation) end.substationId = l[`${side}SubstationId`];
  for (const [k, f] of [['equipmentId', `${side}EquipmentId`], ['panel', `${side}Panel`], ['startNo', `${side}StartNo`]] as const) {
    if (f in l) end[k] = l[f];
  }
  return end;
};

/**
 * 오버레이 → `PUT /commit` 본문. 서버 스키마(backend/src/v2/commit/schema.ts)와 칸 이름이 같다.
 * 지운 설비에 딸린 기록 고치기·지우기는 싣지 않는다(서버가 함께 지운다).
 */
export function buildCommitPayload(s: Pick<WorkingCopyState, 'saved' | 'overlays' | 'baseVersions'>): CommitPayload {
  const o = s.overlays;
  const p: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined) p[k] = v; };

  /* 살아 있는 설비·광선로의 번호 안쪽만 — 줄였거나 지운 것의 값 고치기는 서버가 거절한다. */
  const eqCount = new Map(effectiveRows(s, 'equipment').map((e) => [e.id, e.circuitCount]));
  const lineCount = new Map(effectiveRows(s, 'fiberLines').map((l) => [l.id, l.coreCount]));
  const lineGone = new Set(o.fiberLines.deletes);

  for (const k of ['floors', 'racks', 'equipment'] as const) {
    put(k, ops(o[k] as Overlay<RowOf[typeof k]>, (r) => pick(r, FIELDS[k].create), (patch) => pick(patch, FIELDS[k].update)));
  }
  /* 지운 광선로의 측정은 서버가 함께 지운다 — 싣지 않는다. */
  const cm = o.coreMeasurements;
  const lineOf = (id: string) => (cm.creates[id] ?? s.saved.coreMeasurements.find((m) => m.id === id))?.lineId;
  const mAlive = (id: string) => { const l = lineOf(id); return !l || !lineGone.has(l); };
  const cmOps = ops<RowOf['coreMeasurements']>(
    { creates: Object.fromEntries(Object.entries(cm.creates).filter(([id]) => mAlive(id))), updates: Object.fromEntries(Object.entries(cm.updates).filter(([id]) => mAlive(id))), deletes: cm.deletes.filter(mAlive) },
    (r) => pick(r, FIELDS.coreMeasurements.create), (patch) => pick(patch, FIELDS.coreMeasurements.update));
  put('coreMeasurements', cmOps);
  put('fiberLines', ops(o.fiberLines,
    (l) => ({ id: l.id, ...pick(l, LINE_FIELDS), a: lineEnd('a', l as never, true), b: lineEnd('b', l as never, true) }),
    (patch) => {
      const out = pick(patch, LINE_FIELDS);
      const a = lineEnd('a', patch as never, false);
      const b = lineEnd('b', patch as never, false);
      if (Object.keys(a).length) out.a = a;
      if (Object.keys(b).length) out.b = b;
      return out;
    }));
  put('links', ops(o.links,
    (l) => ({ id: l.id, substationId: l.substationId, ...pick(l, LINK_FIELDS), a: l.a, b: l.b }),
    (patch) => {
      const out = pick(patch, LINK_FIELDS);
      /* 끝 대상은 바꾸지 않는다(① 규칙) — 설비 끝의 표기만 aLabel/bLabel 로. */
      if (patch.a?.kind === 'equipment') out.aLabel = patch.a.label ?? null;
      if (patch.b?.kind === 'equipment') out.bLabel = patch.b.label ?? null;
      return out;
    }));

  const circuits = Object.entries(o.circuits).map(([k, patch]) => {
    const [, equipmentId, no] = k.split(':');
    return { equipmentId: equipmentId!, no: Number(no), patch };
  }).filter((c) => c.no <= (eqCount.get(c.equipmentId) ?? 0));
  if (circuits.length) p.circuits = { updates: circuits };
  const cores = Object.entries(o.cores).map(([k, patch]) => {
    const [, lineId, no] = k.split(':');
    return { lineId: lineId!, no: Number(no), patch };
  }).filter((c) => c.no <= (lineCount.get(c.lineId) ?? 0));
  if (cores.length) p.cores = { updates: cores };

  /* 기록 — 지운 설비의 것은 뺀다. */
  const eqGone = new Set(o.equipment.deletes);
  const ownerOf = (kind: 'maintenance' | 'inspections' | 'photos', id: string) =>
    (o[kind].creates[id] ?? (s.saved[kind] as { id: string; equipmentId: string }[]).find((r) => r.id === id))?.equipmentId;
  const recordOps = (kind: 'maintenance' | 'inspections' | 'photos', createKeys: readonly string[], patchKeys: readonly string[]) => {
    const ov = o[kind] as Overlay<{ id: string; equipmentId: string }>;
    const alive = (id: string) => { const e = ownerOf(kind, id); return !e || !eqGone.has(e); };
    const creates = Object.values(ov.creates).filter((r) => alive(r.id)).map((r) => pick(r, createKeys));
    const updates = Object.entries(ov.updates).filter(([id]) => alive(id)).map(([id, patch]) => ({ id, patch: pick(patch, patchKeys) }));
    const deletes = ov.deletes.filter(alive);
    const out: Record<string, unknown> = {};
    if (creates.length) out.creates = creates;
    if (updates.length) out.updates = updates;
    if (deletes.length) out.deletes = deletes;
    return Object.keys(out).length ? out : undefined;
  };
  const records: Record<string, unknown> = {};
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
