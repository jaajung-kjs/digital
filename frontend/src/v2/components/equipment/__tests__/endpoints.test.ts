import { beforeEach, describe, expect, it } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { endLabel, endpointOptions, linksOfEquipment } from '../endpoints';

beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', { id: 'p', substationId: 'S1', rackId: 'r', name: '분전반', typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 2, panelCount: null, updatedAt: '' });
  s.create('equipment', { id: 'o', substationId: 'S1', rackId: 'r', name: '송광치', typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '' });
  s.create('fiberLines', { id: 'L', cableTypeId: 'f', coreCount: 2, name: null, lengthKm: null, segments: [], aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1, bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1, aSubstationName: '북춘천', bSubstationName: '춘천HP', updatedAt: '' });
  s.create('links', { id: 'k', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'p', no: 1 }, b: { kind: 'equipment', equipmentId: 'o', label: 'AC IN' }, updatedAt: '' });
});

describe('잇기 끝 목록', () => {
  it('이 국의 설비·회로·이 국 쪽 코어 끝이 나온다 — 쓰인 회로는 taken', () => {
    const opts = endpointOptions(store.getState(), 'S1');
    expect(opts.filter((o) => o.group === '설비').map((o) => o.label).sort()).toEqual(['분전반', '송광치']);
    expect(opts.filter((o) => o.group === '차단기').map((o) => [o.label, o.taken])).toEqual([['분전반 차단기 1', true], ['분전반 차단기 2', false]]);
    expect(opts.filter((o) => o.group === '코어').map((o) => o.ref)).toEqual([
      { kind: 'core', lineId: 'L', no: 1, side: 'A' }, { kind: 'core', lineId: 'L', no: 2, side: 'A' },
    ]);
  });

  it('반대 국에서는 그 국 쪽 끝(B)만', () => {
    const opts = endpointOptions(store.getState(), 'S2');
    expect(opts.filter((o) => o.group === '코어').every((o) => o.ref.kind === 'core' && o.ref.side === 'B')).toBe(true);
  });

  it('끝 이름', () => {
    const s = store.getState();
    expect(endLabel(s, { kind: 'circuit', equipmentId: 'p', no: 1 })).toBe('분전반 차단기 1');
    expect(endLabel(s, { kind: 'equipment', equipmentId: 'o', label: 'AC IN' })).toBe('송광치 AC IN');
    expect(endLabel(s, { kind: 'core', lineId: 'L', no: 2, side: 'A' })).toBe('북춘천–춘천HP 코어 2');
  });

  it('설비의 연결 — 그 설비의 회로에 닿은 것도 포함', () => {
    expect(linksOfEquipment(store.getState(), 'p').map((l) => l.id)).toEqual(['k']);
    expect(linksOfEquipment(store.getState(), 'o').map((l) => l.id)).toEqual(['k']);
  });
});
