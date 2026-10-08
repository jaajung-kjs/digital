import { useMemo } from 'react';
import { CIRCUIT_CURRENTS, MAX_CIRCUITS, SWITCH_STATES } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, ListRow } from '../../../components/ui';
import { effectiveCircuits, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy } from '../../model/store/workingCopy';
import type { Circuit } from '../../model/types';
import { circuitLink, endLabel } from './endpoints';
import { EditOnly } from '../../useCanEdit';

const wordOf = (vocab: readonly { value: string; label: string }[], v: string | null) => (v ? vocab.find((x) => x.value === v)?.label ?? v : null);

/**
 * 차단기 요약 — 좁은 패널(364px)에서는 **한 줄씩만** 읽는다: `번호 · 표기 · 용량 · 교류/직류 · 개폐 → 부하`.
 * 빈 칸은 건너뛰고 넘치면 말줄임. 고치는 일은 넓은 편집 창(`BreakerEditor`)이 맡는다 — 줄을 누르면 그 줄로 열린다.
 * 차단기가 없으면 카드를 그리지 않는다(더하는 길은 설비 머리의 「차단기 추가」).
 * `onOpenPower` 를 주면 머리에 「차단기 대장에서 보기」 — 차단기 대장의 이 설비 블록으로 건너간다(기록을 남긴다).
 */
export function CircuitCard({ equipmentId, onEdit, onAdd, onOpenPower }: {
  equipmentId: string; onEdit: (no: number | null) => void; onAdd: () => void;
  /** 전원 계통 차단기 대장의 이 설비 블록으로. */
  onOpenPower?: () => void;
}) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const rows = useMemo(() => effectiveCircuits({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const links = useMemo(() => effectiveRows({ saved, overlays }, 'links'), [saved, overlays]);
  if (rows.length === 0) return null;

  const line = (c: Circuit) => {
    const head = [String(c.no), c.label, c.capacity, wordOf(CIRCUIT_CURRENTS, c.current), wordOf(SWITCH_STATES, c.switch)].filter(Boolean).join(' · ');
    const hit = circuitLink(links, equipmentId, c.no);
    return hit ? `${head} → ${endLabel({ saved, overlays }, hit.far)}` : head;
  };

  return (
    <DetailCard>
      <DetailCardHeader
        title={`차단기 ${rows.length}`}
        actions={(
          <>
            {onOpenPower && <Button variant="secondary" size="sm" onClick={onOpenPower}>차단기 대장에서 보기</Button>}
            <EditOnly>
              <Button variant="secondary" size="sm" onClick={() => onEdit(null)}>편집</Button>
              <Button variant="secondary" size="sm" disabled={rows.length >= MAX_CIRCUITS} onClick={onAdd}>추가</Button>
            </EditOnly>
          </>
        )}
      />
      {/* 줄들을 한 자식으로 묶는다 — 카드는 자식마다 여백을 주므로, 따로 두면 줄마다 py-2 가 붙어 36px 로 벌어진다. */}
      <div>
        {rows.map((c) => {
          const text = line(c);
          return <ListRow key={c.no} title={text} onClick={() => onEdit(c.no)}>{text}</ListRow>;
        })}
      </div>
    </DetailCard>
  );
}
