import { describe, it, expect } from 'vitest';
import { resolveCableSeed } from './cableSeed';

const cats = [{ id: 'cat1', groupId: 'g1' }];
const cables = [
  { id: 'c1', sourceAssetId: 'a1', targetAssetId: 'a2', categoryId: 'cat1' },
  { id: 'c2', sourceAssetId: null, targetAssetId: 'a3', groupId: 'g2' },
  { id: 'c3', sourceAssetId: 'a4', targetAssetId: null }, // group 미해소
];

describe('resolveCableSeed', () => {
  it('source 우선 seed + categoryId→groupId 해소', () => {
    expect(resolveCableSeed('c1', cables, cats)).toEqual({ seedAssetId: 'a1', groupId: 'g1' });
  });
  it('source 없으면 target seed, 직접 groupId 우선', () => {
    expect(resolveCableSeed('c2', cables, cats)).toEqual({ seedAssetId: 'a3', groupId: 'g2' });
  });
  it('group 해소 불가 → null', () => {
    expect(resolveCableSeed('c3', cables, cats)).toBeNull();
  });
  it('없는 케이블 → null', () => {
    expect(resolveCableSeed('nope', cables, cats)).toBeNull();
  });
});
