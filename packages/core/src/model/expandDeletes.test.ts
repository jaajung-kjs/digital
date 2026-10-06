import { describe, expect, it } from 'vitest';
import type { ModelState } from './types.js';
import { expandDeletes } from './expandDeletes.js';

function state(): ModelState {
  return {
    racks: [{ id: 'r1', substationId: 'S1', name: '랙' }, { id: 'r2', substationId: 'S1', name: '빈 랙' }],
    equipment: [
      { id: 'pnl', substationId: 'S1', rackId: 'r1', name: '분전반', circuitCount: 2 },
      { id: 'ote', substationId: 'S1', rackId: 'r1', name: '송광치', circuitCount: 0 },
      { id: 'ofd', substationId: 'S1', rackId: 'r1', name: 'OFD', circuitCount: 0 },
    ],
    fiberLines: [{ id: 'L', cableTypeId: 'f', coreCount: 24, aSubstationId: 'S1', aEquipmentId: 'ofd', bSubstationId: 'S2', bEquipmentId: null }],
    links: [
      { id: 'pw', substationId: 'S1', cableTypeId: null, a: { kind: 'circuit', equipmentId: 'pnl', no: 1 }, b: { kind: 'equipment', equipmentId: 'ote' } },
      { id: 'jp', substationId: 'S1', cableTypeId: null, a: { kind: 'core', lineId: 'L', no: 5, side: 'A' }, b: { kind: 'equipment', equipmentId: 'ote' } },
      { id: 'far', substationId: 'S2', cableTypeId: null, a: { kind: 'core', lineId: 'L', no: 5, side: 'B' }, b: { kind: 'equipment', equipmentId: 'x' } },
    ],
    cableTypes: [],
  };
}

describe('expandDeletes', () => {
  it('설비를 지우면 그 설비에 닿은 연결이 함께 간다', () => {
    const p = expandDeletes(state(), { equipment: ['ote'] });
    expect(p.equipment).toEqual(['ote']);
    expect(p.links.sort()).toEqual(['jp', 'pw']);
    expect(p.blocked).toEqual([]);
  });

  it('설비를 지우면 그 설비의 회로에 닿은 연결도 함께 간다', () => {
    expect(expandDeletes(state(), { equipment: ['pnl'] }).links).toEqual(['pw']);
  });

  it('OFD 를 지우면 그것을 단자로 가리키던 광선로 끝을 비운다 — 선로는 남는다', () => {
    const p = expandDeletes(state(), { equipment: ['ofd'] });
    expect(p.lineEndClears).toEqual([{ lineId: 'L', side: 'A' }]);
    expect(p.fiberLines).toEqual([]);
  });

  it('광선로를 지우면 양 끝 국의 코어 끝 연결이 모두 간다', () => {
    expect(expandDeletes(state(), { fiberLines: ['L'] }).links.sort()).toEqual(['far', 'jp']);
  });

  it('설비가 남은 랙은 지울 수 없다', () => {
    const p = expandDeletes(state(), { racks: ['r1'] });
    expect(p.racks).toEqual([]);
    expect(p.blocked).toEqual([{ id: 'r1', reason: '랙 안에 설비가 3대 있습니다 — 먼저 옮기거나 지우세요' }]);
  });

  it('안의 설비를 함께 지우면 랙도 지울 수 있다', () => {
    const p = expandDeletes(state(), { racks: ['r1'], equipment: ['pnl', 'ote', 'ofd'] });
    expect(p.racks).toEqual(['r1']);
    expect(p.blocked).toEqual([]);
  });

  it('빈 랙은 그냥 지운다', () => {
    expect(expandDeletes(state(), { racks: ['r2'] }).racks).toEqual(['r2']);
  });

  it('직접 지우라고 한 연결은 그대로 실린다(중복 없이)', () => {
    expect(expandDeletes(state(), { links: ['pw'], equipment: ['pnl'] }).links).toEqual(['pw']);
  });
});
