/**
 * **고친 것이 있는가** — 초안을 원본과 견주는 한 가지 방법.
 *
 * 세 탭이 같은 질문에 각자 답하고 있었다: 장비 품목은 `isDraftDirty`(JSON 비교), 설비
 * 종류는 그 자리에서 `JSON.stringify` 두 번, 케이블은 손으로 필드를 하나씩 견주는 `same`.
 * 셋이 같은 뜻이어야 하는데 구현이 다르면 언젠가 한쪽만 고쳐진다 — 실제로 케이블만
 * 「비어 있는 새 초안」을 기준으로 삼아 다른 답을 냈다.
 *
 * 비교는 JSON 으로 하되 **칸의 차례를 먼저 맞춘다**(`canonical`).
 *
 * 예전에는 날 `JSON.stringify` 로 견줬다. 그래서 「초안은 늘 같은 만든이를 거치고 spread 로만
 * 고친다」는 불변식에 정답이 매달려 있었는데, 사람이 지키는 불변식은 언젠가 깨진다 — 실제로
 * 깨졌다: 포트를 더하는 자리가 줄을 손으로 지어 칸의 차례가 달라졌고, **저장을 눌러도 저장·
 * 취소 단추가 켜진 채로 남았다**(고칠 것이 남았다고 읽혔으므로). 차례를 여기서 맞추면 그
 * 통로가 닫힌다. 값이 정말 다를 때만 다르다.
 */
export function isDirty<T>(draft: T | null, saved: T | null): boolean {
  if (draft == null) return false;
  /* 원본이 없다 = 만드는 중 — 아직 아무것도 저장된 적이 없으니 늘 「고친 것이 있다」. */
  if (saved == null) return true;
  return canonical(draft) !== canonical(saved);
}

/**
 * 값을 **차례가 정해진 글자**로 — 칸의 차례가 달라도 같은 값이면 같은 글자가 되게.
 *
 * 배열의 차례는 뜻이 있으므로(포트가 서는 순서) 건드리지 않는다. 객체의 칸 차례만 맞춘다.
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value == null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortKeys(v)]),
  );
}
