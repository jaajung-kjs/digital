import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from './cn';
import { Badge, type BadgeStatus } from './Badge';
import { IconButton } from './IconButton';

/**
 * 사이드패널 "선택 상세 카드" 표준 — 업무화면의 상세는 **표**다(1px 테두리 · 회색 머리 띠 ·
 * 라벨칸+값칸). 차단기·슬롯·랙 정보 등 "무언가를 클릭하면 아래에 뜨는 상세 카드"는 모두
 * 이 컴포넌트를 쓴다.
 *
 * 타이포 스케일(고정): 본문=text-sm, 라벨/메타/배지=text-xs. text-xs 미만 금지.
 * → src/components/ui/CONVENTIONS.md 참고.
 */
/**
 * 업무화면의 상세는 **카드가 아니라 표**다 — 둥근 모서리와 그림자 대신 1px 테두리와 칸
 * 구분선. 여백은 카드가 아니라 **줄**이 갖는다(라벨칸·값칸이 각자 쓴다).
 *
 * **그런데 줄이 아닌 것이 들어오면?** 사진 격자·안내 문구·빈 상태처럼 표의 줄이 아닌
 * 내용이 흔하다. 한때 카드가 `p-3` 를 갖고 있다가 줄이 제 여백을 갖게 되면서 그것을
 * 걷었는데, 그러자 **줄 아닌 내용은 아무도 여백을 책임지지 않았다** — 사진 탭의 「등록된
 * 사진이 없습니다」와 기준정보의 안내 문구가 테두리에 딱 붙었다.
 *
 * 호출부마다 감싸는 상자를 하나씩 두는 것은 답이 아니다. 새 카드를 만들 때마다 기억해야
 * 하고, 한 번 잊으면 그 화면만 붙는다. **카드가 스스로 가려낸다**: 제 여백을 갖는 것
 * (`data-detail-row`·`data-detail-head`)은 그대로 두고, 나머지에는 여백을 준다.
 */
export function DetailCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border border-line-strong bg-surface text-sm',
        /* 마지막 줄의 아래 선은 상자 테두리와 겹치므로 지운다. */
        '[&>*:last-child]:border-b-0',
        /* 줄도 머리도 아닌 것 — 여백은 카드가 준다. */
        '[&>*:not([data-detail-row]):not([data-detail-head])]:px-2.5',
        '[&>*:not([data-detail-row]):not([data-detail-head])]:py-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 카드 헤더 — 제목(좌) + 상태 배지 + 우측 액션.
 *
 * 카드 안 섹션 제목은 전부 이것을 쓴다. 예전에는 절반이 `<p className="text-xs font-semibold
 * text-content-muted">속성</p>` 처럼 직접 쓰여 있어서, 같은 패널 안에서도 어떤 섹션 제목은
 * 12px 회색이고 어떤 것은 14px 검정이었다 — 제목 크기가 제각각으로 보이던 주된 이유다.
 *
 * 우측 액션: 수정/삭제는 `onEdit`/`onDelete`, 그 밖의 버튼(업로드·추가 등)은 `actions`.
 */
