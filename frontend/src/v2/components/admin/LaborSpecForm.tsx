/**
 * 공량·단가 카드 — **자산 종류·설비 종류·케이블 종류가 같은 것을 쓴다**.
 *
 * 예전에는 세 화면이 각자 폼을 갖고 있었다. 그래서 케이블에만 이설이 없고, 설비에만
 * 자재단가가 없고, 라벨도 제각각이었다. 칸을 늘리거나 줄이려면 세 곳을 손으로 맞춰야 했으니
 * 하나만 고쳐지는 것이 시간 문제였다.
 *
 * 칸은 `WORK_KINDS` 가, 단위는 `LABOR_CARRIERS` 가 정한다(`@twin/core` 의 `laborSpec`).
 *
 * **고르는 칸 · 적는 칸 · 따라오는 칸**이 눈으로 갈린다: 노무유형은 고르고, 단가·품은 적고,
 * 노임단가는 기준자료가 정해 글자로만 선다.
 */
import { useEffect, useState } from 'react';
import { LABOR_CODE_LABEL, LABOR_WAGE_LABEL, laborSpecColumns } from '@twin/core';
import type { LaborCarrier, LaborSpec } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailRow, Input, EMPTY } from '../../../components/ui';
import { useWageCatalog } from '../../hooks';
import { LaborTypeSelect } from './LaborTypeSelect';

/** 비우면 null(「안 적었다」), 0 은 「품이 안 든다」. 둘을 뭉개지 않는다. */
const toNumber = (raw: string, int = false): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  const v = int ? parseInt(t, 10) : parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

/** 아직 수가 아닌 것까지 통과시킨다 — `0.` 은 `0.06` 으로 가는 길목이다. 빈칸은 지우는 길. */
const NUMBER_ISH = /^\d*\.?\d*$/;

/**
 * 손대지 않은 값은 **읽기 좋게**, 고치는 중에는 **적은 그대로**.
 *
 * `1700000` 은 자릿수를 세어야 얼마인지 알 수 있어 `1,700,000` 으로 적는다. 다만 고치는
 * 중에까지 구분점을 끼워 넣으면 커서가 튀므로, 손이 얹힌 칸만 날것으로 되돌린다
 * (Carbon `NumberInput`·Stripe 가 같은 방식이다).
 *
 * 글자를 그대로 들고 있어야 하는 이유는 따로 있다: 숫자로만 들고 있으면 `0.` 을 치는 순간
 * `0` 으로 되돌아가 소수를 입력할 수 없다(품셈은 0.06 같은 값이다). 한 번에 한 칸만
 * 고치므로 들고 있을 것도 하나다.
 */
function useNumericFields(spec: LaborSpec, resetKey: string) {
  const [editing, setEditing] = useState<{ field: keyof LaborSpec; text: string } | null>(null);
  /* 고르는 대상이 바뀌면 고치던 글자는 버린다 — 저 줄의 글자가 이 줄에 남으면 안 된다. */
  useEffect(() => setEditing(null), [resetKey]);

  const raw = (field: keyof LaborSpec) => {
    const v = spec[field] as number | null;
    return v == null ? '' : String(v);
  };

  return {
    valueOf: (field: keyof LaborSpec) => {
      if (editing?.field === field) return editing.text;
      const v = spec[field] as number | null;
      /* 소수 자릿수를 임의로 깎지 않는다 — 기본값(3)은 적어 둔 값을 화면에서 반올림한다. */
      return v == null ? '' : v.toLocaleString(undefined, { maximumFractionDigits: 20 });
    },
    /** 손이 얹히면 날것으로 — 구분점이 든 글자를 고치게 두면 지우다 말고 수가 깨진다. */
    onFocus: (field: keyof LaborSpec) => setEditing({ field, text: raw(field) }),
    onBlur: () => setEditing(null),
    /** 수가 될 수 없는 글자는 아예 받지 않는다(`type="number"` 가 해 주던 일). */
    accept: (field: keyof LaborSpec, next: string) => {
      if (!NUMBER_ISH.test(next)) return false;
      setEditing({ field, text: next });
      return true;
    },
  };
}

