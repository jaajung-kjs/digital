import { describe, expect, it } from 'vitest';
import { mediumContainers } from '../peerResolve';

const port = (id: string, medium: string) =>
  ({ id, assetId: 'x', group: 'A', index: 1, name: id, direction: 'BI' as const, medium });

const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});

const rack = asset('rack', '랙 A');

describe('매체 컨테이너 찾기', () => {
  it('그 매체 포트를 가진 자식이 있는 컨테이너만', () => {
    const child = asset('c', '장비', { parentAssetId: 'rack', containerKey: 'main', ports: [port('p', 'power')] });
    const other = asset('o', '광장비', { parentAssetId: 'rack', containerKey: 'main', ports: [port('q', 'fiber')] });
    expect(mediumContainers([rack, child, other] as never, 'power').map((c) => c.asset.id)).toEqual(['rack']);
    expect(mediumContainers([rack, child] as never, 'fiber')).toEqual([]);
  });

  /* 자리 번호는 컨테이너마다 1부터 다시 시작한다(백엔드도 그 단위로 유일성을 강제).
     그래서 한 자산이 컨테이너를 둘 선언하면 표도 둘이어야 한다 — 뭉치면 두 자산이
     같은 회로 번호를 갖는 행이 되어 버린다. */
  it('한 자산이 컨테이너를 둘 가지면 각각 따로 센다', () => {
    const left = asset('L', '좌', { parentAssetId: 'rack', containerKey: 'left', ports: [port('lp', 'power')] });
    const right = asset('R', '우', { parentAssetId: 'rack', containerKey: 'right', ports: [port('rp', 'power')] });
    const out = mediumContainers([rack, left, right] as never, 'power');
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.containerKey)).toEqual(['left', 'right']);
  });

  it('같은 컨테이너의 자식이 여럿이어도 하나로 센다', () => {
    const a = asset('a', 'A', { parentAssetId: 'rack', containerKey: 'main', ports: [port('ap', 'power')] });
    const b = asset('b', 'B', { parentAssetId: 'rack', containerKey: 'main', ports: [port('bp', 'power')] });
    expect(mediumContainers([rack, a, b] as never, 'power')).toHaveLength(1);
  });

  it('자리에 놓이지 않은(키 없는) 자식도 잃지 않는다', () => {
    const loose = asset('n', '떠 있음', { parentAssetId: 'rack', ports: [port('np', 'power')] });
    expect(mediumContainers([rack, loose] as never, 'power')[0]?.containerKey).toBeNull();
  });
});
