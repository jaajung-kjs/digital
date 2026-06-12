/**
 * id 를 키로 하는 lookup 맵 — 코드 곳곳의 `new Map(items.map(x => [x.id, x]))` 관용구를
 * 단일 소스로 모은 것. (id → 다른 값 매핑은 대상 아님 — 이 함수는 항상 id → 원소.)
 */
export function toMapById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]));
}
