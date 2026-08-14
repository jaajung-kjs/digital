import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { controlSizeClasses, type ControlSize } from './controlSize';

// 네이티브 size(글자 수)는 쓰지 않는다 — 폭은 레이아웃이 정한다.
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 조밀한 패널은 'sm'. 여백을 className 으로 덮어쓰지 않는다 — controlSize.ts 참고. */
  size?: ControlSize;
  /**
   * 이 칸의 값이 저장을 막는가 — 테두리로 **어느 칸인지** 짚는다.
   *
   * 문구는 부르는 쪽이 말한다(`DetailRow` 의 `issue`, 저장 바의 오류 수). 표처럼 라벨 옆에
   * 문구를 놓을 자리가 없는 자리에서는 이 테두리가 유일한 길잡이다.
   */
  invalid?: boolean;
  /**
   * **금액·수량 칸** — 세는 값이지 글이 아니다.
   *
   * `type="number"` 를 쓰지 않는다. ① 칸에 손이 얹힌 채 스크롤하면 **값이 소리 없이 바뀐다**
   * (긴 폼에서 단가가 저 혼자 달라진다), ② 위아래 스피너는 단가·품셈에 아무 뜻이 없고,
   * ③ 천단위 구분이나 로케일을 붙일 수 없다. 업계도 그래서 금액에는 텍스트 입력 + 포맷터를
   * 쓴다(Ant `InputNumber`, Carbon `NumberInput`, Stripe).
   *
   * `inputMode` 는 `numeric` 이 아니라 `decimal` 이다 — 품셈은 `0.06` 같은 값이라
   * `numeric` 키패드에는 소수점이 없어 **휴대기기에서 아예 입력할 수 없다**.
   *
   * 오른쪽 정렬 + `tabular-nums`: 자릿수가 세로로 맞아야 크기가 눈으로 비교된다(표의
   * 수 열과 같은 규칙).
   */
  numeric?: boolean;
  /**
   * 값에 딸린 **단위** — 칸 안 오른쪽에 붙는다(`원/식`·`인/m`).
   *
   * 상자 **바깥**에 별개 글자로 두면 단위가 어느 칸의 것인지 눈으로 이어야 하고, 칸이 여럿
   * 쌓인 폼에서는 값과 단위가 서로 다른 줄에서 만난다. 값과 단위는 한 덩어리다
   * (Ant `addonAfter`, Fluent suffix). 표에서는 `Th` 의 `unit` 이 같은 일을 한다.
   */
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, disabled, size = 'md', invalid = false, numeric = false, suffix, ...rest },
  ref,
) {
  /* 수는 오른쪽으로, 자릿수는 세로로 맞춘다. `type` 은 건드리지 않는다 — 기본값이 text 다. */
  const numericClass = numeric && 'text-right tabular-nums';
  const inputMode = numeric ? ('decimal' as const) : undefined;

  if (suffix == null) {
    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        inputMode={inputMode}
        className={cn(
          'w-full border rounded text-content',
          // 표 셀은 표의 배경 위에 그대로 앉는다 — §controlSize.
          size === 'cell' ? 'bg-transparent' : 'bg-surface',
          invalid ? 'border-danger' : 'border-line',
          controlSizeClasses[size],
          numericClass,
          'placeholder:text-content-faint',
          'transition-colors focus:outline-none focus:border-primary focus-ring-input',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        {...rest}
      />
    );
  }

  /* 단위가 붙으면 **상자가 테두리를 갖는다** — 안쪽 입력은 테두리도 배경도 없이 그 안에 앉고,
     여백(`controlSizeClasses`)도 상자가 가져간다. 그래야 단위가 테두리 안쪽에 들어오고
     글자 기준선은 단위가 없을 때와 같은 자리에 남는다. */
  return (
    <span
      className={cn(
        'flex w-full items-center gap-1 rounded border',
        size === 'cell' ? 'bg-transparent' : 'bg-surface',
        invalid ? 'border-danger' : 'border-line',
        controlSizeClasses[size],
        'transition-colors focus-within:border-primary focus-ring-input-box',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        inputMode={inputMode}
        className={cn(
          // 여백·테두리·배경은 상자의 몫이다 — 여기서 또 주면 상자 안에 상자가 하나 더 생긴다.
          'min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-content',
          numericClass,
          'placeholder:text-content-faint',
          'focus:outline-none',
          disabled && 'cursor-not-allowed',
        )}
        {...rest}
      />
      {/* 단위는 값보다 한 단 흐리게 — 무엇을 세는 칸인지는 값이 말하고 단위는 곁들인다
          (`Th` 의 unit 과 같은 규칙). 값이 길어도 단위는 밀리지 않는다. */}
      <span className="shrink-0 text-xs text-content-faint">{suffix}</span>
    </span>
  );
});
