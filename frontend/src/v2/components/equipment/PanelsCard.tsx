import { useMemo } from 'react';
import { MAX_PANELS, fiberLineName, type Side } from '@twin/core';
import { DetailCard, DetailCardHeader, ListRow, MessageStrip } from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { BlockFocus } from '../../useWorkspaceRoute';
import { InlineEditCell } from '../InlineEditCell';

/**
 * 슬롯 수 칸 값 → 저장할 값. 비우면 `null`(모름), 정수 0..MAX_PANELS 가 아니면 `undefined`(받지 않는다).
 */
function parsePanelCount(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PANELS ? n : undefined;
}

/** 슬롯 수 칸이 받지 않는 값의 까닭 — 칸이 붉어지고 열린 채 남는다(`InlineEditCell validate`). */
const panelCountIssue = (raw: string): string | null =>
  parsePanelCount(raw) === undefined ? `슬롯 수는 0–${MAX_PANELS} 사이의 정수입니다` : null;

export interface SlotEnd { lineId: string; side: Side; slot: number | null; startNo: number; label: string }

/**
 * 이 설비를 단자로 가리키는 광선로 끝 — **슬롯 → 시작 번호** 순(선번장 블록 차례와 같다). 슬롯이 없는 끝은 뒤로.
 * 설비 상세 머리(「슬롯 수」 단추를 세울지)와 슬롯 카드가 같은 것을 읽는다.
 */
export function useSlotEnds(equipmentId: string): SlotEnd[] {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  return useMemo(() => {
    const lines = effectiveRows({ saved, overlays }, 'fiberLines');
    return lines.flatMap((l) => {
      const out: SlotEnd[] = [];
      const label = `${fiberLineName(l.name, l.aSubstationName, l.bSubstationName)} · ${l.coreCount}심`;
      if (l.aEquipmentId === equipmentId) out.push({ lineId: l.id, side: 'A', slot: l.aPanel, startNo: l.aStartNo, label });
      if (l.bEquipmentId === equipmentId) out.push({ lineId: l.id, side: 'B', slot: l.bPanel, startNo: l.bStartNo, label });
      return out;
    }).sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity) || a.startNo - b.startNo);
  }, [saved, overlays, equipmentId]);
}

/**
 * 슬롯 셈 — 「빈 슬롯」은 **1..슬롯 수 안에서 쓰인 슬롯**만 빼고, 슬롯 수를 넘는 슬롯은 따로 짚는다(경고, 막지 않는다).
 * 넘는 슬롯까지 쓰인 것으로 세면 빈 슬롯이 실제보다 적게 나온다.
 */
function slotTally(ends: readonly { slot: number | null }[], panelCount: number | null): { free: number | null; over: number[] } {
  const slots = [...new Set(ends.map((e) => e.slot).filter((p): p is number => p != null))].sort((a, b) => a - b);
  if (panelCount == null) return { free: null, over: [] };
  const used = slots.filter((p) => p >= 1 && p <= panelCount).length;
  return { free: panelCount - used, over: slots.filter((p) => p > panelCount) };
}

/**
 * 광선로 슬롯 — 이 설비(OFD 등)를 단자로 가리키는 광선로 끝, 슬롯 번호 순(모델의 `aPanel/bPanel`).
 * 한 줄 = 「슬롯 2 · (구)춘천–화천 · 24심」. 줄을 누르면 선번장의 그 블록으로 간다(`onOpenBlock`, 기록을 남긴다 — 뒤로 가면 이 상세로 돌아온다).
 * 머리 오른쪽의 「슬롯 수」는 이 설비의 `panelCount` — 비우면 모름(null), 그때는 「빈 슬롯」 줄이 없다.
 *
 * 그릴지는 부르는 쪽이 정한다(`EquipmentDetail`): 광선로 끝도 슬롯 수도 없으면 카드 대신 머리줄의 「슬롯 수」 단추가 서고,
 * 그것을 누르면 이 카드가 슬롯 수 칸을 연 채로 선다(`editCount`). 칸이 열려 있는 동안은 값을 비워도 카드가 남는다.
 */
export function PanelsCard({ equipmentId, panelCount, onOpenBlock, editCount, onEditingChange }: {
  equipmentId: string;
  panelCount: number | null;
  onOpenBlock?: (focus: BlockFocus) => void;
  /** 슬롯 수 칸을 연 채로 선다. */
  editCount?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const ends = useSlotEnds(equipmentId);
  const { free, over } = slotTally(ends, panelCount);

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
            <span className="w-12 text-right">
              <InlineEditCell
                type="number" label="슬롯 수" value={panelCount != null ? String(panelCount) : ''}
                validate={panelCountIssue} startEditing={editCount} onEditingChange={onEditingChange} onCommit={commitCount}
              />
            </span>
          </span>
        )}
      />
      {/* 줄들을 한 자식으로 묶는다 — 카드는 자식마다 여백을 준다(§ ListRow). */}
      {(ends.length > 0 || free != null) && (
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
          {free != null && <ListRow>{`빈 슬롯 ${Math.max(0, free)}`}</ListRow>}
        </div>
      )}
      {over.length > 0 && (
        <MessageStrip tone="warning">{`슬롯 ${over.join(', ')} 이 슬롯 수(${panelCount})보다 큽니다`}</MessageStrip>
      )}
    </DetailCard>
  );
}
