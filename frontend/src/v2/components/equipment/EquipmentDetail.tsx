import { useMemo, useState } from 'react';
import { expandDeletes } from '@twin/core';
import { Button, EmptyState, Tabs, ViewCard, useConfirm, useTabs, type TabItem } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { deleteRows } from '../../model/store/deleteActions';
import { effectiveRows, toModelState } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { PhotoCard } from '../detail/PhotoCard';
import { RecordsTab } from '../detail/RecordsTab';
import { CircuitCard } from './CircuitCard';
import { EquipmentInfoCard } from './EquipmentInfoCard';
import { PanelsCard } from './PanelsCard';

type Tab = '정보' | '연결' | '점검·고장' | '사진';
const TABS: readonly TabItem<Tab>[] = (['정보', '연결', '점검·고장', '사진'] as const).map((k) => ({ key: k, label: k }));

/** 설비 상세 — 정보 · 연결 · 점검·고장 · 사진. 연결 탭 내용은 ③ 이 채운다. */
export function EquipmentDetail({ equipmentId, onClose, onDeleted }: { equipmentId: string; onClose: () => void; onDeleted: () => void }) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const eq = useMemo(() => effectiveRows({ saved, overlays }, 'equipment').find((e) => e.id === equipmentId) ?? null, [saved, overlays, equipmentId]);
  const [tab, setTab] = useState<Tab>('정보');
  const tabs = useTabs(tab);
  const { confirm, confirmDialog } = useConfirm();

  if (!eq) return <ViewCard><EmptyState title="고른 설비가 없습니다" /></ViewCard>;

  async function remove() {
    const s = workingCopyStore.getState();
    const links = expandDeletes(toModelState(s, catalog?.cableTypes), { equipment: [equipmentId] }).links.length;
    const message = links > 0 ? `이 설비와 닿은 연결 ${links}건이 함께 지워집니다.` : '저장 전에는 되돌릴 수 있습니다.';
    if (!(await confirm({ title: '설비 삭제', target: eq!.name, message, confirmLabel: '삭제', danger: true }))) return;
    deleteRows({ equipment: [equipmentId] });
    onDeleted();
  }

  return (
    <ViewCard title={eq.name} actions={<Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>} body="scroll">
      <div className="space-y-3">
        <Tabs {...tabs.list} items={TABS} onChange={setTab} />
        <div {...tabs.panel} className="space-y-3">
          {tab === '정보' && (
            <>
              <EquipmentInfoCard eq={eq} catalog={catalog} onDelete={remove} />
              <CircuitCard equipmentId={equipmentId} circuitCount={eq.circuitCount} />
              <PanelsCard equipmentId={equipmentId} panelCount={eq.panelCount} />
            </>
          )}
          {tab === '연결' && <EmptyState title="아직 연결이 없습니다" />}
          {tab === '점검·고장' && (
            <>
              <RecordsTab equipmentId={equipmentId} kind="inspections" dateField="inspectedAt" extraField="result" dateLabel="점검일" extraLabel="결과" sectionTitle="점검" emptyMessage="점검 기록이 없습니다" />
              <RecordsTab equipmentId={equipmentId} kind="maintenance" dateField="occurredAt" extraField="action" dateLabel="발생일" extraLabel="조치" sectionTitle="고장이력" emptyMessage="고장 기록이 없습니다" />
            </>
          )}
          {tab === '사진' && <PhotoCard equipmentId={equipmentId} />}
        </div>
      </div>
      {confirmDialog}
    </ViewCard>
  );
}
