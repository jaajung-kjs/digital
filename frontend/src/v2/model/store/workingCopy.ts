import { circuitKey, coreKey } from '@twin/core';
import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { apiErrorMessage } from '../../apiError';
import { emptyOverlay, overlayDirtyCount, stageCreate, stageDelete, stageUpdate, type Overlay } from '../../store/overlay';
import { fetchWorkingcopy } from '../api';
import type {
  Circuit, Core, CoreMeasurement, EquipmentPhoto, Equipment, FiberLine, Floor, InspectionLog, Link,
  MaintenanceLog, Rack, RefEquipment, RefLine, Workingcopy,
} from '../types';

export interface RowOf {
  floors: Floor; racks: Rack; equipment: Equipment; fiberLines: FiberLine; coreMeasurements: CoreMeasurement;
  links: Link; maintenance: MaintenanceLog; inspections: InspectionLog; photos: EquipmentPhoto;
}
export type RowKind = keyof RowOf;
export const ROW_KINDS: readonly RowKind[] = ['floors', 'racks', 'equipment', 'fiberLines', 'coreMeasurements', 'links', 'maintenance', 'inspections', 'photos'];

export interface Saved {
  substations: Record<string, { id: string; name: string }>;
  floors: Floor[]; racks: Rack[]; equipment: Equipment[]; circuits: Circuit[];
  fiberLines: FiberLine[]; cores: Core[]; coreMeasurements: CoreMeasurement[];
  links: Link[]; farLinks: Link[]; refEquipment: RefEquipment[]; refLines: RefLine[];
  maintenance: MaintenanceLog[]; inspections: InspectionLog[]; photos: EquipmentPhoto[];
}
export type Overlays = { [K in RowKind]: Overlay<RowOf[K]> } & {
  /** 회로 값 고치기 — 키는 `circuitKey`. 회로 행은 회로 수로만 생기므로 만들기·지우기가 없다. */
  circuits: Record<string, Partial<Circuit>>;
  /** 코어 값 고치기 — 키는 `coreKey`. */
  cores: Record<string, Partial<Core>>;
};

const EMPTY_SAVED: Saved = {
  substations: {}, floors: [], racks: [], equipment: [], circuits: [], fiberLines: [], cores: [], coreMeasurements: [],
  links: [], farLinks: [], refEquipment: [], refLines: [], maintenance: [], inspections: [], photos: [],
};
/** 저장된 행 — 고치기가 제자리로 돌아왔는지 견줄 기준(`stageUpdate` 의 `base`). */
export function savedRow(saved: Saved, kind: RowKind, id: string): unknown {
  return (saved[kind] as { id: string }[]).find((r) => r.id === id);
}

export function emptyOverlays(): Overlays {
  return {
    floors: emptyOverlay(), racks: emptyOverlay(), equipment: emptyOverlay(), fiberLines: emptyOverlay(),
    coreMeasurements: emptyOverlay(), links: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(),
    photos: emptyOverlay(), circuits: {}, cores: {},
  };
}

/** id 로 합친다 — 광선로처럼 두 국 응답에 같은 행이 실려도 하나로. 뒤에 온 것이 이긴다. */
function mergeById<T>(prev: T[], next: T[], keyOf: (r: T) => string): T[] {
  const m = new Map(prev.map((r) => [keyOf(r), r]));
  for (const r of next) m.set(keyOf(r), r);
  return [...m.values()];
}
const byId = (r: { id: string }) => r.id;

