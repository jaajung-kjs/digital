import { describe, expect, it } from 'vitest';
import type { ModelState } from './types.js';
import { validateState } from './validate.js';

/** 국 둘(S1·S2), 랙 하나씩, 설비 몇, S1–S2 광선로 하나. 검사마다 한 군데만 망가뜨린다. */
function base(): ModelState {
  return {
    racks: [
      { id: 'r1', substationId: 'S1', name: '통신랙' },
      { id: 'r2', substationId: 'S2', name: '통신랙' },
    ],
    equipment: [
      { id: 'pnl', substationId: 'S1', rackId: 'r1', name: '분전반', circuitCount: 4 },
      { id: 'ote', substationId: 'S1', rackId: 'r1', name: '송광치', circuitCount: 0 },
      { id: 'ofd1', substationId: 'S1', rackId: 'r1', name: 'OFD', circuitCount: 0 },
      { id: 'ote2', substationId: 'S2', rackId: 'r2', name: '송광치', circuitCount: 0 },
    ],
    fiberLines: [
      { id: 'L', cableTypeId: 'opgw', coreCount: 24, aSubstationId: 'S1', aEquipmentId: 'ofd1', bSubstationId: 'S2', bEquipmentId: null },
    ],
    links: [
      { id: 'k1', substationId: 'S1', cableTypeId: 'fcv', a: { kind: 'circuit', equipmentId: 'pnl', no: 1 }, b: { kind: 'equipment', equipmentId: 'ote' } },
      { id: 'k2', substationId: 'S1', cableTypeId: 'jumper', a: { kind: 'core', lineId: 'L', no: 5, side: 'A' }, b: { kind: 'equipment', equipmentId: 'ote', label: 'C1 WEST' } },
      { id: 'k3', substationId: 'S2', cableTypeId: 'jumper', a: { kind: 'core', lineId: 'L', no: 5, side: 'B' }, b: { kind: 'equipment', equipmentId: 'ote2' } },
    ],
    cableTypes: [
      { id: 'fcv', medium: 'power' }, { id: 'jumper', medium: 'comm' }, { id: 'opgw', medium: 'fiber' },
    ],
  };
}
const codes = (s: ModelState) => validateState(s).map((i) => i.code);

