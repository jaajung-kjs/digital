import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from './catalog.js';

const byKey = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)!;

describe('시드 카탈로그 — 구 role 7종의 데이터 표현 증명', () => {
  it('key 유일성 + 모든 타입의 categoryKey가 시드 분류에 존재', () => {
    const keys = SEED_ASSET_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const cats = new Set(SEED_CATEGORIES.map((c) => c.key));
    for (const t of SEED_ASSET_TYPES) expect(cats.has(t.categoryKey)).toBe(true);
  });

  it('RACK: 배치 가능 + 12슬롯 span 허용 컨테이너 (구 rack role)', () => {
    const rack = byKey('RACK');
    expect(rack.placement.placeable).toBe(true);
    expect(rack.containers[0]).toMatchObject({ slotCount: 12, allowSpan: true });
  });

  it('OFD: 광슬롯만 수용하는 자유형 컨테이너 (구 ofd role)', () => {
    const ofd = byKey('OFD');
    expect(ofd.containers[0]).toMatchObject({ slotCount: null, accepts: { typeKeys: ['OFD-SLOT'] } });
  });

  it('OFD-SLOT: A/B 광 포트 + byIndex 패스스루 (구 slot role의 채널 보존)', () => {
    const slot = byKey('OFD-SLOT');
    expect(slot.ports.map((p) => p.group)).toEqual(['A', 'B']);
    expect(slot.ports.every((p) => p.medium === '광')).toBe(true);
    expect(slot.links).toEqual([{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }]);
  });

  it('DIST(분전반): 피더만 수용 (구 panel role)', () => {
    expect(byKey('DIST').containers[0]!.accepts).toEqual({ typeKeys: ['FEEDER'] });
  });

  it('FEEDER: 전원 IN 1 + OUT 1 + all 패스스루 (구 feeder role의 방향성)', () => {
    const feeder = byKey('FEEDER');
    expect(feeder.ports).toEqual([
      { group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' },
    ]);
    expect(feeder.links).toEqual([{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }]);
  });

  it('구 seed의 타입 전수가 이관되었다 (26종 이상)', () => {
    expect(SEED_ASSET_TYPES.length).toBeGreaterThanOrEqual(26);
  });

  it('케이블 그룹 5종 이관 (전원/네트워크/광/제어/접지)', () => {
    expect(SEED_CABLE_GROUPS.length).toBeGreaterThanOrEqual(5);
    const names = SEED_CABLE_GROUPS.map((g) => g.name);
    for (const n of ['전원', '네트워크', '광']) expect(names).toContain(n);
  });
});
