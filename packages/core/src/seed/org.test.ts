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

  /**
   * **우리 공사 자료의 사업소가 목록 안에 다 들어와야 한다.**
   *
   * 목록은 한전 홈페이지에서 옮겨 온 것이고, 우리 자료(공사 설계서 138건)는 현장에서 실제로
   * 일한 기록이다. 둘이 어긋나면 둘 중 하나가 틀린 것이니 여기서 맞물리는지 본다.
   */
  it('공사 자료에 나온 사업소가 전부 들어 있다', () => {
    const 실제 = {
      강원본부: ['강릉전력지사', '동해전력지사', '원주전력지사', '태백전력지사'],
      경기본부: ['동부전력지사'],
      경남본부: ['통영전력지사'],
      경북본부: ['구미전력지사', '영주전력지사'],
      광주전남본부: ['광주전력지사', '목포전력지사'],
      남서울본부: ['강남전력지사'],
      대구본부: ['경산전력지사', '칠곡전력지사'],
      대전세종충남본부: ['세종전력지사', '청양전력지사'],
      부산울산본부: ['서부산전력지사'],
      서울본부: ['중부전력지사'],
      인천본부: ['김포전력지사'],
      전북본부: ['군산전력지사'],
    };
    for (const [hq, branches] of Object.entries(실제)) {
      const found = SEED_ORG.find((h) => h.name === hq)!;
      for (const b of branches) expect(found.branches, hq).toContain(b);
    }
  });

  /* 사업소는 배전을 맡는 「○○지사」와 송·변전을 맡는 「○○전력지사」로 갈린다. 이 시스템이
     다루는 것은 변전소의 ICT 설비이므로 전력지사만 담는다. */
  it('전력지사만 담는다 — 배전 지사는 넣지 않는다', () => {
    for (const hq of SEED_ORG) {
      for (const b of hq.branches) expect(b.endsWith('전력지사'), `${hq.name}: ${b}`).toBe(true);
    }
  });

  /* 변전소는 시드에 없다 — 반쯤 맞는 목록은 지우는 수고를 만든다(파일 주석 참고). */
  it('변전소는 담지 않는다', () => {
    expect(Object.keys(SEED_ORG[0]!)).toEqual(['name', 'branches']);
  });
});
