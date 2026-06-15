import { describe, it, expect } from 'vitest';
import { fiberSlotLabel } from './fiberSlotLabel';
import type { TraceGraph } from '../trace/traceGraph';

const SLOT = 'slotA';
const TWIN = 'slotB';
const OFD = 'ofdA';
const opgw = { id: 'opgw', cableType: 'FIBER', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };

function graphOf(over: Partial<TraceGraph> = {}): TraceGraph {
  return {
    assets: [], cables: [opgw],
    nameById: new Map(),
    subNameById: new Map([[OFD, '춘천S/S'], [TWIN, '북춘천S/S']]),
    parentById: new Map([[SLOT, OFD]]),
    codeById: new Map(),
    ...over,
  } as unknown as TraceGraph;
}

describe('fiberSlotLabel', () => {
  it('자국 - 대국 #코어수 포맷', () => {
    // remoteSlotSubstation(SLOT) = subNameById.get(TWIN) = 북춘천S/S
    expect(fiberSlotLabel(SLOT, graphOf())).toBe('춘천S/S - 북춘천S/S #24');
  });

  it('graph 없으면 빈 문자열', () => {
    expect(fiberSlotLabel(SLOT, null)).toBe('');
  });

  it('코어수 없으면 # 생략', () => {
    const g = graphOf({ cables: [{ ...opgw, specParams: {} }] } as unknown as TraceGraph);
    expect(fiberSlotLabel(SLOT, g)).toBe('춘천S/S - 북춘천S/S');
  });
});
