import { describe, it, expect } from 'vitest';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete, overlayDirtyCount, snapshotBaseVersions } from './overlay';

interface Row { id: string; name: string; v: string }

describe('overlay reducers', () => {
  it('emptyOverlay 는 비어있고 dirty 0', () => {
    expect(overlayDirtyCount(emptyOverlay<Row>())).toBe(0);
  });
  it('stageUpdate 는 누적 머지', () => {
    let o = emptyOverlay<Row>();
    o = stageUpdate(o, 'a', { name: 'A2' });
    o = stageUpdate(o, 'a', { v: '9' } as Partial<Row>);
    expect(o.updates['a']).toEqual({ name: 'A2', v: '9' });
    expect(overlayDirtyCount(o)).toBe(1);
  });
  it('stageDelete 는 deletes 에 넣고 updates 에서 제거', () => {
    let o = stageUpdate(emptyOverlay<Row>(), 'a', { name: 'X' });
    o = stageDelete(o, 'a');
    expect(o.deletes).toContain('a');
    expect(o.updates['a']).toBeUndefined();
  });
  it('temp 생성 후 삭제하면 creates 에서 제거(서버 안 감)', () => {
    let o = stageCreate(emptyOverlay<Row>(), 'temp-x', { id: 'temp-x', name: 'X', v: '' });
    o = stageDelete(o, 'temp-x', true);
    expect(o.creates['temp-x']).toBeUndefined();
    expect(o.deletes).not.toContain('temp-x');
  });
  it('snapshotBaseVersions 는 id→version', () => {
    const bv = snapshotBaseVersions([{ id: 'a', name: 'A', v: '1' }], (r: Row) => r.id, (r: Row) => r.v);
    expect(bv).toEqual({ a: '1' });
  });
});
