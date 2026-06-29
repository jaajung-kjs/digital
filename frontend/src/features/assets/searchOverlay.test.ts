import { describe, it, expect } from 'vitest';
import { buildSearchOverlay, hashSearchOverlay } from './searchOverlay';

const orgNames = new Map([['s1', '원주'], ['s3', '신규']]);
const assetsOverlay = {
  creates: { 'tmp1': { id: 'tmp1', name: '신규OFD', substationId: 's3', assetType: { role: 'ofd' } } },
  updates: { 'o1': { name: '개명' } },
  deletes: ['o2'],
} as never;

describe('buildSearchOverlay', () => {
  it('creates 는 role·substationName 포함, updates 는 표시필드, deletes 통과', () => {
    const o = buildSearchOverlay(assetsOverlay, orgNames);
    expect(o.creates).toEqual([{ id: 'tmp1', name: '신규OFD', role: 'ofd', substationId: 's3', substationName: '신규' }]);
    expect(o.updates).toEqual([{ id: 'o1', name: '개명' }]);
    expect(o.deletes).toEqual(['o2']);
  });
  it('hash 는 키 순서에 안정', () => {
    const a = buildSearchOverlay(assetsOverlay, orgNames);
    expect(hashSearchOverlay(a)).toBe(hashSearchOverlay(buildSearchOverlay(assetsOverlay, orgNames)));
  });
  it('빈 overlay → 빈 해시', () => {
    expect(hashSearchOverlay({ creates: [], updates: [], deletes: [] })).toBe('');
  });
});
