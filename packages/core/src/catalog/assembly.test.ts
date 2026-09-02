import { describe, expect, it } from 'vitest';
import { validateAssembly, ASSEMBLY_GRID, type AssemblySpec } from './assembly.js';
import type { PortTemplate } from './types.js';
import type { AssetTypeSpec } from './types.js';

const item = (over: Partial<AssemblySpec['items'][number]> & { id: string }) => ({
  typeKey: 'OPT-TERM', name: '이름', col: 0, row: 0, colSpan: 1, rowSpan: 1, ...over,
});

/** 격자 하나에 장비를 놓은 것 — 그게 설비 품목의 전부다(담는 중간 자산이 없다). */
const optSet: AssemblySpec = {
  key: 'OPT-SET', name: '송변전광단말장치',
  items: [
    item({ id: 'a', typeKey: 'OPT-TERM', name: '광단말', row: 0 }),
    item({ id: 'b', typeKey: 'NET-SW', name: '네트워크스위치', row: 1 }),
  ],
};
const types = new Set(['OPT-TERM', 'NET-SW']);

/* 링크를 볼 때 필요한 선언 — 실물 모양 그대로(정류기는 교류를 받아 직류를 낸다). */
const TEMPLATES: Record<string, PortTemplate[]> = {
  'IR-48': [
    { group: 'AC-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
    { group: 'DC-OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' },
  ],
  'BUS': [
    { group: 'DC-IN', count: 3, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
    { group: 'DC-OUT', count: 3, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'DC' },
  ],
};
const portsOf = (k: string) => TEMPLATES[k];

/** 정류기 둘과 배전부 하나 — 실제 충전기의 최소 모양. */
const charger = (links: AssemblySpec['links']): AssemblySpec => ({
  key: 'CHG', name: '통신용 충전기',
  items: [
    { id: 'r1', typeKey: 'IR-48', name: '정류기 1', col: 0, row: 0, colSpan: 1, rowSpan: 1 },
    { id: 'r2', typeKey: 'IR-48', name: '정류기 2', col: 0, row: 1, colSpan: 1, rowSpan: 1 },
    { id: 'bus', typeKey: 'BUS', name: '배전부', col: 0, row: 2, colSpan: 1, rowSpan: 1 },
  ],
  links,
});
const link = (o: Partial<AssemblySpec['links'][number]> & { id: string }) => ({
  aItemId: 'r1', aGroup: 'DC-OUT', aIndex: 1, bItemId: 'bus', bGroup: 'DC-IN', bIndex: 1, ...o,
});

/**
 * 설비 품목이 들고 다니는 **내부 배선**.
 *
 * 판정은 케이블을 이을 때와 **같은 함수**(`validateConnection`)가 한다 — 여기서 규칙을 다시
 * 쓰면 설비 품목에서는 이어지는데 놓고 나서 그 케이블이 규칙 위반이 되는 조립을 만들 수 있다.
 */
describe('validateAssembly — 내부 배선', () => {
  const types = new Set(['IR-48', 'BUS']);

  it('정류기 출력이 배전부 입력으로 — 이어진다', () => {
    const spec = charger([link({ id: 'l1' }), link({ id: 'l2', aItemId: 'r2', bIndex: 2 })]);
    expect(validateAssembly(spec, types, portsOf)).toBeNull();
  });

  it('링크가 없으면 볼 것이 없다 — 예사인 설비 품목이다', () => {
    expect(validateAssembly(charger([]), types, portsOf)).toBeNull();
    expect(validateAssembly(charger(undefined), types, portsOf)).toBeNull();
  });

  /* 전원은 공급과 소비가 갈린다 — 출력끼리 잇는 것은 물리적으로 불가능하다. */
  it('출력끼리는 못 잇는다', () => {
    const bad = charger([link({ id: 'l1', bItemId: 'r2', bGroup: 'DC-OUT', bIndex: 1 })]);
    expect(validateAssembly(bad, types, portsOf)).toBe('link-invalid');
  });

  it('교류 출력에 직류 입력을 물리지 못한다 — 갈래가 다르다', () => {
    const bad = charger([link({ id: 'l1', aGroup: 'AC-IN', bGroup: 'DC-IN' })]);
    expect(validateAssembly(bad, types, portsOf)).toBe('link-invalid');
  });

  it('한 포트에 둘을 물리지 못한다', () => {
    const bad = charger([link({ id: 'l1' }), link({ id: 'l2', aItemId: 'r2' })]);
    expect(validateAssembly(bad, types, portsOf)).toBe('link-occupied');
  });

  /* 항목을 지웠는데 줄이 남았거나, 포트 수를 줄여 번호가 사라진 경우. */
  it('없는 항목·없는 포트를 가리키면 흠이다', () => {
    expect(validateAssembly(charger([link({ id: 'l1', aItemId: '없음' })]), types, portsOf)).toBe('link-endpoint');
    expect(validateAssembly(charger([link({ id: 'l1', bIndex: 9 })]), types, portsOf)).toBe('link-endpoint');
  });
});

describe('validateAssembly', () => {
  it('격자 안에 겹치지 않게 놓였으면 유효', () => {
    expect(validateAssembly(optSet, types)).toBeNull();
  });

  /* 격자는 명세가 들고 다니지 않는다 — 모든 설비가 같은 도화지를 쓴다. 들고 다니던 동안
     화면(상수)과 서버(저장값)의 판이 갈려, 눈으로 놓은 자리가 저장할 때만 튕겼다. */
  it('격자는 상수 하나다 — 명세가 제 격자를 갖지 않는다', () => {
    expect('grid' in optSet).toBe(false);
    expect(ASSEMBLY_GRID).toEqual({ cols: 10, rows: 20 });
  });

  it('어휘에 없는 타입은 거부한다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', typeKey: 'NOPE' })] }, types)).toBe('unknown-type');
  });

  /* 저장 전에 걸러야 배치할 때 터지지 않는다 — 설비 품목에서는 놓였는데 실제 배치에서 튕기면
     짠 사람이 무엇이 잘못됐는지 알 길이 없다. */
  it('격자 밖은 거부한다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', row: 20 })] }, types)).toBe('out-of-range');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', col: 10 })] }, types)).toBe('out-of-range');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', row: 19, rowSpan: 2 })] }, types)).toBe('out-of-range');
  });

  it('같은 자리에 둘을 놓으면 거부한다', () => {
    const clash = { ...optSet, items: [item({ id: 'a', row: 0 }), item({ id: 'b', typeKey: 'NET-SW', row: 0 })] };
    expect(validateAssembly(clash, types)).toBe('overlap');
  });

  /* 가로·세로 둘 다 겹쳐야 겹친 것이다 — 2열 격자의 옆 칸은 남의 자리가 아니다. */
  it('열이 다르면 같은 행이라도 겹치지 않는다', () => {
    const twoCol: AssemblySpec = {
      ...optSet,
      items: [item({ id: 'a', col: 0, row: 0 }), item({ id: 'b', typeKey: 'NET-SW', col: 1, row: 0 })],
    };
    expect(validateAssembly(twoCol, types)).toBeNull();
  });

  /**
   * 이름·포트 수도 **여기서** 본다.
   *
   * 예전에는 이 둘이 서버의 요청 형식 검사(zod)에만 있었다. 그래서 화면은 「저장할 수 있다」고
   * 하고, 누르면 서버가 400 으로 거절했다 — 게다가 그 문구는 영어라 사람은 무엇을 고쳐야
   * 하는지 알 길이 없었다. 규칙이 한 곳에 있어야 두 쪽이 같은 답을 낸다.
   */
  it('이름이 비었으면 유효하지 않다 — 공백만 친 것도 빈 것이다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', name: '' })] }, types)).toBe('empty-name');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', name: '   ' })] }, types)).toBe('empty-name');
  });

  it('포트 수는 1 이상의 정수여야 한다 — 심선 수도 같다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', portCounts: { FIBER: 0 } })] }, types)).toBe('bad-port-count');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', portPositions: { 'FIBER-TRUNK': 1.5 } })] }, types)).toBe('bad-port-count');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', portCounts: { FIBER: 24 } })] }, types)).toBeNull();
  });

  it('빈 설비 품목도 유효하다 — 놓고 나서 채울 수 있다', () => {
    expect(validateAssembly({ ...optSet, items: [] }, types)).toBeNull();
  });
});

