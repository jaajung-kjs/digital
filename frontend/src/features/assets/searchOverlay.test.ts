import { describe, it, expect } from 'vitest';
import { buildSearchOverlay, hashSearchOverlay, SearchOverlay } from './searchOverlay';

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

  it('creates·deletes 순서가 뒤바뀐 두 overlay 는 동일 해시를 반환한다', () => {
    const a: SearchOverlay = {
      creates: [
        { id: 'z1', name: 'A', role: null, substationId: 's1', substationName: '원주' },
        { id: 'a1', name: 'B', role: 'ofd', substationId: 's3', substationName: '신규' },
      ],
      updates: [],
      deletes: ['del-z', 'del-a'],
    };
    const b: SearchOverlay = {
      creates: [
        { id: 'a1', name: 'B', role: 'ofd', substationId: 's3', substationName: '신규' },
        { id: 'z1', name: 'A', role: null, substationId: 's1', substationName: '원주' },
      ],
      updates: [],
      deletes: ['del-a', 'del-z'],
    };
    expect(hashSearchOverlay(a)).toBe(hashSearchOverlay(b));
  });

  it('name 에 : 또는 | 가 포함된 서로 다른 overlay 는 다른 해시를 반환한다 (충돌 없음)', () => {
    const base: SearchOverlay = {
      creates: [{ id: 'x1', name: 'foo:bar', role: null, substationId: 's1', substationName: null }],
      updates: [],
      deletes: [],
    };
    const collider: SearchOverlay = {
      creates: [{ id: 'x1', name: 'foo', role: null, substationId: 's1', substationName: 'bar' }],
      updates: [],
      deletes: [],
    };
    expect(hashSearchOverlay(base)).not.toBe(hashSearchOverlay(collider));
  });

  it('substationName 에 | 가 포함된 서로 다른 overlay 는 다른 해시를 반환한다 (충돌 없음)', () => {
    const withPipe: SearchOverlay = {
      creates: [{ id: 'y1', name: 'alpha', role: null, substationId: 's1', substationName: 'A|B' }],
      updates: [],
      deletes: [],
    };
    const withoutPipe: SearchOverlay = {
      creates: [{ id: 'y1', name: 'alpha', role: null, substationId: 's1', substationName: 'A' }],
      updates: [],
      deletes: ['B'],
    };
    expect(hashSearchOverlay(withPipe)).not.toBe(hashSearchOverlay(withoutPipe));
  });
});
