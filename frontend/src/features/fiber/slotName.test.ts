import { describe, it, expect } from 'vitest';
import { composeSlotName, nextRouteNumber } from './slotName';
import type { TraceGraph } from '../trace/traceGraph';

describe('composeSlotName', () => {
  it('자국 - 대국 -N #코어 전체', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 2, 24)).toBe('춘천S/S - 북춘천S/S -2 #24');
  });
  it('코어 0 이면 # 생략', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 1, 0)).toBe('춘천S/S - 북춘천S/S -1');
  });
  it('n<=0 이면 -N 생략', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 0, 24)).toBe('춘천S/S - 북춘천S/S #24');
  });
  it('대국 없으면 자국만', () => {
    expect(composeSlotName('춘천S/S', null, 1, 24)).toBe('춘천S/S -1 #24');
  });
  it('둘 다 없으면 빈 문자열', () => {
    expect(composeSlotName(null, null, 1, 24)).toBe('');
  });
});

// nextRouteNumber: OFD 'ofd' 아래 슬롯들. slotA→대국 sub-bc, 기존 slotX→sub-bc 1개 있으면 새 번호=2.
const opgw = (id: string, s: string, t: string) => ({ id, cableType: 'FIBER', sourceAssetId: s, targetAssetId: t, sourceRole: 'IN', targetRole: 'IN' });
function graphOf(over: Partial<TraceGraph> = {}): TraceGraph {
  return {
    assets: [{ id: 'slotX', role: 'slot' }],
    cables: [opgw('o1', 'slotX', 'twinX')],
    subById: new Map([['twinX', 'sub-bc']]),
    parentById: new Map([['slotX', 'ofd']]),
    roleById: new Map([['slotX', 'slot']]),
    ...over,
  } as unknown as TraceGraph;
}

describe('nextRouteNumber', () => {
  it('같은 대국 기존 형제 1개 → 새 번호 2', () => {
    expect(nextRouteNumber('ofd', 'sub-bc', graphOf())).toBe(2);
  });
  it('기존 형제 없음 → 1', () => {
    expect(nextRouteNumber('ofd', 'sub-other', graphOf())).toBe(1);
  });
  it('twinSubId null → 1', () => {
    expect(nextRouteNumber('ofd', null, graphOf())).toBe(1);
  });
});
