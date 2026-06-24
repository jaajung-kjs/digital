import { describe, it, expect } from 'vitest';
import { makeCategoryGroupOf } from './useAssetConnections';
import type { CableCategory } from '../../../types/cableCategory';

describe('makeCategoryGroupOf', () => {
  const cats = [{ id: 'fib', groupName: '광케이블', groupColor: '#22c55e', name: 'OPGW' }] as unknown as CableCategory[];
  it('categoryId 매칭 → 그룹 이름·색', () => {
    expect(makeCategoryGroupOf(cats)({ categoryId: 'fib' })).toMatchObject({ key: '광케이블', label: '광케이블', color: '#22c55e' });
  });
  it('미분류 → 기타(폴백 없음)', () => {
    expect(makeCategoryGroupOf(cats)({ categoryId: null })).toMatchObject({ key: '기타', label: '기타', color: null });
  });
});