/** 한 국 응답을 base 에 더한다. 그 국의 국-소속 행은 응답이 정답이다(지워진 행이 남지 않게). */
function absorb(saved: Saved, wc: Workingcopy): Saved {
  const sid = wc.substation.id;
  const keep = <T extends { substationId: string }>(rows: T[]) => rows.filter((r) => r.substationId !== sid);
  const lineIds = new Set(wc.fiberLines.map((l) => l.id));
  const eqIds = new Set(wc.equipment.map((e) => e.id));
  const equipment = wc.equipment.map(({ circuits: _c, ...e }) => e);
  const fiberLines = wc.fiberLines.map(({ cores: _c, ...l }) => l);
  const cores = wc.fiberLines.flatMap((l) => l.cores.map(({ measurements: _m, ...c }) => c));
  const measurements = wc.fiberLines.flatMap((l) => l.cores.flatMap((c) => c.measurements));
  return {
    substations: { ...saved.substations, [sid]: wc.substation },
    floors: [...keep(saved.floors), ...wc.floors],
    racks: [...keep(saved.racks), ...wc.racks],
    equipment: [...keep(saved.equipment), ...equipment],
    circuits: [...saved.circuits.filter((c) => !eqIds.has(c.equipmentId)), ...wc.equipment.flatMap((e) => e.circuits)],
    links: [...keep(saved.links), ...wc.links],
    fiberLines: mergeById(saved.fiberLines, fiberLines, byId),
    cores: [...saved.cores.filter((c) => !lineIds.has(c.lineId)), ...cores],
    coreMeasurements: [...saved.coreMeasurements.filter((m) => !lineIds.has(m.lineId)), ...measurements],
    farLinks: mergeById(saved.farLinks, wc.farLinks, byId),
    refEquipment: mergeById(saved.refEquipment, wc.refEquipment, byId),
    refLines: mergeById(saved.refLines, wc.refLines ?? [], byId),
    maintenance: [...saved.maintenance.filter((r) => !eqIds.has(r.equipmentId)), ...wc.maintenanceLogs],
    inspections: [...saved.inspections.filter((r) => !eqIds.has(r.equipmentId)), ...wc.inspectionLogs],
    photos: [...saved.photos.filter((r) => !eqIds.has(r.equipmentId)), ...wc.photos],
  };
}

/** 기준 버전 — uuid 행은 id, 회로·코어는 자연 키. 저장할 때 고치거나 지우는 행의 것만 보낸다. */
function versionsOf(s: Saved): Record<string, string> {
  const v: Record<string, string> = {};
  /* 먼 연결(들르지 않은 국의, 공유 코어에 닿은 연결)도 — 광선로를 지우면 함께 지우는 행이다. */
  for (const r of s.farLinks) v[r.id] = r.updatedAt;
  for (const k of ROW_KINDS) for (const r of s[k] as { id: string; updatedAt: string }[]) v[r.id] = r.updatedAt;
  for (const c of s.circuits) v[circuitKey(c.equipmentId, c.no)] = c.updatedAt;
  for (const c of s.cores) v[coreKey(c.lineId, c.no)] = c.updatedAt;
  return v;
}

export interface WorkingCopyState {
  /** 들른 국 — 들른 차례대로. */
  loaded: string[];
  /** 읽는 중인 국(없으면 null). */
  loading: string | null;
  /** 읽지 못한 국 → 까닭. 다시 들르면(`ensureLoaded`) 다시 읽는다. */
  loadErrors: Record<string, string>;
  saved: Saved;
  overlays: Overlays;
  baseVersions: Record<string, string>;
  /**
   * 국을 들른다 — 이미 들렀으면 아무것도 하지 않는다. **오버레이는 건드리지 않는다.**
   * 지난번에 못 읽었으면 다시 읽는다(못 읽은 국은 `loaded` 에 들지 않는다).
   */
  ensureLoaded: (substationId: string) => Promise<void>;
  /** 들른 국을 모두 다시 읽고 오버레이를 비운다 — 저장·충돌 새로고침 뒤. */
  refresh: () => Promise<void>;
  /** 변경안을 버린다(들른 국은 그대로). */
  revert: () => void;
  /** 오버레이를 한 번에 바꾼다 — 한 번의 되돌리기로 모두 물린다(삭제 펼침용). */
  applyOverlays: (fn: (o: Overlays) => Overlays) => void;
  /** 저장이 끝난 변경안을 비운다 — 되돌리기 이력도 함께. */
  clearOverlays: () => void;
  /** 처음 상태로 — 시험·로그아웃용. */
  reset: () => void;
  create: <K extends RowKind>(kind: K, row: RowOf[K]) => void;
  /** 여러 행을 **한 번의 set** 으로 — 되돌리기 한 번에 함께 물러난다(블록 일괄 측정 입력). */
  createMany: <K extends RowKind>(kind: K, rows: RowOf[K][]) => void;
  update: <K extends RowKind>(kind: K, id: string, patch: Partial<RowOf[K]>) => void;
  /** 한 행만 지운다 — 함께 가야 할 것은 `deleteRows` 가 펼친다. 화면은 `deleteRows` 를 쓴다. */
  remove: <K extends RowKind>(kind: K, id: string) => void;
  updateCircuit: (equipmentId: string, no: number, patch: Partial<Circuit>) => void;
  updateCore: (lineId: string, no: number, patch: Partial<Core>) => void;
  dirtyCount: () => number;
  /** 변경이 닿은 국 — 저장 바가 이름을 보여 준다. */
  touchedSubstations: () => string[];
}

