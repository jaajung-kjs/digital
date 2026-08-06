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
  containerKey: null,
  slotIndex: null,
  slotSpan: null,
  fieldValues: {},
  updatedAt: 'v',
  ports: [],
  ...over,
});

const floors = new Map([['f1', '1층']]);
const build = (...list: V2Asset[]) => new Map(list.map((a) => [a.id, a]));

describe('자산 위치 경로', () => {
  it('층에 놓인 자산은 층 이름', () => {
    const rack = asset('rack', '전원랙 A', { floorId: 'f1' });
    expect(assetLocationPath(rack, build(rack), floors)).toBe('1층');
  });

  it('랙 안의 장비는 층까지 거슬러 올라간다 — 예전에는 층이 사라졌다', () => {
    const rack = asset('rack', '전원랙 A', { floorId: 'f1' });
    const ups = asset('ups', 'UPS-1', { parentAssetId: 'rack', slotIndex: 0 });
    expect(assetLocationPath(ups, build(rack, ups), floors)).toBe('1층 · 전원랙 A · 슬롯 1');
  });

  it('두 단계 중첩도 끝까지 — 층 · 함체 · 슬롯 · 안의 장비', () => {
    const rack = asset('rack', '통신랙 A', { floorId: 'f1' });
    const ofd = asset('ofd', 'OFD-1', { parentAssetId: 'rack', slotIndex: 1 });
    const slot = asset('slot', '슬롯 1', { parentAssetId: 'ofd', slotIndex: 2 });
    expect(assetLocationPath(slot, build(rack, ofd, slot), floors)).toBe(
      '1층 · 통신랙 A · 슬롯 2 · OFD-1 · 슬롯 3',
    );
  });

  it('슬롯 번호가 없으면 이름만 붙는다(자유형 컨테이너)', () => {
    const ofd = asset('ofd', 'OFD-1', { floorId: 'f1' });
    const child = asset('c', '슬롯 1', { parentAssetId: 'ofd' });
    expect(assetLocationPath(child, build(ofd, child), floors)).toBe('1층 · OFD-1');
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