describe('validateState', () => {
  it('바른 상태에는 흠이 없다 — 두 국이 같은 코어의 서로 다른 끝을 쓴다', () => {
    expect(validateState(base())).toEqual([]);
  });

  it('① 같은 국 랙 이름이 겹치면 흠, 다른 국이면 괜찮다', () => {
    const s = base();
    s.racks.push({ id: 'r3', substationId: 'S1', name: '통신랙' });
    expect(codes(s)).toEqual(['RACK_NAME_TAKEN']);
  });

  it('① 랙과 설비는 이름 공간이 따로다 — 일체형(UPS반 + UPS)', () => {
    const s = base();
    s.racks.push({ id: 'r3', substationId: 'S1', name: '분전반' });
    expect(codes(s)).toEqual([]);
  });

  it('① 같은 국 설비 이름이 겹치면 흠', () => {
    const s = base();
    s.equipment.push({ id: 'x', substationId: 'S1', rackId: 'r1', name: '송광치', circuitCount: 0 });
    expect(codes(s)).toEqual(['EQUIPMENT_NAME_TAKEN']);
  });

  it('② 설비의 랙은 같은 국에 있어야 한다', () => {
    const s = base();
    s.equipment[1]!.rackId = 'r2';
    expect(codes(s)).toEqual(['EQUIPMENT_RACK_INVALID']);
  });

  it('② 없는 랙을 가리키면 흠', () => {
    const s = base();
    s.equipment[1]!.rackId = 'nope';
    expect(codes(s)).toEqual(['EQUIPMENT_RACK_INVALID']);
  });

  it('③ 설비 끝은 연결의 국 설비여야 한다', () => {
    const s = base();
    s.links[0]!.b = { kind: 'equipment', equipmentId: 'ote2' };
    expect(codes(s)).toEqual(['LINK_END_INVALID']);
  });

  it('③ 회로 번호는 1..회로 수 안이어야 한다', () => {
    const s = base();
    s.links[0]!.a = { kind: 'circuit', equipmentId: 'pnl', no: 5 };
    expect(codes(s)).toEqual(['LINK_END_INVALID']);
  });

  it('③ 코어 끝은 그 끝의 국이 연결의 국이어야 한다 — S1 연결이 B 끝을 쓰면 흠', () => {
    const s = base();
    s.links[1]!.a = { kind: 'core', lineId: 'L', no: 6, side: 'B' };
    expect(codes(s)).toEqual(['LINK_END_INVALID']);
  });

  it('③ 코어 번호는 1..코어 수 안이어야 한다', () => {
    const s = base();
    s.links[1]!.a = { kind: 'core', lineId: 'L', no: 25, side: 'A' };
    expect(codes(s)).toEqual(['LINK_END_INVALID']);
  });

  it('③ 같은 국 안 광선로(MCR실)는 두 끝 모두 그 국에서 쓸 수 있다', () => {
    const s = base();
    s.fiberLines.push({ id: 'M', cableTypeId: 'opgw', coreCount: 8, aSubstationId: 'S1', aEquipmentId: null, bSubstationId: 'S1', bEquipmentId: null });
    s.links.push({ id: 'k9', substationId: 'S1', cableTypeId: 'jumper', a: { kind: 'core', lineId: 'M', no: 1, side: 'B' }, b: { kind: 'core', lineId: 'L', no: 9, side: 'A' } });
    expect(codes(s)).toEqual([]);
  });

  it('⑤ 회로 끝 하나에 연결이 둘이면 흠', () => {
    const s = base();
    s.links.push({ id: 'k4', substationId: 'S1', cableTypeId: 'fcv', a: { kind: 'circuit', equipmentId: 'pnl', no: 1 }, b: { kind: 'equipment', equipmentId: 'ofd1' } });
    expect(codes(s)).toEqual(['LINK_END_TAKEN']);
  });

  it('⑤ 코어 끝 하나에 연결이 둘이면 흠, 설비 끝은 몇 개든 괜찮다', () => {
    const s = base();
    s.links.push({ id: 'k4', substationId: 'S1', cableTypeId: 'jumper', a: { kind: 'equipment', equipmentId: 'ote' }, b: { kind: 'core', lineId: 'L', no: 5, side: 'A' } });
    expect(codes(s)).toEqual(['LINK_END_TAKEN']);
  });

  it('⑥ 국 내 연결에 광선로 매체 케이블을 쓰면 흠', () => {
    const s = base();
    s.links[0]!.cableTypeId = 'opgw';
    expect(codes(s)).toEqual(['LINK_MEDIUM']);
  });

  it('⑥ 케이블 종류가 비어 있는 연결은 허용한다(아직 모르는 케이블)', () => {
    const s = base();
    s.links[0]!.cableTypeId = null;
    expect(codes(s)).toEqual([]);
  });

  it('⑥ 광선로에 국 내 연결 매체를 쓰면 흠', () => {
    const s = base();
    s.fiberLines[0]!.cableTypeId = 'fcv';
    expect(codes(s)).toEqual(['LINE_MEDIUM']);
  });

  it('⑦ 광선로 끝의 단자 설비는 그 끝의 국 설비여야 한다', () => {
    const s = base();
    s.fiberLines[0]!.bEquipmentId = 'ofd1';
    expect(codes(s)).toEqual(['LINE_END_EQUIPMENT']);
  });

  it('⑦ 판정 범위 밖 국의 단자 설비는 outsideEquipment 로 안다 — 그 국에 있으면 괜찮고, 다른 국이면 흠', () => {
    const s = base();
    s.fiberLines[0]!.bEquipmentId = 'far';
    expect(codes(s)).toEqual(['LINE_END_EQUIPMENT']);
    s.outsideEquipment = [{ id: 'far', substationId: 'S2' }];
    expect(codes(s)).toEqual([]);
    s.outsideEquipment = [{ id: 'far', substationId: 'S3' }];
    expect(codes(s)).toEqual(['LINE_END_EQUIPMENT']);
  });

  it('⑧ 연결의 두 끝이 같은 대상이면 흠', () => {
    const s = base();
    s.links[0]!.a = { kind: 'equipment', equipmentId: 'ote', label: 'x' };
    expect(codes(s)).toEqual(['LINK_SELF']);
  });

  it('⑨ 같은 접속 설비·슬롯에서 어댑터 범위가 겹치면 흠 — 이어지면(1–24, 25–48) 괜찮다', () => {
    const s = base();
    s.fiberLines = [
      { ...s.fiberLines[0]!, id: 'L', aPanel: 1, aStartNo: 1 },
      { ...s.fiberLines[0]!, id: 'M', aPanel: 1, aStartNo: 25 },
    ];
    expect(validateState(s).filter((i) => i.code === 'LINE_SLOT_OVERLAP')).toEqual([]);
    s.fiberLines[1] = { ...s.fiberLines[1]!, aStartNo: 1 };
    const hit = validateState(s).filter((i) => i.code === 'LINE_SLOT_OVERLAP');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.ids.sort()).toEqual(['L', 'M']);
    expect(hit[0]!.message).toBe('접속 설비 「OFD」 슬롯 1에서 광선로 둘의 어댑터 번호가 겹칩니다');
    /* 다른 슬롯이면 같은 번호여도 괜찮다. 슬롯 미정은 묻지 않는다. */
    s.fiberLines[1] = { ...s.fiberLines[1]!, aPanel: 2 };
    expect(validateState(s).filter((i) => i.code === 'LINE_SLOT_OVERLAP')).toEqual([]);
    s.fiberLines = s.fiberLines.map((l) => ({ ...l, aPanel: null }));
    expect(validateState(s).filter((i) => i.code === 'LINE_SLOT_OVERLAP')).toEqual([]);
  });

  it('⑨ 긴 범위 안에 든 둘째 겹침도 잡는다', () => {
    const s = base();
    s.fiberLines = [
      { ...s.fiberLines[0]!, id: 'A', coreCount: 48, aPanel: 1, aStartNo: 1 },
      { ...s.fiberLines[0]!, id: 'B', coreCount: 2, aPanel: 1, aStartNo: 2 },
      { ...s.fiberLines[0]!, id: 'C', coreCount: 2, aPanel: 1, aStartNo: 10 },
    ];
    const ids = validateState(s).filter((i) => i.code === 'LINE_SLOT_OVERLAP').map((i) => i.ids.sort().join(''));
    expect(ids.sort()).toEqual(['AB', 'AC']);
  });

  it('⑨ 슬롯 번호가 접속 설비의 슬롯 수를 넘으면 흠 — 슬롯 수 미정이면 묻지 않는다', () => {
    const s = base();
    s.fiberLines = [{ ...s.fiberLines[0]!, aPanel: 5, aStartNo: 1 }];
    expect(validateState(s).filter((i) => i.code === 'LINE_SLOT_RANGE')).toEqual([]);
    s.equipment = s.equipment.map((e) => (e.id === 'ofd1' ? { ...e, panelCount: 4 } : e));
    const hit = validateState(s).filter((i) => i.code === 'LINE_SLOT_RANGE');
    expect(hit).toEqual([{ code: 'LINE_SLOT_RANGE', message: '접속 설비 「OFD」의 슬롯 5 — 슬롯 수(4)를 넘습니다', ids: ['L'] }]);
  });

  it('코어 수는 1 이상', () => {
    const s = base();
    s.fiberLines[0]!.coreCount = 0;
    s.links = s.links.filter((l) => l.a.kind !== 'core');
    expect(codes(s)).toEqual(['LINE_CORE_COUNT']);
  });

  it('흠마다 관련 id 를 싣는다 — 화면이 그 행을 짚을 수 있게', () => {
    const s = base();
    s.links.push({ id: 'k4', substationId: 'S1', cableTypeId: 'fcv', a: { kind: 'circuit', equipmentId: 'pnl', no: 1 }, b: { kind: 'equipment', equipmentId: 'ofd1' } });
    expect(validateState(s)[0]!.ids.sort()).toEqual(['k1', 'k4']);
  });
});
