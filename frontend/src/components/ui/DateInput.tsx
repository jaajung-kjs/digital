import { useRef, type MutableRefObject } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input, type InputProps } from './Input';
import { cn } from './cn';

/**
 * 값을 **React 가 보는 방식으로** 밀어 넣는다.
 *
 * `el.value = v` 만 하면 React 는 값이 바뀐 줄 모른다(제 트래커를 거치지 않아서). 네이티브
 * 설정자를 직접 부른 뒤 `input` 을 흘려야 제어·비제어 어느 쪽 호출부든 똑같이 받는다.
 */
function setInputValue(el: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 날짜를 적는 칸 — **앱 전체가 한 형식으로 적고, 한 형식으로 읽는다**.
 *
 * `<input type="date">` 를 그대로 쓰면 표기를 **브라우저 로케일이** 정한다. 그래서 한국어
 * 앱인데 설치일 칸이 `mm/dd/yyyy` 로 서 있었다 — 그 자리에서 `04/05` 가 4월 5일인지
 * 5월 4일인지 알 길이 없고, 같은 화면의 다른 날짜(`2026-08-13`)와도 형식이 어긋난다.
 *
 * 그래서 보이는 칸은 **글자 칸**이고 형식은 `YYYY-MM-DD` 로 고정한다(`formatDate` 와 같은
 * 형식이고, 저장 형식과도 같다 — 옮겨 적는 자리가 없으면 어긋날 자리도 없다).
 *
 * **달력을 뺏지는 않는다.** 옆 단추가 브라우저 기본 고르개를 띄우고, 고른 값은 글자 칸에
 * 그대로 들어간다. 고르개를 못 여는 브라우저에서는 단추가 서지 않는다 — 글자로 적는 길은
 * 그대로 열려 있다.
 */
export function DateInput({
  className,
  disabled,
  inputRef,
  ...rest
}: Omit<InputProps, 'type'> & { inputRef?: MutableRefObject<HTMLInputElement | null> | ((el: HTMLInputElement | null) => void) }) {
  const shown = useRef<HTMLInputElement | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const canPick = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype;

  return (
    <span className={cn('relative flex min-w-0 items-center gap-1', className)}>
      <Input
        ref={(el) => {
          shown.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        disabled={disabled}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        {...rest}
      />
      {canPick && (
        <>
          <button
            type="button"
            aria-label="달력에서 고르기"
            disabled={disabled}
            className="shrink-0 rounded p-1 text-content-faint transition-colors hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const el = shown.current;
              if (el && picker.current) picker.current.value = el.value.trim();
              picker.current?.showPicker();
            }}
          >
            <CalendarDays size={14} />
          </button>
          {/* 고르개를 띄우려면 **그려져 있어야** 한다 — `display:none` 이면 브라우저가 거부한다. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
            onChange={(e) => {
              const el = shown.current;
              if (!el) return;
              setInputValue(el, e.currentTarget.value);
              /* 이 앱의 날짜 칸은 **칸을 떠날 때** 저장한다 — 고르기도 그 규칙을 따른다. */
              el.focus();
              el.blur();
            }}
          />
        </>
      )}
    </span>
  );
}
