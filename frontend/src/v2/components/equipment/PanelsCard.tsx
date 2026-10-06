import { useMemo } from 'react';
import { DetailCard, DetailCardHeader, DetailRow } from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy } from '../../model/store/workingCopy';

/** 이 설비를 단자로 가리키는 광선로 끝 — 판 번호 순. 읽기 전용(편집은 광선로 화면). 없으면 그리지 않는다. */
export function PanelsCard({ equipmentId, panelCount }: { equipmentId: string; panelCount: number | null }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const lines = useMemo(() => effectiveRows({ saved, overlays }, 'fiberLines'), [saved, overlays]);
  const ends = lines.flatMap((l) => {
    const out: { id: string; panel: number | null; label: string }[] = [];
    const label = `${l.aSubstationName}–${l.bSubstationName} · ${l.coreCount}C`;
    if (l.aEquipmentId === equipmentId) out.push({ id: `${l.id}:A`, panel: l.aPanel, label });
    if (l.bEquipmentId === equipmentId) out.push({ id: `${l.id}:B`, panel: l.bPanel, label });
    return out;
  }).sort((a, b) => (a.panel ?? Infinity) - (b.panel ?? Infinity));
  if (ends.length === 0) return null;
  const used = new Set(ends.map((e) => e.panel).filter((p): p is number => p != null)).size;
  return (
    <DetailCard>
      <DetailCardHeader title="판" />
      {ends.map((e) => (
        <DetailRow key={e.id} label={e.panel != null ? `판 ${e.panel}` : '판 —'}>{e.label}</DetailRow>
      ))}
      {panelCount != null && <DetailRow label="빈 판">{Math.max(0, panelCount - used)}</DetailRow>}
    </DetailCard>
  );
}
