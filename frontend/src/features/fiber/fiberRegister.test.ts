import { describe, it, expect } from 'vitest';
import { buildFiberCoreRows } from './fiberRegister';
import type { FiberPathDetail, FiberCore } from './types';

const path: FiberPathDetail = {
  id: 'fp1',
  ofdA: { id: 'ofdLocal', name: '원주OFD', substationName: '원주', floorId: 'f1' },
  ofdB: { id: 'ofdRemote', name: '홍천OFD', substationName: '홍천', floorId: 'f2' },
  portCount: 3,
  description: null,
  ports: [
    { portNumber: 1, sideA: null, sideB: null },
    { portNumber: 2, sideA: { cableId: 'c2', assetId: 'a2', assetName: '송변전광단말' }, sideB: { cableId: 'c2r', assetId: 'r2', assetName: '홍천단말' } },
    { portNumber: 3, sideA: null, sideB: null },
  ],
  createdAt: '', updatedAt: '',
};

describe('buildFiberCoreRows', () => {
  it('로컬=ofdA 일 때 near=sideA, far=sideB', () => {
    const rows = buildFiberCoreRows(path, 'ofdLocal', []);
    expect(rows[1].near?.assetName).toBe('송변전광단말');
    expect(rows[1].far?.assetName).toBe('홍천단말');
    expect(rows[1].occupied).toBe(true);
    expect(rows[1].usage).toBe('사용');
  });

  it('로컬=ofdB 면 near/far 가 뒤집힌다', () => {
    const rows = buildFiberCoreRows(path, 'ofdRemote', []);
    expect(rows[1].near?.assetName).toBe('홍천단말');
    expect(rows[1].far?.assetName).toBe('송변전광단말');
  });

  it('빈 코어는 occupied=false, usage=미사용', () => {
    const rows = buildFiberCoreRows(path, 'ofdLocal', []);
    expect(rows[0].occupied).toBe(false);
    expect(rows[0].usage).toBe('미사용');
  });

  it('FiberCore 메타를 코어번호로 머지하고 coreRecordId 를 단다', () => {
    const cores: FiberCore[] = [{ id: 'fc1', fiberPathId: 'fp1', coreNumber: 2, purpose: '통합단말', circuitText: '원주 GR2링', spliceType: '패치', usageOverride: null }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[1].purpose).toBe('통합단말');
    expect(rows[1].circuitText).toBe('원주 GR2링');
    expect(rows[1].coreRecordId).toBe('fc1');
  });

  it('usageOverride 가 점유 도출을 이긴다(빈 코어를 사용으로 예약)', () => {
    const cores: FiberCore[] = [{ id: 'fc2', fiberPathId: 'fp1', coreNumber: 1, purpose: null, circuitText: null, spliceType: null, usageOverride: '사용' }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[0].occupied).toBe(false);
    expect(rows[0].usage).toBe('사용');
  });

  it('다른 fiberPath 의 메타는 무시한다', () => {
    const cores: FiberCore[] = [{ id: 'x', fiberPathId: 'OTHER', coreNumber: 2, purpose: '엉뚱', circuitText: null, spliceType: null, usageOverride: null }];
    const rows = buildFiberCoreRows(path, 'ofdLocal', cores);
    expect(rows[1].purpose).toBeNull();
  });
});
