import { describe, expect, it } from 'vitest';
import { newCatalogKey } from '../catalogKey';

describe('newCatalogKey', () => {
  it('종류별 접두를 붙인다', () => {
    expect(newCatalogKey('equipment-types')).toMatch(/^EQ-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(newCatalogKey('rack-types')).toMatch(/^RACK-/);
    expect(newCatalogKey('cable-types')).toMatch(/^CABLE-/);
    expect(newCatalogKey('categories')).toMatch(/^CAT-/);
  });
  it('두 번 부르면 다르다', () => {
    expect(newCatalogKey('rack-types')).not.toBe(newCatalogKey('rack-types'));
  });
});