export function LaborSpecForm({
  carrier,
  spec,
  onChange,
  issueFor,
  hint,
  resetKey,
}: {
  carrier: LaborCarrier;
  spec: LaborSpec;
  onChange: (patch: Partial<LaborSpec>) => void;
  /** 고르는 대상이 바뀌면 입력 중이던 글자를 버린다 — 종류 id·행 key 를 준다. */
  resetKey: string;
  /** 검증 문구를 찾아 주는 함수 — 화면마다 이슈 목록의 모양이 달라서 조회만 받는다. */
  issueFor?: (path: string) => string | null;
  /** 카드 머리 아래 한 줄 — 설비의 「1식」처럼 담체마다 다른 사정. */
  hint?: string;
}) {
  const num = useNumericFields(spec, resetKey);
  /** 적는 칸들 — 이름·단위·빈칸의 뜻까지 선언이 준다(`@twin/core` 의 `laborSpec`). */
  const columns = laborSpecColumns(carrier);
  const wage = useWageCatalog();
  const wageValue = wage.wageOf(spec.laborCode);
  const staleDate = wage.staleDateOf(spec.laborCode);

  return (
    <DetailCard>
      <DetailCardHeader title="공량" />
      {hint && <p className="text-xs text-content-faint">{hint}</p>}

      <DetailRow label={LABOR_CODE_LABEL}>
        <LaborTypeSelect value={spec.laborCode} onChange={(laborCode) => onChange({ laborCode })} />
      </DetailRow>

      {/* 코드는 **저장되는 값**, 노임단가는 기준자료가 정하는 **조회 값** — 다른 데이터라 줄을 나눈다. */}
      <DetailRow label="코드">
        <span className="text-sm text-content tabular-nums">{spec.laborCode ?? EMPTY}</span>
      </DetailRow>

      <DetailRow
        label={LABOR_WAGE_LABEL}
        hint={staleDate ? `${staleDate} 기준 · ${wage.noteOf(spec.laborCode) ?? ''}` : undefined}
      >
        <span className="text-sm text-content tabular-nums">
          {spec.laborCode == null ? EMPTY : wageValue == null ? '단가 없음' : `${wageValue.toLocaleString()}원/일`}
        </span>
      </DetailRow>

      {/* 칸도 단위도 **선언이 정한다**(`laborSpecColumns`) — 폼과 표가 각자 칸을 적으면
          반드시 어긋난다(실제로 케이블 표에만 자재단가가 빠져 있었다).
          한 줄에 한 칸씩 — 위의 세 줄과 같은 규칙이다. 예전에는 두 단으로 흘려서
          「2개 + 1개」로 접혔고, 그래서 카드 안에서만 규칙이 달라 보였다. */}
      {columns.map((c) => (
        <DetailRow key={c.field} label={c.label} issue={issueFor?.(`labor.${c.field}`)}>
          <Input
            /* 자재단가는 라벨이 곧 이름이고, 품은 「신설」만으로는 무엇의 신설인지 모른다. */
            aria-label={c.kind === 'price' ? c.label : `${c.label} 공량`}
            numeric
            suffix={c.unit}
            /* **빈 칸이 제 뜻을 말한다** — 비움(null)과 `0` 은 뜻이 정반대인데 화면에서는
               둘 다 「거의 빈 상자」였다. 무엇을 뜻하는지는 담체가 선언한다(`emptyMeaning`). */
            placeholder={c.empty}
            value={num.valueOf(c.field)}
            onFocus={() => num.onFocus(c.field)}
            onBlur={() => num.onBlur()}
            onChange={(e) => {
              const next = e.currentTarget.value;
              if (!num.accept(c.field, next)) return;
              /* 단가는 원 단위 정수, 품은 소수 — 어느 쪽인지도 선언이 말한다. */
              onChange({ [c.field]: toNumber(next, c.kind === 'price') } as Partial<LaborSpec>);
            }}
          />
        </DetailRow>
      ))}

    </DetailCard>
  );
}
