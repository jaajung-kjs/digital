/**
 * 케이블을 얼마나 굵게, 얼마나 벌려 그리나 — **눈이 기대하는 대로** 움직이게.
 *
 * 두 극단이 다 틀렸다:
 * - 월드 단위로 그리면(예전) 축소할수록 실처럼 가늘어진다. 평면도는 이제 놓인 것들에 맞춰
 *   열리므로 그 축소된 자리가 곧 기본 화면이다 — 거기서 케이블이 가장 안 보였다.
 * - 화면 px 로 못 박으면 굵기는 늘 같은데, **확대하면 가늘어 보인다**: 설비 상자도 배경
 *   도면도 함께 커지는데 케이블만 제자리라서 상대적으로 얇아진다(착시가 아니라 비율이다).
 *
 * 그래서 배율을 **조금만** 탄다(√). 확대하면 굵어지되 위아래로 묶어, 축소해도 사라지지 않고
 * 확대해도 도면을 덮지 않는다.
 */

/** 100% 에서의 굵기(화면 px). */
const BASE = 2.5;
/** 아무리 축소해도 이보다 가늘지 않고, 아무리 확대해도 이보다 굵지 않다. */
const MIN = 2;
const MAX = 6;
/** 고른 케이블은 조금 더 굵다 — 색만으로는 겹친 선들 사이에서 눈에 안 띈다. */
const SELECTED_RATIO = 1.6;

/** 같은 자리를 지나는 다발끼리 벌리는 간격(화면 px) — 배율이 달라져도 한 다발로 읽힌다. */
export const BUNDLE_GAP_PX = 5;

/**
 * 이 배율에서 케이블 선의 굵기(**화면 px**).
 *
 * @param scale 1 = 100%
 */
export function cableLineWidth(scale: number, selected = false): number {
  const w = Math.min(Math.max(BASE * Math.sqrt(Math.max(scale, 0.01)), MIN), MAX);
  return selected ? w * SELECTED_RATIO : w;
}
