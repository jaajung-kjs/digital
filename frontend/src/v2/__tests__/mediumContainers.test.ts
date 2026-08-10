import { describe, expect, it } from 'vitest';
import { mediumContainers } from '../peerResolve';

const port = (id: string, medium: string) =>
  ({ id, assetId: 'x', group: 'A', index: 1, name: id, direction: 'BI' as const, medium });

const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', assemblyId: null, substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});

/* 표의 단위는 **설비 하나**다. 예전에는 (자산, 컨테이너) 쌍이었다 — 자리를 자산 종류이
   선언했고 타입이 컨테이너를 여럿 가질 수 있었기 때문인데, 이제 자리는 설비 종류의 격자
   하나뿐이라 그 축이 사라졌다. */
const rack = asset('rack', '랙 A', { typeId: null, assemblyId: 'asm-1' });

describe('매체별 설비 찾기', () => {
  it('그 매체 포트를 가진 부품이 있는 설비만', () => {
    const child = asset('c', '장비', { parentAssetId: 'rack', ports: [port('p', 'power')] });
    const other = asset('o', '광장비', { parentAssetId: 'rack', ports: [port('q', 'fiber')] });
    expect(mediumContainers([rack, child, other] as never, 'power').map((c) => c.id)).toEqual(['rack']);
    expect(mediumContainers([rack, child] as never, 'fiber')).toEqual([]);
  });

  it('부품이 여럿이어도 설비는 하나로 센다', () => {
    const a = asset('a', 'A', { parentAssetId: 'rack', ports: [port('ap', 'power')] });
    const b = asset('b', 'B', { parentAssetId: 'rack', ports: [port('bp', 'power')] });
    expect(mediumContainers([rack, a, b] as never, 'power')).toHaveLength(1);
  });

  it('자리에 놓이지 않은 부품도 잃지 않는다', () => {
    const loose = asset('n', '떠 있음', { parentAssetId: 'rack', ports: [port('np', 'power')] });
    expect(mediumContainers([rack, loose] as never, 'power').map((c) => c.id)).toEqual(['rack']);
  });
});
