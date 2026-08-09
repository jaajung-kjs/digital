import { describe, expect, it } from 'vitest';
import { PORT_KINDS, cableFieldsFor, portFieldsFor, portGroupLabel, portPresets, portValuesAt, setPortValueAt, uniqueGroupKey } from './portKinds.js';

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
    expect(cableFieldsFor('power').map((f) => f.key)).toEqual(['lengthM', 'voltage']);
  });

  /* 값이 무엇의 것인지가 갈린다 — 길이는 케이블 한 가닥의 것이고, 손실·점검일은 심선마다
     다르다. 예전에는 손실도 케이블에 담아서, OPGW 한 가닥을 심선 수만큼 케이블로 복제해야
     했고 그 탓에 설계서 공량이 그 배로 부풀었다. */
  it('손실·점검일은 케이블이 아니라 **광 인입** 포트의 값이다', () => {
    expect(cableFieldsFor('fiber-trunk').map((f) => f.key)).toEqual(['lengthM']);
    expect(portFieldsFor('fiber-trunk').map((f) => f.key)).toEqual(['lossDb', 'inspectedAt']);
  });

  /* OTDR 로 재는 것은 인입(성단) 심선이다 — 장비쪽 광 포트에는 잴 것이 없다.
     화면이 "이 포트만 예외" 라고 걸러 내지 않도록, 그 사실을 어휘가 말해야 한다. */
  it('장비쪽 광 포트에는 딸린 값이 없다 — OTDR 로 잴 것이 없다', () => {
    for (const k of ['network', 'fiber', 'control', 'ground']) {
      expect(portFieldsFor(k), k).toEqual([]);
    }
  });

  /* 개폐는 자산이 아니라 그 회로의 상태다. 입력에도 차단기가 있다 — 배전반 주차단기,
     UPS·정류기의 입력 MCCB. 상대의 출력 차단기와 내 입력 차단기는 서로 다른 둘이다. */
  it('전원 개폐는 입력·출력 양쪽에 있다', () => {
    expect(portFieldsFor('power').map((f) => f.key)).toEqual(['closed']);
  });

  /* 살아 있는 계통에서 투입이 예사이고 개방이 사건이다 — 없는 값을 개방으로 읽으면
     아직 아무도 손대지 않은 판이 통째로 죽은 것처럼 보인다. */
  it('개폐는 적힌 값이 없으면 투입이다', () => {
    const bare = { medium: 'power', fieldValues: {} };
    expect(portValuesAt(bare, 1)['closed']).toBe(true);
    expect(portValuesAt({ ...bare, fieldValues: { closed: false } }, 1)['closed']).toBe(false);
  });

  /* 쓰기가 읽기와 같은 문을 쓰면 값 하나를 고칠 때마다 기본값이 저장에 눌러앉는다 —
     "아무도 손대지 않음" 과 "투입이라고 적음" 이 구분되지 않게 된다. */
  it('값을 적어도 기본값이 저장에 새어 들어가지 않는다', () => {
    const port = { medium: 'fiber-trunk', positions: 4, fieldValues: {} };
    expect(setPortValueAt(port, 2, 'lossDb', 0.7)).toEqual({ 2: { lossDb: 0.7 } });
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

describe('포트 그룹 이름', () => {
  const g = (group, medium, direction = 'BI') => ({ group, medium, direction });

  /* 그룹 키(`P`·`GND`·`PWR-IN`)는 타입 안에서 유일해야 하는 식별자이지 이름이 아니다.
     화면이 `GND 그룹` 이라고 적고 있었다 — 쓰는 사람에게는 아무 뜻이 없는 글자다. */
  it('종류 이름으로 부른다 — 내부 키를 그대로 보여 주지 않는다', () => {
    const all = [g('P', 'network'), g('GND', 'ground'), g('COM', 'control')];
    expect(portGroupLabel(all[0]!, all)).toBe('네트워크');
    expect(portGroupLabel(all[1]!, all)).toBe('접지');
    expect(portGroupLabel(all[2]!, all)).toBe('제어');
  });

  it('방향이 뜻을 갖는 종류는 방향까지 — 입력과 출력은 다른 물건이다', () => {
    const all = [g('PWR-IN', 'power', 'IN'), g('PWR-OUT', 'power', 'OUT')];
    expect(portGroupLabel(all[0]!, all)).toBe('전원 입력');
    expect(portGroupLabel(all[1]!, all)).toBe('전원 출력');
  });

  it('같은 이름이 둘이면 그때만 키를 덧붙인다 — 광슬롯의 A·B', () => {
    const all = [g('A', 'fiber'), g('B', 'fiber')];
    expect(portGroupLabel(all[0]!, all)).toBe('광 A');
    expect(portGroupLabel(all[1]!, all)).toBe('광 B');
  });

  it('하나뿐이면 키를 붙이지 않는다 — 구분이 필요할 때까지 이름을 길게 만들지 않는다', () => {
    const all = [g('A', 'fiber')];
    expect(portGroupLabel(all[0]!, all)).toBe('광');
  });

  it('어휘에 없는 종류는 그 값을 쓴다 — 빈 이름이 되지 않게', () => {
    const all = [g('X', '미지의매체')];
    expect(portGroupLabel(all[0]!, all)).toBe('미지의매체');
  });
});
