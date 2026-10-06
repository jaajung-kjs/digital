import { useMemo } from 'react';
import { EQUIPMENT_STATUSES } from '@twin/core';
import { Button, DateInput, DetailCard, DetailCardHeader, DetailRow, Input, Select } from '../../../components/ui';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Catalog, Equipment } from '../../model/types';
import { EquipmentTypeOptions } from './TypeOptions';

type TextKey = 'model' | 'maker' | 'serial' | 'manager' | 'note';
const TEXTS: { key: TextKey; label: string }[] = [
  { key: 'model', label: '모델명' }, { key: 'maker', label: '제작사' }, { key: 'serial', label: 'S/N' },
  { key: 'manager', label: '담당자' }, { key: 'note', label: '비고' },
];

/** 설비 정보 — 값은 바뀔 때마다 변경안에 실린다. */
export function EquipmentInfoCard({ eq, catalog, onDelete }: { eq: Equipment; catalog: Pick<Catalog, 'categories' | 'equipmentTypes'> | undefined; onDelete: () => void }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const racks = useMemo(() => bySubstation(effectiveRows({ saved, overlays }, 'racks'), eq.substationId), [saved, overlays, eq.substationId]);
  const patch = (p: Partial<Equipment>) => workingCopyStore.getState().update('equipment', eq.id, p);
  return (
    <DetailCard>
      <DetailCardHeader title="설비 정보" actions={<Button variant="secondary" size="sm" onClick={onDelete}>삭제</Button>} />
      <DetailRow label="이름"><Input size="sm" value={eq.name} onChange={(e) => patch({ name: e.currentTarget.value })} /></DetailRow>
      <DetailRow label="설비 품목">
        <Select size="sm" value={eq.typeId} onChange={(e) => patch({ typeId: e.currentTarget.value })}>
          <EquipmentTypeOptions categories={catalog?.categories ?? []} types={catalog?.equipmentTypes ?? []} />
        </Select>
      </DetailRow>
      <DetailRow label="상태">
        <Select size="sm" value={eq.status} onChange={(e) => patch({ status: e.currentTarget.value })}>
          {EQUIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </DetailRow>
      <DetailRow label="랙">
        <Select size="sm" value={eq.rackId} onChange={(e) => patch({ rackId: e.currentTarget.value })}>
          {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </DetailRow>
      {TEXTS.slice(0, 2).map((t) => (
        <DetailRow key={t.key} label={t.label}><Input size="sm" value={eq[t.key] ?? ''} onChange={(e) => patch({ [t.key]: e.currentTarget.value || null })} /></DetailRow>
      ))}
      <DetailRow label="제조년월"><DateInput size="sm" value={eq.madeOn ?? ''} onChange={(e) => patch({ madeOn: e.currentTarget.value || null })} /></DetailRow>
      {TEXTS.slice(2, 3).map((t) => (
        <DetailRow key={t.key} label={t.label}><Input size="sm" value={eq[t.key] ?? ''} onChange={(e) => patch({ [t.key]: e.currentTarget.value || null })} /></DetailRow>
      ))}
      <DetailRow label="설치일"><DateInput size="sm" value={eq.installDate ?? ''} onChange={(e) => patch({ installDate: e.currentTarget.value || null })} /></DetailRow>
      {TEXTS.slice(3).map((t) => (
        <DetailRow key={t.key} label={t.label}><Input size="sm" value={eq[t.key] ?? ''} onChange={(e) => patch({ [t.key]: e.currentTarget.value || null })} /></DetailRow>
      ))}
    </DetailCard>
  );
}
