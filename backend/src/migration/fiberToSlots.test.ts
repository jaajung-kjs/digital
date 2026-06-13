import { describe, it, expect } from 'vitest';
import { planFiberMigration } from './fiberToSlots';

const ofdInfo = new Map([
  ['ofdW', { substationId: 'sW', name: '원주OFD' }],
  ['ofdH', { substationId: 'sH', name: '홍천OFD' }],
]);
const fiberPaths = [{ id: 'fp1', ofdAId: 'ofdW', ofdBId: 'ofdH', portCount: 24 }];
const fiberCables = [
  { id: 'c1', sourceAssetId: 'eqA', targetAssetId: 'ofdW', fiberPathId: 'fp1', fiberPortNumber: 5 },
];
const fiberCores = [
  { fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말', circuitText: '원주 GR2링', spliceType: '패치', usageOverride: null },
];

describe('planFiberMigration', () => {
  it('FiberPath→슬롯 2 + OPGW 1, fiber케이블→OUT(번호·메타)', () => {
    const p = planFiberMigration(fiberPaths, fiberCables, fiberCores, ofdInfo);
    expect(p.slots).toHaveLength(2);
    expect(p.slots.find((s) => s.parentAssetId === 'ofdW')?.substationId).toBe('sW');
    expect(p.slots.find((s) => s.parentAssetId === 'ofdW')?.name).toBe('홍천OFD'); // 대국명
    expect(p.opgwCables).toHaveLength(1);
    expect(p.outCables).toHaveLength(1);
    const out = p.outCables[0];
    expect(out.number).toBe(5);
    expect(out.equipmentAssetId).toBe('eqA');
    expect(out.slotKey).toBe('slot:fp1:A'); // ofdW=A
    expect(out.specParams).toMatchObject({ purpose: '통합단말', circuitText: '원주 GR2링', spliceType: '패치' });
  });

  it('OFD 정보 없는 고아 path 는 skip', () => {
    const p = planFiberMigration([{ id: 'fpX', ofdAId: 'ghost', ofdBId: 'ofdH', portCount: 24 }], [], [], ofdInfo);
    expect(p.slots).toHaveLength(0);
    expect(p.opgwCables).toHaveLength(0);
  });
});
