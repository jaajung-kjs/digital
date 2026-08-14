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
import { DateInput, Input } from '../../components/ui';

interface InlineEditCellProps {
  value: string;
  onCommit: (raw: string) => void;
  type?: 'text' | 'number' | 'date';
}

export function InlineEditCell({ value, onCommit, type = 'text' }: InlineEditCellProps) {
  /* 날짜는 로케일이 표기를 정하는 네이티브 칸을 쓰지 않는다 — `DateInput` 참고. */
  if (type === 'date') {
    return (
      <DateInput
        size="cell"
        defaultValue={value}
        className="min-w-0"
        key={value}
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <Input
      type={type}
      size="cell"
      defaultValue={value}
      className="min-w-0"
      key={value}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
