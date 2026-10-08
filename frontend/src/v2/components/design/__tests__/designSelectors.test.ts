import { designItems } from '@twin/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Link } from '../../../model/types';
import { designInput, hasUnpricedChanges } from '../designSelectors';

const far = (id: string): Link => ({
  id, substationId: 'FAR', cableTypeId: null, lengthM: 4, spec: null, note: null, pathPoints: [],
  a: { kind: 'core', lineId: 'L1', no: 1, side: 'B' }, b: { kind: 'core', lineId: 'L1', no: 2, side: 'B' }, updatedAt: 't',
});
const CATALOG = { rackTypes: [], equipmentTypes: [], cableTypes: [] };

beforeEach(() => store.getState().reset());

describe('designInput — 들르지 않은 국의 먼 연결', () => {
  it('지우기로 한 먼 연결은 케이블 철거, 손대지 않은 먼 연결은 산출하지 않는다', () => {
    store.setState({ saved: { ...store.getState().saved, substations: { S1: { id: 'S1', name: '북춘천S/S' } }, farLinks: [far('gone'), far('kept')] } });
    store.getState().applyOverlays((o) => ({ ...o, links: { ...o.links, deletes: ['gone'] } }));
    const items = designItems(designInput(store.getState(), CATALOG, () => '화천S/S'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'cable-remove', target: 'link', qty: 4, primarySubstationId: 'FAR' });
  });
});

describe('hasUnpricedChanges — 있던 연결·광선로의 길이·품목이 실제로 바뀌었을 때만', () => {
  const near = (id: string): Link => ({ ...far(id), substationId: 'S1' });
  const seedLinks = () => store.setState({ saved: { ...store.getState().saved, links: [near('k1')] } });

  it('길이가 바뀌면 알린다', () => {
    seedLinks();
    store.getState().update('links', 'k1', { lengthM: 9 });
    expect(hasUnpricedChanges(store.getState())).toBe(true);
  });

  it('같은 값으로 되돌리거나 메모만 바꾸면 알리지 않는다', () => {
    seedLinks();
    store.getState().update('links', 'k1', { lengthM: 4, note: '메모' });
    expect(hasUnpricedChanges(store.getState())).toBe(false);
  });

  it('지운 연결의 고침은 철거로 이미 센다', () => {
    seedLinks();
    store.getState().update('links', 'k1', { lengthM: 9 });
    store.getState().remove('links', 'k1');
    expect(hasUnpricedChanges(store.getState())).toBe(false);
  });
});
