import { describe, it, expect } from 'vitest';
import { buildDelta } from './delta';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete } from './overlay';

interface Row { id: string; name: string }

describe('buildDelta', () => {
  it('creates/updates/deletes + baseVersion 동봉', () => {
    let o = emptyOverlay<Row>();
    o.baseVersions = { a: 'v1', b: 'v1' };
    o = stageUpdate(o, 'a', { name: 'A2' });
    o = stageDelete(o, 'b');
    o = stageCreate(o, 'temp-x', { id: 'temp-x', name: 'X' });
    const delta = buildDelta(o);
    expect(delta.creates).toEqual([{ id: 'temp-x', name: 'X' }]);
    expect(delta.updates).toEqual([{ id: 'a', baseVersion: 'v1', patch: { name: 'A2' } }]);
    expect(delta.deletes).toEqual([{ id: 'b', baseVersion: 'v1' }]);
  });
  it('base 없는 항목은 baseVersion null', () => {
    let o = stageUpdate(emptyOverlay<Row>(), 'z', { name: 'Z' });
    expect(buildDelta(o).updates[0].baseVersion).toBeNull();
  });
  it('create+update 같은 tempId(place 후 drag): create 1개에 패치 반영, updates 비어있음', () => {
    let o = stageCreate(emptyOverlay<Row>(), 't1', { id: 't1', name: 'orig' });
    o = stageUpdate(o, 't1', { name: 'X' });
    const delta = buildDelta(o);
    expect(delta.creates).toEqual([{ id: 't1', name: 'X' }]);
    expect(delta.updates).toEqual([]);
  });
});
