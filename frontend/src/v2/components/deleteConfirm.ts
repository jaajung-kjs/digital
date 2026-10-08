/**
 * 삭제 확인 문구 — **한 규칙, 한 꼴**.
 *
 * 규칙: 지우는 일의 결과가 **지금 서 있는 자리에서 다 보이지 않으면** 묻는다(설비·랙·광선로 — 딸려 가는 것이 다른 탭·다른 국에
 * 있다 / 연결 — 상대 끝이 다른 설비다 / 사진·기록·측정 — 목록에서 한 줄이 사라질 뿐 내용은 다시 보이지 않는다).
 * 지운 것이 바로 그 자리에서 보이는 일(차단기 끝 번호 삭제)은 묻지 않는다 — 실행 취소가 곧 답이다.
 *
 * 꼴: 제목 「<무엇> 삭제」, 대상 이름, 문구는 「함께 …」 문장들 + 「저장 전에는 실행 취소할 수 있습니다.」, 단추 「삭제」.
 */
export const UNDO_HINT = '저장 전에는 실행 취소할 수 있습니다.';

export function deleteConfirm(what: string, target: string | null, effects: readonly string[] = []) {
  return { title: `${what} 삭제`, target, message: [...effects, UNDO_HINT].join(' '), confirmLabel: '삭제', danger: true } as const;
}

/** 「함께 삭제됩니다 — 차단기 3 · 연결 2.」 — 0 인 것은 뺀다. 남는 것이 없으면 null. */
export function alsoDeleted(parts: readonly (readonly [string, number])[]): string | null {
  const live = parts.filter(([, n]) => n > 0);
  return live.length > 0 ? `함께 삭제됩니다 — ${live.map(([w, n]) => `${w} ${n}`).join(' · ')}.` : null;
}
