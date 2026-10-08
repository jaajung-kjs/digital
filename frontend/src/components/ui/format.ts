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

/*
 * ── 수 꼴 — 종류마다 helper 하나(CONVENTIONS §1.7-i1) ─────────────────────────────────────────────
 * SI 단위는 한 칸 띄우고(12 m · 30 A · 220 V · -13.05 dB · 8.5 km), 셈 단위는 붙인다(24심 · 3대 · 2개 · 5건 · 1,234원).
 * 표 칸에는 수만 적고 단위는 머리 괄호(「길이(m)」)에 둔다 — 아래 `format*` 는 수만, `*Text` 는 단위까지 돌려준다.
 * 소수는 **꼬리 0 을 버린다**(0.500 → 0.5). 예외는 설계서의 공량 하나 — 문서 관행대로 늘 3자리(`formatManDaysFixed`).
 * `toLocaleString` 을 화면 코드에서 직접 부르지 않는다(로케일·자릿수가 자리마다 갈린다).
 */

/** 원 — 정수, 천 단위 구분(「1,234」). 문장 안에서는 「1,234원」(원은 붙인다). */
export function formatWon(v: number): string {
  return formatNumber(Math.round(v));
}

/** 공량(인, 길이당 인/m) — 최대 3자리, 꼬리 0 제거(「0.5」·「1.125」). 설계서 밖 모든 자리. */
export function formatManDays(v: number): string {
  return formatNumber(v, 3);
}

/** 설계서의 공량 — 늘 3자리(「1.000」·「0.500」). 설계 문서 관행: 자릿수가 맞아야 열이 세로로 읽힌다. */
export function formatManDaysFixed(v: number): string {
  return v.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** 수량(대·m) — 최대 2자리, 꼬리 0 제거. */
export function formatQty(v: number): string {
  return formatNumber(v, 2);
}

/** 길이(m) — 「12 m」. 수만 원하면 `formatNumber(v, 2)`. */
export function lengthText(m: number): string {
  return `${formatNumber(m, 2)} m`;
}

/** 길이(km) — 「8.5 km」. */
export function kmText(km: number): string {
  return `${formatNumber(km, 3)} km`;
}

/** 측정값(dB·km 의 수) — 최대 3자리, 꼬리 0 제거, 천 단위 구분 없음(「-6.435」). */
export function formatMeasure(v: number): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 3, useGrouping: false });
}

/** 손실 — 「-13.05 dB」. */
export function dbText(v: number): string {
  return `${formatMeasure(v)} dB`;
}

/** 율 — 0.0321 → 「3.21%」(최대 3자리, 꼬리 0 제거). */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
}

/**
 * 자유 글로 적힌 「수+단위」 값(차단기 용량 「50A」, 전압 「220V」)을 **보일 때만** 띄어 쓴다 — 「50 A」.
 * 분명한 수+단위 꼴(`/^(\d+(?:\.\d+)?)\s*(A|V)$/`)일 때만 바꾸고, 그 밖(「AC220V」·「3P 30A」)은 적힌 그대로 둔다.
 * 저장 값은 건드리지 않는다.
 */
export function unitValueText(raw: string): string {
  const m = /^(\d+(?:\.\d+)?)\s*(A|V)$/.exec(raw.trim());
  return m ? `${m[1]} ${m[2]}` : raw;
}

/**
 * 병합 칸의 조각을 잇는다 — **빈 조각은 뺀다**(「— · 50 A」가 아니라 「50 A」). 모두 비면 null(부르는 쪽이 「—」).
 * 정격(전압 · 용량) · 전원케이블 · 길이 · 부하 · 포트 · 최근 측정이 이 하나로 잇는다.
 */
export function joinParts(parts: ReadonlyArray<string | null | undefined | false>, sep = ' · '): string | null {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '' && p !== EMPTY);
  return kept.length > 0 ? kept.join(sep) : null;
}

/**
 * 원문 시기 표기(「2026.1.1」·「2026. 4.30. 입찰공고분 부터」)를 화면 날짜 `YYYY-MM-DD` 로 — 읽을 수 없으면 원문 그대로.
 * 원문은 부르는 쪽이 `title` 에 둔다(`SourceDate`).
 */
export function formatSourceDate(raw: string | null | undefined): string {
  if (!raw) return EMPTY;
  const m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(raw);
  if (!m) return raw;
  const two = (s: string) => s.padStart(2, '0');
  return `${m[1]}-${two(m[2]!)}-${two(m[3]!)}`;
}
