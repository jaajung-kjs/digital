import type { ValueDef } from '@twin/core';
import { EMPTY } from '../../components/ui';
import { InlineEditCell } from './InlineEditCell';
import { useV2WorkingCopy } from '../store/workingCopyStore';

export interface CableValueFieldProps {
  /** 값을 담는 자리 — 없으면 적을 곳이 없다(대시). */
  cableId: string | null;
  /** 어떤 값을 적는 칸인지 — 키·자료형·단위·목록이 여기서 나온다. 화면이 키를 알지 않는다. */
  field: ValueDef;
  /** 화면에 뜬 값. **무변경 판정에는 쓰지 않는다**(아래 주석). */
  value: unknown;
  /** 모선이 이미 말한 값인가 — 그러면 흐리게(대장의 ditto). */
  muted?: boolean;
}

/**
 * 케이블 하나에 적는 값 한 칸 — 길이 · 굵기 · 선로명 · 접속개소.
 *
 * **같은 글이 세 곳에 복사돼 있었다**: 선번장(`MetaInput`) · 계통(`CableFieldInput`) ·
 * 포트 상세(`CableValueControl`). 셋 다 같은 일을 했다 — 숫자면 `Number()`, 빈 값은 `null`,
 * `NaN` 이면 무시, 무변경이면 무시, 그리고 `stageCableUpdate({ specParams })`. 같은 케이블의
 * 같은 칸인데 검증이 세 벌이라 한 곳만 고쳐지기 딱 좋았고, 이 저장소는 그 사고를 이미
 * 겪었다(`cableActions.ts` 머리 주석).
 *
 * 스토어를 **여기서 부른다.** 다듬는 규칙만 떼고 쌓는 일을 부르는 쪽에 두면 같은 다섯 줄이
 * 다시 세 벌이 되고(그래서 `components/ui` 가 아니라 여기 산다), 무엇보다 무변경 판정이
 * 케이블을 읽어야 옳다 — 아래를 본다.
 */
export function CableValueField({ cableId, field, value, muted }: CableValueFieldProps) {
  /* 케이블이 없으면 적을 곳도 없다 — 다만 대시는 **그 열의 줄맞춤을 따라야** 한다(칸이
     정한다). 인라인 span 이면 편집기가 선 줄과 대시만 선 줄에서 대시 위치가 어긋난다. */
  if (!cableId) return <span className="block px-1 text-sm text-content-faint">{EMPTY}</span>;

  const id = cableId;
  const isNumber = field.type === 'number';
  return (
    <InlineEditCell
      value={value === null || value === undefined ? '' : String(value)}
      label={field.label}
      unit={field.unit}
      /* 고를 수 있는 값이 선언돼 있으면 목록으로 — 화면이 그 목록을 알지 않는다. */
      options={field.options}
      muted={muted}
      /* 칸의 자료형 그대로 — 예전에는 수가 아니면 전부 날짜였다(선로명 칸에 `YYYY-MM-DD`). */
      type={isNumber ? 'number' : field.type === 'date' ? 'date' : 'text'}
      onCommit={(raw) => {
        /* 케이블은 **커밋하는 순간** 읽는다 — 렌더 때 닫아 두면 옆 칸을 고친 뒤의 값을 못
           보고, 그 오래된 `specParams` 로 덮어써 옆 칸이 되돌아간다(실제 버그였다). */
        const wc = useV2WorkingCopy.getState();
        const cable = wc.effectiveCables().find((c) => c.id === id);
        if (!cable) return;
        const params = cable.specParams ?? {};

        // 숫자 칸만 수로 바꿔 담는다 — 나머지(글자·날짜)는 적힌 그대로다.
        const next = isNumber ? (raw.trim() === '' ? null : Number(raw)) : (raw.trim() || null);
        /* 수가 아니면 아무 일도 하지 않는다 — 삼키는 것이 NaN 을 쌓는 것보다 낫다. */
        if (isNumber && typeof next === 'number' && Number.isNaN(next)) return;
        /**
         * 무변경 판정은 **케이블 제 값**과 비교한다 — 화면에 뜬 `value` 가 아니다.
         *
         * 계통의 회로 줄은 모선이 말한 값을 흐리게 물려 보여 준다(ditto). 그 줄에 같은 수를
         * 손으로 적는 일은 「이 회로의 값으로 못 박는다」는 뜻이라 쌓여야 하는데, 뜬 값과
         * 비교하면 삼켜진다 — 포트 상세의 한 벌이 그렇게 적혀 있었다.
         */
        if ((params[field.key] ?? null) === next) return;

        wc.stageCableUpdate(id, { specParams: { ...params, [field.key]: next } });
      }}
    />
  );
}
