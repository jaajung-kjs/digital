import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPowerRows, commitMeta } from './powerRegisterDescriptor';

const cables = [
  { id: 'cb1', sourceAssetId: 'feeder1', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, categoryName: 'CV', specParams: { cbNumber: '1', capacity: '20A', switchState: 'ON' } },
  { id: 'cb2', sourceAssetId: 'load2', targetAssetId: 'feeder1', sourceRole: null, targetRole: 'OUT', categoryName: 'CV', specParams: { cbNumber: '2', capacity: '30A', switchState: 'OFF' } },
  { id: 'x', sourceAssetId: 'a', targetAssetId: 'b', sourceRole: null, targetRole: null, specParams: {} },
];
const nameById = new Map([['load1', '부하A'], ['load2', '부하B']]);

describe('buildPowerRows', () => {
  it('피더 OUT 케이블만 CB행으로(양방향 끝점), 부하=반대편', () => {
    const rows = buildPowerRows('feeder1', cables as never[], nameById);
    expect(rows.map((r) => r.cableId).sort()).toEqual(['cb1', 'cb2']);
    const r1 = rows.find((r) => r.cableId === 'cb1')!;
    expect(r1.loadAssetId).toBe('load1');
    expect(r1.loadName).toBe('부하A');
    expect(r1.cbNumber).toBe('1');
    expect(r1.switchState).toBe('ON');
    const r2 = rows.find((r) => r.cableId === 'cb2')!;
    expect(r2.loadAssetId).toBe('load2');   // target=feeder 면 source 가 부하
  });
});

// ── commitMeta 편집 단위 테스트 ────────────────────────────────────────────
// useSubstationWorkingCopy 를 vi.mock 으로 교체 — getState()가 반환하는
// wc.effectiveCables / wc.patch 를 spy 해서 specParams 병합을 검증한다.

const mockPatch = vi.fn();
const mockEffectiveCables = vi.fn();

vi.mock('../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: {
    getState: () => ({
      effectiveCables: mockEffectiveCables,
      patch: mockPatch,
    }),
  },
}));

describe('commitMeta — CB specParams 병합 patch', () => {
  beforeEach(() => {
    mockPatch.mockClear();
    mockEffectiveCables.mockClear();
  });

  it('기존 specParams 키를 보존하면서 지정 필드만 갱신', () => {
    mockEffectiveCables.mockReturnValue([
      { id: 'cb1', specParams: { cbNumber: '1', capacity: '20A', switchState: 'ON' } },
    ]);
    commitMeta('cb1', 'switchState', 'OFF');
    expect(mockPatch).toHaveBeenCalledWith('cables', 'cb1', {
      specParams: { cbNumber: '1', capacity: '20A', switchState: 'OFF' },
    });
  });

  it('번호(cbNumber) 편집 — 나머지 specParams 보존', () => {
    mockEffectiveCables.mockReturnValue([
      { id: 'cb2', specParams: { cbNumber: '2', capacity: '30A', switchState: 'OFF' } },
    ]);
    commitMeta('cb2', 'cbNumber', '99');
    expect(mockPatch).toHaveBeenCalledWith('cables', 'cb2', {
      specParams: { cbNumber: '99', capacity: '30A', switchState: 'OFF' },
    });
  });

  it('value null 허용(필드 클리어)', () => {
    mockEffectiveCables.mockReturnValue([
      { id: 'cb1', specParams: { cbNumber: '7', switchState: 'ON' } },
    ]);
    commitMeta('cb1', 'cbNumber', null);
    expect(mockPatch).toHaveBeenCalledWith('cables', 'cb1', {
      specParams: { cbNumber: null, switchState: 'ON' },
    });
  });

  it('케이블을 찾지 못하면 빈 specParams 로 patch', () => {
    mockEffectiveCables.mockReturnValue([]);
    commitMeta('unknown', 'capacity', '50A');
    expect(mockPatch).toHaveBeenCalledWith('cables', 'unknown', {
      specParams: { capacity: '50A' },
    });
  });
});
