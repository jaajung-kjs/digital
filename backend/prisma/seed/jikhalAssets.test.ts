import { describe, it, expect } from 'vitest';
import { juuid, orderAssets } from './jikhalAssets';

describe('juuid', () => {
  it('결정적·uuid 형식(version4·variant b)', () => {
    const a = juuid(1, 'guchuncheon');
    const b = juuid(1, 'guchuncheon');
    expect(a).toBe(b);
    expect(a).toMatch(/^9a000101-0000-4000-b000-[0-9a-f]{12}$/);
  });
  it('type/key 다르면 다른 id', () => {
    expect(juuid(1, 'x')).not.toBe(juuid(2, 'x'));
    expect(juuid(3, 'a')).not.toBe(juuid(3, 'b'));
  });
});

describe('orderAssets', () => {
  it('부모(parentKey=null)가 자식보다 앞', () => {
    const out = orderAssets([
      { key: 'slot', parentKey: 'ofd' },
      { key: 'ofd', parentKey: null },
    ]);
    expect(out.map((a) => a.key)).toEqual(['ofd', 'slot']);
  });
});
