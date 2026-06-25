import { describe, it, expect } from 'vitest';
import { fiberSlotLabel } from './fiberSlotLabel';
import type { TraceGraph } from '../trace/traceGraph';

const SLOT = 'slotA';
const TWIN = 'slotB';
const OFD = 'ofdA';
// 같은 자국 OFD → 같은 대국(북춘천) 두 번째 경로슬롯.
const SLOT2 = 'slotC';
const TWIN2 = 'slotD';
const opgw = { id: 'opgw', cableType: 'FIBER', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const opgw2 = { id: 'opgw2', cableType: 'FIBER', sourceAssetId: SLOT2, targetAssetId: TWIN2, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };

function graphOf(over: Partial<TraceGraph> = {}): TraceGraph {
  return {
    assets: [{ id: SLOT, role: 'slot' }],
    cables: [opgw],
    nameById: new Map(),
    subNameById: new Map([[OFD, '춘천S/S'], [TWIN, '북춘천S/S'], [TWIN2, '북춘천S/S']]),
    parentById: new Map([[SLOT, OFD], [SLOT2, OFD]]),
    codeById: new Map(),
    roleById: new Map([[SLOT, 'slot'], [SLOT2, 'slot']]),
    slotIndexById: new Map([[SLOT, 0], [SLOT2, 1]]),
    ...over,
  } as unknown as TraceGraph;
}

describe('fiberSlotLabel', () => {
  it('자국 - 대국 -N #코어수 포맷 (단일 경로도 -1)', () => {
    expect(fiberSlotLabel(SLOT, graphOf())).toBe('춘천S/S - 북춘천S/S -1 #24');
  });

  it('같은 대국으로 가는 경로슬롯 2개는 slotIndex 순으로 -1 / -2', () => {
    const g = graphOf({
      assets: [{ id: SLOT, role: 'slot' }, { id: SLOT2, role: 'slot' }],
      cables: [opgw, opgw2],
    } as unknown as TraceGraph);
    expect(fiberSlotLabel(SLOT, g)).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(fiberSlotLabel(SLOT2, g)).toBe('춘천S/S - 북춘천S/S -2 #24');
  });

  it('slotIndex 가 반대면 -N 도 따라 바뀐다(정렬 기준 확인)', () => {
    const g = graphOf({
      assets: [{ id: SLOT, role: 'slot' }, { id: SLOT2, role: 'slot' }],
      cables: [opgw, opgw2],
      slotIndexById: new Map([[SLOT, 5], [SLOT2, 1]]),
    } as unknown as TraceGraph);
    expect(fiberSlotLabel(SLOT2, g)).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(fiberSlotLabel(SLOT, g)).toBe('춘천S/S - 북춘천S/S -2 #24');
  });

  it('graph 없으면 빈 문자열', () => {
    expect(fiberSlotLabel(SLOT, null)).toBe('');
  });

  it('코어수 없으면 # 생략 (-N 은 유지)', () => {
    const g = graphOf({ cables: [{ ...opgw, specParams: {} }] } as unknown as TraceGraph);
    expect(fiberSlotLabel(SLOT, g)).toBe('춘천S/S - 북춘천S/S -1');
  });

  it('코어수 0 이면 # 생략', () => {
    const g = graphOf({ cables: [{ ...opgw, specParams: { cores: 0 } }] } as unknown as TraceGraph);
    expect(fiberSlotLabel(SLOT, g)).toBe('춘천S/S - 북춘천S/S -1');
  });
});
