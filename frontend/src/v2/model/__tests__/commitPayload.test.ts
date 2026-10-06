import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workingcopy } from '../types';

const wc: Workingcopy = {
  substation: { id: 'S1', name: 'S' }, floors: [], refEquipment: [], farLinks: [],
  racks: [{ id: 'r1', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: 'rv' }],
  equipment: [{ id: 'e1', substationId: 'S1', rackId: 'r1', name: '분전반', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: '2024-03-11', manager: null, note: null, circuitCount: 1, panelCount: null, updatedAt: 'ev',
    circuits: [{ equipmentId: 'e1', no: 1, label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null, updatedAt: 'cv' }] }],
  links: [{ id: 'k1', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'e1', no: 1 }, b: { kind: 'equipment', equipmentId: 'e1', label: 'x' }, updatedAt: 'kv' }],
  fiberLines: [], maintenanceLogs: [], inspectionLogs: [], photos: [],
};
vi.mock('../api', () => ({ fetchWorkingcopy: async () => structuredClone(wc), putCommit: async () => ({}) }));

import { buildCommitPayload } from '../store/commitPayload';
import { workingCopyStore as store } from '../store/workingCopy';

beforeEach(async () => { store.getState().reset(); await store.getState().ensureLoaded('S1'); });

describe('buildCommitPayload', () => {
  it('만들기는 서버가 받는 칸만 — updatedAt·이름 같은 읽기 칸은 싣지 않는다', () => {
    store.getState().create('racks', { id: 'r2', substationId: 'S1', name: '새 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    const p = buildCommitPayload(store.getState()) as { racks: { creates: Record<string, unknown>[] } };
    expect(p.racks.creates[0]).toEqual({ id: 'r2', substationId: 'S1', name: '새 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null });
  });

  it('고치기·지우기는 그 행의 기준 버전을 싣는다', () => {
    store.getState().update('equipment', 'e1', { note: 'n' });
    store.getState().remove('links', 'k1');
    const p = buildCommitPayload(store.getState()) as { equipment: unknown; links: unknown; baseVersions: Record<string, string> };
    expect(p.equipment).toEqual({ updates: [{ id: 'e1', patch: { note: 'n' } }] });
    expect(p.links).toEqual({ deletes: ['k1'] });
    expect(p.baseVersions).toEqual({ e1: 'ev', k1: 'kv' });
  });

  it('회로는 자연 키로, 저장된 회로만 기준 버전을 싣는다', () => {
    store.getState().update('equipment', 'e1', { circuitCount: 2 });
    store.getState().updateCircuit('e1', 1, { label: 'A' });
    store.getState().updateCircuit('e1', 2, { label: 'B' });
    const p = buildCommitPayload(store.getState()) as { circuits: unknown; baseVersions: Record<string, string> };
    expect(p.circuits).toEqual({ updates: [{ equipmentId: 'e1', no: 1, patch: { label: 'A' } }, { equipmentId: 'e1', no: 2, patch: { label: 'B' } }] });
    expect(p.baseVersions['circuit:e1:1']).toBe('cv');
    expect(p.baseVersions['circuit:e1:2']).toBeUndefined();
  });

  it('연결 고치기는 끝 대상을 보내지 않고 표기만 aLabel/bLabel 로 보낸다', () => {
    store.getState().update('links', 'k1', { b: { kind: 'equipment', equipmentId: 'e1', label: 'y' }, lengthM: 3 });
    const p = buildCommitPayload(store.getState()) as { links: { updates: { patch: Record<string, unknown> }[] } };
    expect(p.links.updates[0]!.patch).toEqual({ lengthM: 3, bLabel: 'y' });
  });

  it('지운 설비에 딸린 기록 고치기는 싣지 않는다(서버가 함께 지운다)', () => {
    store.getState().create('maintenance', { id: 'm1', equipmentId: 'e1', occurredAt: '2026-10-01T00:00:00.000Z', content: 'x', action: null, updatedAt: '' });
    store.getState().remove('links', 'k1');
    store.getState().remove('equipment', 'e1');
    const p = buildCommitPayload(store.getState()) as { records?: unknown };
    expect(p.records).toBeUndefined();
  });

  it('빈 변경안은 빈 객체', () => {
    expect(buildCommitPayload(store.getState())).toEqual({});
  });
});
