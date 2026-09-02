import { describe, expect, it } from 'vitest';
import { validateTypeSpec } from './typeSpec';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from '../seed/catalog';
import type { AssetTypeSpec } from '../catalog/types';

const CTX = { categoryKeys: ['통신', '전원'], mediumKeys: ['fiber', 'power'] };

function base(over: Partial<AssetTypeSpec> = {}): AssetTypeSpec {
  return {
    key: 'T1', name: '테스트', categoryKey: '통신', sortOrder: 0,
    labor: { laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0 }, containers: [], ports: [], links: [],
    ...over,
  };
}

describe('validateTypeSpec', () => {
  it('유효한 스펙은 이슈 0', () => {
    expect(validateTypeSpec(base(), CTX)).toEqual([]);
  });
  it('key 형식 위반(공백/한글)과 name 빈값을 거부한다', () => {
    expect(validateTypeSpec(base({ key: '한 글' }), CTX).some((i) => i.path === 'key')).toBe(true);
    expect(validateTypeSpec(base({ name: '  ' }), CTX).some((i) => i.path === 'name')).toBe(true);
  });

  /**
   * **빈 키는 「아직 안 붙었다」이지 틀린 것이 아니다.**
   *
   * 키는 사람이 짓지 않고 서버가 붙인다. 이걸 흠으로 세는 동안 화면은 새 장비 품목을 아예
   * 저장할 수 없었다 — 단추를 눌러도 「입력 오류 1건」만 뜨고, 정작 그 흠을 가리킬 칸이
   * 화면에 없어 무엇이 막는지 알 길도 없었다. 설비 품목은 처음부터 이 규칙이었다.
   */
  it('빈 키는 흠이 아니다 — 서버가 붙일 자리다', () => {
    expect(validateTypeSpec(base({ key: '' }), CTX).some((i) => i.path === 'key')).toBe(false);
  });
  it('categoryKey 미존재를 거부한다', () => {
    expect(validateTypeSpec(base({ categoryKey: '없음' }), CTX).some((i) => i.path === 'categoryKey')).toBe(true);
  });
  it('음수 공량을 거부한다', () => {
    const s = base({ labor: { laborCode: '통신내선공', installManDays: -1, removeManDays: 0, relocateManDays: 0 } });
    expect(validateTypeSpec(s, CTX).some((i) => i.path === 'labor.installManDays')).toBe(true);
  });
  it('포트 group 중복·count 0·미지 매체·{n} 누락 패턴을 거부한다', () => {
    const p = { count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: '코어 {n}' };
    const dup = base({ ports: [ { group: 'A', ...p }, { group: 'A', ...p } ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'ports[1].group')).toBe(true);
    const zero = base({ ports: [{ group: 'A', ...p, count: 0 }] });
    expect(validateTypeSpec(zero, CTX).some((i) => i.path === 'ports[0].count')).toBe(true);
    const badMedium = base({ ports: [{ group: 'A', ...p, medium: 'laser' }] });
    expect(validateTypeSpec(badMedium, CTX).some((i) => i.path === 'ports[0].medium')).toBe(true);
    const noN = base({ ports: [{ group: 'A', ...p, count: 2, namePattern: '코어' }] });
    expect(validateTypeSpec(noN, CTX).some((i) => i.path === 'ports[0].namePattern')).toBe(true);
  });
  it('count=1 포트는 고정 이름 패턴({n} 없음)을 허용한다', () => {
    const single = base({ ports: [
      { group: 'IN', count: 1, direction: 'IN' as const, medium: 'power', namePattern: 'IN' },
    ] });
    expect(validateTypeSpec(single, CTX)).toEqual([]);
  });
  /* 다심을 **가질 수 있는지**는 종류가 정한다 — 아무 포트에나 코어 수를 적을 수 있으면
     어휘가 뜻을 잃는다. 전원에는 다심이 없다. */
  it('다심 아닌 종류에 positions>1 을 적으면 이슈 발화', () => {
    const s = base({ ports: [
      { group: 'A', count: 2, direction: 'BI' as const, medium: 'power', namePattern: 'A {n}', positions: 24 },
    ] });
    expect(validateTypeSpec(s, CTX).some((i) => i.path === 'ports[0].positions')).toBe(true);
  });
  /* 몇 심인지는 포트마다 다르다 — 같은 광이라도 성단은 24심이고 장비쪽 어댑터는 1심이다. */
  it('광은 1심도 24심도 이슈 없음', () => {
    for (const positions of [1, 24]) {
      const s = base({ ports: [
        { group: 'T', count: 1, direction: 'BI' as const, medium: 'fiber', namePattern: '광 {n}', positions },
      ] });
      expect(validateTypeSpec(s, CTX).some((i) => i.path === 'ports[0].positions')).toBe(false);
    }
  });
  it('시드 전 타입이 시드 카테고리/매체 컨텍스트에서 이슈 0 (모델 증명)', () => {
    const ctx = {
      categoryKeys: SEED_CATEGORIES.map((c) => c.key),
      mediumKeys: SEED_CABLE_GROUPS.map((g) => g.key),
    };
    for (const t of SEED_ASSET_TYPES) {
      expect({ key: t.key, issues: validateTypeSpec(t, ctx) }).toEqual({ key: t.key, issues: [] });
    }
  });
  /*
   * 여기 있던 시험 셋(충전기·UPS·축전지의 전원 포트 방향, 접지 부스바 선언)은 **시드에 그
   * 품목들이 있다**는 사실을 못 박고 있었다. 임시로 넣었던 그 서른 종을 지우면서 함께
   * 걷어냈다 — 카탈로그는 이제 시드가 아니라 현장이 만든다.
   *
   * 그 시험들이 지키려던 규칙 자체는 살아 있다: 전원이 공급과 소비로 갈리는 것은
   * `PORT_KINDS.power.pairing === 'opposite'` 이 정하고 `validateConnection` 이 강제하며,
   * 만들 때 갈라져 나오는 것은 `portPresets` 가 낸다(입력·출력이 따로 선다).
   */
});
