import { describe, it, expect } from 'vitest';
import { DEFAULT_FACING, nextFacing, COMMON_ASSET_FIELDS } from './types.js';

describe('정면 — 도면에 놓는 설비의 방향', () => {
  /* 반과 랙은 문이 통로를 보게 놓는다. 도면에서 통로는 대개 아래쪽이다. */
  it('기본은 아래다', () => {
    expect(DEFAULT_FACING).toBe('아래');
  });

  /**
   * **네 방향만 돈다 — 「없음」으로는 돌아가지 않는다.**
   *
   * 한때 한 바퀴에 `null` 을 끼웠는데, 도면에 놓인 설비는 놓는 순간부터 정면을 가지므로
   * 그 칸은 「돌리다가 굵은 변이 사라지는」 한 칸일 뿐이었다.
   */
  it('시계 방향으로 한 바퀴 — 어디서도 없음이 되지 않는다', () => {
    let f = nextFacing(null);
    const seen = [f];
    for (let i = 0; i < 4; i++) {
      f = nextFacing(f);
      seen.push(f);
    }
    expect(seen).toEqual(['아래', '왼쪽', '위', '오른쪽', '아래']);
    expect(seen.every((v) => v != null)).toBe(true);
  });

  /* 아직 정면이 없는 옛 자산은 첫 번째 누름이 기본값을 준다. */
  it('모르는 값에서 시작하면 기본값으로 선다', () => {
    expect(nextFacing(null)).toBe(DEFAULT_FACING);
    expect(nextFacing(undefined)).toBe(DEFAULT_FACING);
    expect(nextFacing('북쪽')).toBe(DEFAULT_FACING);
  });

  /* 도는 값은 선언이 적어 둔 네 가지 그대로여야 한다 — 렌더러가 그 글자로 변을 고른다. */
  it('도는 값은 선언이 적어 둔 것뿐이다', () => {
    const declared = COMMON_ASSET_FIELDS.find((f) => f.key === 'facing')?.options ?? [];
    let f = nextFacing(null);
    for (let i = 0; i < 4; i++) {
      expect(declared).toContain(f);
      f = nextFacing(f);
    }
  });

  /**
   * 정면은 **도면에서 정한다** — 상세 폼에는 서지 않는다(`inForm: false`).
   * 폼에서 「위·아래」를 고르는 것은 도면을 안 보고 방향을 정하는 일이다.
   */
  it('폼의 줄로는 서지 않는다', () => {
    const facing = COMMON_ASSET_FIELDS.find((f) => f.key === 'facing');
    expect(facing?.inForm).toBe(false);
    expect(facing?.inTable).toBe(false);
  });
});
