import { Button, Select, Toggle, cn } from '../../components/ui';
import type { ConnectSession } from '../connectSession';

interface CableGroup {
  key: string;
  name: string;
  categories: readonly { id: string; name: string }[];
}

/**
 * **지금 케이블을 잇는 중이라는 사실**을 화면에 계속 띄운다.
 *
 * 머리줄 아래, 뷰 탭 줄 위에 선다 — **탭을 옮겨도 층을 옮겨도 국을 옮겨도 남는다**. 그래야
 * 「다른 층·다른 국은 평소처럼 옮겨 가서 고른다」가 성립한다.
 *
 * 예전에는 도면 하단에 `1/3`~`3/3` 이 떴다. 실제 걸음은 다섯인데 셋으로 세어 `2/3` 가 두 번
 * 나왔고(설비→포트→경로→설비→포트), 이은 뒤에는 말없이 `1/3` 로 돌아가 방금 완성한 일이
 * 실패한 것처럼 보였다. 단계 번호를 걷고 **지금 무엇을 기다리는지** 한 줄로 적는다.
 *
 * **종류가 여기 있다.** 진입점마다 다른 자리에 있던 것(도면은 도구바, 포트 탭은 아예 없어서
 * 매체 그룹의 첫 품목을 말없이 집었다)을 한 자리로 모은다 — 도면을 보는 동안에도 언제든
 * 바꾸고, **비워 두면 이어지지 않는다**.
 */
export function ConnectOverlay({
  session, groups, readOnly, substationName, onCategory, onKeepGoing, onBack, onCancel,
}: {
  session: ConnectSession;
  groups: readonly CableGroup[];
  /** 다른 국에 다녀오는 중 — 그 국은 읽기 전용이다(고르러 간 것이지 고치러 간 것이 아니다). */
  readOnly: boolean;
  /** 지금 보고 있는 국 이름 — 읽기 전용일 때 그 이름을 적는다. */
  substationName: string | null;
  onCategory: (id: string) => void;
  onKeepGoing: (on: boolean) => void;
  /** 담아 둔 국으로 돌아간다 — 다녀오는 중일 때만 있다. */
  onBack?: () => void;
  onCancel: () => void;
}) {
  /* 종류 목록은 **출발 매체의 것만**. 케이블의 매체는 출발 포트의 매체와 같아야 한다
     (`validation/connection.ts:42`) — 거르는 것이 규칙이 이미 말하는 사실이다. */
  const cats = session.from
    ? (groups.find((g) => g.key === session.from!.medium)?.categories ?? [])
    : [];

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line-strong bg-info-bg px-4">
      <span className="shrink-0 text-sm font-semibold text-primary">케이블 연결</span>

      {session.from ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-xs text-content-muted">출발</span>
          <span className="min-w-0 truncate text-sm text-content">{session.from.label}</span>
        </span>
      ) : (
        <span className="text-sm text-content-muted">출발할 포트를 고르세요</span>
      )}

      {session.from && (
        <div className="w-48 shrink-0">
          <Select
            aria-label="케이블 품목"
            size="sm"
            value={session.categoryId ?? ''}
            onChange={(e) => onCategory(e.currentTarget.value)}
          >
            {/* 비어 있으면 못 잇는다 — 짐작해 채우지 않는다. */}
            <option value="">— 종류를 고르세요 —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      )}

      <span className={cn('min-w-0 truncate text-sm', readOnly ? 'text-warning' : 'text-content-muted')}>
        {readOnly
          ? `${substationName ?? '이 변전소'} 는 읽기 전용 — 이을 포트만 누르세요`
          : session.from
            ? '도착할 설비를 도면에서 누르세요'
            : ''}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* 한 번 켜고 여러 가닥을 잇는다 — 이으면 출발만 비우고 이 자리로 돌아온다. */}
        <Toggle
          checked={session.keepGoing}
          onChange={(next) => onKeepGoing(next)}
          size="sm"
          label="이어서 또 잇기"
        />
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>돌아가기</Button>
        )}
        <Button variant="secondary" size="sm" onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}
