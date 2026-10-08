/**
 * 화면에 값을 **적어 넣는 규칙** — 빈 칸과 날짜.
 *
 * 같은 뜻을 화면마다 다르게 적고 있었다: 빈 칸이 어떤 표에서는 `—`, 어떤 카드에서는 `-`,
 * 어떤 자리에서는 그냥 빈칸. 날짜는 다섯 가지 형식이 한 앱 안에 있었다(그중 하나는
 * 브라우저 로케일이 정한 미국식 `mm/dd/yyyy`). 규칙을 부르는 자리마다 다시 적으면
 * 하나만 고쳐지는 것은 시간 문제라, 여기 한 번만 적는다.
 */

/**
 * 값이 **없다**는 표시 — 전각 대시.
 *
 * 빈 문자열로 두지 않는 이유: 빈 칸은 「없음」과 「아직 안 그려짐」이 구분되지 않는다.
 * 하이픈(`-`)이 아니라 대시(`—`)인 이유는 숫자의 마이너스와 헷갈리지 않기 위해서다.
 */
export const EMPTY = '—';

/**
 * 날짜를 화면 형식으로 — `YYYY-MM-DD`.
 *
 * 저장 형식과 **같은 형식**이다. 옮겨 적는 자리가 없으면 어긋날 자리도 없다.
 * ISO 앞 열 글자를 자를 뿐이라 시각·시간대는 버린다 — 이 앱의 날짜 값은 전부 날짜다.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  return value.slice(0, 10);
}

/** 오늘(이 기기의 날짜) — `YYYY-MM-DD`. `toISOString` 은 UTC 라 새벽 아홉 시 전에는 어제가 된다. */
export function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * 수 — 천 단위 구분, **로케일은 ko-KR 로 못 박는다**(`toLocaleString()` 을 로케일 없이 부르면
 * 브라우저 설정이 구분자를 정해 같은 값이 PC 마다 다르게 적힌다).
 */
export function formatNumber(v: number, maximumFractionDigits = 0): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits });
}

/**
 * 시각을 화면 형식으로 — `YYYY-MM-DD HH:mm`(이 기기의 시간대). 변경 이력처럼 **언제 했는가**가 값인 자리만 쓴다.
 * 날짜 값(설치일·점검일)은 `formatDate` — 시각이 없는 값에 시간대를 씌우면 날이 바뀐다.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
