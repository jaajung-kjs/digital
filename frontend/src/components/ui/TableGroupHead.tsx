import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Th } from './Table';

/**
 * 묶음 표의 **묶음 머리줄**(§3.7) — `thead` 첫 줄에 표 폭을 다 쓰는 한 칸: 제목 · 메타(흐리게) · 오른쪽 끝 단추.
 *
 * 선번장 블록(「OFD · 슬롯 2 ↔ 송광치 · 24심」 + 측정 입력·편집)이 처음 썼고, 차단기 대장처럼 묶음마다
 * 표를 세우는 판이 같은 한 벌을 쓴다. 손으로 짜면 제목 굵기·메타 잘림·단추 자리가 판마다 갈린다.
 *
 * - **제목은 잘리지 않는다**(`shrink-0`) — 어느 묶음인지가 이 줄의 뜻이다. 넘치면 메타가 먼저 말줄임된다.
 * - **단추는 판 오른쪽에 남는다**(`sticky right-0`) — 표가 가로로 구르면 단추가 판 밖으로 밀려나지 않게.
 *   그래서 칸은 `Th bare` 다(말줄임 감싸개의 `overflow: hidden` 이 sticky 를 가둔다).
 * - 머리줄은 `thead` 안이라 고정 머리글과 함께 붙는다 — 48심 블록을 굴려도 어느 묶음인지 남는다.
 */
export function TableGroupHead({
  colSpan, title, metas = [], actions, className, ...rest
}: {
  colSpan: number;
  /** 굵은 제목 — 글자든 `TableGroupHeadButton` 이든. 여럿이면 그대로 늘어놓는다. */
  title: ReactNode;
  /**
   * 흐린 메타(선로명·길이·케이블) — 빈 것은 건너뛴다. 넘치면 말줄임(전문은 title).
   * 눈길을 끌어야 하는 사실(「입력 전원 미확인」)은 `{ text, tone: 'warning' }` — 흐리지 않고 경고 색이다.
   */
  metas?: readonly (string | { text: string; tone: 'warning' } | null | undefined)[];
  /** 오른쪽 끝 단추 — 표 줄 안이므로 `size="xs"`. */
  actions?: ReactNode;
  /** 칸 테두리 같은 꾸밈(고정 머리의 바닥 그림자 등). */
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <tr>
      <Th colSpan={colSpan} bare className={className}>
        <span data-testid={rest['data-testid']} className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-content">{title}</span>
          {metas.filter((m) => !!m).map((m, i) => {
            const meta = typeof m === 'string' ? { text: m, tone: null } : m!;
            return (
              <span key={i} className={cn('min-w-0 truncate font-normal', meta.tone === 'warning' ? 'text-warning' : 'text-content-muted')} title={meta.text}>
                {meta.text}
              </span>
            );
          })}
          {actions && (
            <span className="sticky right-0 ml-auto flex shrink-0 items-center gap-1 bg-surface-2 pl-2">{actions}</span>
          )}
        </span>
      </Th>
    </tr>
  );
}

/**
 * 묶음 머리줄 제목 안의 누를 것 — `link` 는 **다른 곳으로 가는** 이름(단자 설비 → 그 설비 상세), 밑줄·강조색으로
 * 「누르면 옮겨 간다」를 말한다. `plain` 은 제자리에서 그 묶음을 고르는 글자(호버에만 강조색).
 */
export function TableGroupHeadButton({
  variant = 'plain', className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'link' | 'plain' }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded text-left text-sm font-semibold focus-visible:outline-none focus-ring-input',
        variant === 'link' ? 'text-primary underline-offset-2 hover:underline' : 'text-content hover:text-primary',
        className,
      )}
      {...rest}
    />
  );
}
