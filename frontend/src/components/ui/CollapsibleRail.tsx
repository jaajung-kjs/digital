import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';

/** 접힌 상태를 이 브라우저에 적어 둔다 — 못 읽거나 못 쓰면(사생활 창·막힌 저장소) 펼친 채로 간다. */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    /* 적지 못해도 지금 화면은 그대로 접고 편다. */
  }
}

export interface CollapsibleRailProps {
  /** 접힘을 적어 둘 이름(보는 사람 브라우저마다). */
  storageKey: string;
  /** 무엇의 레일인가 — 「조직」. 단추 이름이 「조직 접기」·「조직 펼치기」가 된다. */
  title: string;
  /** 펼친 폭·테두리·바탕 — 레일 바깥 모양은 부르는 쪽이 정한다(접히면 폭만 바뀐다). */
  className?: string;
  'data-testid'?: string;
  /** 레일 내용 — 받은 「접기」 단추를 제 머리줄에 둔다. */
  children: (collapseButton: ReactNode) => ReactNode;
}

/**
 * **접을 수 있는 왼쪽 레일** — 조직 트리처럼 늘 서 있는 길잡이.
 *
 * 1280 에서 트리(256px)가 늘 서 있으면 넓은 표(선번장 12열)의 이름 칸이 잘린다. 접으면 32px 띠에
 * 「펼치기」 단추만 남는다. 접고 펴는 것은 **사람이 정한다** — 화면이 저 혼자 접지 않는다.
 * 접힌 동안에도 내용은 **그대로 살아 있다**(숨길 뿐) — 펼치면 펼쳐 둔 가지·검색어가 그대로다.
 */
export function CollapsibleRail({ storageKey, title, className, children, ...rest }: CollapsibleRailProps) {
  const [stored, setStored] = useState(() => readFlag(storageKey));
  const collapsed = stored;
  /* 누른 단추가 사라지면 초점이 body 로 떨어진다 — 맞은편 단추로 옮긴다. 사람이 누른 때만(첫 화면·잠금 풀림은 아니다). */
  const moveFocus = useRef(false);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const set = (on: boolean) => { moveFocus.current = true; setStored(on); writeFlag(storageKey, on); };
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (collapsed ? expandRef : collapseRef).current?.focus();
  }, [collapsed]);

  const collapse = (
    <IconButton ref={collapseRef} size="sm" aria-label={`${title} 접기`} title={`${title} 접기`} onClick={() => set(true)}>
      <PanelLeftClose size={14} />
    </IconButton>
  );

  return (
    <aside
      data-testid={rest['data-testid']}
      data-collapsed={collapsed || undefined}
      className={cn('flex shrink-0 flex-col', className, collapsed && '!w-8')}
    >
      {collapsed && (
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-line">
          <IconButton ref={expandRef} size="sm" aria-label={`${title} 펼치기`} title={`${title} 펼치기`} onClick={() => set(false)}>
            <PanelLeftOpen size={14} />
          </IconButton>
        </div>
      )}
      {/* 숨길 뿐 걷지 않는다 — `hidden` 속성(보조기술도 건너뛴다)과 클래스를 함께. */}
      <div hidden={collapsed} className={collapsed ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>{children(collapse)}</div>
    </aside>
  );
}
