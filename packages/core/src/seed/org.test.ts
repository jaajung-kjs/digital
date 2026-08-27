import { describe, expect, it } from 'vitest';
import { DIRECT_BRANCH, SEED_ORG } from './org.js';

describe('초기 조직 시드', () => {
  it('한전 지역본부 열다섯', () => {
    expect(SEED_ORG).toHaveLength(15);
    expect(new Set(SEED_ORG.map((h) => h.name)).size).toBe(15);
  });

  /* 「직할」은 코드가 붙인다 — 목록에 적어 두면 열다섯 번 되풀이되고 한 곳이 빠진다. */
  it('직할은 목록에 없다 — 어느 본부에나 있으므로 코드가 붙인다', () => {
    for (const hq of SEED_ORG) expect(hq.branches).not.toContain(DIRECT_BRANCH);
  });

  it('지사 이름은 본부 안에서 겹치지 않는다', () => {
    for (const hq of SEED_ORG) expect(new Set(hq.branches).size).toBe(hq.branches.length);
  });

  /* 자료(공사 설계서 파일명)에서 확인된 사업소는 빠짐없이 들어 있어야 한다 — 시드가 자료보다
     좁으면 현장이 이미 있는 조직을 손으로 다시 만든다. */
  it('자료에 나온 지사를 담는다', () => {
    const 강원 = SEED_ORG.find((h) => h.name === '강원본부')!;
    for (const b of ['강릉전력지사', '동해전력지사', '원주전력지사', '태백전력지사']) {
      expect(강원.branches).toContain(b);
    }
  });

  /* 변전소는 시드에 없다 — 반쯤 맞는 목록은 지우는 수고를 만든다(파일 주석 참고). */
  it('변전소는 담지 않는다', () => {
    expect(Object.keys(SEED_ORG[0]!)).toEqual(['name', 'branches']);
  });
});
