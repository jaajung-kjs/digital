import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Card } from './Card';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** 패널 최대 폭 — md(기본, 448px) / sm(360px) / lg(672px, 판을 담을 때). 폭 매직넘버의 단일 소스. */
  size?: 'sm' | 'md' | 'lg';
  /** 패널에 추가 className */
  className?: string;
}

const SIZE = { sm: 'max-w-[360px]', md: 'max-w-md', lg: 'max-w-2xl' } as const;

/** 초점이 갈 수 있는 것들 — 트랩이 순환시킬 대상. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  /* 제목은 이미 화면에 있으므로 새 글자를 만들지 않고 그것을 가리킨다. `useId` 인 이유:
     고정 문자열이면 모달이 둘 열렸을 때 두 대화상자가 같은 이름을 가리킨다. */
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  /**
   * 닫는 손잡이는 **ref 로 쥔다** — 초점을 옮기는 일은 상자가 열리고 닫힐 때만 해야 한다.
   *
   * 부르는 쪽은 거의 다 `onClose={() => setModal(null)}` 처럼 그 자리에서 함수를 만든다.
   * 그것을 아래 effect 의 의존성에 두면 **부모가 다시 그려질 때마다** effect 가 걷혔다
   * 다시 서고, 그때마다 초점이 옮겨 갔다 — 상자 안 칸에 한 글자를 치면 그 글자가 부모를
   * 다시 그리고, 초점은 곧바로 머리줄의 「닫기」 단추로 튀었다. 두 번째 글자부터는 아무 데도
   * 들어가지 않고, 거기서 Enter 나 Space 를 누르면 상자가 닫혔다(Esc 를 누른 것처럼 보인다).
   *
   * 손잡이는 **부를 때** 최신이면 되고, effect 가 다시 설 이유는 되지 못한다.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /**
   * 열기 전에 초점이 있던 자리 — **그리는 동안** 적어 둔다.
   *
   * effect 에서 적으면 늦다: React 는 `autoFocus` 를 커밋 단계에서 이미 걸어 놓으므로, 그때
   * 물어본 「지금 초점」은 상자를 연 단추가 아니라 상자 안 칸이다. 그 자리를 돌려주면 이미
   * 사라진 칸으로 돌아가려다 초점이 body 로 떨어진다. 그리기는 커밋보다 앞이라 그 전 자리가
   * 그대로 남아 있다. 되돌려 준 뒤 비운다(다음에 열 때 다시 적는다).
   */
  const opener = useRef<HTMLElement | null>(null);
  if (open && !opener.current) opener.current = document.activeElement as HTMLElement | null;

  /**
   * Esc 로 닫고, **Tab 이 상자 밖으로 새지 않게** 한다.
   *
   * 트랩이 없으면 Tab 을 누르는 순간 초점이 뒤에 깔린 화면으로 빠져나간다 — 화면은 막혀
   * 있는데 초점만 그 아래를 돌아다니므로, 키보드·스크린리더 사용자는 자기가 어디 있는지
   * 알 수 없다(WAI-ARIA APG Dialog).
   */
  useEffect(() => {
    if (!open) return;
    /* 초점은 상자 안으로 들어온다 — 다만 **내용이 스스로 잡았으면 뺏지 않는다**(`autoFocus`
       를 단 칸이 있으면 그 칸이 주인이다). 뺏으면 이름을 적으러 연 상자에서 초점이 「닫기」에
       가 있게 된다. 아무도 안 잡았으면 첫 번째 것을, 그것도 없으면 상자 자신을 잡는다
       (WAI-ARIA APG Dialog). */
    if (!panel.current?.contains(document.activeElement)) {
      (panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      /* 상자가 쌓였으면 **맨 위 것만** 키를 가진다 — 확인 상자가 상자 위에 뜨는 자리가 있다.
         아래 것들은 흘려보내서(끊지 않고) 안쪽 상자가 잡게 둔다. */
      const stack = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (panel.current && stack.length > 1 && stack[stack.length - 1] !== panel.current) return;
      if (e.key === 'Escape') {
        /* **이 Esc 는 여기서 끝난다.** 뒤에 깔린 화면들도 Esc 를 「고른 것 풀기」로 듣고
           있는데, 상자가 닫히면서 그것들까지 함께 물리면 안 된다 — 구성 격자에서 부품 상자를
           Esc 로 닫으면 고른 자산까지 풀려 상세 패널이 통째로 사라졌다.

           「떠 있는 상자가 있으면 뒤는 듣지 않는다」로는 못 막는다: 이 손짓 하나 안에서 상자가
           닫히고 React 가 그 자리에서 DOM 을 지우므로, 뒤 핸들러가 볼 때는 이미 상자가 없다.
           그래서 **잡는 단계에서 미리 끊는다** — 붙잡기(capture)는 window 에서 가장 먼저
           돈다. 상자가 여럿 쌓였으면 **맨 위 것만** 가져간다(그 아래 것은 그냥 흘려보내
           안쪽 상자가 잡게 둔다). */
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const edge = e.shiftKey ? items[0]! : items[items.length - 1]!;
      if (document.activeElement !== edge) return;
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1]! : items[0]!).focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      /**
       * 닫힌 뒤에는 **열기 전 있던 자리**로 초점을 돌려준다 — 안 그러면 body 로 튕겨
       * 처음부터 다시 Tab 해야 한다.
       *
       * 다만 **그 키를 다 쓴 뒤에** 돌려준다. 한 번의 키 누름은 `keydown` 하나가 아니라
       * `keydown → keypress → keyup` 의 한 묶음이고, 상자를 닫는 일은 대개 `keydown` 에서
       * 일어난다. 그 안에서 초점을 옮기면 **남은 조각을 새 자리가 받는다** — Enter 로 본부를
       * 추가하면 상자가 닫히고 초점이 「본부 추가」 단추로 돌아간 뒤, 같은 Enter 의 `keypress`
       * 가 그 단추를 눌러 빈 상자가 곧바로 다시 열렸다(추가는 됐는데 상자가 안 닫힌 것처럼
       * 보인다). 한 박자 미루면 그 조각들은 원래 자리에서 끝난다.
       */
      const back = opener.current;
      opener.current = null;
      setTimeout(() => back?.focus?.(), 0);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay)]"
      onClick={onClose}
    >
      <Card
        padding={false}
        /* 키는 화면을 넘지 않는다 — 안이 길면 **본문만** 구른다(머리줄과 단추는 제자리에
           남아야 닫는 길이 늘 보인다). 판을 담는 상자가 생기면서 필요해졌다. */
        className={cn(
          'mx-4 flex max-h-[85vh] w-full flex-col hover:!bg-surface active:!bg-surface cursor-default',
          SIZE[size],
          className,
        )}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-content">{title}</h2>
          <IconButton aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </Card>
    </div>
  );
}
