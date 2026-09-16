import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';

interface ItemCardProps {
  /** 머리줄 제목 — 보통 "포트 1" 처럼 종류 + 순번. */
  title: ReactNode;
  /** 주면 우측에 삭제 아이콘이 뜬다. 잠금 상태면 넘기지 않는다. */
  onDelete?: () => void;
  children: ReactNode;
}

/**
 * 목록 안에서 되풀이되는 항목 카드 — 포트·케이블 그룹이 모두 이 모양이다.
 *
 * 명세 편집기 다섯 곳이 이 블록(`rounded border border-line bg-surface-2 p-2 space-y-1.5`)과
 * 머리줄(제목 + 휴지통)을 각자 다시 써 두고 있었다. 삭제 버튼이 어떤 곳은 `title` 속성이 있고
 * 어떤 곳은 없는 식으로 조금씩 어긋난 것도 그래서다. 한 곳에서만 정한다.
 *
 * `DetailCard`(흰 배경, 1px 테두리)와 다른 계층이다 — 이건 그 카드 *안*에 들어가는 항목이다.
 */
export function ItemCard({ title, onDelete, children }: ItemCardProps) {
  return (
    <div className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs text-content-muted">{title}</span>
        {onDelete && (
          <IconButton aria-label={`${typeof title === 'string' ? title : ''} 삭제`.trim()} title="삭제" onClick={onDelete}>
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>
      {children}
    </div>
  );
}
