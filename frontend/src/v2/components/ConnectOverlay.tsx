import { Button, cn } from '../../components/ui';
import type { ConnectSession } from '../connectSession';

/**
 * **지금 케이블을 잇는 중이라는 사실**을 화면에 계속 띄운다.
 *
 * 머리줄 아래, 뷰 탭 줄 위에 선다 — **탭을 옮겨도 층을 옮겨도 국을 옮겨도 남는다**. 그래야
 * 「다른 층·다른 국은 평소처럼 옮겨 가서 고른다」가 성립한다.
 *
 * 적는 것은 **둘뿐**이다: 지금 잇는 중이라는 것, 그리고 **어디서 출발했는지**.
 *
 * 예전에는 여기에 케이블 종류 드롭다운과 「이어서 또 잇기」 토글이 함께 섰다. 종류를 미리
 * 고르게 두니 안 고른 채 포트를 누르면 「종류를 고르세요」로 튕겨 **고른 포트가 버려졌고**,
 * 도면 위에서는 무엇을 잘못했는지도 알기 어려웠다. 종류는 포트를 고른 **뒤에** 묻는다
 * (`ConnectCategoryDialog`). 그 앞에는 도면 하단에 `1/3`~`3/3` 이 떴는데, 실제 걸음은
 * 다섯인데 셋으로 세어 `2/3` 가 두 번 나왔다 — 걸음 번호도 걷었다.
 */
export function ConnectOverlay({
  session, readOnly, substationName, onBack, onCancel,
}: {
  session: ConnectSession;
  /** 다른 국에 다녀오는 중 — 그 국은 읽기 전용이다(고르러 간 것이지 고치러 간 것이 아니다). */
  readOnly: boolean;
  /** 지금 보고 있는 국 이름 — 읽기 전용일 때 그 이름을 적는다. */
  substationName: string | null;
  /** 담아 둔 국으로 돌아간다 — 다녀오는 중일 때만 있다. */
  onBack?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line-strong bg-info-bg px-4">
      <span className="shrink-0 text-sm font-semibold text-primary">케이블 연결 중</span>

      {session.from ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-xs text-content-muted">출발</span>
          <span className="min-w-0 truncate text-sm font-medium text-content">{session.from.label}</span>
        </span>
      ) : (
        <span className="text-sm text-content-muted">출발할 포트를 고르세요</span>
      )}

      <span className={cn('min-w-0 truncate text-sm', readOnly ? 'text-warning' : 'text-content-muted')}>
        {readOnly
          ? `${substationName ?? '이 변전소'} 는 읽기 전용 — 이을 포트만 누르세요`
          : session.from
            ? '이을 포트를 고르세요 — 다른 층·다른 국으로 옮겨 가도 됩니다'
            : ''}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>돌아가기</Button>
        )}
        <Button variant="secondary" size="sm" onClick={onCancel}>연결 취소</Button>
      </div>
    </div>
  );
}
