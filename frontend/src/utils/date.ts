/**
 * 백엔드가 date 컬럼을 YYYY-MM-DD 슬라이스로 내려보내는 게 정상 경로지만,
 * 과거 데이터가 ISO datetime ("2026-05-13T00:00:00.000Z") 으로 남아 있을 수
 * 있어 `<input type="date">` 가 값을 못 읽고 빈 칸으로 떨어지는 일이 있다.
 * 두 형태 모두 YYYY-MM-DD 로 정규화.
 */
export function toDateInputValue(s: string | null | undefined): string {
  if (!s) return '';
  return s.slice(0, 10);
}
