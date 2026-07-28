import { describe, expect, it } from 'vitest';
import { cableSegments, distanceToPolyline, freePortsOf, occupiedPortIds, withDescendants } from '../cableSelectors';

const port = (id: string, assetId: string, medium = 'fiber') => ({ id, assetId, group: 'A', index: 1, name: id, direction: 'BI' as const, medium });
const cable = (id: string, a: string, b: string, pathPoints: {x:number;y:number}[] = []) => ({ id, name: null, substationId: 's', aPortId: a, bPortId: b, categoryId: null, pathPoints, specParams: {}, updatedAt: 'v' });

describe('freePortsOf / occupiedPortIds', () => {
  const asset = { id: 'a1', ports: [port('p1', 'a1'), port('p2', 'a1', 'power')] } as never;
  it('점유 제외 + medium 필터', () => {
    const cables = [cable('c1', 'p1', 'px')];
    expect(freePortsOf(asset, cables as never).map((p) => p.id)).toEqual(['p2']);
    expect(freePortsOf(asset, [] as never, 'fiber').map((p) => p.id)).toEqual(['p1']);
    expect(occupiedPortIds(cables as never)).toEqual(new Set(['p1', 'px']));
  });
});

describe('cableSegments', () => {
  const a1 = { id: 'a1', floorId: 'f1', x: 0, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p1', 'a1')] };
  const a2 = { id: 'a2', floorId: 'f1', x: 100, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p2', 'a2')] };
  const a3 = { id: 'a3', floorId: 'f2', x: 0, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p3', 'a3')] };
  it('양끝 모두 해당 층 배치 케이블만, 중심점+경유점', () => {
    const segs = cableSegments([cable('c1', 'p1', 'p2', [{ x: 50, y: 50 }]), cable('c2', 'p1', 'p3')] as never, [a1, a2, a3] as never, 'f1');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.points).toEqual([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 110, y: 10 }]);
  });
  it('자식 포트 케이블은 배치 조상(컨테이너) 중심으로 해소', () => {
    const ofd = { id: 'ofd', floorId: 'f1', x: 0, y: 0, width: 40, height: 40, parentAssetId: null, ports: [] };
    const slot = { id: 'slot', floorId: null, x: null, y: null, width: null, height: null, parentAssetId: 'ofd', ports: [port('ps', 'slot')] };
    const dev = { id: 'dev', floorId: 'f1', x: 100, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('pd', 'dev')] };
    const segs = cableSegments([cable('c1', 'ps', 'pd')] as never, [ofd, slot, dev] as never, 'f1');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.points[0]).toEqual({ x: 20, y: 20 }); // OFD 중심
    expect(segs[0]!.aAssetId).toBe('ofd');
  });
});

describe('distanceToPolyline', () => {
  it('세그먼트 수직거리', () => {
    expect(distanceToPolyline({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(3);
    expect(distanceToPolyline({ x: -5, y: 0 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(5);
  });
});

describe('withDescendants', () => {
  it('루트+전이적 자식, 루트 우선', () => {
    const mk = (id: string, parentAssetId: string | null) => ({ id, name: id, parentAssetId } as never);
    const list = [mk('rack', null), mk('mod1', 'rack'), mk('sub', 'mod1'), mk('other', null)];
    expect(withDescendants(list as never, 'rack').map((a: { id: string }) => a.id)).toEqual(['rack', 'mod1', 'sub']);
  });
});
