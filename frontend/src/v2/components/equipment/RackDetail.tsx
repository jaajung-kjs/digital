import { useMemo, useState } from 'react';
import { Button, DetailCard, DetailCardHeader, DetailRow, EMPTY, EmptyState, ErrorStrip, Input, ListRow, Select, ViewCard, useConfirm } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { expandDeletes } from '@twin/core';
import { deleteRows } from '../../model/store/deleteActions';
import { effectiveRows, toModelState } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { RackTypeOptions } from './TypeOptions';

interface Props {
  rackId: string;
  onClose: () => void;
  onSelectEquipment: (id: string) => void;
  onDeleted: () => void;
  /** 「설비 추가」 — 이 랙을 기본값으로. */
  onAddEquipment: (rackId: string) => void;
}

/** 랙 상세 — 이름·랙 품목·안의 설비. 지우기는 안에 설비가 남으면 막힌다. */
export function RackDetail({ rackId, onClose, onSelectEquipment, onDeleted, onAddEquipment }: Props) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const { rack, inside } = useMemo(() => ({
    rack: effectiveRows({ saved, overlays }, 'racks').find((r) => r.id === rackId) ?? null,
    inside: effectiveRows({ saved, overlays }, 'equipment').filter((e) => e.rackId === rackId),
  }), [saved, overlays, rackId]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  if (!rack) return <ViewCard><EmptyState title="고른 랙이 없습니다" /></ViewCard>;
  const patch = (p: Partial<typeof rack>) => workingCopyStore.getState().update('racks', rackId, p);

  async function remove() {
    /* 막힌 일은 묻지 않는다 — 먼저 알아보고 까닭을 말한다. */
    const plan = expandDeletes(toModelState(workingCopyStore.getState(), catalog?.cableTypes), { racks: [rackId] });
    if (plan.blocked.length > 0) { setBlocked(plan.blocked.map((x) => x.reason).join(' / ')); return; }
    setBlocked(null);
    if (!(await confirm({ title: '랙 삭제', target: rack!.name, message: '저장 전에는 되돌릴 수 있습니다.', confirmLabel: '삭제', danger: true }))) return;
    const { blocked: b } = deleteRows({ racks: [rackId] });
    if (b.length > 0) { setBlocked(b.map((x) => x.reason).join(' / ')); return; }
    onDeleted();
  }

  const place = rack.floorId == null ? '배치 안 됨' : `${saved.floors.find((f) => f.id === rack.floorId)?.name ?? '—'} (${rack.x ?? EMPTY}, ${rack.y ?? EMPTY})`;
  return (
    <ViewCard title={rack.name} actions={<Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>} body="scroll">
      <div className="space-y-3">
        <DetailCard>
          <DetailCardHeader title="랙 정보" actions={<Button variant="secondary" size="sm" onClick={remove}>삭제</Button>} />
          <DetailRow label="이름"><Input size="sm" value={rack.name} onChange={(e) => patch({ name: e.currentTarget.value })} /></DetailRow>
          <DetailRow label="랙 품목">
            <Select size="sm" value={rack.rackTypeId} onChange={(e) => patch({ rackTypeId: e.currentTarget.value })}>
              <RackTypeOptions types={catalog?.rackTypes ?? []} />
            </Select>
          </DetailRow>
          <DetailRow label="배치">{place}</DetailRow>
          <ErrorStrip message={blocked} onDismiss={() => setBlocked(null)} />
        </DetailCard>
        <DetailCard>
          <DetailCardHeader title={`안의 설비 ${inside.length}`} actions={<Button variant="secondary" size="sm" onClick={() => onAddEquipment(rackId)}>설비 추가</Button>} />
          {inside.length === 0 && <ListRow>안에 설비가 없습니다</ListRow>}
          {inside.map((e) => (
            <ListRow key={e.id} onClick={() => onSelectEquipment(e.id)}>{e.name}</ListRow>
          ))}
        </DetailCard>
      </div>
      {confirmDialog}
    </ViewCard>
  );
}
