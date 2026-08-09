/**
 * InlineEditCell — 표 셀 인라인 편집 (blur/Enter 커밋)
 *
 * 선번장(FiberRegisterView)·계통(PowerRegisterView) 4개 호출부가 blur/Enter
 * 커밋 셸을 손으로 복제하고 있었다: `key={value}` 리마운트-리셋(외부 변경 시
 * uncontrolled 입력 리셋) + onBlur에서 `e.currentTarget.value` 동기 캡처 +
 * Enter → blur. 이 셸 자체가 과거 stale 클로저로 값이 씹히는 실제 버그의
 * 원인이었으므로(무변경 가드 자체는 필드마다 의미가 달라 호출부에 남긴다),
 * 셸만 한 곳으로 모은다 — JSX 형태가 아니라 이 거동을 단일화하는 것이 목적.
 *
 * 무엇을·어떻게 비교/파싱해서 커밋할지(필드별 무변경 가드, trim, null 변환,
 * 숫자 파싱)는 호출부마다 다르므로 여기서 일반화하지 않고 `onCommit`에 그대로 위임한다.
 */
import { Input } from '../../components/ui';

interface InlineEditCellProps {
  value: string;
  onCommit: (raw: string) => void;
  type?: 'text' | 'number' | 'date';
}

// 호출부가 공유하던 표 셀 전용 밀도(bg-transparent/px-1/py-0.5) —
// Input 기본(bg-surface/px-3/py-2)과 충돌하므로 !중요도로 강제.
const cellInputClass = 'min-w-0 !bg-transparent !px-1 !py-0.5 text-sm';

export function InlineEditCell({ value, onCommit, type = 'text' }: InlineEditCellProps) {
  return (
    <Input
      type={type}
      defaultValue={value}
      className={cellInputClass}
      key={value}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
