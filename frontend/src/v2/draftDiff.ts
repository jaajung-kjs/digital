/**
 * **고친 것이 있는가** — 초안을 원본과 견주는 한 가지 방법.
 *
 * 세 탭이 같은 질문에 각자 답하고 있었다: 자산 종류는 `isDraftDirty`(JSON 비교), 설비
 * 종류는 그 자리에서 `JSON.stringify` 두 번, 케이블은 손으로 필드를 하나씩 견주는 `same`.
 * 셋이 같은 뜻이어야 하는데 구현이 다르면 언젠가 한쪽만 고쳐진다 — 실제로 케이블만
 * 「비어 있는 새 초안」을 기준으로 삼아 다른 답을 냈다.
 *
 * 비교는 **JSON 직렬화**로 한다. 그래서 초안은 늘 같은 만든이(`…ToDraft`/`empty…Draft`)를
 * 거치고 spread-patch 로만 고쳐야 한다 — 필드 순서가 달라지면 안 고쳤는데도 고친 것이 된다.
 * 이 불변식이 깨지면 저장 단추가 제멋대로 켜진다.
 */
export function isDirty<T>(draft: T | null, saved: T | null): boolean {
  if (draft == null) return false;
  /* 원본이 없다 = 만드는 중 — 아직 아무것도 저장된 적이 없으니 늘 「고친 것이 있다」. */
  if (saved == null) return true;
  return JSON.stringify(draft) !== JSON.stringify(saved);
}
