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

  it('그래도 모든 타입의 자산은 설치일·담당자를 갖는다', () => {
    for (const t of SEED_ASSET_TYPES) {
      const keys = assetFieldDefs(t.fields).map((f) => f.key);
      expect(keys, t.key).toContain('installDate');
      expect(keys, t.key).toContain('manager');
    }
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
