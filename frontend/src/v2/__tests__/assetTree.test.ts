import { describe, expect, it } from 'vitest';
import { assetsById, descendantCount, floorAnchorOf, floorIdOf, withDescendants } from '../assetTree';
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

  it('장비는 자기를 담은 설비가 놓인 층의 것이다', () => {
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

/**
 * 내려가는 걸음도 **한 곳에서만** 한다.
 *
 * 예전에는 네 곳에 따로 적혀 있었고, 그중 둘(평면도·정보 탭의 삭제 확인)은 손으로 짠 재귀라
 * 순환을 막는 것이 없었다 — 자료가 한 번 꼬이면 「삭제하시겠습니까」를 띄우려다 화면이 멈춘다.
 */
describe('withDescendants / descendantCount', () => {
  const mk = (id: string, parentAssetId: string | null, name = id) =>
    ({ id, name, parentAssetId }) as unknown as V2Asset;

  it('뿌리가 맨 앞, 그 아래는 이름순', () => {
    const list = [mk('rack', null), mk('b', 'rack'), mk('a', 'rack'), mk('sub', 'a'), mk('other', null)];
    expect(withDescendants(list, 'rack').map((a) => a.id)).toEqual(['rack', 'a', 'b', 'sub']);
    expect(descendantCount(list, 'rack')).toBe(3);
  });

  it('없는 뿌리는 빈 손 — 세면 0이다', () => {
    expect(withDescendants([mk('x', null)], 'nope')).toEqual([]);
    expect(descendantCount([mk('x', null)], 'nope')).toBe(0);
  });

  it('자료가 순환해도 멈춘다 — 본 것은 다시 담지 않는다', () => {
    /* a → b → a. 손으로 짠 재귀였다면 여기서 스택이 넘친다. */
    const cyclic = [mk('a', 'b'), mk('b', 'a')];
    expect(withDescendants(cyclic, 'a').map((x) => x.id)).toEqual(['a', 'b']);
  });
});
