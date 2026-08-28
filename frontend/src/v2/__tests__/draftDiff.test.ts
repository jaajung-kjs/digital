/**
 * **저장을 누르면 고칠 것이 남지 않는다** — 그 판정이 여기 하나에 있다(`isDirty`).
 *
 * 예전에는 날 `JSON.stringify` 로 견줘서, 같은 값이라도 **칸의 차례**가 다르면 「고쳤다」가
 * 됐다. 실제로 포트를 더하는 자리가 줄을 손으로 지으면서 그 일이 벌어졌고, 저장을 눌러도
 * 저장·취소 단추가 켜진 채로 남았다. 차례를 맞춰 견주면 그 통로가 닫힌다.
 */
import { describe, expect, it } from 'vitest';
import { isDirty } from '../draftDiff';

describe('isDirty', () => {
  it('칸의 차례가 달라도 같은 값이면 고친 것이 아니다', () => {
    expect(isDirty({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
    expect(isDirty(
      { ports: [{ group: 'A', count: 1, variant: null }] },
      { ports: [{ variant: null, count: 1, group: 'A' }] },
    )).toBe(false);
  });

  it('값이 다르면 고친 것이다', () => {
    expect(isDirty({ a: 1 }, { a: 2 })).toBe(true);
    expect(isDirty({ ports: [{ count: 1 }] }, { ports: [{ count: 2 }] })).toBe(true);
  });

  /* 줄이 서는 차례는 뜻이 있다 — 포트가 판에 서는 순서가 그것이다. */
  it('줄의 차례가 바뀌면 고친 것이다', () => {
    expect(isDirty({ ports: [{ g: 'A' }, { g: 'B' }] }, { ports: [{ g: 'B' }, { g: 'A' }] })).toBe(true);
  });

  it('빈 값과 없는 칸은 다르다 — 그건 만든이가 맞출 일이다', () => {
    expect(isDirty({ a: null }, {})).toBe(true);
  });

  it('원본이 없으면 만드는 중이라 늘 고친 것이 있다', () => {
    expect(isDirty({ a: 1 }, null)).toBe(true);
    expect(isDirty(null, { a: 1 })).toBe(false);
  });
});
