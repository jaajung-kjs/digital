import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES } from './catalog.js';
import { assetFieldDefs } from '../catalog/types.js';
import { portKind, portPresets } from '../catalog/portKinds.js';

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

/**
 * **시드는 화면이 만들 수 있는 것만 만든다.**
 *
 * 장비 품목의 포트는 화면에서 「어떤 종류를 몇 개」로 더한다 — 그때 그룹 키는 어휘가 정하고
 * (`portPresets`), 같은 종류를 두 번 더하면 `NETWORK-2` 처럼 번호가 붙는다(`uniqueGroupKey`).
 * 시드가 그 밖의 키를 쓰면 **화면으로는 만들 수도 고칠 수도 없는 품목**이 생긴다. 실제로
 * 「UPLINK」 라는 그룹을 지어내 시드에 넣은 적이 있는데, 화면 어디에도 그런 선택지가 없었다.
 */
describe('시드 포트 그룹은 어휘가 내놓는 것뿐', () => {
  const allowed = new Set(portPresets().map((p) => p.groupKey));

  it('모든 그룹 키가 화면의 선택지(또는 그 번호붙임)다', () => {
    for (const type of SEED_ASSET_TYPES) {
      for (const port of type.ports) {
        /* 같은 종류를 두 번 더하면 `NETWORK-2` — 그 꼬리를 떼고 본다. */
        const base = port.group.replace(/-\d+$/, '');
        expect(allowed.has(base), `${type.key}: ${port.group}`).toBe(true);
      }
    }
  });

  /* 매체·방향도 그 선택지의 것이어야 한다 — 키만 같고 속이 다르면 화면과 어긋난다. */
  it('그룹 키가 정한 매체·방향을 따른다', () => {
    const byKey = new Map(portPresets().map((p) => [p.groupKey, p]));
    for (const type of SEED_ASSET_TYPES) {
      for (const port of type.ports) {
        const preset = byKey.get(port.group.replace(/-\d+$/, ''))!;
        expect(port.medium, `${type.key}: ${port.group}`).toBe(preset.medium);
        expect(port.direction, `${type.key}: ${port.group}`).toBe(preset.direction);
        expect(port.variant ?? null, `${type.key}: ${port.group}`).toBe(preset.variant ?? null);
        /* 다심인지 아닌지도 선택지가 정한다 — 「광」에 24심을 적으면 화면에 없는 모양이 된다. */
        expect((port.positions ?? 1) > 1, `${type.key}: ${port.group}`).toBe(preset.positions > 1);
      }
    }
  });

  /**
   * **포트 이름은 화면이 만드는 그것뿐이다.**
   *
   * 화면에는 포트 이름을 정하는 자리가 없다 — 종류를 고르면 이름은 그 선택지가 정한다
   * (`PortPreset.namePattern`). 그런데 시드가 「UTP」·「COM1」·「관리」·「회선 {n}」처럼 제
   * 손으로 이름을 지어 넣어, **화면으로는 만들 수도 고칠 수도 없는 이름**이 자산 판에
   * 떠 있었다(서지보호기는 「입력」·「출력」이라 방향까지 지어냈다).
   *
   * 이름을 정하는 자리가 생기기 전까지, 시드가 쓸 수 있는 이름은 선택지의 것뿐이다.
   */
  it('포트 이름은 화면의 선택지가 내놓는 것뿐이다', () => {
    const names = new Set(portPresets().map((p) => p.namePattern));
    for (const type of SEED_ASSET_TYPES) {
      for (const port of type.ports) {
        expect(names.has(port.namePattern), `${type.key}: ${port.namePattern}`).toBe(true);
      }
    }
  });
});
