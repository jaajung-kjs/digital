import { describe, it, expect } from 'vitest';
import { buildSlotPorts, twinSlotIdOf } from './slotPorts';
import type { CableLike } from './slotRegister';
import type { TraceGraph } from '../trace/traceGraph';

const SLOT = 'slotA';
const TWIN = 'slotB';

const opgw: CableLike = {
  id: 'opgw', cableType: 'FIBER',
  sourceAssetId: SLOT, targetAssetId: TWIN,
  sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 },
};
// 실제 buildCoreOutCable 형태: 설비=source(role null), 슬롯=target(role 'OUT').
const localOut3: CableLike = {
  id: 'c-l3', cableType: 'FIBER',
  sourceAssetId: 'eqpL', targetAssetId: SLOT,
  sourceRole: null, targetRole: 'OUT', number: 3,
};
const remoteOut3: CableLike = {
  id: 'c-r3', cableType: 'FIBER',
  sourceAssetId: 'eqpR', targetAssetId: TWIN,
  sourceRole: null, targetRole: 'OUT', number: 3,
};
const localOut5: CableLike = {
  id: 'c-l5', cableType: 'FIBER',
  sourceAssetId: 'eqpL2', targetAssetId: SLOT,
  sourceRole: null, targetRole: 'OUT', number: 5,
};
const remoteOut8: CableLike = {
  id: 'c-r8', cableType: 'FIBER',
  sourceAssetId: 'eqpR2', targetAssetId: TWIN,
  sourceRole: null, targetRole: 'OUT', number: 8,
};

const graph = {
  assets: [], cables: [opgw],
  nameById: new Map([['eqpL', '자국장비'], ['eqpR', '대국장비'], ['eqpL2', '자국2'], ['eqpR2', '대국2']]),
  subNameById: new Map(), parentById: new Map(), codeById: new Map(),
} as unknown as TraceGraph;

describe('buildSlotPorts', () => {
  it('용량 N(=24) 만큼 포트를 만든다', () => {
    const ports = buildSlotPorts({ id: SLOT }, [opgw], graph);
    expect(ports).toHaveLength(24);
    expect(ports[0].coreNumber).toBe(1);
    expect(ports[23].coreNumber).toBe(24);
  });

  it('양쪽 OUT 이 있으면 full', () => {
    const ports = buildSlotPorts({ id: SLOT }, [opgw, localOut3, remoteOut3], graph);
    const p3 = ports.find((p) => p.coreNumber === 3)!;
    expect(p3.state).toBe('full');
    expect(p3.localAssetId).toBe('eqpL');
    expect(p3.remoteAssetId).toBe('eqpR');
    expect(p3.localCableId).toBe('c-l3');
    expect(p3.remoteCableId).toBe('c-r3');
  });

  it('자국만 OUT 이면 half (대국 미연결)', () => {
    const ports = buildSlotPorts({ id: SLOT }, [opgw, localOut5], graph);
    const p5 = ports.find((p) => p.coreNumber === 5)!;
    expect(p5.state).toBe('half');
    expect(p5.localAssetId).toBe('eqpL2');
    expect(p5.remoteAssetId).toBeNull();
  });

  it('대국만 OUT 이면 half (자국 미연결) — local 비어도 대국 점유 감지', () => {
    const ports = buildSlotPorts({ id: SLOT }, [opgw, remoteOut8], graph);
    const p8 = ports.find((p) => p.coreNumber === 8)!;
    expect(p8.state).toBe('half');
    expect(p8.localAssetId).toBeNull();
    expect(p8.remoteAssetId).toBe('eqpR2');
    expect(p8.remoteCableId).toBe('c-r8');
  });

  it('둘 다 없으면 empty', () => {
    const ports = buildSlotPorts({ id: SLOT }, [opgw], graph);
    const p1 = ports.find((p) => p.coreNumber === 1)!;
    expect(p1.state).toBe('empty');
    expect(p1.localAssetId).toBeNull();
    expect(p1.remoteAssetId).toBeNull();
  });

  it('OPGW(용량) 없으면 빈 배열', () => {
    expect(buildSlotPorts({ id: SLOT }, [localOut3], graph)).toEqual([]);
  });
});

describe('twinSlotIdOf', () => {
  it('OPGW(IN-IN) 반대편 슬롯 id', () => {
    expect(twinSlotIdOf('slotA', [opgw])).toBe('slotB');
    expect(twinSlotIdOf('slotB', [opgw])).toBe('slotA');
  });
  it('OPGW 없으면 null', () => {
    expect(twinSlotIdOf('slotA', [])).toBeNull();
  });
});
