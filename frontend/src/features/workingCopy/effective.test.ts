import { describe, it, expect } from 'vitest';
import { mergeEffective } from './effective';
import { emptyOverlay, stageUpdate, stageDelete, stageCreate } from './overlay';
import type { CollectionDescriptor } from './descriptor';

interface Row { id: string; name: string; v: string }
const d: CollectionDescriptor<Row> = {
  name: 'rows', idOf: (r) => r.id, versionOf: (r) => r.v, isTemp: (id) => id.startsWith('temp-'),
};
const saved: Row[] = [{ id: 'a', name: 'A', v: '1' }, { id: 'b', name: 'B', v: '1' }];

describe('mergeEffective', () => {
  it('빈 overlay 면 saved 그대로', () => {
    expect(mergeEffective(saved, emptyOverlay<Row>(), d)).toEqual(saved);
  });
  it('update 패치가 덮인다', () => {
    const o = stageUpdate(emptyOverlay<Row>(), 'a', { name: 'A2' });
    expect(mergeEffective(saved, o, d).find((r) => r.id === 'a')!.name).toBe('A2');
  });
  it('delete 는 제외', () => {
    const o = stageDelete(emptyOverlay<Row>(), 'b');
    expect(mergeEffective(saved, o, d).map((r) => r.id)).toEqual(['a']);
  });
  it('create 는 뒤에 추가', () => {
    const o = stageCreate(emptyOverlay<Row>(), 'temp-x', { id: 'temp-x', name: 'X', v: '' });
    const out = mergeEffective(saved, o, d);
    expect(out).toHaveLength(3);
    expect(out[2].id).toBe('temp-x');
  });
});
