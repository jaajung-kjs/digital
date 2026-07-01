/**
 * 실효 floorId — 자산이 자기 floorId 가 없으면 부모(랙/패널/OFD…)의 floorId 를 상속한다(조상까지 재귀).
 *
 * "자식이 부모의 floorId 를 물려받는다"는 규칙을 한 곳으로 통일하기 위한 공용 리졸버.
 * getFloor/getParent 콜백으로 어떤 자산 소스(워킹카피·트레이스 그래프 등)에도 동일하게 적용한다.
 * - 명시 floorId 가 있으면 그것을 우선(자식이 부모와 다른 층을 명시했으면 존중).
 * - 사이클 안전(seen). 조상 어디에도 없으면 null.
 */
export function effectiveFloorId(
  id: string | null | undefined,
  getFloor: (id: string) => string | null | undefined,
  getParent: (id: string) => string | null | undefined,
): string | null {
  const seen = new Set<string>();
  let cur: string | null = id ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const f = getFloor(cur);
    if (f) return f;
    cur = getParent(cur) ?? null;
  }
  return null;
}
