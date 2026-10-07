import { useMemo } from 'react';
import { EQUIPMENT_STATUSES, type EquipmentStatus } from '@twin/core';
import { Button, CommitInput, DateInput, DetailCard, DetailCardHeader, DetailRow, Select } from '../../../components/ui';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Catalog, Equipment } from '../../model/types';
import { EquipmentTypeOptions } from './TypeOptions';

const MADE_ON = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 연-월 꼴이 아니면 한 줄 안내 — 비었으면 말하지 않는다. */
const madeOnHint = (v: string | null) => (v && !MADE_ON.test(v) ? '연-월(예 2008-05) 형식으로 입력해야 정렬·집계에 반영됩니다' : undefined);

type TextKey = 'model' | 'maker' | 'serial' | 'manager' | 'note';
const TEXTS: { key: TextKey; label: string }[] = [
  { key: 'model', label: '모델명' }, { key: 'maker', label: '제조사' }, { key: 'serial', label: 'S/N' },
  { key: 'manager', label: '담당자' }, { key: 'note', label: '비고' },
];

/** 설비 정보 — 글 칸은 다 친 뒤 한 번(`CommitInput`), 고르는 칸은 고를 때 변경안에 실린다. 이름은 비울 수 없다. */
export function EquipmentInfoCard({ eq, catalog, onDelete }: { eq: Equipment; catalog: Pick<Catalog, 'categories' | 'equipmentTypes'> | undefined; onDelete: () => void }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const racks = useMemo(() => bySubstation(effectiveRows({ saved, overlays }, 'racks'), eq.substationId), [saved, overlays, eq.substationId]);
  const patch = (p: Partial<Equipment>) => workingCopyStore.getState().update('equipment', eq.id, p);
  return (
    <DetailCard>
      <DetailCardHeader title="설비 정보" actions={<Button variant="secondary" size="sm" onClick={onDelete}>삭제</Button>} />
      <DetailRow label="이름"><CommitInput size="sm" aria-label="이름" required value={eq.name} onCommit={(v) => patch({ name: v })} /></DetailRow>
      <DetailRow label="설비 품목">
        <Select size="sm" value={eq.typeId} onChange={(e) => patch({ typeId: e.currentTarget.value })}>
          <EquipmentTypeOptions categories={catalog?.categories ?? []} types={catalog?.equipmentTypes ?? []} />
        </Select>
      </DetailRow>
      <DetailRow label="상태">
        <Select size="sm" value={eq.status} onChange={(e) => patch({ status: e.currentTarget.value as EquipmentStatus })}>
          {EQUIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </DetailRow>
      <DetailRow label="랙">
        <Select size="sm" value={eq.rackId} onChange={(e) => patch({ rackId: e.currentTarget.value })}>
          {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </DetailRow>
      {TEXTS.slice(0, 2).map((t) => (
        <DetailRow key={t.key} label={t.label}><CommitInput size="sm" aria-label={t.label} value={eq[t.key] ?? ''} onCommit={(v) => patch({ [t.key]: v || null })} /></DetailRow>
      ))}
      {/* 제조년월은 명판에 적힌 그대로의 글 — 날짜 고르기를 두면 없는 「일」을 지어내야 한다.
          꼴이 어긋나면 **알려만 준다**(저장은 막지 않는다): 명판이 「2008.5」·「08년」처럼 적혀 있는 일이 있다. */}
      <DetailRow label="제조년월" hint={madeOnHint(eq.madeOn)}><CommitInput size="sm" aria-label="제조년월" placeholder="예 2008-05" value={eq.madeOn ?? ''} onCommit={(v) => patch({ madeOn: v || null })} /></DetailRow>
      {TEXTS.slice(2, 3).map((t) => (
        <DetailRow key={t.key} label={t.label}><CommitInput size="sm" aria-label={t.label} value={eq[t.key] ?? ''} onCommit={(v) => patch({ [t.key]: v || null })} /></DetailRow>
      ))}
      <DetailRow label="설치일"><DateInput size="sm" value={eq.installDate ?? ''} onChange={(e) => patch({ installDate: e.currentTarget.value || null })} /></DetailRow>
      {TEXTS.slice(3).map((t) => (
        <DetailRow key={t.key} label={t.label}><CommitInput size="sm" aria-label={t.label} value={eq[t.key] ?? ''} onCommit={(v) => patch({ [t.key]: v || null })} /></DetailRow>
      ))}
    </DetailCard>
  );
}
