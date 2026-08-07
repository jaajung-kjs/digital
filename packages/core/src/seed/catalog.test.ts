import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES } from './catalog.js';
import { assetFieldDefs } from '../catalog/types.js';

const byKey = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)!;

describe('시드 카탈로그 — 구 role 7종의 데이터 표현 증명', () => {
  it('key 유일성 + 모든 타입의 categoryKey가 시드 분류에 존재', () => {
    const keys = SEED_ASSET_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const cats = new Set<string>(SEED_CATEGORIES.map((c) => c.key));
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

  /* 성단 판의 실제 모습 — 뒤로 OPGW 한 가닥(다심 포트 1개), 앞으로 점퍼 24가닥. */
  it('OFD-SLOT: 광 24 + 다심 인입 1 + byPosition 매핑', () => {
    const slot = byKey('OFD-SLOT');
    const core = slot.ports.find((p) => p.group === 'CORE')!;
    const trunk = slot.ports.find((p) => p.group === 'TRUNK')!;
    expect([core.medium, core.count, core.positions ?? 1]).toEqual(['fiber', 24, 1]);
    expect([trunk.medium, trunk.count, trunk.positions]).toEqual(['fiber-trunk', 1, 24]);
    expect(slot.links).toEqual([{ fromGroup: 'TRUNK', toGroup: 'CORE', mapping: 'byPosition' }]);
  });

  /* 케이블 1본 = 심선 24가닥. 예전처럼 심선마다 케이블을 두면 40m 가 960m 로 집계된다. */
  it('OFD-SLOT: 인입은 포트 1개다 — 심선 수만큼 펴지 않는다', () => {
    const trunk = byKey('OFD-SLOT').ports.find((p) => p.group === 'TRUNK')!;
    expect(trunk.count).toBe(1);
    expect(trunk.positions).toBeGreaterThan(1);
  });

  it('DIST(분전반): 피더만 수용 (구 panel role)', () => {
    expect(byKey('DIST').containers[0]!.accepts).toEqual({ typeKeys: ['FEEDER'] });
  });

  it('FEEDER: 전원 IN 1 + OUT 1 + all 패스스루 (구 feeder role의 방향성)', () => {
    const feeder = byKey('FEEDER');
    expect(feeder.ports).toEqual([
      { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT' },
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

  /* 설치일·담당자는 이제 타입이 선언하지 않는다 — 모든 자산이 갖는 **기본**이라
     `assetFieldDefs` 가 얹어 준다. 시드가 같은 둘을 26번 복사해 넣고 있었고, 카탈로그
     관리자에도 그대로 나와 새 타입마다 사용자가 다시 적어야 했다. */
  it('공통 필드는 타입이 선언하지 않는다', () => {
    for (const t of SEED_ASSET_TYPES) {
      const keys = t.fields.map((f) => f.key);
      expect(keys, t.key).not.toContain('installDate');
      expect(keys, t.key).not.toContain('manager');
    }
  });

  it('그래도 모든 타입의 자산은 설치일·담당자를 갖는다', () => {
    for (const t of SEED_ASSET_TYPES) {
      const keys = assetFieldDefs(t.fields).map((f) => f.key);
      expect(keys, t.key).toContain('installDate');
      expect(keys, t.key).toContain('manager');
    }
  });

  it('타입 고유 필드는 공통 뒤에 붙는다 — 피더의 차단기 번호', () => {
    const feeder = SEED_ASSET_TYPES.find((t) => t.key === 'FEEDER')!;
    expect(assetFieldDefs(feeder.fields).map((f) => f.key)).toEqual([
      'installDate', 'manager', 'breakerNo', 'switchState',
    ]);
  });

  it('타입이 공통 필드를 다시 선언해도 두 번 나오지 않는다', () => {
    const dup = [{ key: 'manager', label: '관리자', type: 'text' as const }];
    expect(assetFieldDefs(dup).map((f) => f.key)).toEqual(['installDate', 'manager']);
  });
});

describe('SEED_CABLE_CATEGORIES — 레거시 16종 이관', () => {
  it('모든 groupKey가 SEED_CABLE_GROUPS에 존재한다', () => {
    const groupKeys = new Set<string>(SEED_CABLE_GROUPS.map((g) => g.key));
    for (const cat of SEED_CABLE_CATEGORIES) {
      expect(groupKeys.has(cat.groupKey), `unknown groupKey: ${cat.groupKey}`).toBe(true);
    }
  });

  it('(groupKey, name) 쌍이 유일하다', () => {
    const seen = new Set<string>();
    for (const cat of SEED_CABLE_CATEGORIES) {
      const key = `${cat.groupKey}::${cat.name}`;
      expect(seen.has(key), `duplicate: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('레거시 카테고리 수 17개와 일치한다', () => {
    expect(SEED_CABLE_CATEGORIES.length).toBe(17);
  });
});
