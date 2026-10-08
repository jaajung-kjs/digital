import { formatSourceDate } from './format';

/**
 * 원문 시기 표기(조달청·임금실태조사 문서의 「2026. 4.30. 입찰공고분 부터」)를 화면 날짜 `YYYY-MM-DD` 로 보이고,
 * 원문은 `title` 에 둔다(CONVENTIONS §1.7-i2). 화면 날짜 꼴은 하나다.
 */
export function SourceDate({ value }: { value: string | null | undefined }) {
  const text = formatSourceDate(value);
  return <span className="tabular-nums" title={value && value !== text ? value : undefined}>{text}</span>;
}
