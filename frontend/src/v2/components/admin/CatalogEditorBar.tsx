import type { ReactNode } from 'react';
import { Badge, Button, ErrorStrip, MessageStrip, OverflowMenu } from '../../../components/ui';

export interface CatalogEditorBarProps {
  /** 지금 편집 중인 것의 이름 — 새로 만드는 중이면 「새 …」. */
  title: string;
  /** 고친 것이 있는가 — 있으면 이름 옆에 점이 뜬다. */
  dirty: boolean;
  saving: boolean;
  /**
   * 저장을 막는 입력 오류 수 — **저장을 눌러 막힌 뒤에만** 말한다(`showIssues`).
   *
   * 예전에는 이 수가 0보다 크기만 하면 띠가 떴다. 그래서 「새 자산 종류」를 누르는 순간
   * 아직 아무것도 안 적은 빈 폼 위에 「입력 오류 2건 — 저장 전에 수정하세요」가 떠 있었다.
   * 아직 하지 않은 일을 실수라고 부르는 것이다.
   */
  issueCount?: number;
  /** 저장을 눌러 막혔는가 — 그때부터 어느 칸이 막는지 말한다. */
  showIssues?: boolean;
  /** 저장 실패 메시지 — 닫을 수 있다. */
  error?: string | null;
  onDismissError?: () => void;
  /** 「몇 개 사용 중」 같은 안내 — 구조 잠금처럼 저장 전에 알아야 하는 것. */
  notice?: ReactNode;
  /** 되돌릴 수 없는 동작 — 저장 옆이 아니라 이름 옆 `⋯` 안에 선다. */
  onDelete?: () => void;
  deleteLabel?: string;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * 대장 편집기의 저장 바 — **세 탭이 같은 자리에 같은 것을 둔다**.
 *
 * 예전에는 탭마다 달랐다: 설비 종류와 자산 종류는 위쪽 바에(문구도 배치도 미묘하게 다르게),
 * 케이블은 그룹 카드마다 아래쪽에 저장 버튼이 있었다. 그래서 「지금 고친 것이 저장됐나」를
 * 탭마다 다른 곳에서 확인해야 했다.
 *
 * 왼쪽은 **지금 무엇을 고치고 있는가**, 오른쪽은 **그것을 어떻게 할 것인가**다.
 *
 * **삭제는 오른쪽에 없다.** 예전에는 `[종류 삭제] [취소] [저장]` 이 한 뼘 안에 늘어서
 * 있었고, 아무것도 고치지 않은 화면에서는 취소·저장이 꺼져 있어 유일하게 눌리는 단추가
 * 삭제였다. 되돌릴 수 없는 것은 이름 옆 `⋯` 안으로 한 겹 들어간다(`OverflowMenu`).
 */
export function CatalogEditorBar({
  title, dirty, saving, issueCount = 0, showIssues = false, error, onDismissError,
  notice, onDelete, deleteLabel, onCancel, onSave,
}: CatalogEditorBarProps) {
  return (
    <div className="shrink-0 border-b border-line bg-surface">
      {/* 높이를 못 박는다 — `⋯` 가 있는 화면(46)과 없는 화면(42)이 4px 달라서, 화면을
          옮기면 첫 줄이 미세하게 튀었다. 캔버스 머리줄은 어디서나 같은 높이다. */}
      <div className="flex h-12 w-full items-center gap-2 px-4">
        <span className="min-w-0 truncate text-sm text-content">
          {title}
          {/* 고친 것이 있다는 표시 — 저장 버튼이 켜지는 것만으로는 눈에 안 띈다. */}
          {dirty && <span className="ml-1 text-warning" aria-label="저장하지 않은 변경">●</span>}
        </span>
        {onDelete && (
          <OverflowMenu items={[{ label: deleteLabel ?? '삭제', danger: true, onSelect: onDelete }]} />
        )}
        {/* 되돌릴 수 있는 것과 없는 것 사이를 화면 폭으로 벌린다. */}
        <span className="flex-1" />
        <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={onCancel}>
          취소
        </Button>
        {/* **막혔다고 꺼 두지 않는다.** 회색 단추는 왜 안 눌리는지 말해 주지 못해서
            막다른 길이 된다 — 누르면 막고 있는 칸을 전부 짚어 준다(GOV.UK·Nielsen). */}
        <Button size="sm" disabled={!dirty || saving} onClick={onSave}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>

      {/* 알림 띠는 **머리줄 아래**에 선다 — 위에 두면 내용에 따라 머리줄이 아래로
          밀려, 화면을 옮길 때 첫 줄의 자리가 달라진다(실측 48 → 94). */}
      {/* 손으로 베낀 마크업이었다 — `role="alert"` 이 빠져 있어 실패한 저장이 낭독되지
          않았다. 같은 것을 두 번 적으면 한쪽만 고쳐진다. */}
      <ErrorStrip message={error} onDismiss={onDismissError} className="w-full px-4 py-1" />
      {/* 오류가 떠 있으면 입력 오류 수는 접어 둔다 — 둘을 겹쳐 놓으면 어느 쪽을 고쳐야 할지
          알 수 없다(먼저 손댈 것은 방금 실패한 저장이다). */}
      {showIssues && issueCount > 0 && error == null && (
        <div className="w-full px-4 py-1">
          <MessageStrip tone="warning">입력 오류 {issueCount}건 — 저장 전에 수정하세요</MessageStrip>
        </div>
      )}
      {notice && <div className="w-full px-4 py-1">{notice}</div>}
    </div>
  );
}

/**
 * 「몇 개 사용 중」 안내 — 사용자가 낸 오류가 아니라 **사정**이다.
 *
 * 예전에는 컨테이너 없이 맨 문장이 `text-danger` 빨강으로 떠 있었다. 고칠 수 없는 것을
 * 빨갛게 칠하면 빨강이 아무 뜻도 없어진다 — 띠에 담고 톤을 낮춘다.
 */
export function InUseNotice({ count, message }: { count: number; message: string }) {
  return (
    <MessageStrip tone="info">
      <span className="flex items-center gap-2">
        <Badge status="info">{count}개 사용 중</Badge>
        <span>{message}</span>
      </span>
    </MessageStrip>
  );
}
