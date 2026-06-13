import { describe, it, expect } from 'vitest';
import { tracePowerUpstream } from './powerTrace';

// 부하L ─cable c1(피더 OUT)→ 피더F ; 충전기C ─cable c2(피더 IN)→ 피더F ; AC ─c3(충전기 IN)→ 충전기C
const assets = [
  { id: 'L', connectionKind: null },
  { id: 'F', connectionKind: 'distributor' },
  { id: 'C', connectionKind: 'distributor' },
  { id: 'AC', connectionKind: null },
];
const cables = [
  { id: 'c1', sourceAssetId: 'F', targetAssetId: 'L', sourceRole: 'OUT', targetRole: null },
  { id: 'c2', sourceAssetId: 'C', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN' },
  { id: 'c3', sourceAssetId: 'AC', targetAssetId: 'C', sourceRole: null, targetRole: 'IN' },
];

describe('tracePowerUpstream', () => {
  it('부하 → 피더 → 충전기 → AC(발전원)까지 상류 추적', () => {
    const r = tracePowerUpstream('L', cables, assets);
    expect(r.map((n) => n.assetId)).toEqual(['L', 'F', 'C', 'AC']);
    expect(r.map((n) => n.cableId)).toEqual([null, 'c1', 'c2', 'c3']);
  });
  it('입력 없는 발전원에서 종료(무한루프 없음)', () => {
    const r = tracePowerUpstream('F', cables, assets);
    expect(r[r.length - 1].assetId).toBe('AC');
  });
});
