/**
 * 번호 행(회로·코어)을 개수에 맞추는 계획 — **행은 늘 1..N 이다.**
 *
 * 개수가 행의 유일한 근원이다: 사람이 행을 하나씩 만들거나 지우지 않는다(엑셀 선번장도
 * 24심이면 24줄이 먼저 깔린다). 그래서 중간이 빠진 상태는 고칠 대상이지 보존할 사실이 아니다.
 */
export function rowsForCount(existing: readonly number[], count: number): { create: number[]; remove: number[] } {
  if (!Number.isInteger(count) || count < 0) throw new Error(`행 수는 0 이상의 정수여야 합니다: ${count}`);
  const have = new Set(existing);
  const create: number[] = [];
  for (let n = 1; n <= count; n++) if (!have.has(n)) create.push(n);
  const remove = [...have].filter((n) => n > count).sort((a, b) => a - b);
  return { create, remove };
}
