import { describe, expect, it } from 'vitest';
import { instantiateAssembly, validateAssembly, type AssemblySpec } from './assembly.js';
import type { AssetTypeSpec } from './types.js';

const item = (over: Partial<AssemblySpec['items'][number]> & { id: string }) => ({
  typeKey: 'OPT-TERM', name: '이름', col: 0, row: 0, colSpan: 1, rowSpan: 1, ...over,
});

/** 격자 하나에 부품을 놓은 것 — 그게 설비 종류의 전부다(담는 중간 자산이 없다). */
const optSet: AssemblySpec = {
  key: 'OPT-SET', name: '송변전광단말장치',
  grid: { cols: 1, rows: 12 },
  items: [
    item({ id: 'a', typeKey: 'OPT-TERM', name: '광단말', row: 0 }),
    item({ id: 'b', typeKey: 'NET-SW', name: '네트워크스위치', row: 1 }),
  ],
};
const types = new Set(['OPT-TERM', 'NET-SW']);

describe('validateAssembly', () => {
  it('격자 안에 겹치지 않게 놓였으면 유효', () => {
    expect(validateAssembly(optSet, types)).toBeNull();
  });

  it('격자가 0이면 거부한다', () => {
    expect(validateAssembly({ ...optSet, grid: { cols: 0, rows: 12 } }, types)).toBe('bad-grid');
    expect(validateAssembly({ ...optSet, grid: { cols: 1, rows: 0 } }, types)).toBe('bad-grid');
  });

  it('어휘에 없는 타입은 거부한다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', typeKey: 'NOPE' })] }, types)).toBe('unknown-type');
  });

  /* 저장 전에 걸러야 배치할 때 터지지 않는다 — 설비 종류에서는 놓였는데 실제 배치에서 튕기면
     짠 사람이 무엇이 잘못됐는지 알 길이 없다. */
  it('격자 밖은 거부한다', () => {
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', row: 12 })] }, types)).toBe('out-of-range');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', col: 1 })] }, types)).toBe('out-of-range');
    expect(validateAssembly({ ...optSet, items: [item({ id: 'x', row: 11, rowSpan: 2 })] }, types)).toBe('out-of-range');
  });

  it('같은 자리에 둘을 놓으면 거부한다', () => {
    const clash = { ...optSet, items: [item({ id: 'a', row: 0 }), item({ id: 'b', typeKey: 'NET-SW', row: 0 })] };
    expect(validateAssembly(clash, types)).toBe('overlap');
  });

  /* 가로·세로 둘 다 겹쳐야 겹친 것이다 — 2열 격자의 옆 칸은 남의 자리가 아니다. */
  it('열이 다르면 같은 행이라도 겹치지 않는다', () => {
    const twoCol: AssemblySpec = {
      ...optSet,
      grid: { cols: 2, rows: 6 },
      items: [item({ id: 'a', col: 0, row: 0 }), item({ id: 'b', typeKey: 'NET-SW', col: 1, row: 0 })],
    };
    expect(validateAssembly(twoCol, types)).toBeNull();
  });

  it('빈 설비 종류도 유효하다 — 놓고 나서 채울 수 있다', () => {
    expect(validateAssembly({ ...optSet, items: [] }, types)).toBeNull();
  });
});

describe('instantiateAssembly', () => {
  const devType: AssetTypeSpec = {
    key: 'OPT-TERM', name: '광단말', categoryKey: '통신', sortOrder: 1,
    placement: { placeable: false }, labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
    ports: [{ group: 'OPT', count: 12, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' }],
  };
  const swType: AssetTypeSpec = {
    ...devType, key: 'NET-SW', name: '네트워크스위치',
    ports: [{ group: 'P', count: 24, direction: 'BI', medium: 'network', namePattern: '포트 {n}' }],
  };
  const specs = new Map([['OPT-TERM', devType], ['NET-SW', swType]]);

  /* 설비 자신(이름·도면 위치)은 놓는 쪽이 만든다 — 여기서는 그 안에 들어갈 것만 낸다. */
  it('부품 이름과 자리를 설비 종류가 적은 그대로 낸다', () => {
    const out = instantiateAssembly(optSet, specs);
    expect(out.map((p) => [p.name, p.row])).toEqual([['광단말', 0], ['네트워크스위치', 1]]);
  });

  it('포트도 타입 선언대로 함께 만들어진다', () => {
    const out = instantiateAssembly(optSet, specs);
    expect(out[0]!.ports).toHaveLength(12);
    expect(out[1]!.ports).toHaveLength(24);
  });

  /* 12심 판과 24심 판이 같은 타입일 수 있다 — 부품마다 오버라이드를 실어 보낸다. */
  it('부품이 선언한 포트 수 오버라이드를 반영한다', () => {
    const withOverride: AssemblySpec = {
      ...optSet,
      items: [{ ...optSet.items[0]!, portCounts: { OPT: 4 } }],
    };
    expect(instantiateAssembly(withOverride, specs)[0]!.ports).toHaveLength(4);
  });
});
