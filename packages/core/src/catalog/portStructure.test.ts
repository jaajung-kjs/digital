import { describe, expect, it } from 'vitest';
import { comparePortStructure, type PortDeclaration } from './portStructure.js';


const tpl = (over: Partial<PortDeclaration> & { group: string; count: number }): PortDeclaration => ({
  direction: 'BI', medium: 'ethernet', namePattern: '포트 {n}', positions: 1, ...over,
});

describe('comparePortStructure', () => {
  const before = [tpl({ group: 'P', count: 2 }), tpl({ group: 'GND', count: 1, medium: 'ground' })];

  it('그대로면 늘지도 줄지도 않는다', () => {
    expect(comparePortStructure(before, [...before])).toEqual({ redefined: false, additions: [], removals: [] });
  });

  /* 이것이 「장비 품목을 잘못 등록해 포트 두 개를 더 달아야 하는데 아무것도 못 한다」의
     회귀 테스트다 — 더하는 쪽은 이미 있는 포트를 건드리지 않는다. */
  it('개수가 늘면 늘어난 만큼만 더한다', () => {
    const d = comparePortStructure(before, [tpl({ group: 'P', count: 4 }), before[1]!]);
    expect(d.additions).toEqual([expect.objectContaining({ group: 'P', delta: 2 })]);
    expect(d.removals).toEqual([]);
  });

  it('구획이 생기면 그 구획 전부가 새 것이다', () => {
    const d = comparePortStructure(before, [...before, tpl({ group: 'OPT', count: 12, medium: 'fiber' })]);
    expect(d.additions).toEqual([expect.objectContaining({ group: 'OPT', delta: 12 })]);
  });

  /* 줄이는 것도 **셈까지는** 한다. 해도 되는지는 그 포트에 케이블이 물렸는지가 정하고,
     그건 DB 만 안다 — 여기서 「사용 중이면 무조건 막기」로 굳히면 안 쓰는 포트도 못 지운다. */
  it('개수가 줄면 줄어든 만큼을 뗄 것으로 센다', () => {
    const d = comparePortStructure(before, [tpl({ group: 'P', count: 1 }), before[1]!]);
    expect(d.removals).toEqual([expect.objectContaining({ group: 'P', delta: 1 })]);
    expect(d.redefined).toBe(false);
  });

  it('구획이 사라지면 그 구획 전부를 뗄 것으로 센다', () => {
    const d = comparePortStructure(before, [before[0]!]);
    expect(d.removals).toEqual([expect.objectContaining({ group: 'GND', delta: 1 })]);
  });

  /* 개수는 그대로여도 **이미 있는 포트의 뜻**이 바뀌면 그것은 다른 물건이 된 것이다 —
     안 쓰는 것만 골라 처리할 수가 없으므로 개수와 따로 표시한다. */
  it('방향·매체·이름 규칙·심선 수가 바뀌면 redefined', () => {
    for (const over of [{ direction: 'IN' }, { medium: 'fiber' }, { positions: 24 }]) {
      expect(comparePortStructure(before, [tpl({ group: 'P', count: 2, ...over }), before[1]!]).redefined).toBe(true);
    }
  });
});

/**
 * **이름은 뜻이 아니다.**
 *
 * 한때 이름 규칙이 바뀌면 「이미 있는 포트가 다른 물건이 되는 일」로 쳐서, 자산이 하나라도
 * 있으면 포트 이름을 고칠 수 없었다. 그런데 이름을 고쳐도 그 포트는 같은 자리에 있고 물린
 * 케이블도 그대로다 — 부르는 말만 달라진다(놓인 포트의 이름은 저장할 때 함께 맞춘다).
 */
describe('이름 규칙 변경', () => {
  it('이름만 달라진 것은 뜻이 바뀐 것이 아니다', () => {
    const before = [tpl({ group: 'A', count: 4 })];
    const after = [tpl({ group: 'A', count: 4, namePattern: '회선 {n}' })];
    expect(comparePortStructure(before, after).redefined).toBe(false);
  });
});
