import { CIRCUIT_CURRENTS, SWITCH_STATES } from '@twin/core';
import { unitValueText } from '../../../components/ui';
import type { Circuit } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { CIRCUIT_FIELD_LABELS } from './fieldLabels';

/** 차단기 한 줄에서 고치는 칸 — 글 칸 다섯과 닫힌 어휘 둘(교류/직류·개폐). */
export type CircuitField = 'label' | 'current' | 'voltage' | 'capacity' | 'phase' | 'switch' | 'purpose';

const LABEL: Record<CircuitField, string> = CIRCUIT_FIELD_LABELS;
/* 교류/직류·개폐는 닫힌 어휘 — 칸에는 말(교류·투입)이, 변경안에는 값(AC·on)이 들어간다(§InlineEditCell choices). */
const CHOICES: Partial<Record<CircuitField, readonly { value: string; label: string }[]>> = {
  current: CIRCUIT_CURRENTS, switch: SWITCH_STATES,
};

/* 전압·용량은 자유 글(「50A」) — 분명한 수+단위 꼴만 **보일 때** 띄운다(「50 A」). 고치는 칸에는 적힌 그대로. */
const FORMAT: Partial<Record<CircuitField, (v: string) => string>> = { voltage: unitValueText, capacity: unitValueText };

/**
 * 차단기 칸 하나 — 편집 창의 표(`CircuitTable`)와 전원 계통의 차단기 대장이 **같은 칸**을 쓴다.
 * 같은 값을 두 곳에서 따로 고치게 짜면 비교·null 처리·어휘가 반드시 갈린다. 빈 글은 null, 그대로면 부르지 않는다.
 */
export function CircuitCell({ circuit, field, onSet }: {
  /** 차단기 행이든 전원 계통의 차단기든 — 칸 값만 읽는다. */
  circuit: Readonly<Record<CircuitField, string | null>>;
  field: CircuitField;
  onSet: (patch: Partial<Circuit>) => void;
}) {
  const current = circuit[field];
  const choices = CHOICES[field];
  return (
    <InlineEditCell
      value={current ?? ''} label={LABEL[field]} choices={choices} format={FORMAT[field]}
      onCommit={(raw) => {
        const next = choices ? raw || null : raw.trim() || null;
        /* 닫힌 어휘 칸의 raw 는 choices 의 값뿐이다 — 타입은 그 어휘가 정한다. */
        if (next !== current) onSet({ [field]: next } as Partial<Circuit>);
      }}
    />
  );
}
