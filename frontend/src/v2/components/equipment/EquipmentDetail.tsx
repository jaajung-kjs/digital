import { useMemo, useState } from 'react';
import { expandDeletes } from '@twin/core';
import { Button, EmptyState, Tabs, ViewCard, useConfirm, useTabs, type TabItem } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { addCircuit, deleteRows } from '../../model/store/deleteActions';
import { effectiveRows, toModelState } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { PhotoCard } from '../detail/PhotoCard';
import { RecordsTab } from '../detail/RecordsTab';
import { BreakerEditor } from './BreakerEditor';
import { CircuitCard } from './CircuitCard';
import { EquipmentInfoCard } from './EquipmentInfoCard';
import { LinkList } from './LinkList';
import { PanelsCard, useSlotEnds } from './PanelsCard';
import type { BlockFocus } from '../../useWorkspaceRoute';

type Tab = '정보' | '연결' | '점검·고장' | '사진';
const TABS: readonly TabItem<Tab>[] = (['정보', '연결', '점검·고장', '사진'] as const).map((k) => ({ key: k, label: k }));

/** 설비 상세 — 정보 · 연결 · 점검·고장 · 사진.  */
export function EquipmentDetail({ equipmentId, onClose, onDeleted, onOpenBlock }: {
  equipmentId: string; onClose: () => void; onDeleted: () => void;
  /** 슬롯 줄 → 선번장의 그 블록(주소). 없으면 줄은 읽기만 한다. */
  onOpenBlock?: (focus: BlockFocus) => void;
}) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const eq = useMemo(() => effectiveRows({ saved, overlays }, 'equipment').find((e) => e.id === equipmentId) ?? null, [saved, overlays, equipmentId]);
  const [tab, setTab] = useState<Tab>('정보');
  const tabs = useTabs(tab);
  const { confirm, confirmDialog } = useConfirm();
  /** 차단기 편집 창 — 열려 있으면 `at` 이 표시할 줄(없으면 표만). */
  const [breakers, setBreakers] = useState<{ at: number | null } | null>(null);
  /** 슬롯 수 칸이 열려 있는가 — 「슬롯 수」 단추로 열었거나 카드 안에서 고치는 중. 그동안은 값을 비워도 카드가 남는다. */
  const [slotEditing, setSlotEditing] = useState(false);
  const slotEnds = useSlotEnds(equipmentId);

  /* 슬롯 카드는 데이터가 있을 때만 선다(차단기와 같은 어법) — 품목으로 가르지 않는다. */
  const hasSlots = slotEnds.length > 0 || eq?.panelCount != null;

  if (!eq) return <ViewCard><EmptyState title="고른 설비가 없습니다" /></ViewCard>;

  async function remove() {
    const s = workingCopyStore.getState();
    const links = expandDeletes(toModelState(s, catalog?.cableTypes), { equipment: [equipmentId] }).links.length;
    const message = links > 0 ? `이 설비와 닿은 연결 ${links}건이 함께 지워집니다.` : '저장 전에는 되돌릴 수 있습니다.';
    if (!(await confirm({ title: '설비 삭제', target: eq!.name, message, confirmLabel: '삭제', danger: true }))) return;
    deleteRows({ equipment: [equipmentId] });
    onDeleted();
  }

  /** 차단기 한 줄 더하기 — 끝 번호의 빈 줄로 생기고(`addCircuit`), 편집 창이 그 줄로 열린다. 개수를 묻지 않는다. */
  function addBreaker() {
    const n = addCircuit(equipmentId);
    if (n !== null) setBreakers({ at: n });
  }

  return (
    <ViewCard
      title={eq.name}
      actions={(
        <>
          {/* 차단기가 하나도 없을 때만 — 있으면 차단기 카드 머리에 「추가」가 선다. 항목 하나짜리 `⋯` 는 두지 않는다
              (아이콘만으로는 무엇이 들었는지 모르고, 한 겹 안에 숨길 만큼 드문 일도 아니다). */}
          {eq.circuitCount === 0 && <Button variant="ghost" size="xs" onClick={addBreaker}>차단기 추가</Button>}
          {/* 슬롯도 같다 — 광선로 끝도 슬롯 수도 없으면 카드 대신 이 단추. 누르면 슬롯 카드가 슬롯 수 칸을 연 채로 선다. */}
          {!hasSlots && !slotEditing && (
            <Button variant="ghost" size="xs" onClick={() => { setTab('정보'); setSlotEditing(true); }}>슬롯 수</Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
        </>
      )}
      body="scroll"
    >
      <div className="space-y-3">
        <Tabs {...tabs.list} items={TABS} onChange={setTab} />
        <div {...tabs.panel} className="space-y-3">
          {tab === '정보' && (
            <>
              <EquipmentInfoCard eq={eq} catalog={catalog} onDelete={remove} />
              <CircuitCard equipmentId={equipmentId} onEdit={(at) => setBreakers({ at })} onAdd={addBreaker} />
              {(hasSlots || slotEditing) && (
                <PanelsCard
                  equipmentId={equipmentId} panelCount={eq.panelCount} onOpenBlock={onOpenBlock}
                  editCount={slotEditing} onEditingChange={setSlotEditing}
                />
              )}
            </>
          )}
          {tab === '연결' && <LinkList equipmentId={equipmentId} substationId={eq.substationId} />}
          {tab === '점검·고장' && (
            <>
              <RecordsTab equipmentId={equipmentId} kind="inspections" dateField="inspectedAt" extraField="result" dateLabel="점검일" extraLabel="결과" sectionTitle="점검" emptyMessage="점검 기록이 없습니다" />
              <RecordsTab equipmentId={equipmentId} kind="maintenance" dateField="occurredAt" extraField="action" dateLabel="발생일" extraLabel="조치" sectionTitle="고장이력" emptyMessage="고장 기록이 없습니다" />
            </>
          )}
          {tab === '사진' && <PhotoCard equipmentId={equipmentId} />}
        </div>
      </div>
      <BreakerEditor equipmentId={equipmentId} equipmentName={eq.name} count={eq.circuitCount} open={breakers !== null} focusNo={breakers?.at ?? null} onAdd={addBreaker} onClose={() => setBreakers(null)} />
      {confirmDialog}
    </ViewCard>
  );
}
