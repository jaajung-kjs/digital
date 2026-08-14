import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * 캔버스 **위에 떠 있는** 도구 상자 — 평면도의 안내 띠·확대 축소.
 *
 * 캔버스는 제 배경을 가지므로, 그 위에 얹는 것은 「떠 있다」가 보여야 눌리는 것으로 읽힌다.
 * 두 곳이 각자 `rounded-lg border border-line bg-surface shadow-sm` 를 적고 있었다.
 *
 * **어디에 뜨는지는 정하지 않는다** — 자리와 층(`absolute`·`z-*`)은 캔버스가 안다.
 */
export function FloatingBar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center rounded-lg border border-line bg-surface shadow-sm', className)} {...rest} />
  );
}
