/**
 * 공량·단가 카드 — **자산 종류·설비 종류·케이블 종류가 같은 것을 쓴다**.
 *
 * 예전에는 세 화면이 각자 폼을 갖고 있었다. 그래서 케이블에만 이설이 없고, 설비에만
 * 자재단가가 없고, 라벨도 제각각이었다(신설(h) / 신설(h/m) / 신설(인)). 칸을 늘리거나
 * 줄이려면 세 곳을 손으로 맞춰야 했으니 하나만 고쳐지는 것이 시간 문제였다.
 *
 * 이제 칸은 `WORK_KINDS` 가, 단위는 `LABOR_CARRIERS` 가 정한다(`@twin/core` 의 `laborSpec`).
 * 여기서 필드 이름을 다시 적지 않는다 — 어휘가 늘면 세 화면이 함께 따라온다.
 */
import { useEffect, useState } from 'react';
import { LABOR_CARRIERS, MAN_DAY_FIELD, WORK_KINDS, laborFieldLabel, unitPriceLabel } from '@twin/core';
import type { LaborCarrier, LaborSpec } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailGrid, DetailRow, Input } from '../../../components/ui';
import { LaborTypeSelect } from './LaborTypeSelect';

/** 숫자 칸 — 비우면 null(「안 적었다」), 0 은 「품이 안 든다」. 둘을 뭉개지 않는다. */
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
  const unit = LABOR_CARRIERS[carrier].unit;
  const num = useNumericFields(spec, resetKey);
  return (
    <DetailCard>
      <DetailCardHeader title="공량" />
      {hint && <p className="text-xs text-content-faint">{hint}</p>}

      <DetailRow label="노무유형">
        <LaborTypeSelect value={spec.laborCode} onChange={(laborCode) => onChange({ laborCode })} />
      </DetailRow>

      <DetailRow label={unitPriceLabel(carrier)} issue={issueFor?.('labor.unitPrice')}>
        <Input
          aria-label={unitPriceLabel(carrier)}
          type="number"
          value={num.valueOf('unitPrice')}
          placeholder="비우면 재료비 0"
          onChange={(e) => {
            num.onType('unitPrice', e.currentTarget.value);
            onChange({ unitPrice: toNumber(e.currentTarget.value, true) });
          }}
        />
      </DetailRow>

      {/* 작업 종류는 어휘가 정한다 — 여기서 세 칸을 손으로 적지 않는다. */}
      <DetailGrid>
        {WORK_KINDS.map((w) => {
          const field = MAN_DAY_FIELD[w.key];
          const label = laborFieldLabel(w.key, carrier);
          return (
            <DetailRow key={w.key} label={label} issue={issueFor?.(`labor.${field}`)}>
              <Input
                aria-label={label}
                type="number"
                value={num.valueOf(field)}
                placeholder="—"
                onChange={(e) => {
                  num.onType(field, e.currentTarget.value);
                  onChange({ [field]: toNumber(e.currentTarget.value) } as Partial<LaborSpec>);
                }}
              />
            </DetailRow>
          );
        })}
      </DetailGrid>

      <p className="text-xs text-content-faint">
        품은 인·일({unit}당) — 노임단가(원/일)와 곱해 직접노무비가 됩니다. 비워 두면 「안 적었다」, 0 은
        「품이 안 든다」는 뜻입니다.
      </p>
    </DetailCard>
  );
}
