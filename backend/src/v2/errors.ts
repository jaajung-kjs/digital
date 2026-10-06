/** v2 자립 에러 — 구 utils/errors 에 의존하지 않는다 (Stage 7 삭제 격리). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * zod 가 잡은 흠을 **사람 말로** — 어느 칸이 왜 틀렸는지.
 *
 * 예전에는 `{ error: 'BAD_REQUEST', message: '요청 형식이 잘못되었습니다' }` 만 보냈다.
 * 그러면 화면에 뜨는 것은 「요청 형식이 잘못되었습니다」 한 줄뿐이라, 스무 칸짜리 폼에서
 * **어느 칸이 문제인지 알 길이 없다**(실제로 설비 품목에서 부품 이름 한 칸을 비운 채 저장해
 * 400 을 받고, 무엇을 고쳐야 하는지 모르는 일이 있었다). 상세(`details`)에는 zod 원문이
 * 실려 있었지만 그것은 영어이고 경로가 `items.0.name` 이다.
 *
 * 이 자리가 유일한 번역 지점이다 — 규칙이 어디서 걸리든 같은 어법으로 나온다. 새 엔드포인트가
 * 늘어도 따로 손댈 것이 없다: 모르는 칸 이름은 그 이름 그대로 적는다(거짓말하지 않는다).
 */
const FIELD_LABEL: Record<string, string> = {
  name: '이름', key: '키', categoryId: '분류', sortOrder: '차례',
  laborCode: '노무유형', unitPrice: '자재단가',
  installManDays: '신설 공량', removeManDays: '철거 공량', relocateManDays: '이설 공량',
  medium: '매체', rackTypeId: '랙 종류', typeId: '설비 종류', rackId: '랙', substationId: '국',
  circuitCount: '회로 수', panelCount: '판 수', coreCount: '코어 수', cableTypeId: '케이블 종류',
  lengthKm: '긍장', lengthM: '길이', measuredOn: '측정일', side: '측정 끝',
};

/** `items.0.name` → 「구성 1번째 이름」. 모르는 칸은 적힌 그대로 둔다. */
function fieldText(path: readonly (string | number)[]): string {
  const parts: string[] = [];
  for (const seg of path) {
    if (typeof seg === 'number') parts.push(`${seg + 1}번째`);
    else parts.push(FIELD_LABEL[seg] ?? seg);
  }
  return parts.join(' ');
}

/** 무엇이 틀렸는가 — zod 의 판정 코드를 그대로 옮긴다. */
function ruleText(issue: { code: string; [k: string]: unknown }): string {
  switch (issue.code) {
    case 'too_small':
      return issue.type === 'string'
        ? (issue.minimum === 1 ? '값을 입력하세요' : `${issue.minimum}자 이상이어야 합니다`)
        : `${issue.minimum} 이상이어야 합니다`;
    case 'too_big':
      return issue.type === 'string' ? `${issue.maximum}자 이하여야 합니다` : `${issue.maximum} 이하여야 합니다`;
    case 'invalid_type':
      if (issue.received === 'undefined') return '빠졌습니다';
      if (issue.expected === 'integer') return '정수여야 합니다';
      if (issue.expected === 'number') return '숫자여야 합니다';
      return '형식이 올바르지 않습니다';
    /* 형식(regex·uuid)과 목록(enum)은 다른 흠이다 — 「고를 수 없는 값」이라고 하면 목록이
       있는 줄 알고 목록을 찾게 된다. */
    case 'invalid_string':
      return '형식이 올바르지 않습니다';
    case 'invalid_enum_value':
    case 'invalid_union':
      return '고를 수 없는 값입니다';
    default:
      return '값이 올바르지 않습니다';
  }
}

/** 첫 흠을 문장으로, 나머지는 수로 — 「구성 1번째 이름: 값을 입력하세요 (외 2건)」. */
export function zodMessage(issues: readonly { code: string; path: readonly (string | number)[] }[]): string {
  const first = issues[0];
  if (!first) return '요청 형식이 잘못되었습니다';
  const where = fieldText(first.path);
  const why = ruleText(first as { code: string });
  const rest = issues.length > 1 ? ` (외 ${issues.length - 1}건)` : '';
  return where === '' ? `${why}${rest}` : `${where}: ${why}${rest}`;
}
