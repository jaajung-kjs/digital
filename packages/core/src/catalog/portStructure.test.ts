import { describe, expect, it } from 'vitest';
import { comparePortStructure, type PortDeclaration } from './portStructure.js';


const tpl = (over: Partial<PortDeclaration> & { group: string; count: number }): PortDeclaration => ({
  direction: 'BI', medium: 'ethernet', namePattern: '포트 {n}', positions: 1, ...over,
});

describe('comparePortStructure', () => {
  const before = [tpl({ group: 'P', count: 2 }), tpl({ group: 'GND', count: 1, medium: 'ground' })];

  it('그대로면 same', () => {
    expect(comparePortStructure(before, [...before]).verdict).toBe('same');
  });

  /* 이것이 「자산 종류를 잘못 등록해 포트 두 개를 더 달아야 하는데 아무것도 못 한다」의
     회귀 테스트다 — 더하는 쪽은 이미 있는 포트를 건드리지 않는다. */
  it('개수가 늘면 additive — 늘어난 만큼만 더한다', () => {
    const d = comparePortStructure(before, [tpl({ group: 'P', count: 4 }), before[1]!]);
    expect(d.verdict).toBe('additive');
    expect(d.additions).toEqual([expect.objectContaining({ group: 'P', delta: 2 })]);
  });

  it('구획이 생기면 additive — 그 구획 전부가 새 것이다', () => {
    const d = comparePortStructure(before, [...before, tpl({ group: 'OPT', count: 12, medium: 'fiber' })]);
    expect(d.verdict).toBe('additive');
    expect(d.additions).toEqual([expect.objectContaining({ group: 'OPT', delta: 12 })]);
  });

  it('개수가 줄면 breaking — 케이블이 물린 포트가 사라질 수 있다', () => {
    expect(comparePortStructure(before, [tpl({ group: 'P', count: 1 }), before[1]!]).verdict).toBe('breaking');
  });

  it('구획이 사라지면 breaking', () => {
    expect(comparePortStructure(before, [before[0]!]).verdict).toBe('breaking');
  });

  /* 개수는 그대로여도 **이미 있는 포트의 뜻**이 바뀌면 깨진다. */
  it('방향·매체·이름 규칙·심선 수가 바뀌면 breaking', () => {
    expect(comparePortStructure(before, [tpl({ group: 'P', count: 2, direction: 'IN' }), before[1]!]).verdict).toBe('breaking');
    expect(comparePortStructure(before, [tpl({ group: 'P', count: 2, medium: 'fiber' }), before[1]!]).verdict).toBe('breaking');
    expect(comparePortStructure(before, [tpl({ group: 'P', count: 2, namePattern: 'P{n}' }), before[1]!]).verdict).toBe('breaking');
    expect(comparePortStructure(before, [tpl({ group: 'P', count: 2, positions: 24 }), before[1]!]).verdict).toBe('breaking');
  });
});