/**
 * 아직 저장 안 한 측정에 **넣은 차례**를 찍는다 — 같은 날짜 측정의 「최근」을 배열 차례가 아니라 데이터로 가리려고(core `newestFirst`).
 * 세션 동안 단조 증가한다(되돌리기·다시 하기로 줄었다 늘어도 이미 찍힌 값은 그대로다). 서버로는 가지 않는다.
 */
let stagedSeq = 0;
function stamped<K extends RowKind>(kind: K, row: RowOf[K]): RowOf[K] {
  return kind === 'coreMeasurements' ? { ...row, stagedSeq: ++stagedSeq } : row;
}

export const workingCopyStore = createStore<WorkingCopyState>()(
  temporal(
    (set, get) => ({
      loaded: [],
      loading: null,
      loadErrors: {},
      saved: EMPTY_SAVED,
      overlays: emptyOverlays(),
      baseVersions: {},

      ensureLoaded: async (substationId) => {
        if (get().loaded.includes(substationId)) return;
        /* 되돌리기 이력은 overlays 만 본다(partialize) — 읽는 동안의 고침도 되돌릴 수 있다. */
        if (get().loading === substationId) return;
        const { [substationId]: _was, ...rest } = get().loadErrors;
        set({ loading: substationId, loadErrors: rest });
        try {
          const wc = await fetchWorkingcopy(substationId);
          const saved = absorb(get().saved, wc);
          set({ saved, baseVersions: versionsOf(saved), loaded: [...get().loaded.filter((x) => x !== substationId), substationId], loading: null });
        } catch (e) {
          /* 오류는 그 국 화면이 그린다(다시 시도와 함께) — 전역 띠에는 올리지 않는다(화면당 표면 하나). */
          set({ loading: null, loadErrors: { ...get().loadErrors, [substationId]: apiErrorMessage(e, '변전소를 불러오지 못했습니다') } });
        }
      },

      refresh: async () => {
        const ids = get().loaded;
        const t = workingCopyStore.temporal.getState();
        t.pause();
        try {
          let saved = EMPTY_SAVED;
          for (const id of ids) saved = absorb(saved, await fetchWorkingcopy(id));
          set({ saved, baseVersions: versionsOf(saved), overlays: emptyOverlays() });
        } finally {
          t.resume();
          t.clear();
        }
      },

      revert: () => {
        set({ overlays: emptyOverlays() });
        workingCopyStore.temporal.getState().clear();
      },

      applyOverlays: (fn) => set((s) => ({ overlays: fn(s.overlays) })),

      clearOverlays: () => {
        set({ overlays: emptyOverlays() });
        workingCopyStore.temporal.getState().clear();
      },

      reset: () => {
        set({ loaded: [], loading: null, loadErrors: {}, saved: EMPTY_SAVED, overlays: emptyOverlays(), baseVersions: {} });
        workingCopyStore.temporal.getState().clear();
      },

      create: (kind, row) => get().createMany(kind, [row]),
      createMany: (kind, rows) => set((s) => ({
        overlays: { ...s.overlays, [kind]: rows.map((r) => stamped(kind, r)).reduce((o, row) => stageCreate(o, (row as { id: string }).id, row), s.overlays[kind] as Overlay<(typeof rows)[number]>) },
      })),
      update: (kind, id, patch) => set((s) => ({ overlays: { ...s.overlays, [kind]: stageUpdate(s.overlays[kind] as Overlay<unknown>, id, patch as Partial<unknown>, savedRow(s.saved, kind, id)) } })),
      remove: (kind, id) => set((s) => ({ overlays: { ...s.overlays, [kind]: stageDelete(s.overlays[kind] as Overlay<unknown>, id) } })),
      updateCircuit: (equipmentId, no, patch) => set((s) => {
        const k = circuitKey(equipmentId, no);
        return { overlays: { ...s.overlays, circuits: { ...s.overlays.circuits, [k]: { ...s.overlays.circuits[k], ...patch } } } };
      }),
      updateCore: (lineId, no, patch) => set((s) => {
        const k = coreKey(lineId, no);
        return { overlays: { ...s.overlays, cores: { ...s.overlays.cores, [k]: { ...s.overlays.cores[k], ...patch } } } };
      }),

      dirtyCount: () => {
        const o = get().overlays;
        return ROW_KINDS.reduce((n, k) => n + overlayDirtyCount(o[k] as Overlay<unknown>), 0)
          + Object.keys(o.circuits).length + Object.keys(o.cores).length;
      },

      touchedSubstations: () => {
        const { overlays: o, saved } = get();
        const subs = new Set<string>();
        const subOfEquipment = (id: string) =>
          (o.equipment.creates[id] ?? saved.equipment.find((e) => e.id === id))?.substationId;
        const rowsOf = <K extends RowKind>(k: K): RowOf[K][] => [
          ...Object.values(o[k].creates),
          ...(saved[k] as RowOf[K][]).filter((r) => (r as { id: string }).id in o[k].updates || o[k].deletes.includes((r as { id: string }).id)),
        ] as RowOf[K][];
        for (const k of ['floors', 'racks', 'equipment', 'links'] as const) for (const r of rowsOf(k)) subs.add(r.substationId);
        for (const r of saved.farLinks) if (o.links.deletes.includes(r.id)) subs.add(r.substationId);
        for (const l of rowsOf('fiberLines')) { subs.add(l.aSubstationId); subs.add(l.bSubstationId); }
        for (const k of ['maintenance', 'inspections', 'photos'] as const) for (const r of rowsOf(k)) { const s = subOfEquipment(r.equipmentId); if (s) subs.add(s); }
        for (const key of Object.keys(o.circuits)) { const s = subOfEquipment(key.split(':')[1]!); if (s) subs.add(s); }
        const lineSubs = (lineId: string) => {
          const l = o.fiberLines.creates[lineId] ?? saved.fiberLines.find((x) => x.id === lineId);
          if (l) { subs.add(l.aSubstationId); subs.add(l.bSubstationId); }
        };
        for (const key of Object.keys(o.cores)) lineSubs(key.split(':')[1]!);
        for (const m of rowsOf('coreMeasurements')) lineSubs(m.lineId);
        return [...subs];
      },
    }),
    { partialize: (s) => ({ overlays: s.overlays }), equality: shallow, limit: 50 },
  ),
);

export function useWorkingCopy<T>(selector: (s: WorkingCopyState) => T): T {
  return useStore(workingCopyStore, selector);
}
useWorkingCopy.getState = workingCopyStore.getState;
useWorkingCopy.temporal = workingCopyStore.temporal;
