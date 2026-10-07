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
/** 머리줄 메타 하나 — 글자만이면 흐린 메타, `faint` 면 한 단 더 흐리게(지금 보기 밖의 것), `title` 은 마우스를 올리면 뜨는 말(없으면 글자 그대로). */
export interface TableGroupMeta { text: string; faint?: boolean; title?: string }

export function TableGroupHead({
  colSpan, title, metas = [], wrapMetas = false, actions, className, ...rest
}: {
  colSpan: number;
  /** 굵은 제목 — 글자든 `TableGroupHeadButton` 이든. 여럿이면 그대로 늘어놓는다. */
  title: ReactNode;
  /** 흐린 메타(선로명·길이·케이블) — 빈 것은 건너뛴다. 넘치면 말줄임(전문은 title). */
  metas?: readonly (string | TableGroupMeta | null | undefined)[];
  /**
   * 메타가 넘치면 말줄임 대신 **머리 안에서 다음 줄로** 내린다 — 메타가 그 묶음의 뜻인 판(차단기 대장의 입력 전원)용.
   * 상세 레일이 선 1280 에서 「교류 입력: … · 직류 입력: …」이 잘리면 어디서 받는지를 읽을 수 없다.
   * 표가 판보다 넓을 수 있는 판은 표들을 감싸는 쪽에 `[container-type:inline-size]` 를 달아 보이는 폭을 알려 준다.
   */
  wrapMetas?: boolean;
  /** 오른쪽 끝 단추 — 표 줄 안이므로 `size="xs"`. */
  actions?: ReactNode;
  /** 칸 테두리 같은 꾸밈(고정 머리의 바닥 그림자 등). */
  className?: string;
  'data-testid'?: string;
}) {
  const items = metas
    .map((m) => (typeof m === 'string' ? { text: m } : m))
    .filter((m): m is TableGroupMeta => !!m && !!m.text);
  const meta = (m: TableGroupMeta, i: number) => (
    <span
      key={i} title={m.title ?? m.text} data-faint={m.faint ? '' : undefined}
      className={cn('min-w-0 font-normal', wrapMetas ? 'break-keep' : 'truncate', m.faint ? 'text-content-faint' : 'text-content-muted')}
    >
      {m.text}
    </span>
  );
  return (
    <tr>
      <Th colSpan={colSpan} bare className={cn(wrapMetas && 'whitespace-normal', className)}>
        {/* `wrapMetas` 면 줄의 폭을 **보이는 판 폭**으로 묶는다(`100cqw` — 판 쪽이 `container-type: inline-size` 를 단다) —
            표가 판보다 넓어 가로로 구를 때, 표 폭에 맞춰 늘어선 메타는 줄을 바꾸지 않고 판 밖·단추 밑으로 숨는다.
            `sticky left-0` 이라 가로로 굴려도 머리는 판 안에 남고, 단추(`sticky right-0`)는 그 끝에 선다. */}
        <span
          data-testid={rest['data-testid']}
          className={cn('flex min-w-0 items-center gap-3', wrapMetas && 'sticky left-0 max-w-[calc(100cqw-1.5rem)]')}
        >
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-content">{title}</span>
          {wrapMetas
            ? items.length > 0 && <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 py-0.5">{items.map(meta)}</span>
            : items.map(meta)}
          {actions && (
            <span className="sticky right-0 ml-auto flex shrink-0 items-center gap-1 bg-surface-2 pl-2">{actions}</span>
          )}
        </span>
      </Th>
    </tr>
  );
}

/**
 * 묶음 안의 **소묶음 머리줄** — `tbody` 안에서 표 폭을 다 쓰는 한 칸, 묶음 머리줄(`TableGroupHead`)보다 한 단 가볍게
 * (열 머리 글씨 크기·흐림, 이름만 본문색). 차단기 대장의 「교류 모선 · 입력: 소내전원반 차단기 4」.
 */
export function TableSubHead({ colSpan, name, meta, 'data-testid': testId }: {
  colSpan: number;
  /** 소묶음 이름 — 본문색. */
  name: string;
  /** 곁들인 말 — 흐리게, 넘치면 말줄임(전문은 title). */
  meta?: string;
  'data-testid'?: string;
}) {
  const full = meta ? `${name} · ${meta}` : name;
  return (
    <tr data-testid={testId}>
      <Th colSpan={colSpan} bare className="font-medium">
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
