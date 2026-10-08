import { Input, type InputProps } from './Input';

/** `HH:mm`(24시) — 비었으면 시각 없음. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 시각을 적는 칸 — `DateInput` 의 짝(§「날짜」). 형식은 `HH:mm`(24시) 하나로 고정한다.
 *
 * `<input type="time">` 은 표기를 브라우저 로케일이 정해 「--:-- --」(오전/오후)로 선다 — 같은 화면의 날짜
 * (`YYYY-MM-DD`)와 어긋난다. 그래서 글자 칸이고, 값의 검사는 부르는 쪽이 `TIME_PATTERN` 으로 한다.
 */
export function TimeInput(props: Omit<InputProps, 'type'>) {
  /* `numeric` 자판은 「:」가 없다(터치) — 글 자판으로 둔다. */
  return <Input placeholder="예 14:30" inputMode="text" maxLength={5} {...props} />;
}
