import { describe, expect, it } from 'vitest';
import { placedAssetsOf } from '../floorPlanSelectors';

const asset = (id: string, extra: object) => ({
  id, name: id, typeId: 't', substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: '', ports: [], ...extra,
});

describe('placedAssetsOf', () => {
  it('해당 층 + 좌표 완전한 자산만 투영', () => {
    const list = [
      asset('a', { floorId: 'f1', x: 0, y: 0, width: 60, height: 80 }),
      asset('b', { floorId: 'f2', x: 0, y: 0, width: 60, height: 80 }),
      asset('c', { floorId: 'f1', x: null, y: 0, width: 60, height: 80 }), // 불완전 → 제외
      asset('d', {}), // 미배치 → 제외
    ];
    expect(placedAssetsOf(list as never, 'f1').map((p) => p.id)).toEqual(['a']);
  });

  it('모두 배치된 경우 여러 자산 반환', () => {
    const list = [
      asset('x', { floorId: 'f1', x: 10, y: 20, width: 50, height: 60 }),
      asset('y', { floorId: 'f1', x: 100, y: 200, width: 30, height: 40 }),
      asset('z', { floorId: 'f1', x: 0, y: 0, width: 0, height: 0 }), // 0도 유효
    ];
    expect(placedAssetsOf(list as never, 'f1').map((p) => p.id)).toEqual(['x', 'y', 'z']);
  });

  it('width 또는 height 가 null 이면 제외', () => {
    const list = [
      asset('w', { floorId: 'f1', x: 0, y: 0, width: null, height: 10 }),
      asset('h', { floorId: 'f1', x: 0, y: 0, width: 10, height: null }),
    ];
    expect(placedAssetsOf(list as never, 'f1')).toHaveLength(0);
  });

  it('빈 배열 입력 → 빈 배열 반환', () => {
    expect(placedAssetsOf([], 'f1')).toEqual([]);
  });

  it('PlacedAsset 으로 올바르게 투영', () => {
    const list = [
      asset('p', { floorId: 'f1', x: 5, y: 10, width: 80, height: 120, name: 'TestAsset' }),
    ];
    const result = placedAssetsOf(list as never, 'f1');
    expect(result[0]).toMatchObject({ id: 'p', name: 'TestAsset', x: 5, y: 10, width: 80, height: 120 });
  });
});
