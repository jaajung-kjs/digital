import { useMemo, useState } from 'react';
import {
  Button, CommitInput, DetailCard, DetailCardHeader, DetailRow, EMPTY, EmptyState, ErrorStrip, ListRow, Select, ViewCard,
  useConfirm, EmptyRow,
} from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { expandDeletes } from '@twin/core';
import { deleteRows } from '../../model/store/deleteActions';
import { effectiveRows, toModelState } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { EditOnly, Editable } from '../../useCanEdit';
import { RackTypeOptions } from './TypeOptions';
import { deleteConfirm } from '../deleteConfirm';

interface Props {
  rackId: string;
  onClose: () => void;
  onSelectEquipment: (id: string) => void;
  onDeleted: () => void;
  /** 「설비 추가」 — 이 랙을 기본값으로. */
  onAddEquipment: (rackId: string) => void;
}

/** 랙 상세 — 이름·랙 품목·실장 설비. 지우기는 안에 설비가 남으면 막힌다. */
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

  if (!rack) return <ViewCard><EmptyState title="선택된 랙이 없습니다" /></ViewCard>;
  const patch = (p: Partial<typeof rack>) => workingCopyStore.getState().update('racks', rackId, p);

  async function remove() {
    /* 막힌 일은 묻지 않는다 — 먼저 알아보고 까닭을 말한다. */
    const plan = expandDeletes(toModelState(workingCopyStore.getState(), catalog?.cableTypes), { racks: [rackId] });
    if (plan.blocked.length > 0) { setBlocked(plan.blocked.map((x) => x.reason).join(' / ')); return; }
    setBlocked(null);
    if (!(await confirm(deleteConfirm('랙', rack!.name)))) return;
    const { blocked: b } = deleteRows({ racks: [rackId] });
    if (b.length > 0) { setBlocked(b.map((x) => x.reason).join(' / ')); return; }
    onDeleted();
  }

  const place = rack.floorId == null ? '미배치' : `${saved.floors.find((f) => f.id === rack.floorId)?.name ?? EMPTY} (${rack.x ?? EMPTY}, ${rack.y ?? EMPTY})`;
  return (
    <ViewCard title={rack.name} actions={<Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>} body="scroll">
        <DetailCard>
          <DetailCardHeader title="랙 정보" actions={<EditOnly><Button variant="secondary" tone="danger" size="sm" onClick={remove}>랙 삭제</Button></EditOnly>} />
          <DetailRow label="이름"><Editable value={rack.name}><CommitInput size="sm" aria-label="이름" required value={rack.name} onCommit={(v) => patch({ name: v })} /></Editable></DetailRow>
          <DetailRow label="랙 품목">
            <Editable value={catalog?.rackTypes.find((t) => t.id === rack.rackTypeId)?.name}>
              <Select size="sm" value={rack.rackTypeId} onChange={(e) => patch({ rackTypeId: e.currentTarget.value })}>
                <RackTypeOptions types={catalog?.rackTypes ?? []} />
              </Select>
            </Editable>
          </DetailRow>
          <DetailRow label="배치">{place}</DetailRow>
          <ErrorStrip message={blocked} onDismiss={() => setBlocked(null)} />
        </DetailCard>
        <DetailCard>
          <DetailCardHeader title="실장 설비" count={inside.length} actions={<EditOnly><Button variant="secondary" size="sm" onClick={() => onAddEquipment(rackId)}>설비 추가</Button></EditOnly>} />
          {/* 줄들은 한 자식 — 카드 여백을 한 번만 받는다(차단기 요약과 같은 밀도). */}
          <div>
            {inside.length === 0 && <EmptyRow>실장 설비가 없습니다</EmptyRow>}
            {inside.map((e) => (
              <ListRow key={e.id} onClick={() => onSelectEquipment(e.id)}>{e.name}</ListRow>
            ))}
          </div>
        </DetailCard>
      {confirmDialog}
    </ViewCard>
  );
}
