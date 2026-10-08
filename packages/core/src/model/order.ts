/**
 * 이름 순서 — **사람이 읽는 순서**(자연 순서) 하나.
 *
 * 「랙2」가 「랙10」보다 앞에 선다. 기본 `localeCompare` 는 글자 하나씩 견주어 「랙10」을
 * 앞에 세운다 — 같은 이름이 현황에서는 그렇게, 선번장·계통도에서는 자연 순서로 서서 화면마다
 * 순서가 달랐다. 이름으로 줄 세우는 곳은 모두 이것을 쓴다.
 */
const NAME_ORDER = new Intl.Collator('ko', { numeric: true });

/** 이름 둘을 자연 순서로 견준다(`Array.prototype.sort` 에 그대로 넘긴다). */
export const compareName: (a: string, b: string) => number = NAME_ORDER.compare;
