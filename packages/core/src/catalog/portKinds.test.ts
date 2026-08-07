import { describe, expect, it } from 'vitest';
import { PORT_KINDS, cableFieldsFor, portPresets, uniqueGroupKey } from './portKinds.js';

describe('포트 프리셋', () => {
  const presets = portPresets();

  it('방향이 뜻을 갖는 종류는 입력·출력 둘로 나뉜다 — "전원 입력 1개, 출력 2개" 가 두 번의 클릭이 되게', () => {
    const power = presets.filter((p) => p.medium === 'power');
    expect(power.map((p) => p.name)).toEqual(['전원 입력', '전원 출력']);
    expect(power.map((p) => p.direction)).toEqual(['IN', 'OUT']);
  });

  it('방향을 따지지 않는 종류는 하나뿐', () => {
    expect(presets.filter((p) => p.medium === 'network')).toHaveLength(1);
    expect(presets.filter((p) => p.medium === 'ground')).toHaveLength(1);
  });

  it('어휘에서 파생된다 — 따로 적어 둔 목록이 아니다', () => {
    expect(new Set(presets.map((p) => p.medium))).toEqual(new Set(PORT_KINDS.map((k) => k.key)));
  });

  it('그룹 키는 프리셋마다 다르다 — 같은 타입에 여러 개를 넣어도 겹치지 않게', () => {
    expect(new Set(presets.map((p) => p.groupKey)).size).toBe(presets.length);
  });

  it('이름 패턴에 번호 자리가 있다', () => {
    expect(presets.every((p) => p.namePattern.includes('{n}'))).toBe(true);
  });
});

describe('그룹 키 중복 피하기', () => {
  it('비어 있으면 그대로', () => {
    expect(uniqueGroupKey('NETWORK', [])).toBe('NETWORK');
  });

  it('이미 있으면 번호를 붙인다', () => {
    expect(uniqueGroupKey('NETWORK', ['NETWORK'])).toBe('NETWORK-2');
    expect(uniqueGroupKey('NETWORK', ['NETWORK', 'NETWORK-2'])).toBe('NETWORK-3');
  });

  it('중간이 비어 있으면 그 자리를 쓴다', () => {
    expect(uniqueGroupKey('NETWORK', ['NETWORK', 'NETWORK-3'])).toBe('NETWORK-2');
  });
});

describe('케이블 파라미터 선언', () => {
  it('공통 + 종류별로 합쳐진다', () => {
    expect(cableFieldsFor('fiber').map((f) => f.key)).toEqual(['lengthM', 'lossDb', 'inspectedAt']);
    expect(cableFieldsFor('power').map((f) => f.key)).toEqual(['lengthM', 'voltage']);
  });

  /* 길이는 설계서 공량의 근거(품셈 × 길이)라 어느 종류든 적을 수 있어야 한다. */
  it('종류별 값이 없어도 공통 값은 남는다', () => {
    expect(cableFieldsFor('network').map((f) => f.key)).toEqual(['lengthM']);
    expect(cableFieldsFor('ground').map((f) => f.key)).toEqual(['lengthM']);
  });

  it('어휘에 없는 종류도 공통 값은 준다 — 화면이 빈 표가 되지 않게', () => {
    expect(cableFieldsFor('미지의매체').map((f) => f.key)).toEqual(['lengthM']);
  });

  it('키는 종류 안에서 겹치지 않는다', () => {
    for (const kind of PORT_KINDS) {
      const keys = cableFieldsFor(kind.key).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
