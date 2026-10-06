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
import { DateInput, EMPTY, Input, Select, cn, SELECTABLE, formatDate, isCommitKey } from '../../components/ui';

interface InlineEditCellProps {
  value: string;
  onCommit: (raw: string) => void;
  type?: 'text' | 'number' | 'date';
  /** 읽는 줄에 붙일 이름 — 「무엇을 고치는 칸인지」를 스크린리더가 읽는다. */
  label: string;
  /**
   * 값 뒤에 붙는 단위 — **읽을 때만** 붙는다(`-13 dB`). 고칠 때 상자에는 수만 남는다.
   *
   * 머리글에 `1310 손실(dB)` 처럼 달면 이름이 그만큼 길어져 잘리고(잘린 머리글은 그 열
   * 전체의 뜻을 잃는다), 무엇보다 단위는 **값의 성질**이지 열 이름의 일부가 아니다.
   */
  unit?: string;
  /**
   * 고를 수 있는 값 — 있으면 **목록**이 선다(`ValueDef.options`).
   *
   * 현장 값이 사실상 정해진 칸(전압·차단기 용량·전선 굵기)에서 손으로 치게 두면 같은 값이
   * 「AC220V」·「AC 220V」·「220v」로 갈려 세지도 거르지도 못한다.
   *
   * **닫아 걸지는 않는다** — 목록에 없는 값이 실제로 나온다(대장에 110V 회로가 하나 있다).
   * 목록 끝의 「직접 입력」이 그때의 문이고, 지금 값이 목록에 없으면 그 값도 목록에 실어
   * 보여 준다(적힌 사실을 화면에서 지우지 않는다).
   */
  options?: readonly (string | number)[];
  /**
   * **위에서 이미 말한 값**인가 — 그러면 흐리게 읽힌다(대장의 ditto).
   *
   * 스무 회로짜리 피더에서 전압·상선식은 대개 모선과 같아, 같은 값이 스무 번 선다. 지우면
   * 고칠 수가 없고(값이 아니라 화면이 사라진다), 그대로 두면 다른 회로 하나가 그 스물 속에
   * 묻힌다. 흐리게 두면 **다른 것만 눈에 걸린다** — 조서가 ditto 로 하던 일이다.
   */
  muted?: boolean;
  /**
   * **닫힌 어휘**(갈래 교류/직류, 개폐 투입/개방) — 값과 보이는 말이 다르다.
   *
   * `options` 와 달리 「직접 입력」이 없다: 서버가 그 값 말고는 받지 않으므로 손으로 친 값은
   * 저장에서 통째로 거절된다. 칸에는 **말(label)** 이 보이고, 넘기는 것은 **값(value)** 이다 —
   * 「교류」를 실어 보내면 서버가 400 을 돌려준다(실제로 그랬다).
   */
  choices?: readonly { value: string; label: string }[];
  /** 읽는 줄에서만 값을 꾸민다(천 단위 구분 등) — 고치는 칸에는 원래 값이 선다. */
  format?: (value: string) => string;
}

/** 읽는 줄 버튼의 모양 — 칸 종류가 달라도(노무유형 등) 평소 모습은 이 하나를 쓴다. */
export const readCellClass = (filled: boolean, muted?: boolean) =>
  cn('w-full rounded px-1 text-sm [text-align:inherit]', muted && 'text-content-faint', filled ? 'text-content' : 'text-content-faint', SELECTABLE);

/** 목록 끝의 「직접 입력」 — 이 값은 저장되지 않고 칸을 자유 입력으로 바꾼다. */
const FREE_INPUT = '\u0000free';

export function InlineEditCell({ value, onCommit, type = 'text', label, unit, options, muted, choices, format }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  /** 목록을 두고도 손으로 치는 중인가 — 「직접 입력」을 고른 뒤. */
  const [freeform, setFreeform] = useState(false);

  if (!editing) {
    /* 빈 칸도 **누를 수 있어야** 한다 — 처음 값을 적는 자리가 바로 여기다. */
    return (
      <button
        type="button"
        aria-label={`${label} 고치기`}
        /* 줄맞춤은 **열이 정한다**(`Td align`) — 여기서 정하면 값이 있는 줄과 대시만 있는
           줄이 한 열에서 서로 다른 자리에 선다. 물려받기만 한다. */
        className={readCellClass(!!value, muted)}
        onClick={() => setEditing(true)}
        /* 키보드로 훑다가 바로 고치는 길 — Enter 는 버튼이 이미 누름으로 읽는다. */
        onFocus={(e) => { if (e.relatedTarget) e.currentTarget.dataset.touched = '1'; }}
      >
        {value ? (
          <>
            {choices ? (choices.find((c) => c.value === value)?.label ?? value) : type === 'date' ? formatDate(value) : format ? format(value) : value}
            {unit && <span className="ml-0.5 text-content-faint">{unit}</span>}
          </>
        ) : (
          EMPTY
        )}
      </button>
    );
  }

  /* 닫힌 어휘 — 말을 보이고 값을 넘긴다. 적힌 값이 어휘 밖이어도 지우지 않고 보여 준다. */
  if (choices) {
    const items = value && !choices.some((c) => c.value === value) ? [{ value, label: value }, ...choices] : choices;
    return (
      <Select
        aria-label={label}
        size="cell"
        autoFocus
        defaultValue={value}
        onChange={(e) => { onCommit(e.currentTarget.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
      >
        <option value="">{EMPTY}</option>
        {items.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    );
  }

  /* 목록이 있으면 목록으로 — 「직접 입력」을 고르면 그때 상자로 바뀐다. */
  if (options && !freeform) {
    const known = options.map(String);
    /* 적힌 값이 목록에 없어도 **보여 준다** — 화면이 사실을 지우면 안 된다. */
    const items = value && !known.includes(value) ? [value, ...known] : known;
    return (
      <Select
        aria-label={label}
        size="cell"
        autoFocus
        defaultValue={value}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next === FREE_INPUT) { setFreeform(true); return; }
          onCommit(next);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
      >
        <option value="">{EMPTY}</option>
        {items.map((o) => (
          <option key={o} value={o}>
            {o}
            {unit ?? ''}
          </option>
        ))}
        <option value={FREE_INPUT}>직접 입력…</option>
      </Select>
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
      setFreeform(false);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isCommitKey(e)) e.currentTarget.blur();
      /* Esc 는 **물린다** — 커밋하지 않고 원래 값으로 돌아간다(앱 공통 규칙). */
      if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setFreeform(false); }
    },
  };

  /* 날짜는 로케일이 표기를 정하는 네이티브 칸을 쓰지 않는다 — `DateInput` 참고. */
  return type === 'date' ? <DateInput {...common} /> : <Input type={type} numeric={type === 'number'} {...common} />;
}
