import { describe, expect, it } from 'vitest';
import { cableCountByPortId, cableSegments, distanceToPolyline } from '../cableSelectors';

const port = (id: string, assetId: string, medium = 'fiber') => ({ id, assetId, group: 'A', index: 1, name: id, direction: 'BI' as const, medium });
const cable = (id: string, a: string, b: string, pathPoints: {x:number;y:number}[] = []) => ({ id, name: null, substationId: 's', aPortId: a, bPortId: b, categoryId: null, pathPoints, specParams: {}, updatedAt: 'v' });

describe('cableCountByPortId', () => {
  it('포트마다 몇 가닥인지 센다 — 같은 포트에 여러 가닥이면 그만큼', () => {
    const cables = [cable('c1', 'bus', 'x'), cable('c2', 'bus', 'y')];
    expect(cableCountByPortId(cables as never).get('bus')).toBe(2);
    expect(cableCountByPortId(cables as never).get('x')).toBe(1);
  });
});

describe('cableSegments', () => {
  const a1 = { id: 'a1', name: 'a1', floorId: 'f1', x: 0, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p1', 'a1')] };
  const a2 = { id: 'a2', name: 'a2', floorId: 'f1', x: 100, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p2', 'a2')] };
  const a3 = { id: 'a3', name: 'a3', floorId: 'f2', x: 0, y: 0, width: 20, height: 20, parentAssetId: null, ports: [port('p3', 'a3')] };
  it('양끝이 이 층에 있으면 중심점+경유점을 잇는다', () => {
    const segs = cableSegments([cable('c1', 'p1', 'p2', [{ x: 50, y: 50 }])] as never, [a1, a2, a3] as never, 'f1');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.points).toEqual([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 110, y: 10 }]);
    expect(segs[0]!.outgoing).toBeUndefined();
  });

  /**
   * 반대쪽이 이 층에 없는 회선 — **도면 밖으로 뽑고 어디로 가는지 적는다**.
   *
   * 예전에는 통째로 빠졌다: OPGW 로 다른 국에 나가는 광이 선번장에는 있는데 도면에는
   * 없었다. 도면만 보고 「이 국에서 몇 회선이 나가나」를 셀 수 없다는 뜻이다.
   */
  describe('나가는 회선', () => {
    /* 다른 층(f2)에 있는 a3 로 가는 케이블 — 이 층에서는 나가는 회선이다. */
    it('한쪽만 이 층에 있으면 인출선으로 그리고 꼬리표를 단다', () => {
      const segs = cableSegments([cable('c2', 'p1', 'p3')] as never, [a1, a2, a3] as never, 'f1');
      expect(segs).toHaveLength(1);
      expect(segs[0]!.bAssetId).toBeNull();
      /* 같은 국이면 **어느 층으로 가는지**를 적는다 — 장비 이름은 그 층에 가면 보인다.
         (다른 국이면 국 이름 — `substationName`. 층을 모르면 장비 이름으로 물러선다.) */
      expect(segs[0]!.outgoing?.label).toBe('a3');
      const withFloors = cableSegments([cable('c2', 'p1', 'p3')] as never, [a1, a2, a3] as never, 'f1', [{ id: 'f2', name: '2층' }]);
      expect(withFloors[0]!.outgoing?.label).toBe('2층');
      /**
       * 인출선은 **위로** 뽑는다 — 도면의 다른 것에 기대지 않는다.
       *
       * 한때 「놓인 것들의 한가운데에서 멀어지는 쪽」이었다. 안쪽을 안 가로지르게 하려던
       * 것인데, 그 한가운데는 도면의 **모든** 자산이 정한다 — 아무 상관없는 설비를 하나 옮길
       * 때마다 인출선이 통째로 방향을 바꿨다. 게다가 「안 가로지른다」는 보장이 아니라 어림이라
       * 배치에 따라 얼마든지 가로질렀다. 어림으로 흔들리느니 늘 같은 자리가 낫다.
       */
      const pts = segs[0]!.points;
      expect(pts[0]).toEqual({ x: 10, y: 10 });
      expect(pts[pts.length - 1]!.x).toBe(10);
      expect(pts[pts.length - 1]!.y).toBeLessThan(10);
    });

    /** **아무 상관없는 설비를 옮겨도 인출선은 그대로다** — 남의 손짓에 흔들리면 그림을 믿지 않는다. */
    it('다른 자산이 움직여도 인출선 방향은 안 바뀐다', () => {
      const 그대로 = cableSegments([cable('c2', 'p1', 'p3')] as never, [a1, a2, a3] as never, 'f1');
      const 옮긴뒤 = cableSegments(
        [cable('c2', 'p1', 'p3')] as never,
        [a1, { ...a2, x: 900, y: 900 }, a3] as never,
        'f1',
      );
      expect(옮긴뒤[0]!.points).toEqual(그대로[0]!.points);
    });

    it('그린 경로가 있으면 그 방향으로 뽑는다 — 사람이 그은 쪽이 나가는 쪽이다', () => {
      const segs = cableSegments([cable('c3', 'p1', 'p3', [{ x: 10, y: 200 }])] as never, [a1, a2, a3] as never, 'f1');
      const pts = segs[0]!.points;
      expect(pts.slice(0, 2)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 200 }]);
      /* 마지막 구간의 방향(아래쪽)으로 이어 뽑는다. */
      expect(pts[2]!.x).toBe(10);
      expect(pts[2]!.y).toBeGreaterThan(200);
    });

    /**
     * 한 OFD 에서 **여러 국으로** 나가는 것이 보통이다(OPGW 여러 가닥). 전부 같은 방향으로
     * 뽑으면 선도 꼬리표도 한자리에 겹쳐 어디로 가는 회선인지 읽을 수 없다.
     */
    it('행선지가 여럿이면 부채꼴로 갈라 뽑는다 — 같은 곳으로 가는 것은 한 갈래', () => {
      const far = (id: string) => ({ ...a3, id, name: id, ports: [port(`fp-${id}`, id)] });
      const segs = cableSegments(
        [cable('c1', 'p1', 'fp-A'), cable('c2', 'p1', 'fp-B'), cable('c3', 'p1', 'fp-B')] as never,
        [a1, far('A'), far('B')] as never,
        'f1',
      );
      const endOf = (label: string) => {
        const seg = segs.find((x) => x.outgoing?.label === label)!;
        return seg.points[seg.points.length - 1]!;
      };
      /* 같은 곳으로 가는 둘(c2·c3)은 **같은 자리**로 나간다 — 그래야 한 다발로 묶여 ×2 가 된다. */
      const bs = segs.filter((x) => x.outgoing?.label === 'B');
      expect(bs).toHaveLength(2);
      expect(bs[0]!.points).toEqual(bs[1]!.points);
      /* 다른 곳으로 가는 것은 갈라진다 — 끝이 서로 멀어야 꼬리표가 겹치지 않는다. */
      const [ea, eb] = [endOf('A'), endOf('B')];
      expect(Math.hypot(ea.x - eb.x, ea.y - eb.y)).toBeGreaterThan(20);
    });

    it('양 끝이 다 이 층 밖이면 이 도면의 선이 아니다', () => {
      const other = { ...a3, id: 'a4', ports: [port('p4', 'a4')] };
      expect(cableSegments([cable('c4', 'p3', 'p4')] as never, [a1, a3, other] as never, 'f1')).toEqual([]);
    });

    /* 경로는 늘 a→b 로 저장된다 — 이 층 끝이 b 쪽이면 거꾸로 따라가야 손이 그은 모양이 된다. */
    it('이 층 끝이 b 쪽이면 경로를 뒤집어 따라간다', () => {
      const segs = cableSegments([cable('c5', 'p3', 'p1', [{ x: 10, y: 200 }])] as never, [a1, a3] as never, 'f1');
      const pts = segs[0]!.points;
      expect(pts.slice(0, 2)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 200 }]);
    });
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
