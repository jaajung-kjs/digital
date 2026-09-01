import { describe, expect, it } from 'vitest';
import { validateAssembly, ASSEMBLY_GRID, type AssemblySpec } from './assembly.js';
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

