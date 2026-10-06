import { beforeEach, describe, expect, it } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { nextFacing, placedRacks, planLinks, unplacedRacks } from '../planSelectors';

const rack = (id: string, floorId: string | null, x: number | null) => ({ id, substationId: 'S1', name: id, rackTypeId: 't', floorId, x, y: x === null ? null : 0, width: x === null ? null : 10, height: x === null ? null : 10, facing: null, updatedAt: '' });
const eq = (id: string, rackId: string) => ({ id, substationId: 'S1', rackId, name: id, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 1, panelCount: null, updatedAt: '' });

beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', rack('R1', 'F1', 0));
  s.create('racks', rack('R2', 'F1', 100));
  s.create('racks', rack('R3', null, null));
  s.create('equipment', eq('E1', 'R1'));
  s.create('equipment', eq('E2', 'R2'));
  s.create('equipment', eq('E3', 'R1'));
  s.create('links', { id: 'k12', substationId: 'S1', cableTypeId: 'fcv', lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'E1', no: 1 }, b: { kind: 'equipment', equipmentId: 'E2' }, updatedAt: '' });
  s.create('links', { id: 'same', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'equipment', equipmentId: 'E1' }, b: { kind: 'equipment', equipmentId: 'E3' }, updatedAt: '' });
});

describe('평면도 셀렉터', () => {
  it('층에 놓인 랙과 대기 중인 랙', () => {
    expect(placedRacks(store.getState(), 'F1').map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(unplacedRacks(store.getState(), 'S1').map((r) => r.id)).toEqual(['R3']);
  });

  it('연결선은 서로 다른 두 랙 중심 사이 — 같은 랙 안 연결은 그리지 않는다', () => {
    const lines = planLinks(store.getState(), 'F1', (id) => (id === 'fcv' ? 'power' : null), (m) => (m === 'power' ? '#f00' : '#999'));
    expect(lines).toEqual([{ id: 'k12', from: { x: 5, y: 5 }, to: { x: 105, y: 5 }, color: '#f00' }]);
  });

  it('정면은 위→오른쪽→아래→왼쪽 순, 없으면 아래', () => {
    expect([nextFacing('위'), nextFacing('오른쪽'), nextFacing('아래'), nextFacing('왼쪽'), nextFacing(null)]).toEqual(['오른쪽', '아래', '왼쪽', '위', '아래']);
  });
});
