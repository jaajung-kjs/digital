import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_EQUIPMENT_STATUS } from '@twin/core';
import { Button, DetailRow, ErrorStrip, Input, Modal, Select, Toggle } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { bySubstation, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { newId } from '../../newId';
import { EquipmentTypeOptions, RackTypeOptions } from './TypeOptions';

interface Props { substationId: string; /** 본문 첫 줄 「위치」(§1.8). 새 랙은 평면도 「배치」로 놓기 전까지 미배치다. */ substationName?: string; open: boolean; onClose: () => void; onCreated: (rackId: string) => void }

/** 랙 추가 — 「같은 이름의 설비 함께 만들기」를 켜면 일체형(UPS반 + UPS)을 한 번에 만든다. */
export function AddRackDialog({ substationId, substationName, open, onClose, onCreated }: Props) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [name, setName] = useState('');
  const [rackTypeId, setRackTypeId] = useState('');
  const [withEquipment, setWithEquipment] = useState(false);
  const [typeId, setTypeId] = useState('');
  const trimmed = name.trim();
  const dupRack = useMemo(
    () => trimmed !== '' && bySubstation(effectiveRows({ saved, overlays }, 'racks'), substationId).some((r) => r.name === trimmed),
    [saved, overlays, substationId, trimmed],
  );
  const dupEquipment = useMemo(
    () => withEquipment && trimmed !== '' && bySubstation(effectiveRows({ saved, overlays }, 'equipment'), substationId).some((e) => e.name === trimmed),
    [saved, overlays, substationId, trimmed, withEquipment],
  );
  /* 닫히면 쓰던 것을 버린다 — 다시 열면 빈 상자다. */
  useEffect(() => { if (!open) { setName(''); setRackTypeId(''); setWithEquipment(false); setTypeId(''); } }, [open]);
  const ok = trimmed !== '' && rackTypeId !== '' && (!withEquipment || typeId !== '') && !dupRack && !dupEquipment;

  function submit() {
    if (!ok) return;
    const rackId = newId();
    const s = workingCopyStore.getState();
    s.create('racks', { id: rackId, substationId, name: trimmed, rackTypeId, floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    if (withEquipment) {
      s.create('equipment', {
        id: newId(), substationId, rackId, name: trimmed, typeId, status: DEFAULT_EQUIPMENT_STATUS,
        model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null,
        circuitCount: 0, panelCount: null, updatedAt: '',
      });
    }
    onCreated(rackId);
    onClose();
  }

  return (
    <Modal
      open={open} onClose={onClose} title="랙 추가" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={!ok} onClick={submit}>추가</Button></>}
    >
      <div className="flex flex-col gap-3">
        {substationName && <DetailRow label="위치" hint="평면도 「배치」에서 층에 배치합니다">{`${substationName} · 미배치`}</DetailRow>}
        <DetailRow label="이름">
          <Input size="sm" autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </DetailRow>
        <DetailRow label="랙 품목">
          <Select size="sm" value={rackTypeId} onChange={(e) => setRackTypeId(e.currentTarget.value)}>
            <option value="" disabled>선택하세요</option>
            <RackTypeOptions types={catalog?.rackTypes ?? []} />
          </Select>
        </DetailRow>
        <Toggle size="sm" aria-label="같은 이름의 설비 함께 등록" label="같은 이름의 설비 함께 등록" checked={withEquipment} onChange={setWithEquipment} />
        {withEquipment && (
          <DetailRow label="설비 품목">
            <Select size="sm" value={typeId} onChange={(e) => setTypeId(e.currentTarget.value)}>
              <option value="" disabled>선택하세요</option>
              <EquipmentTypeOptions categories={catalog?.categories ?? []} types={catalog?.equipmentTypes ?? []} />
            </Select>
          </DetailRow>
        )}
        <ErrorStrip message={dupRack ? '같은 이름의 랙이 있습니다' : dupEquipment ? '같은 이름의 설비가 있습니다' : null} />
      </div>
    </Modal>
  );
}
