import { describe, it, expect } from 'vitest';
import { resolveSelectedCable } from './selectionHighlight';

const cables = [
  { id: 'in', sourceAssetId: 'src', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', number: null },
  { id: 'b2', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: null, number: 2 },
  { id: 'o3', sourceAssetId: 'S', targetAssetId: 'e3', sourceRole: 'OUT', targetRole: null, number: 3 },
  { id: 'opgw', sourceAssetId: 'S', targetAssetId: 'RS', sourceRole: 'IN', targetRole: 'IN', number: null },
];

describe('resolveSelectedCable', () => {
  it('슬롯 OUT 코어: number===core 케이블', () => {
    expect(resolveSelectedCable('S', 3, cables)).toBe('o3');
  });
  it('피더 분기: number===core(CB)', () => {
    expect(resolveSelectedCable('F', 2, cables)).toBe('b2');
  });
  it('피더 입력(core 0): 그 자산의 IN 케이블', () => {
    expect(resolveSelectedCable('F', 0, cables)).toBe('in');
  });
  it('core null: 자산에 닿는 대표 케이블(전체 연결 하이라이트)', () => {
    expect(resolveSelectedCable('F', null, cables)).toBe('in');
  });
  it('자산 없음/매칭 없음 → null', () => {
    expect(resolveSelectedCable(null, 2, cables)).toBeNull();
    expect(resolveSelectedCable('S', 9, cables)).toBeNull();
  });
});
