import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Th, useTableLayout } from './Table';

/**
 * 묶음 표의 **묶음 머리줄**(§3.7) — `thead` 첫 줄에 표 폭을 다 쓰는 한 칸: 제목 · 메타(흐리게) · 오른쪽 끝 단추.
 *
 * 선번장 블록(「OFD · 슬롯 2 ↔ 송광치 · 24심」 + 측정 등록·광선로 수정)이 처음 썼고, 차단기 대장처럼 묶음마다
 * 표를 세우는 판이 같은 한 벌을 쓴다. 손으로 짜면 제목 굵기·메타 잘림·단추 자리가 판마다 갈린다.
 *
 * - **제목은 잘리지 않는다**(`shrink-0`) — 어느 묶음인지가 이 줄의 뜻이다. 넘치면 메타가 먼저 말줄임된다.
 * - **단추는 머리줄 오른쪽 끝**이다. 표는 가로로 구르지 않는다(§1.7-e) — 열은 순위로 병합·숨는다.
 * - `colSpan` 은 기본으로 지금 서는 열 수다(`useTableLayout`) — 손으로 세면 열이 숨을 때 어긋난다.
 * - 머리줄은 `thead` 안이라 고정 머리글과 함께 붙는다 — 48심 블록을 굴려도 어느 묶음인지 남는다.
 */
/** 머리줄 메타 하나 — 글자만이면 흐린 메타, `faint` 면 한 단 더 흐리게(지금 보기 밖의 것), `title` 은 마우스를 올리면 뜨는 말(없으면 글자 그대로). */
export interface TableGroupMeta { text: string; faint?: boolean; title?: string }

export function TableGroupHead({
  colSpan: span, title, metas = [], actions, className, ...rest
}: {
  /** 기본은 지금 서는 열 수(`TableCard columns`). */
  colSpan?: number;
  /** 굵은 제목 — 글자든 `TableGroupHeadButton` 이든. 여럿이면 그대로 늘어놓는다. */
  title: ReactNode;
  /** 흐린 메타(선로명·길이·케이블) — 빈 것은 건너뛴다. 넘치면 말줄임(전문은 title). 머리줄은 늘 한 줄이다(§1.7-g). */
  metas?: readonly (string | TableGroupMeta | null | undefined)[];
  /** 오른쪽 끝 단추 — 표 줄 안이므로 `size="xs"`. */
  actions?: ReactNode;
  /** 칸 테두리 같은 꾸밈(고정 머리의 바닥 그림자 등). */
  className?: string;
  'data-testid'?: string;
}) {
  const layout = useTableLayout();
  const items = metas
    .map((m) => (typeof m === 'string' ? { text: m } : m))
    .filter((m): m is TableGroupMeta => !!m && !!m.text);
  const meta = (m: TableGroupMeta, i: number) => (
    <span
      key={i} title={m.title ?? m.text} data-faint={m.faint ? '' : undefined}
      className={cn('min-w-0 truncate font-normal', m.faint ? 'text-content-faint' : 'text-content-muted')}
    >
      {m.text}
    </span>
  );
  return (
    <tr>
      <Th colSpan={span ?? layout.colCount} bare className={className}>
        <span data-testid={rest['data-testid']} className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-content">{title}</span>
          {items.map(meta)}
          {actions && (
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">{actions}</span>
          )}
        </span>
      </Th>
    </tr>
  );
}

/**
 * 묶음 안의 **소묶음 머리줄** — `tbody` 안에서 표 폭을 다 쓰는 한 칸, 묶음 머리줄(`TableGroupHead`)보다 한 단 가볍게
 * (열 머리 글씨 크기·흐림, 이름만 본문색). 차단기 대장의 「교류 모선 · 입력: 소내전원반 차단기 4」·「교류/직류 미지정」.
 */
export function TableSubHead({ colSpan, name, meta, 'data-testid': testId }: {
  /** 기본은 지금 서는 열 수. */
  colSpan?: number;
  /** 소묶음 이름 — 본문색. */
  name: string;
  /** 곁들인 말 — 흐리게, 넘치면 말줄임(전문은 title). */
  meta?: string;
  'data-testid'?: string;
}) {
  const layout = useTableLayout();
  const full = meta ? `${name} · ${meta}` : name;
  return (
    <tr data-testid={testId}>
      <Th colSpan={colSpan ?? layout.colCount} bare scope="rowgroup" className="font-medium">
        <span className="block min-w-0 truncate" title={full}>
          <span className="text-content">{name}</span>
          {meta && <span> · {meta}</span>}
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
