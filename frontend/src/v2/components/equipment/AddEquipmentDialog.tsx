import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_EQUIPMENT_STATUS, MAX_CIRCUITS } from '@twin/core';
import { Button, DetailRow, ErrorStrip, Input, Modal, Select } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { newId } from '../../newId';
import { EquipmentTypeOptions } from './TypeOptions';

interface Props { substationId: string; open: boolean; defaultRackId?: string; onClose: () => void; onCreated: (equipmentId: string) => void }

/** 설비 추가 — 이름·품목·랙·회로 수. */
export function AddEquipmentDialog({ substationId, open, defaultRackId, onClose, onCreated }: Props) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [rackPick, setRackPick] = useState<string | null>(null);
  const [circuits, setCircuits] = useState('0');
  const racks = useMemo(() => bySubstation(effectiveRows({ saved, overlays }, 'racks'), substationId), [saved, overlays, substationId]);
  const rackId = rackPick ?? defaultRackId ?? '';
  const trimmed = name.trim();
  const n = Number(circuits);
  const dup = useMemo(
    () => trimmed !== '' && bySubstation(effectiveRows({ saved, overlays }, 'equipment'), substationId).some((e) => e.name === trimmed),
    [saved, overlays, substationId, trimmed],
  );
  /* 닫히면 쓰던 것을 버린다 — 다시 열면 빈 상자다. */
  useEffect(() => { if (!open) { setName(''); setTypeId(''); setRackPick(null); setCircuits('0'); } }, [open]);
  const circuitsOk = circuits.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_CIRCUITS;
  const ok = trimmed !== '' && typeId !== '' && rackId !== '' && circuitsOk && !dup;

  function submit() {
    if (!ok) return;
    const id = newId();
    workingCopyStore.getState().create('equipment', {
      id, substationId, rackId, name: trimmed, typeId, status: DEFAULT_EQUIPMENT_STATUS,
      model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null,
      circuitCount: n, panelCount: null, updatedAt: '',
    });
    onCreated(id);
    onClose();
  }

  return (
    <Modal
      open={open} onClose={onClose} title="설비 추가" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={!ok} onClick={submit}>추가</Button></>}
    >
      <div className="space-y-2">
        <DetailRow label="이름">
          <Input size="sm" autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </DetailRow>
        <DetailRow label="설비 품목">
          <Select size="sm" value={typeId} onChange={(e) => setTypeId(e.currentTarget.value)}>
            <option value="">선택</option>
            <EquipmentTypeOptions categories={catalog?.categories ?? []} types={catalog?.equipmentTypes ?? []} />
          </Select>
        </DetailRow>
        <DetailRow label="랙">
          <Select size="sm" value={rackId} onChange={(e) => setRackPick(e.currentTarget.value)}>
            <option value="">선택</option>
            {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </DetailRow>
        <DetailRow label="회로 수" issue={circuitsOk ? undefined : `회로 수는 0~${MAX_CIRCUITS} 사이의 정수입니다`}>
          <Input size="sm" numeric invalid={!circuitsOk} value={circuits} onChange={(e) => setCircuits(e.currentTarget.value)} />
        </DetailRow>
        <ErrorStrip message={dup ? '같은 이름의 설비가 있습니다' : null} />
      </div>
    </Modal>
  );
}
