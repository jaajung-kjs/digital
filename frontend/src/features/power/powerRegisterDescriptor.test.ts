import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPowerRows, commitMeta, powerRegisterDescriptor } from './powerRegisterDescriptor';
import type { Asset } from '../../types/asset';
import type { RegisterCtx } from '../connections/registerGrid/registerTypes';

const cables = [
  { id: 'cb1', sourceAssetId: 'feeder1', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, categoryName: 'CV', categoryId: 'cat-1', number: 1, specParams: { capacity: '20A', switchState: 'ON' } },
  { id: 'cb2', sourceAssetId: 'load2', targetAssetId: 'feeder1', sourceRole: null, targetRole: 'OUT', categoryName: 'CV', categoryId: 'cat-1', number: 2, specParams: { capacity: '30A', switchState: 'OFF' } },
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

// ── buildSection — 입력 행 prepend + 위치(floorAnchor) ──────────────────────
const placed = (id: string, name: string, parentAssetId: string | null = null): Asset => ({
  id, name, parentAssetId,
  floorId: 'fl1', positionX: 0, positionY: 0, width2d: 10, height2d: 10,
} as unknown as Asset);
const bare = (id: string, name: string, parentAssetId: string | null): Asset => ({
  id, name, parentAssetId,
} as unknown as Asset);

describe('powerRegisterDescriptor.buildSection — 입력 행 + 위치', () => {
  it('IN 케이블 + OUT 2개 → rows[0] 이 입력 행, OUT 행 위치는 floorAnchor 로 해소', () => {
    const feeder = placed('feeder1', '피더1');
    const supply = placed('supply', '주변압기');
    const load1 = placed('load1', '부하A');
    // load2 는 미배치 → 배치된 부모(panel) 의 이름으로 위치 해소
    const panel = placed('panel', '분전반1F');
    const load2 = bare('load2', '부하B', 'panel');
    const assets = [feeder, supply, load1, load2, panel];
    const cables = [
      { id: 'in1', sourceAssetId: 'supply', targetAssetId: 'feeder1', sourceRole: null, targetRole: 'IN', categoryName: 'CV 6sq', categoryId: 'cat-in', number: null, specParams: { capacity: '50A', switchState: 'ON' } },
      { id: 'cb1', sourceAssetId: 'feeder1', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, categoryName: 'CV', categoryId: 'cat-1', number: 1, specParams: { capacity: '20A', switchState: 'ON' } },
      { id: 'cb2', sourceAssetId: 'load2', targetAssetId: 'feeder1', sourceRole: null, targetRole: 'OUT', categoryName: 'CV', categoryId: 'cat-1', number: 2, specParams: { capacity: '30A', switchState: 'OFF' } },
    ];
    const ctx = { assets, cables, graph: null, isLoading: false } as unknown as RegisterCtx;
    const section = powerRegisterDescriptor.buildSection(feeder, ctx);

    expect(section.rows).toHaveLength(3);
    const input = section.rows[0];
    expect(input.isInput).toBe(true);
    expect(input.cbNumber).toBe('입력');
    expect(input.loadName).toBe('주변압기');
    expect(input.spec).toBe('CV 6sq');
    expect(input.categoryId).toBe('cat-in');
    expect(input.location).toBe('주변압기'); // supply 자신이 배치됨

    const out1 = section.rows.find((r) => r.cableId === 'cb1')!;
    expect(out1.isInput).toBeFalsy();
    expect(out1.location).toBe('부하A'); // 자신 배치
    const out2 = section.rows.find((r) => r.cableId === 'cb2')!;
    expect(out2.location).toBe('분전반1F'); // 미배치 → placed 부모

    // 사용 라벨은 OUT 행만 카운트(입력 행 제외)
    expect(section.usedLabel).toBe('사용 1/2');
  });

  it('IN 케이블 없으면 입력 행 없음, 모든 행에 location', () => {
    const feeder = placed('feeder1', '피더1');
    const load1 = placed('load1', '부하A');
    const assets = [feeder, load1];
    const cables = [
      { id: 'cb1', sourceAssetId: 'feeder1', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: null, categoryName: 'CV', categoryId: 'cat-1', number: 1, specParams: { capacity: '20A', switchState: 'ON' } },
    ];
    const ctx = { assets, cables, graph: null, isLoading: false } as unknown as RegisterCtx;
    const section = powerRegisterDescriptor.buildSection(feeder, ctx);
    expect(section.rows).toHaveLength(1);
    expect(section.rows[0].isInput).toBeFalsy();
    expect(section.rows[0].location).toBe('부하A');
  });

  it('컬럼은 6개(번호·부하·위치·용량·규격·SW), 부하만 너비 미지정', () => {
    expect(powerRegisterDescriptor.columns.map((c) => c.label)).toEqual(['번호', '부하', '위치', '용량', '규격', 'SW']);
    const unwidthed = powerRegisterDescriptor.columns.filter((c) => !c.width).map((c) => c.label);
    expect(unwidthed).toEqual(['부하']);
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
