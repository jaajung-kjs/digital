import { describe, expect, it } from 'vitest';
import { DEFAULT_CORE_COUNT, PORT_KINDS, cableFieldsFor, coreCount, groupRefOf, groupRefOfTemplate, isMultiCorePort, portFieldsFor, portGroupLabel, portPresets, portValuesAt, setPortValueAt, uniqueGroupKey, polesOf } from './portKinds.js';

describe('포트 프리셋', () => {
  const presets = portPresets();

  /**
   * 전원은 **방향과 갈래**로 갈린다 — 「전원 입력(교류) 1개, 출력(직류) 2개」가 두 번의 클릭이다.
   *
   * 갈래를 화면에서 고를 수 없으면 만들 수도 없다: 충전기처럼 교류를 받아 직류를 내보내는
   * 장비를 적을 방법이 사라진다.
   *
   * **양방향도 낸다** — 방향 없는 자리(모선 단자)가 실제로 있다. 축전지는 단자 한 쌍으로
   * 충전도 방전도 오간다. 이게 없으면 그 자리를 만드는 길이 「입력을 만든 뒤 방향을
   * 바꾼다」는 우회뿐이고, 그러면 묶음 키가 어긋난다.
   */
  it('방향이 뜻을 갖는 종류는 방향×갈래로 나뉜다', () => {
    const power = presets.filter((p) => p.medium === 'power');
    expect(power.map((p) => p.name)).toEqual([
      '전원 입력(AC)', '전원 입력(DC)', '전원 출력(AC)', '전원 출력(DC)',
      '전원 양방향(AC)', '전원 양방향(DC)',
    ]);
    /* 프리셋은 **갈래까지만** 정한다 — 몇 V 인지는 놓인 회로가 안다(계통 표). */
    expect(power.every((p) => !('voltage' in p))).toBe(true);
    expect(power.map((p) => `${p.direction}·${p.variant}`))
      .toEqual(['IN·AC', 'IN·DC', 'OUT·AC', 'OUT·DC', 'BI·AC', 'BI·DC']);
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

  /* 다심 프리셋(OPGW)만 예외다 — 성단은 자산마다 한 자리라 번호를 붙일 것이 없다. */
  it('이름 패턴에 번호 자리가 있다 (다심 프리셋 제외)', () => {
    expect(presets.filter((p) => p.positions === 1).every((p) => p.namePattern.includes('{n}'))).toBe(true);
  });

  /* 다심이 있는 종류는 단심·다심 둘로 나온다 — 하나로 두면 24심 인입을 놓을 방법이 없거나
     반대로 어댑터가 24심이 된다. */
  it('광은 단심과 다심 프리셋이 함께 나온다', () => {
    const fiber = presets.filter((p) => p.medium === 'fiber');
    expect(fiber.map((p) => p.positions).sort()).toEqual([1, DEFAULT_CORE_COUNT].sort());
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
    expect(cableFieldsFor('power').map((f) => f.key)).toEqual(['lengthM', 'sizeSq']);
  });

  /**
   * **전압은 포트의 값**이다 — 케이블의 것이 아니다.
   *
   * 같은 F-CV 한 가닥이 220V 회로에도 380V 회로에도 쓰인다. 전압을 정하는 것은 그 회로,
   * 곧 포트다. 케이블에 적어 두었을 때는 「이 포트가 몇 V 인가」를 물을 데가 없었다.
   */
  it('전압은 케이블이 아니라 포트에 적힌다', () => {
    expect(cableFieldsFor('power').map((f) => f.key)).not.toContain('voltage');
    expect(portFieldsFor('power').map((f) => f.key)).toContain('voltage');
  });

  it('갈래가 고를 값을 좁힌다 — 직류 포트에 교류 전압이 뜨지 않는다', () => {
    const dc = portFieldsFor('power', 1, 'DC').find((f) => f.key === 'voltage')!;
    expect(dc.options?.every((v) => String(v).startsWith('DC'))).toBe(true);
    const ac = portFieldsFor('power', 1, 'AC').find((f) => f.key === 'voltage')!;
    expect(ac.options?.every((v) => String(v).startsWith('AC'))).toBe(true);
  });

  /**
   * **어휘는 「고를 수 있는 값」만 말하고 「예사값」은 말하지 않는다.**
   *
   * 한때 갈래가 예사 전압을 들고 있었고(`defaultVoltage`), 포트가 생길 때 그것이 저장됐다.
   * 아무도 확인한 적 없는 값이 자료로 굳는 자리였다 — 옛 대장에는 「220V 3상」까지만 적혀
   * 있는데 우리가 「1상2선」을 채워 넣으면 화면이 없는 사실을 말한다.
   *
   * 빈자리를 메우는 일은 **읽는 쪽**이 한다: 회로에 없으면 그 반의 모선에서 물려받는다.
   */
  it('전압·상선식에는 예사값이 없다 — 모선에서 물려받을 값이라고만 말한다', () => {
    for (const key of ['voltage', 'wiring']) {
      const f = portFieldsFor('power', 1, 'AC').find((x) => x.key === key)!;
      expect(f.defaultValue, key).toBeUndefined();
      expect(f.inherited, key).toBe(true);
    }
    /* 용량·개폐는 물려받지 않는다 — 모선이 400A 라고 분기가 400A 인 것이 아니다. */
    for (const key of ['ampere', 'closed']) {
      expect(portFieldsFor('power', 1, 'AC').find((x) => x.key === key)?.inherited, key).toBeUndefined();
    }
  });

  /**
   * **상·선식은 갈래가 칸을 갖는다** — 직류에는 그 칸이 아예 서지 않는다.
   *
   * 한때 위상을 전압 값에 넣어 두었다(「AC 220V 3φ」). 그러면 직류에 빈 칸이 안 남는 대신
   * 3상3선과 3상4선을 못 가르고, 현장에서 가장 흔한 3상4선 380/220V 를 적을 수가 없었다.
   */
  it('상·선은 교류에만 있는 칸이다', () => {
    const ac = portFieldsFor('power', 1, 'AC').find((f) => f.key === 'wiring');
    expect(ac?.label).toBe('상');
    expect(ac?.options).toEqual(['1φ2W', '3φ4W', '3φ3W', '1φ3W']);
    expect(portFieldsFor('power', 1, 'DC').find((f) => f.key === 'wiring')).toBeUndefined();
  });

  /**
   * 극수는 상·선이 정한다 — 「NFB#1 **2P** 100A」의 그 2P 다.
   *
   * **3P 가 둘이라 극수만으로는 못 가른다**: 삼상3선(델타 220V)과 단상3선(110/220V)이 둘 다
   * 3P 다. 그래서 값은 φ·W 를 함께 담고, 극수는 거기서 따라 나온다.
   */
  it('극수는 상·선에서 따라온다 — 따로 적지 않는다', () => {
    expect(polesOf('3φ4W')).toBe('4P');
    expect(polesOf('3φ3W')).toBe('3P');
    expect(polesOf('1φ3W')).toBe('3P');
    expect(polesOf('1φ2W')).toBe('2P');
    expect(polesOf(null)).toBeNull();
  });

  /* 현장 대장은 전원케이블을 「FR-5.5sq」로 적는다 — 종류는 케이블 품목이 알고, 굵기는
     여기 적는다. 접지선도 같은 사실을 같은 칸에 적는다(「IV 22sq」). */
  it('전원·접지 케이블은 굵기를 적는다', () => {
    for (const medium of ['power', 'ground']) {
      expect(cableFieldsFor(medium).map((f) => f.key), medium).toContain('sizeSq');
    }
  });

  /* 값이 무엇의 것인지가 갈린다 — 길이는 케이블 한 가닥의 것이고, 손실·점검일은 심선마다
     다르다. 예전에는 손실도 케이블에 담아서, OPGW 한 가닥을 심선 수만큼 케이블로 복제해야
     했고 그 탓에 설계서 공량이 그 배로 부풀었다. */
  it('OTDR 값은 케이블이 아니라 **다심 광** 포트의 값이다 — 파장마다 따로 잰다', () => {
    expect(cableFieldsFor('fiber').map((f) => f.key)).toEqual(['lengthM']);
    /* 파장마다 손실과 거리 두 칸 — OTDR 은 파장마다 따로 쏘므로 잰 거리도 따로 나온다. */
    expect(portFieldsFor('fiber', 24).map((f) => f.key)).toEqual([
      'loss1310',
      'distance1310',
      'loss1550',
      'distance1550',
      'measuredAt',
    ]);
  });

  it('측정일은 **적는 칸이 아니다** — 값에서 따라온다', () => {
    const measuredAt = portFieldsFor('fiber', 24).find((f) => f.key === 'measuredAt');
    expect(measuredAt?.readOnly).toBe(true);
    /* 어느 칸에 찍을지는 종류가 말한다 — 화면이 키를 알지 않는다. */
    expect(PORT_KINDS.find((k) => k.key === 'fiber')?.stampKey).toBe('measuredAt');
  });

  /* 장비쪽 어댑터(1심)에는 OTDR 로 잴 것이 없다 — 예전에는 매체를 갈라 그 사실을 표현했다. */
  it('단심 광 포트에는 손실·점검일이 없다', () => {
    expect(portFieldsFor('fiber', 1)).toEqual([]);
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
    expect(portFieldsFor('power').map((f) => f.key)).toContain('closed');
  });

  /* 차단기 용량도 **회로마다** 다르다(20A·30A·50A). 자산 필드로 두면 열세 회로가 한 값을
     나눠 갖고, 입력 차단기(「200A AC MAIN」)를 적을 자리도 없어진다. */
  it('차단기 용량은 그 회로(포트)의 값이다', () => {
    const ampere = portFieldsFor('power').find((f) => f.key === 'ampere');
    expect(ampere?.type).toBe('number');
    expect(ampere?.unit).toBe('A');
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
    const port = { medium: 'fiber', positions: 4, fieldValues: {} };
    expect(setPortValueAt(port, 2, 'lossDb', 0.7)).toEqual({ 2: { lossDb: 0.7 } });
  });

  /* 길이는 설계서 공량의 근거(품셈 × 길이)라 어느 종류든 적을 수 있어야 한다. */
  it('종류별 값이 없어도 공통 값은 남는다', () => {
    expect(cableFieldsFor('network').map((f) => f.key)).toEqual(['lengthM']);
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

/**
 * **정해진 값은 고르게 한다** — 강릉 대장 전체에서 굵기는 열넷, 용량은 아홉, 전압은 넷뿐이었다.
 * 손으로 치면 같은 값이 「AC220V」·「AC 220V」·「220v」로 갈려 세지도 거르지도 못한다.
 */
describe('고를 수 있는 값', () => {
  it('전압·용량·굵기는 목록이 있다', () => {
    const voltage = portFieldsFor('power').find((f) => f.key === 'voltage');
    const size = cableFieldsFor('power').find((f) => f.key === 'sizeSq');
    const ampere = portFieldsFor('power').find((f) => f.key === 'ampere');
    for (const f of [voltage, size, ampere]) expect(f?.options?.length).toBeGreaterThan(3);
  });

  /* 전압 값에는 **전압만** 있다 — 상은 제 칸에 있다(`wiring`). 자료의 「3상4선 380/220V」는
     한 값으로 적을 수 없었던 것이라 목록에 넣었다. */
  it('전압 값에 위상이 섞이지 않는다', () => {
    const voltage = portFieldsFor('power').find((f) => f.key === 'voltage')!;
    const opts = voltage.options!.map(String);
    expect(opts.every((o) => !o.includes('φ'))).toBe(true);
    expect(opts).toContain('AC 380/220V');
  });

  /* 현장 대장에 실제로 나온 값은 목록에 다 있어야 한다 — 목록이 사실보다 좁으면 쓰는 사람이
     매번 「직접 입력」으로 빠져나가고, 그러면 목록을 둔 뜻이 없다. */
  it('대장에 나온 값을 담는다', () => {
    const size = cableFieldsFor('power').find((f) => f.key === 'sizeSq')!.options!;
    for (const v of [2, 2.5, 3.5, 4, 5.5, 6, 8, 10, 14, 16, 22, 25, 35, 38, 60]) expect(size).toContain(v);
    const ampere = portFieldsFor('power').find((f) => f.key === 'ampere')!.options!;
    for (const v of [15, 30, 50, 60, 75, 100, 150, 225, 400]) expect(ampere).toContain(v);
  });

  /**
   * **목록은 사실보다 넓으면 안 된다.**
   *
   * 표준 계열이라며 240sq·600A 까지 늘어놓은 적이 있는데, 그런 전선도 그런 차단기도 이 자료
   * 어디에도 없다. 넓은 목록은 고르는 일을 느리게 하고(스무 줄에서 다섯 줄 찾기) 「목록에
   * 있으니 맞겠지」라는 잘못된 안심을 준다. 없는 값은 「직접 입력」으로 적는다.
   */
  it('자료에 없는 값까지 늘어놓지 않는다', () => {
    const size = cableFieldsFor('power').find((f) => f.key === 'sizeSq')!.options!;
    for (const v of [70, 95, 120, 185, 240]) expect(size).not.toContain(v);
    const ampere = portFieldsFor('power').find((f) => f.key === 'ampere')!.options!;
    for (const v of [250, 300, 500, 600]) expect(ampere).not.toContain(v);
    /* 직류는 **쓰임에 따라 계통이 갈린다** — 통신 48V, 제어 125V·110V, 보조 24V.
       그래도 넓게 잡지는 않는다: 250V 는 1940~50년대 계열이라 신설에 쓰지 않고,
       DC 220V 는 영국·대형 송전 쪽이라 우리 범위가 아니다. */
    const voltage = portFieldsFor('power').find((f) => f.key === 'voltage')!.options!.map(String);
    expect(voltage.some((v) => v.includes('250V'))).toBe(false);
    expect(voltage.some((v) => v === 'DC 220V')).toBe(false);
  });

  /** 직류 목록은 **그 쓰임이 있는 것만** — 통신(48V) · 제어(125V·110V) · 보조(24V). */
  it('직류 전압은 쓰임이 있는 것만 담는다', () => {
    const dc = portFieldsFor('power', 1, 'DC').find((f) => f.key === 'voltage')!;
    expect(dc.options).toEqual(['DC 125V', 'DC 110V', 'DC 48V', 'DC 24V']);
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

  /* 이름으로 갈리지 않으면 **순번**을 붙인다 — 그룹 키(`A`·`B`·`POWER-OUT-AC-2`)는 타입 안에서
     유일하기만 하면 되는 식별자라 사람에게 아무 뜻이 없다. 차례는 키 순서라 흔들리지 않는다. */
  it('같은 이름이 둘이면 순번으로 가른다', () => {
    const all = [g('A', 'fiber'), g('B', 'fiber')];
    expect(portGroupLabel(all[0]!, all)).toBe('광 1');
    expect(portGroupLabel(all[1]!, all)).toBe('광 2');
  });

  /* 선언과 놓인 포트가 **같은 이름**을 낸다 — 품목 화면과 자산 화면이 다르게 부르면 안 된다. */
  it('선언에서도 놓인 포트에서도 같은 이름이 나온다', () => {
    const tpl = groupRefOfTemplate({
      group: 'POWER-OUT-AC', medium: 'power', direction: 'OUT', namePattern: '전원 출력 {n}', variant: 'AC',
    });
    const placed = groupRefOf({
      group: 'POWER-OUT-AC', medium: 'power', direction: 'OUT', name: '전원 출력 1', positions: 1, variant: 'AC',
    });
    expect(portGroupLabel(tpl, [tpl])).toBe('전원 출력(AC)');
    expect(portGroupLabel(placed, [placed])).toBe('전원 출력(AC)');
  });

  /**
   * 값까지 같으면 **순번**으로 가른다 — 한 장비에 같은 전압 입력이 둘일 때(이중 인입)
   * 두 구획이 똑같이 「전원 입력」으로 서면 어느 쪽인지 알 길이 없다.
   *
   * 380V 를 220V 로 고치는 **도중**에 이 상태가 된다 — 그때 뜻 없는 키가 튀어나오면 안 된다.
   */
  it('뜻이 같은 구획이 둘이면 순번으로 가른다', () => {
    const at = (group: string) => groupRefOf({
      group, medium: 'power', direction: 'IN', name: '전원 입력 1', positions: 1, variant: 'AC',
    });
    const one = at('POWER-IN-AC');
    const two = at('POWER-IN-AC-2');
    const refs = [one, two];
    expect(portGroupLabel(one, refs)).toBe('전원 입력(AC) 1');
    expect(portGroupLabel(two, refs)).toBe('전원 입력(AC) 2');
  });

  it('하나뿐이면 키를 붙이지 않는다 — 구분이 필요할 때까지 이름을 길게 만들지 않는다', () => {
    const all = [g('A', 'fiber')];
    expect(portGroupLabel(all[0]!, all)).toBe('광');
  });

  /**
   * **괄호는 갈래뿐이다** — 「전원 입력(AC)」·「전원 입력(DC)」.
   *
   * 한때 전압을 이름에 실었다(「전원 출력(DC 48V)」). 그런데 전압은 회로마다 다르다 —
   * 380/220V 3상4선 반은 한 구획의 회로가 380V 3상과 220V 단상으로 갈린다. 그러면 그 구획
   * 이름은 거짓말이 된다. 몇 V 인지는 계통 표가 회로마다 말한다.
   */
  it('괄호에는 갈래만 붙는다 — 전압은 이름에 싣지 않는다', () => {
    const at = (name: string, dir: 'IN' | 'OUT', variant: string) =>
      groupRefOf({ group: `G-${dir}`, medium: 'power', direction: dir, name, positions: 1, variant });
    const refs = [at('전원 출력 1', 'OUT', 'DC'), at('전원 입력 1', 'IN', 'AC')];
    expect(refs.map((r) => portGroupLabel(r, refs))).toEqual(['전원 출력(DC)', '전원 입력(AC)']);
  });

  /**
   * **판에 적힌 이름을 화면이 버리지 않는다.**
   *
   * 예전에는 어휘로 지어내서, 「UTP」·「관리」·「OPGW」라고 이름 붙인 포트가 화면에서는 전부
   * 「네트워크」·「광」으로 덮였다 — 자료가 이름을 갖고 있는데 화면이 그것을 버린 셈이다.
   */
  it('포트에 이름이 있으면 그 이름으로 부른다', () => {
    const named = (name: string, medium: string) => groupRefOf({ group: name, medium, direction: 'BI', name, positions: 1 });
    const refs = [named('UTP', 'network'), named('OPGW', 'fiber'), named('관리', 'network')];
    expect(refs.map((r) => portGroupLabel(r, refs))).toEqual(['UTP', 'OPGW', '관리']);
  });

  /* 이름이 아예 없을 때만 어휘로 물러선다 — 그때는 방향까지 불러야 입력과 출력이 갈린다. */
  it('이름이 없으면 어휘로 물러선다', () => {
    const refs = [g('PWR-IN', 'power', 'IN'), g('PWR-OUT', 'power', 'OUT')];
    expect(refs.map((r) => portGroupLabel(r, refs))).toEqual(['전원 입력', '전원 출력']);
  });

  it('어휘에 없는 종류는 그 값을 쓴다 — 빈 이름이 되지 않게', () => {
    const all = [g('X', '미지의매체')];
    expect(portGroupLabel(all[0]!, all)).toBe('미지의매체');
  });
});

/* 「심선 수를 안 적었으면 한 가닥」이 열세 군데에 흩어져 있었다(`positions ?? 1`) — 기본값이
   규칙인 이상 적는 자리는 하나여야 한다. 한 곳이 어긋나면 같은 포트가 화면에서는 1심,
   저장에서는 24심이 된다. */
describe('coreCount', () => {
  it('안 적었으면 한 가닥이다', () => {
    expect(coreCount(undefined)).toBe(1);
    expect(coreCount(null)).toBe(1);
  });

  it('적었으면 그 수다', () => {
    expect(coreCount(24)).toBe(24);
  });

  it('「다심인가」도 같은 셈에서 나온다 — 두 규칙이 갈리지 않게', () => {
    expect(isMultiCorePort(undefined)).toBe(coreCount(undefined) > 1);
    expect(isMultiCorePort(24)).toBe(coreCount(24) > 1);
  });
});

/**
 * **선로 값은 종류가 부른다** — 매체가 아니라.
 *
 * 같은 광이어도 점퍼코드에 송전선로 관리번호를 적을 일은 없다. 그렇다고 화면이 종류 **이름**
 * 으로 「OPGW」를 찾으면 안 된다 — 이름은 본부마다 다르고 바뀐다. 종류가 선언한다.
 */
describe('광 선로 값', () => {
  it('선언이 없으면 공통 칸뿐이다', () => {
    expect(cableFieldsFor('fiber').map((f) => f.key)).toEqual(['lengthM']);
  });

  it('선언을 켜면 밖에서 받아 적을 수밖에 없는 것이 붙는다', () => {
    /* 관리번호는 뺐다 — 대장에 있어도 우리가 그것으로 하는 일이 없다. */
    expect(cableFieldsFor('fiber', { managesFiberLine: true }).map((f) => f.key)).toEqual([
      'lengthM',
      'lineName',
      'spliceCount',
    ]);
  });

  it('도면과 연결이 아는 것은 여기 없다 — 대국·용도·경로는 적지 않는다', () => {
    const keys = cableFieldsFor('fiber', { managesFiberLine: true }).map((f) => f.key);
    for (const derived of ['peer', 'purpose', 'route', 'usage']) expect(keys).not.toContain(derived);
  });
});
