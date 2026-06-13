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

  it('슬롯에 마이그레이션 마커(attributes) 포함', () => {
    const p = planFiberMigration(fiberPaths, fiberCables, fiberCores, ofdInfo);
    const slotA = p.slots.find((s) => s.parentAssetId === 'ofdW');
    const slotB = p.slots.find((s) => s.parentAssetId === 'ofdH');
    expect(slotA?.attributes).toMatchObject({ __migration: 'fiberToSlots', __fiberPathId: 'fp1', __side: 'A' });
    expect(slotB?.attributes).toMatchObject({ __migration: 'fiberToSlots', __fiberPathId: 'fp1', __side: 'B' });
  });

  it('OPGW 케이블에 마이그레이션 마커(specParams) + substationId 포함', () => {
    const p = planFiberMigration(fiberPaths, fiberCables, fiberCores, ofdInfo);
    const opgw = p.opgwCables[0];
    expect(opgw.specParams).toMatchObject({ __migration: 'fiberToSlots', __fiberPathId: 'fp1' });
    expect(opgw.substationId).toBe('sW'); // A-end OFD 의 substationId
  });

  it('OUT 케이블에 마이그레이션 마커(__migration, __fiberPathId, __fromCableId) 포함', () => {
    const p = planFiberMigration(fiberPaths, fiberCables, fiberCores, ofdInfo);
    const out = p.outCables[0];
    expect(out.specParams).toMatchObject({
      __migration: 'fiberToSlots',
      __fiberPathId: 'fp1',
      __fromCableId: 'c1',
    });
  });

  it('I3: equip 이 반대편 OFD 이면 OUT 케이블 생성 skip (OFD↔OFD 직결 케이블은 OPGW로 처리)', () => {
    // cable whose "equipment" end is the other OFD — should be skipped
    const ofdToOfdCable = [
      { id: 'cOFD', sourceAssetId: 'ofdW', targetAssetId: 'ofdH', fiberPathId: 'fp1', fiberPortNumber: null },
    ];
    const p = planFiberMigration(fiberPaths, ofdToOfdCable, [], ofdInfo);
    expect(p.outCables).toHaveLength(0);
  });

  it('I3: equip 이 A-side OFD 이면 OUT 케이블 생성 skip (B-side 출발 OFD↔OFD)', () => {
    // cable: sourceAssetId=ofdH (B-side OFD), targetAssetId=ofdW (A-side OFD)
    // After side detection: side='B', equip='ofdW' which equals ofdAId — skip
    const ofdToOfdCableB = [
      { id: 'cOFD2', sourceAssetId: 'ofdH', targetAssetId: 'ofdW', fiberPathId: 'fp1', fiberPortNumber: null },
    ];
    const p = planFiberMigration(fiberPaths, ofdToOfdCableB, [], ofdInfo);
    expect(p.outCables).toHaveLength(0);
  });
});
