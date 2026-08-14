import { describe, it, expect } from 'vitest';
import { assetLocationPath } from '../assetLocation';
import type { V2Asset } from '../types';

const asset = (id: string, name: string, over: Partial<V2Asset> = {}): V2Asset => ({
  id,
  name,
  typeId: 't',
  substationId: 's',
  status: 'normal',
  floorId: null,
  x: null,
  y: null,
  width: null,
  height: null,
  parentAssetId: null,
  assemblyId: null,
  col: null, row: null,
  colSpan: null, rowSpan: null,
  fieldValues: {},
  updatedAt: 'v',
  ports: [],
  ...over,
});

const floors = new Map([['f1', '1층']]);
const build = (...list: V2Asset[]) => new Map(list.map((a) => [a.id, a]));

/* 자리 번호는 상위 **설비의 설비 종류의 격자**에서 나온다 — 랙 모양은 1열, 분전반 조서는 2열. */
const assemblies = new Map([
  ['rack-asm', { id: 'rack-asm', gridCols: 1, gridRows: 12 } as never],
  ['panel-asm', { id: 'panel-asm', gridCols: 2, gridRows: 6 } as never],
]);

describe('자산 위치 경로', () => {
  it('층에 놓인 자산은 층 이름', () => {
    const rack = asset('rack', '전원랙 A', { floorId: 'f1' });
    expect(assetLocationPath(rack, build(rack), floors)).toBe('1층');
  });

  it('설비 안의 부품은 층까지 거슬러 올라간다 — 예전에는 층이 사라졌다', () => {
    const rack = asset('rack', '전원랙 A', { floorId: 'f1', typeId: null, assemblyId: 'rack-asm' });
    const ups = asset('ups', 'UPS-1', { parentAssetId: 'rack', col: 0, row: 0 });
    expect(assetLocationPath(ups, build(rack, ups), floors, assemblies)).toBe('1층 · 전원랙 A · 자리 1');
  });

  /* 부품이 또 부품을 담지 않는다(평평하다) — OFD 도 도면에 바로 놓이는 설비 종류다.
     그래도 경로 계산은 깊이를 가정하지 않는다: 데이터가 그렇게 되면 그대로 따라간다. */
  it('자리 번호가 없으면 이름만 붙는다', () => {
    const ofd = asset('ofd', 'OFD-1', { floorId: 'f1', typeId: null, assemblyId: 'rack-asm' });
    const child = asset('c', '슬롯 1', { parentAssetId: 'ofd' });
    expect(assetLocationPath(child, build(ofd, child), floors, assemblies)).toBe('1층 · OFD-1');
  });

  /* 열이 여럿이면 번호는 행 우선이다 — 2열짜리 조서의 (1,0)은 2번 회로다. */
  it('여러 열 격자에서는 자리 번호가 행 우선으로 매겨진다', () => {
    const panel = asset('p', '분전반 P1', { floorId: 'f1', typeId: null, assemblyId: 'panel-asm' });
    const feeder = asset('f', '피더 콘센트', { parentAssetId: 'p', col: 1, row: 0 });
    expect(assetLocationPath(feeder, build(panel, feeder), floors, assemblies)).toBe('1층 · 분전반 P1 · 자리 2');
  });

  it('상위 설비 종류를 모르면 자리 번호를 1열로 매긴다 — 이름만으로도 어디인지는 읽힌다', () => {
    const rack = asset('rack', '전원랙 A', { floorId: 'f1' });
    const ups = asset('ups', 'UPS-1', { parentAssetId: 'rack', col: 0, row: 0 });
    expect(assetLocationPath(ups, build(rack, ups), floors)).toBe('1층 · 전원랙 A · 자리 1');
  });

  it('어디에도 붙어 있지 않으면 미배치', () => {
    const orphan = asset('o', '떠 있는 자산');
    expect(assetLocationPath(orphan, build(orphan), floors)).toBe('미배치');
  });

  it('상위가 순환해도 멈춘다 — 데이터가 망가져도 화면이 얼지 않게', () => {
    const a = asset('a', 'A', { parentAssetId: 'b' });
    const b = asset('b', 'B', { parentAssetId: 'a' });
    expect(() => assetLocationPath(a, build(a, b), floors)).not.toThrow();
  });
});
