import { useMemo } from 'react';
import { DetailCard, DetailCardHeader, ListRow } from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy } from '../../model/store/workingCopy';

/**
 * 광선로 슬롯 — 이 설비(OFD 등)를 단자로 가리키는 광선로 끝, 슬롯 번호 순(모델의 `aPanel/bPanel`).
 * 한 줄 = 「슬롯 2 · (구)춘천–화천 · 24심」. 읽기 전용(편집은 광선로 화면). 없으면 그리지 않는다.
 */
export function PanelsCard({ equipmentId, panelCount }: { equipmentId: string; panelCount: number | null }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const lines = useMemo(() => effectiveRows({ saved, overlays }, 'fiberLines'), [saved, overlays]);
  const ends = lines.flatMap((l) => {
    const out: { id: string; slot: number | null; label: string }[] = [];
    const label = `${l.name ?? `${l.aSubstationName}–${l.bSubstationName}`} · ${l.coreCount}심`;
    if (l.aEquipmentId === equipmentId) out.push({ id: `${l.id}:A`, slot: l.aPanel, label });
    if (l.bEquipmentId === equipmentId) out.push({ id: `${l.id}:B`, slot: l.bPanel, label });
    return out;
  }).sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
  if (ends.length === 0) return null;
  const used = new Set(ends.map((e) => e.slot).filter((p): p is number => p != null)).size;
  return (
    <DetailCard>
      <DetailCardHeader title="광선로 슬롯" />
      {ends.map((e) => {
        const text = [e.slot != null ? `슬롯 ${e.slot}` : null, e.label].filter(Boolean).join(' · ');
        return <ListRow key={e.id} title={text}>{text}</ListRow>;
      })}
      {panelCount != null && <ListRow>{`빈 슬롯 ${Math.max(0, panelCount - used)}`}</ListRow>}
    </DetailCard>
  );
}
