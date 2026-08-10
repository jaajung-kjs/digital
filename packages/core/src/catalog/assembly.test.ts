import { describe, expect, it } from 'vitest';
import { instantiateAssembly, validateAssembly, type AssemblySpec } from './assembly.js';
import type { AssetTypeSpec } from './types.js';

const item = (over: Partial<AssemblySpec['items'][number]> & { id: string }) => ({
  parentItemId: null, typeKey: 'RACK', name: '이름', containerKey: null,
  col: null, row: null, colSpan: null, rowSpan: null, ...over,
});

/** 랙 하나 + 그 안의 장비 하나 — 가장 작은 「1식」. */
const oneSet: AssemblySpec = {
  key: 'OPT-SET', name: '송변전광단말장치 1식',
  items: [
    item({ id: 'r', typeKey: 'RACK', name: '랙' }),
    item({ id: 'd', parentItemId: 'r', typeKey: 'OPT-TERM', name: '광단말', containerKey: 'main', col: 0, row: 0, colSpan: 1, rowSpan: 1 }),
  ],
};
const types = new Set(['RACK', 'OPT-TERM']);

describe('validateAssembly', () => {
  it('뿌리 하나 + 자식이면 유효', () => {
    expect(validateAssembly(oneSet, types)).toBeNull();
  });

  /* 도면에 "무엇을" 놓는지가 정해지려면 뿌리가 하나여야 한다. */
  it('뿌리가 없거나 둘이면 거부한다', () => {
    expect(validateAssembly({ ...oneSet, items: [item({ id: 'a', parentItemId: 'b' })] }, types)).toBe('no-root');
    expect(validateAssembly({ ...oneSet, items: [item({ id: 'a' }), item({ id: 'b' })] }, types)).toBe('many-roots');
  });

  it('없는 부모를 가리키면 거부한다', () => {
    const bad = { ...oneSet, items: [item({ id: 'r' }), item({ id: 'x', parentItemId: 'nope', containerKey: 'main' })] };
    expect(validateAssembly(bad, types)).toBe('unknown-parent');
  });

  /* 부모가 있으면 그 부모의 **어느 컨테이너**인지가 있어야 자리가 정해진다. */
  it('부모는 있는데 컨테이너를 안 정하면 거부한다', () => {
    const bad = { ...oneSet, items: [item({ id: 'r' }), item({ id: 'x', parentItemId: 'r', typeKey: 'OPT-TERM' })] };
    expect(validateAssembly(bad, types)).toBe('child-without-container');
  });

  it('어휘에 없는 타입은 거부한다', () => {
    const bad = { ...oneSet, items: [item({ id: 'r', typeKey: 'NOPE' })] };
    expect(validateAssembly(bad, types)).toBe('unknown-type');
  });

  /* 고리가 있으면 인스턴스화가 끝나지 않는다 — 저장 전에 걸러야 배치할 때 안 터진다. */
  it('고리가 있으면 거부한다', () => {
    const bad: AssemblySpec = {
      ...oneSet,
      items: [
        item({ id: 'r' }),
        item({ id: 'a', parentItemId: 'b', typeKey: 'OPT-TERM', containerKey: 'main' }),
        item({ id: 'b', parentItemId: 'a', typeKey: 'OPT-TERM', containerKey: 'main' }),
      ],
    };
    expect(validateAssembly(bad, types)).toBe('cycle');
  });
});

describe('instantiateAssembly', () => {
  const rackType: AssetTypeSpec = {
    key: 'RACK', name: '랙', categoryKey: '구조', sortOrder: 1,
    placement: { placeable: true }, labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
    containers: [{ key: 'main', name: '슬롯', cols: 1, rows: 12, allowSpan: true, accepts: {} }],
    ports: [{ group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' }],
  };
  const devType: AssetTypeSpec = {
    ...rackType, key: 'OPT-TERM', name: '광단말', containers: [],
    ports: [{ group: 'OPT', count: 12, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' }],
  };
  const specs = new Map([['RACK', rackType], ['OPT-TERM', devType]]);

  it('뿌리 이름만 놓는 사람이 정하고 나머지는 형판이 적은 그대로', () => {
    const out = instantiateAssembly(oneSet, specs, '통신랙 A');
    expect(out.map((a) => a.name)).toEqual(['통신랙 A', '광단말']);
  });

  it('자리와 부모 관계가 그대로 실려 나온다', () => {
    const out = instantiateAssembly(oneSet, specs, '통신랙 A');
    expect(out[1]).toMatchObject({ parentItemId: 'r', containerKey: 'main', col: 0, row: 0 });
  });

  it('포트도 타입 선언대로 함께 만들어진다', () => {
    const out = instantiateAssembly(oneSet, specs, '통신랙 A');
    expect(out[0]!.ports.map((p) => p.name)).toEqual(['접지']);
    expect(out[1]!.ports).toHaveLength(12);
  });

  /* 12심 판과 24심 판이 같은 타입일 수 있다 — 부품마다 오버라이드를 실어 보낸다. */
  it('부품이 선언한 포트 수·심선 수 오버라이드를 반영한다', () => {
    const withOverride: AssemblySpec = {
      ...oneSet,
      items: [oneSet.items[0]!, { ...oneSet.items[1]!, portCounts: { OPT: 4 } }],
    };
    expect(instantiateAssembly(withOverride, specs, 'x')[1]!.ports).toHaveLength(4);
  });
});
