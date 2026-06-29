import { describe, it, expect } from 'vitest';
import { matchesSearch, mergeSearchOverlay } from '../src/services/assetSearch.js';

const committed = [
  { id: 'o1', name: '원주OFD', substationId: 's1', substationName: '원주' },
  { id: 'o2', name: '홍천OFD', substationId: 's2', substationName: '홍천' },
];

describe('matchesSearch', () => {
  it('role·q·substationId 필터(대소문자 무시)', () => {
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { role: 'ofd' })).toBe(true);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { role: 'slot' })).toBe(false);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { q: '원주' })).toBe(true);
    expect(matchesSearch({ name: '원주OFD', substationId: 's1', role: 'ofd' }, { substationId: 's2' })).toBe(false);
  });
});

describe('mergeSearchOverlay', () => {
  it('overlay 없으면 committed 그대로', () => {
    expect(mergeSearchOverlay(committed, undefined, { role: 'ofd' })).toEqual(committed);
  });
  it('deletes 제거', () => {
    const r = mergeSearchOverlay(committed, { creates: [], updates: [], deletes: ['o1'] }, { role: 'ofd' });
    expect(r.map((x) => x.id)).toEqual(['o2']);
  });
  it('filter 일치 creates 추가(미일치 제외, 중복 제외)', () => {
    const overlay = {
      creates: [
        { id: 'o3', name: '신규OFD', role: 'ofd', substationId: 's3', substationName: '신규' },
        { id: 'x9', name: '슬롯', role: 'slot', substationId: 's3', substationName: '신규' }, // role 미일치
        { id: 'o1', name: '원주OFD', role: 'ofd', substationId: 's1', substationName: '원주' }, // 중복(committed)
      ],
      updates: [], deletes: [],
    };
    const r = mergeSearchOverlay(committed, overlay, { role: 'ofd' });
    expect(r.map((x) => x.id).sort()).toEqual(['o1', 'o2', 'o3']); // x9 제외, o1 중복 아님
  });
  it('updates 는 present row 의 표시 필드만 패치', () => {
    const r = mergeSearchOverlay(committed, { creates: [], updates: [{ id: 'o1', name: '원주개명' }], deletes: [] }, { role: 'ofd' });
    expect(r.find((x) => x.id === 'o1')!.name).toBe('원주개명');
  });
});
