/**
 * InlineEditCell — 표 셀 인라인 편집.
 *
 * **읽는 줄이 기본이고, 고칠 때만 상자가 선다.** 예전에는 모든 칸이 늘 입력 상자였다 —
 * 선번장 한 화면에 상자가 312개(96행 × 3칸) 서서, 조회하러 온 사람에게 편집기부터 들이미는
 * 꼴이었고 값이 상자 테두리에 갇혀 세로로 훑기도 어려웠다. 실수로 바꾸기도 쉬웠다.
 * 포트 탭의 케이블 품목이 이미 같은 어법을 쓴다(누르면 그때 드롭다운이 선다).
 *
 * 커밋 거동은 한 곳에 모은다: 선번장·계통 네 호출부가 blur/Enter 셸을 손으로 복제하고 있었고,
 * 그 셸 자체가 과거 stale 클로저로 값이 씹히는 실제 버그의 원인이었다. 무엇을·어떻게
 * 비교해서 커밋할지(필드별 무변경 가드, trim, null 변환, 숫자 파싱)는 호출부마다 다르므로
 * 여기서 일반화하지 않고 `onCommit` 에 그대로 위임한다.
 */
import { useState } from 'react';
import { DateInput, EMPTY, Input, cn, SELECTABLE, formatDate, isCommitKey } from '../../components/ui';

interface InlineEditCellProps {
  value: string;
  onCommit: (raw: string) => void;
  type?: 'text' | 'number' | 'date';
  /** 읽는 줄에 붙일 이름 — 「무엇을 고치는 칸인지」를 스크린리더가 읽는다. */
  label: string;
}

export function InlineEditCell({ value, onCommit, type = 'text', label }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    /* 빈 칸도 **누를 수 있어야** 한다 — 처음 값을 적는 자리가 바로 여기다. */
    return (
      <button
        type="button"
        aria-label={`${label} 고치기`}
        className={cn(
          'w-full rounded px-1 text-left text-sm',
          type === 'number' ? 'text-right tabular-nums' : '',
          value ? 'text-content' : 'text-content-faint',
          SELECTABLE,
        )}
        onClick={() => setEditing(true)}
        /* 키보드로 훑다가 바로 고치는 길 — Enter 는 버튼이 이미 누름으로 읽는다. */
        onFocus={(e) => { if (e.relatedTarget) e.currentTarget.dataset.touched = '1'; }}
      >
        {value ? (type === 'date' ? formatDate(value) : value) : EMPTY}
      </button>
    );
  }

  const common = {
    size: 'cell' as const,
    autoFocus: true,
    'aria-label': label,
    defaultValue: value,
    className: 'min-w-0',
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      onCommit(e.currentTarget.value);
      setEditing(false);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isCommitKey(e)) e.currentTarget.blur();
      /* Esc 는 **물린다** — 커밋하지 않고 원래 값으로 돌아간다(앱 공통 규칙). */
      if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
    },
  };

  /* 날짜는 로케일이 표기를 정하는 네이티브 칸을 쓰지 않는다 — `DateInput` 참고. */
  return type === 'date' ? <DateInput {...common} /> : <Input type={type} numeric={type === 'number'} {...common} />;
}
