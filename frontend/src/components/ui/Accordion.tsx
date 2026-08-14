import { useId, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Badge, type BadgeStatus } from './Badge';
import { SELECTABLE } from './selection';

/** 접었다 펴는 한 구획 — 머리줄에 서는 것과 그 안에 담기는 것. */
export interface AccordionSection {
  key: string;
  /** 머리줄의 이름 — 접혀 있을 때 이 줄만 남으므로 「무엇인가」를 여기서 다 말해야 한다. */
  title: ReactNode;
  /** 이름 옆 요약 — 펴 보지 않고도 고를 수 있게 하는 값(`3/25 연결`). */
  badge?: ReactNode;
  badgeStatus?: BadgeStatus;
  /** 펼쳤을 때 나오는 것. 접혀 있으면 **그리지 않는다**(아래 참고). */
  body: ReactNode;
}

export interface AccordionProps {
  sections: readonly AccordionSection[];
  /** 지금 펼친 구획. `null` 이면 전부 접힌다 — **하나만 펼친다**. */
  openKey: string | null;
  /** 머리줄을 눌렀을 때. 펼친 것을 다시 누르면 `null` 이 온다(다시 누르면 풀린다). */
  onOpenChange: (key: string | null) => void;
  className?: string;
}

/**
 * 아코디언 — **한 번에 하나만 펼친다**.
 *
 * 왜 필요했나: 상세 패널은 384px 인데 포트 탭은 부품마다 전면판을 한 장씩 세로로 쌓았다.
 * 판암 송광치는 부품이 열둘이라 판 하나에 2,945px — **화면 5.5장**이 됐고, 맨 아래 통합단말을
 * 보려면 그 위 열한 장을 지나 스크롤해야 했다. 접는 길도, 부품으로 건너뛰는 길도 없었다.
 *
 * 접힌 머리줄이 곧 **부품 목록**이다 — 그래서 `badge` 가 중요하다. 이름만 남으면 「어느 것을
 * 펴야 하나」를 펴 보면서 알아내야 하므로, 펴지 않고도 고를 수 있는 값(연결 수)을 함께 적는다.
 *
 * **접힌 구획은 그리지 않는다**(`hidden` 이 아니라 언마운트). 감추기만 하면 판 열두 장을
 * 그대로 그려 놓고 눈에서만 치우는 셈이라, 스크롤은 없어져도 렌더 비용은 그대로다 —
 * 포트 114개가 전부 DOM 에 남는다.
 *
 * 카드 껍데기(`rounded-lg border-line bg-surface`)를 이 컴포넌트가 갖는다 — 안에 `DetailCard`
 * 를 또 넣으면 테두리가 두 겹이 된다. 구획 하나가 곧 카드 한 장이다.
 *
 * 왜 「하나만」인가: 여럿을 동시에 펼칠 수 있으면 결국 전부 펼쳐 놓고 쓰게 되어 원래 상태로
 * 돌아간다. 업계도 좁은 패널에서는 단일 펼침이다(Ant `Collapse accordion`, Carbon `Accordion`).
 */
export function Accordion({ sections, openKey, onOpenChange, className }: AccordionProps) {
  const baseId = useId();

  return (
    <div className={cn('space-y-2', className)}>
      {sections.map((section) => {
        const open = section.key === openKey;
        const headerId = `${baseId}-h-${section.key}`;
        const panelId = `${baseId}-p-${section.key}`;
        return (
          <div key={section.key} className="rounded-lg border border-line bg-surface">
            {/* 머리줄 전체가 누르는 자리다 — 셰브런만 누르게 하면 과녁이 12px 로 좁아진다. */}
            <button
              type="button"
              id={headerId}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                'flex min-h-7 w-full items-center gap-2 rounded-lg px-3 py-2 text-left',
                SELECTABLE,
              )}
              onClick={() => onOpenChange(open ? null : section.key)}
            >
              <span aria-hidden className="shrink-0 text-content-faint">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content">
                {section.title}
              </span>
              {section.badge != null && (
                <Badge status={section.badgeStatus ?? 'neutral'}>{section.badge}</Badge>
              )}
            </button>
            {open && (
              <div id={panelId} role="region" aria-labelledby={headerId} className="space-y-2 px-3 pb-3">
                {section.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
