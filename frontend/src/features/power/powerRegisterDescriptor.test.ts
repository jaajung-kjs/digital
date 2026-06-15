import { describe, it, expect } from 'vitest';
import { buildPowerRows } from './powerRegisterDescriptor';

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
