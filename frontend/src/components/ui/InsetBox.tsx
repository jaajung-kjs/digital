import type { HTMLAttributes, ElementType } from 'react';
import { cn } from './cn';

/**
 * 카드 **안**의 한 구획 — 한 단 들어간 면.
 *
 * 「이 안은 바깥과 다른 것을 담는다」를 말하는 자리다: 슬롯 수를 적는 줄, 연결 내역,
 * 넣을 것을 고르는 목록. 네 곳이 각자 `rounded border border-line bg-surface-2` 를 손으로
 * 적고 있었고, 그래서 모서리·테두리·면이 조금씩 달랐다(`p-1.5` / `px-2 py-1.5` / `p-2`).
 *
 * **면과 테두리만 정한다.** 안을 어떻게 흘릴지(가로로 늘어놓을지, 세로로 쌓을지)는 담는
 * 쪽이 안다 — `className` 으로 받는다.
 */
export function InsetBox({
  as: Tag = 'div',
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Tag className={cn('rounded border border-line bg-surface-2 p-2', className)} {...rest} />;
}