export function DetailCardHeader({
  title,
  badge,
  badgeStatus = 'neutral',
  actions,
  onEdit,
  onDelete,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  badgeStatus?: BadgeStatus;
  /** 우측 임의 액션(업로드·추가 등). onEdit/onDelete 와 함께 쓸 수 있다. */
  actions?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  return (
    /* 상세의 머리는 **회색 띠**다 — 표 머리와 같은 면(`surface-2`)을 써서 「여기부터 이
       묶음」이 한눈에 잡힌다. 예전에는 흰 바탕에 굵은 글자뿐이라 줄들과 섞였다. */
    <div
      data-detail-head
      className={cn(
        'flex min-h-[28px] items-center gap-2 border-b border-line-strong bg-surface-2 px-2.5',
        className,
      )}
    >
      <span className="text-xs font-bold text-content-muted">{title}</span>
      {badge != null && <Badge status={badgeStatus}>{badge}</Badge>}
      {(actions || onEdit || onDelete) && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {actions}
          {onEdit && (
            <IconButton aria-label="수정" title="수정" size="sm" className="hover:text-primary" onClick={onEdit}>
              <Pencil size={14} />
            </IconButton>
          )}
          {onDelete && (
            <IconButton aria-label="삭제" title="삭제" size="sm" className="hover:text-danger" onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 라벨-값 한 줄 — 라벨(좌, 고정폭 text-xs) + 값(우, text-sm). 값에는 텍스트뿐 아니라
 * `Input`/`Select` 같은 편집 노드도 그대로 넣는다 — 표시 행과 편집 행을 겸한다.
 *
 * 라벨 폭을 여기서만 정하는 이유: 명세 편집기들이 이 구조를 각자 손으로 다시 만들면서
 * w-12·w-14·w-16 세 갈래로 갈렸고, 화면을 옮길 때마다 입력 열이 다른 자리에서 시작했다.
 * 폭은 가장 긴 라벨("이름 패턴", "수용 대상")이 한 줄에 들어가는 w-16 으로 맞춘다.
 */
/**
 * 검증 문구를 **지금 다 보여 줄 것인가** — 저장을 눌렀을 때 폼 전체가 켠다.
 *
 * 평소에는 각 줄이 「손대 본 칸」만 붉게 말한다(아래 `touched`). 하지만 저장을 눌러
 * 막혔다면 어느 칸이 막고 있는지 전부 짚어 줘야 한다 — 「입력 오류 3건」만 뜨고 어느
 * 칸인지 안 짚는 화면이 실제로 그랬다.
 */
export const IssueReveal = createContext(false);

export function DetailRow({
  label,
  issue,
  hint,
  required = false,
  align = 'center',
  wide = false,
  children,
}: {
  label: ReactNode;
  /** 검증 실패 문구 — 값 바로 아래에 붉게. */
  issue?: string | null;
  /**
   * 비우면 저장이 안 되는 칸 — 라벨에 `*`, 컨트롤에 `aria-required`.
   *
   * 표시가 없으면 무엇이 필수인지 **눌러 보기 전에는 알 수 없다**. 저장 단추가 회색인데
   * 왜인지 알 방법이 없는 막다른 길이 거기서 나온다.
   */
  required?: boolean;
  /** 보조 설명 — 지금 값이 무엇을 뜻하는지(예: "자유형"). */
  hint?: ReactNode;
  /** 세로로 긴 값(체크박스 묶음 등)이면 라벨을 첫 줄에 맞춘다. */
  align?: 'center' | 'start';
  /** 값이 폭을 다 써야 할 때(판·격자처럼 넓을수록 나은 것). 글 입력에는 쓰지 않는다. */
  wide?: boolean;
  children: ReactNode;
}) {
  /* 라벨을 입력과 실제로 연결한다.
     예전에는 그냥 <span> 이라, 화면에는 "이름" 이라고 쓰여 있어도 스크린리더는 그냥
     "편집창" 이라고만 읽었고, 라벨을 눌러도 입력에 포커스가 가지 않았다.
     자식이 하나짜리 컨트롤이면 id 를 붙여 htmlFor 로 잇고, 여러 개(체크박스 묶음 등)면
     연결할 대상이 모호하므로 예전처럼 단순 텍스트로 둔다. */
  /**
   * 아직 손대지 않은 칸을 **실수라고 부르지 않는다**.
   *
   * 예전에는 매 렌더마다 검증해 그대로 붉게 칠했다 — 새 종류를 만들면 이름 칸에 손도
   * 대기 전에 「이름은 필수입니다」가 이미 떠 있었다. 오류색이 상시 켜져 있으면 진짜
   * 오류를 알리는 힘을 잃는다. 칸을 떠난 뒤부터(또는 저장을 눌러 막힌 뒤부터) 말한다.
   */
  const [touched, setTouched] = useState(false);
  const revealAll = useContext(IssueReveal);
  const showIssue = issue != null && issue !== '' && (touched || revealAll);

  const generatedId = useId();
  // Children.count 는 텍스트 노드도 1 로 세므로, 배열로 펼쳐 **엘리먼트 하나**인지 본다.
  const items = Children.toArray(children);
  const only = items.length === 1 ? items[0] : null;
  const linkable = isValidElement<{ id?: string }>(only) && only.props.id === undefined;
  const controlId = linkable ? generatedId : undefined;
  const body = linkable
    ? cloneElement(only as ReactElement<{ id?: string; 'aria-required'?: boolean }>, {
        id: controlId,
        ...(required ? { 'aria-required': true } : {}),
      })
    : children;

  return (
    /* **라벨칸 + 값칸.** 공공·공기업 업무화면의 폼은 표다: 왼쪽 회색 칸에 라벨, 오른쪽 흰
       칸에 값. 라벨이 어디서 시작하고 값이 어디서 시작하는지가 화면마다 같아진다.
       예전에는 라벨이 그냥 회색 글자라, 값이 길면 어디까지가 라벨인지 흐렸다. */
    <div
      data-detail-row
      className={cn('flex border-b border-line', align === 'start' ? 'items-stretch' : 'items-stretch')}
      /* 칸을 떠나면 그때부터 말한다 — 안쪽 어느 컨트롤이든 한 번 떠나면 켜진다. */
      onBlur={() => setTouched(true)}
    >
      <label
        htmlFor={controlId}
        className={cn(
          'flex w-[88px] shrink-0 items-center border-r border-line bg-surface-2 px-2.5 py-1 text-xs font-bold text-content-muted',
          align === 'start' && 'items-start',
        )}
      >
        {label}
        {/* 필수 표시는 라벨 쪽에 — 값 칸에 두면 값이 길 때 밀려 안 보인다. */}
        {/* 필수 별표는 **한전 CI 레드**다 — 경고(`danger`)와 쓰임이 다르다. 경고는 「지금
            잘못됐다」이고, 별표는 「비우면 저장이 안 된다」는 안내다. */}
        {required && (
          <span className="ml-0.5 text-required" aria-hidden>
            *
          </span>
        )}
      </label>
      {/* 값의 폭을 묶는다(22rem) — 상세 패널(384px)에서는 어차피 이보다 좁으므로 그대로이고,
          넓은 화면의 관리 화면에서만 걸린다. 이름 한 칸이 1000px 로 벌어지면 라벨과 값이
          멀어져 어느 라벨의 값인지 눈으로 좇아야 하고, 폼이 화면 폭에 따라 달라 보인다.
          두 화면이 같은 치수로 서야 같은 폼으로 읽힌다. */}
      {/* 값칸의 세로 여백은 **읽는 줄 기준**(22px)이다 — 고치는 줄은 안에 든 컨트롤이
          제 높이(24/28px)로 밀어 올린다. 둘을 같은 값으로 묶으면 읽는 표가 공연히 성기다. */}
      <div className={cn('flex min-w-0 flex-col justify-center gap-0.5 px-2.5 py-0.5 text-content', wide ? 'flex-1' : 'w-full max-w-[24rem]')}>
        {body}
        {showIssue && <span className="text-xs text-danger">{issue}</span>}
        {hint && <span className="text-xs text-content-faint">{hint}</span>}
      </div>
    </div>
  );
}

/**
 * 카드 안에서 짧은 칸 여럿을 **두 단으로** 흘린다 — 신설·철거·이설처럼 나란히 읽는 값.
 *
 * 한 줄에 하나씩 쌓으면 카드가 세로로만 길어지고, 옆에 남는 자리는 그대로 빈다.
 * 좁아지면 저절로 한 단으로 돌아온다.
 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

