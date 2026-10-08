import { useMemo } from 'react';
import { EQUIPMENT_STATUSES, type EquipmentStatus } from '@twin/core';
import { Button, CommitInput, DateInput, DetailCard, DetailCardHeader, DetailRow, Select, formatDate } from '../../../components/ui';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Catalog, Equipment } from '../../model/types';
import { EditOnly, Editable } from '../../useCanEdit';
import { EQUIPMENT_FIELD_LABELS as L } from './fieldLabels';
import { EquipmentTypeOptions } from './TypeOptions';

const MADE_ON = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 연-월 꼴이 아니면 한 줄 안내 — 비었으면 말하지 않는다. */
const madeOnHint = (v: string | null) => (v && !MADE_ON.test(v) ? '연-월(예 2008-05) 형식으로 입력해야 정렬·집계에 반영됩니다' : undefined);

type TextKey = 'model' | 'maker' | 'serial' | 'manager' | 'note';
const TEXTS: { key: TextKey; label: string }[] = (['model', 'maker', 'serial', 'manager', 'note'] as const).map((key) => ({ key, label: L[key]! }));

/** 설비 정보 — 글 칸은 다 친 뒤 한 번(`CommitInput`), 고르는 칸은 고를 때 변경안에 실린다. 이름은 비울 수 없다. */
export function EquipmentInfoCard({ eq, catalog, onDelete }: { eq: Equipment; catalog: Pick<Catalog, 'categories' | 'equipmentTypes'> | undefined; onDelete: () => void }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const racks = useMemo(() => bySubstation(effectiveRows({ saved, overlays }, 'racks'), eq.substationId), [saved, overlays, eq.substationId]);
  const patch = (p: Partial<Equipment>) => workingCopyStore.getState().update('equipment', eq.id, p);
  const typeName = catalog?.equipmentTypes.find((t) => t.id === eq.typeId)?.name;
  const text = (t: { key: TextKey; label: string }) => (
    <DetailRow key={t.key} label={t.label}>
      <Editable value={eq[t.key]}><CommitInput size="sm" aria-label={t.label} value={eq[t.key] ?? ''} onCommit={(v) => patch({ [t.key]: v || null })} /></Editable>
    </DetailRow>
  );
  return (
    <DetailCard>
      <DetailCardHeader title="설비 정보" actions={<EditOnly><Button variant="secondary" size="sm" onClick={onDelete}>삭제</Button></EditOnly>} />
      <DetailRow label={L.name}><Editable value={eq.name}><CommitInput size="sm" aria-label={L.name} required value={eq.name} onCommit={(v) => patch({ name: v })} /></Editable></DetailRow>
      <DetailRow label={L.typeId}>
        <Editable value={typeName}>
          <Select size="sm" value={eq.typeId} onChange={(e) => patch({ typeId: e.currentTarget.value })}>
            <EquipmentTypeOptions categories={catalog?.categories ?? []} types={catalog?.equipmentTypes ?? []} />
          </Select>
        </Editable>
      </DetailRow>
      <DetailRow label={L.status}>
        <Editable value={EQUIPMENT_STATUSES.find((s) => s.value === eq.status)?.label}>
          <Select size="sm" value={eq.status} onChange={(e) => patch({ status: e.currentTarget.value as EquipmentStatus })}>
            {EQUIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Editable>
      </DetailRow>
      <DetailRow label={L.rackId}>
        <Editable value={racks.find((r) => r.id === eq.rackId)?.name}>
          <Select size="sm" value={eq.rackId} onChange={(e) => patch({ rackId: e.currentTarget.value })}>
            {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Editable>
      </DetailRow>
      {TEXTS.slice(0, 2).map(text)}
      {/* 제조년월은 명판에 적힌 그대로의 글 — 날짜 고르기를 두면 없는 「일」을 지어내야 한다.
          꼴이 어긋나면 **알려만 준다**(저장은 막지 않는다): 명판이 「2008.5」·「08년」처럼 적혀 있는 일이 있다. */}
      <DetailRow label={L.madeOn} hint={madeOnHint(eq.madeOn)}>
        <Editable value={eq.madeOn}><CommitInput size="sm" aria-label={L.madeOn} placeholder="예 2008-05" value={eq.madeOn ?? ''} onCommit={(v) => patch({ madeOn: v || null })} /></Editable>
      </DetailRow>
      {TEXTS.slice(2, 3).map(text)}
      <DetailRow label={L.installDate}>
        <Editable value={eq.installDate && formatDate(eq.installDate)}><DateInput size="sm" value={eq.installDate ?? ''} onChange={(e) => patch({ installDate: e.currentTarget.value || null })} /></Editable>
      </DetailRow>
      {TEXTS.slice(3).map(text)}
    </DetailCard>
  );
}
