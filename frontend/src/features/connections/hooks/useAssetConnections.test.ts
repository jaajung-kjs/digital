import { describe, it, expect } from 'vitest';
import { makeCategoryGroupOf } from './useAssetConnections';
import type { CableCategory } from '../../../types/cableCategory';

describe('makeCategoryGroupOf', () => {
  const cats = [{ id: 'fib', displayGroup: '광', displayColor: '#22c55e', name: '광케이블' }] as unknown as CableCategory[];
  it('categoryId 매칭 → displayGroup 그룹', () => {
    expect(makeCategoryGroupOf(cats)({ categoryId: 'fib', cableType: 'FIBER' })).toMatchObject({ key: '광', label: '광', color: '#22c55e' });
  });
  it('미분류 FIBER → cableType→displayGroup 폴백(광)', () => {
    expect(makeCategoryGroupOf(cats)({ categoryId: null, cableType: 'FIBER' })).toMatchObject({ key: '광', label: '광' });
  });
});
