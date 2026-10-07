import { useMemo } from 'react';
import type { Side } from '@twin/core';
import { DetailCard, DetailCardHeader, ListRow } from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { BlockFocus } from '../../useWorkspaceRoute';
import { InlineEditCell } from '../InlineEditCell';

/** 슬롯 수의 끝 — 서버가 받는 범위(`commit/schema` 0..200). */
const MAX_PANELS = 200;

/**
 * 슬롯 수 칸 값 → 저장할 값. 비우면 `null`(모름), 정수 0..200 이 아니면 `undefined`(받지 않는다 — 칸은 원래 값으로).
 */
export function parsePanelCount(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PANELS ? n : undefined;
}

/**
 * 광선로 슬롯 — 이 설비(OFD 등)를 단자로 가리키는 광선로 끝, 슬롯 번호 순(모델의 `aPanel/bPanel`).
 * 한 줄 = 「슬롯 2 · (구)춘천–화천 · 24심」. 줄을 누르면 선번장의 그 블록으로 간다(`onOpenBlock`).
 * 머리 오른쪽의 「슬롯 수」는 이 설비의 `panelCount` — 비우면 모름(null), 그때는 「빈 슬롯」 줄이 없다.
 * 광선로 끝도 슬롯 수도 없으면 그리지 않는다.
 */
export function PanelsCard({ equipmentId, panelCount, onOpenBlock }: {
  equipmentId: string;
  panelCount: number | null;
  onOpenBlock?: (focus: BlockFocus) => void;
}) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const lines = useMemo(() => effectiveRows({ saved, overlays }, 'fiberLines'), [saved, overlays]);
  const ends = lines.flatMap((l) => {
    const out: { lineId: string; side: Side; slot: number | null; label: string }[] = [];
    const label = `${l.name ?? `${l.aSubstationName}–${l.bSubstationName}`} · ${l.coreCount}심`;
    if (l.aEquipmentId === equipmentId) out.push({ lineId: l.id, side: 'A', slot: l.aPanel, label });
    if (l.bEquipmentId === equipmentId) out.push({ lineId: l.id, side: 'B', slot: l.bPanel, label });
    return out;
  }).sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
  if (ends.length === 0 && panelCount == null) return null;
  const used = new Set(ends.map((e) => e.slot).filter((p): p is number => p != null)).size;

  function commitCount(raw: string) {
    const next = parsePanelCount(raw);
    if (next === undefined || next === panelCount) return;
    workingCopyStore.getState().update('equipment', equipmentId, { panelCount: next });
  }

  return (
    <DetailCard>
      <DetailCardHeader
        title="광선로 슬롯"
        actions={(
          <span className="flex items-center gap-1 text-xs text-content-muted">
            슬롯 수
            <span className="w-8 text-right">
              <InlineEditCell type="number" label="슬롯 수" value={panelCount != null ? String(panelCount) : ''} onCommit={commitCount} />
            </span>
          </span>
        )}
      />
      {/* 줄들을 한 자식으로 묶는다 — 카드는 자식마다 여백을 준다(§ ListRow). */}
      <div>
        {ends.map((e) => {
          const text = [e.slot != null ? `슬롯 ${e.slot}` : null, e.label].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={`${e.lineId}:${e.side}`}
              title={onOpenBlock ? `${text} — 선번장에서 보기` : text}
              onClick={onOpenBlock ? () => onOpenBlock({ lineId: e.lineId, side: e.side }) : undefined}
            >
              {text}
            </ListRow>
          );
        })}
        {panelCount != null && <ListRow>{`빈 슬롯 ${Math.max(0, panelCount - used)}`}</ListRow>}
      </div>
    </DetailCard>
  );
}
