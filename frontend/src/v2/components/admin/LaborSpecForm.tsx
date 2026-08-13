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
import { LABOR_CODE_LABEL, LABOR_WAGE_LABEL, MAN_DAY_FIELD, WORK_KINDS, manDayUnit, unitPriceUnit } from '@twin/core';
import type { LaborCarrier, LaborSpec } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailRow, Input } from '../../../components/ui';
import { useWageCatalog } from '../../hooks';
import { LaborTypeSelect } from './LaborTypeSelect';

/** 비우면 null(「안 적었다」), 0 은 「품이 안 든다」. 둘을 뭉개지 않는다. */
const toNumber = (raw: string, int = false): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  const v = int ? parseInt(t, 10) : parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

const show = (v: number | null) => (v == null ? '' : String(v));

/**
 * 고치는 도중의 글자를 그대로 들고 있는다.
 *
 * 숫자로만 들고 있으면 `0.` 을 치는 순간 `0` 으로 되돌아가 소수를 입력할 수 없다(품셈은
 * 0.06 같은 값이다). 이 사정을 세 화면이 각자 해결하면 한 곳만 고쳐지므로 여기서 한 번 푼다.
 */
function useNumericFields(spec: LaborSpec, resetKey: string) {
  const [text, setText] = useState<Record<string, string>>({});
  useEffect(() => setText({}), [resetKey]);
  return {
    valueOf: (field: keyof LaborSpec) => text[field] ?? show(spec[field] as number | null),
    onType: (field: keyof LaborSpec, raw: string) => setText((prev) => ({ ...prev, [field]: raw })),
  };
}

/** 값 오른쪽에 붙는 단위 — 라벨 자리(w-16)가 좁아 「자재단가(원/m)」은 두 줄로 접힌다. */
const Unit = ({ children }: { children: string }) => (
  <span className="shrink-0 text-xs text-content-faint">{children}</span>
);

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

      {/* **고칠 수 없는 칸** — 노임단가는 기준자료(임포트)가 정한다. 옛 회차 값일 때만 그
          사정을 덧붙인다(보고서 문장 그대로). */}
      <DetailRow
        label={LABOR_WAGE_LABEL}
        hint={staleDate ? `${staleDate} 기준 · ${wage.noteOf(spec.laborCode) ?? ''}` : undefined}
      >
        <span className="text-sm text-content tabular-nums">
          {spec.laborCode == null ? '—' : wageValue == null ? '단가 없음' : `${wageValue.toLocaleString()}원/일`}
        </span>
      </DetailRow>

      <DetailRow label="자재단가" issue={issueFor?.('labor.unitPrice')}>
        <span className="flex items-center gap-1.5">
          <Input
            aria-label="자재단가"
            type="number"
            value={num.valueOf('unitPrice')}
            onChange={(e) => {
              num.onType('unitPrice', e.currentTarget.value);
              onChange({ unitPrice: toNumber(e.currentTarget.value, true) });
            }}
          />
          <Unit>{unitPriceUnit(carrier)}</Unit>
        </span>
      </DetailRow>

      {/* 한 줄에 한 칸씩 — 위의 세 줄과 같은 규칙이다. 예전에는 두 단으로 흘려서
          「2개 + 1개」로 접혔고, 그래서 카드 안에서만 규칙이 달라 보였다. */}
      {WORK_KINDS.map((w) => {
        const field = MAN_DAY_FIELD[w.key];
        return (
          <DetailRow key={w.key} label={w.label} issue={issueFor?.(`labor.${field}`)}>
            <span className="flex items-center gap-1.5">
              <Input
                aria-label={`${w.label} 공량`}
                type="number"
                value={num.valueOf(field)}
                onChange={(e) => {
                  num.onType(field, e.currentTarget.value);
                  onChange({ [field]: toNumber(e.currentTarget.value) } as Partial<LaborSpec>);
                }}
              />
              <Unit>{manDayUnit(carrier)}</Unit>
            </span>
          </DetailRow>
        );
      })}

    </DetailCard>
  );
}
