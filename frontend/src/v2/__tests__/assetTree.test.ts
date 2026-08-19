import { describe, expect, it } from 'vitest';
import { assetsById, floorAnchorOf, floorIdOf } from '../assetTree';
import type { V2Asset } from '../types';

const a = (id: string, over: Partial<V2Asset> = {}): V2Asset => ({
  id, name: id, typeId: null, substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: '', ports: [], ...over,
});

describe('floorAnchorOf', () => {
  const rack = a('rack', { floorId: 'f1' });
  const part = a('part', { parentAssetId: 'rack' });
  const deep = a('deep', { parentAssetId: 'part' });
  const byId = assetsById([rack, part, deep]);

  it('부품은 자기를 담은 설비가 놓인 층의 것이다', () => {
    expect(floorAnchorOf('deep', byId)?.id).toBe('rack');
    expect(floorIdOf('deep', byId)).toBe('f1');
  });

  it('도면에 없으면 null', () => {
    const orphan = a('x');
    expect(floorIdOf('x', assetsById([orphan]))).toBeNull();
  });

  /* 자료가 꼬여 부모가 서로를 가리켜도 **멈춘다** — 예전에는 이 걸음이 화면마다 손으로
     적혀 있었고 순환을 막는 것은 그중 하나뿐이라, 나머지는 화면이 굳었다. */
  it('순환해도 멈춘다', () => {
    const p1 = a('p1', { parentAssetId: 'p2' });
    const p2 = a('p2', { parentAssetId: 'p1' });
    expect(floorIdOf('p1', assetsById([p1, p2]))).toBeNull();
  });
});
