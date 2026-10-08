import { useMemo, useState } from 'react';
import { Button, EmptyState, Tabs, ViewCard, useConfirm, useTabs, type TabItem, EMPTY } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { addCircuit, deleteRows, equipmentDeleteSummary } from '../../model/store/deleteActions';
import { alsoDeleted, deleteConfirm } from '../deleteConfirm';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { HistoryTab } from '../detail/HistoryTab';
import { PhotoCard } from '../detail/PhotoCard';
import { RecordsTab } from '../detail/RecordsTab';
import { BreakerEditor } from './BreakerEditor';
import { CircuitCard } from './CircuitCard';
import { EquipmentInfoCard } from './EquipmentInfoCard';
import { LinkList } from './LinkList';
import { PanelsCard, useSlotEnds } from './PanelsCard';
import { EditOnly } from '../../useCanEdit';
import { RECORD_FIELD_LABELS as R } from './fieldLabels';
import type { BlockFocus } from '../../useWorkspaceRoute';

type Tab = '정보' | '연결' | '점검·고장' | '사진' | '이력';
const TABS: readonly TabItem<Tab>[] = (['정보', '연결', '점검·고장', '사진', '이력'] as const).map((k) => ({ key: k, label: k }));

/** 설비 상세 — 정보 · 연결 · 점검·고장 · 사진 · 이력. */
export function EquipmentDetail({ equipmentId, onClose, onDeleted, onOpenBlock, onOpenPower }: {
  equipmentId: string; onClose: () => void; onDeleted: () => void;
  /** 슬롯 줄 → 선번장의 그 블록(주소). 없으면 줄은 읽기만 한다. */
  onOpenBlock?: (focus: BlockFocus) => void;
  /** 차단기 카드·연결 탭 「입력 전원」 → 전원 계통 차단기 대장의 이 설비 블록(주소). 없으면 그 길을 두지 않는다. */
  onOpenPower?: (equipmentId: string) => void;
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

  if (!eq) return <ViewCard><EmptyState title="선택된 설비가 없습니다" /></ViewCard>;

  /**
   * 설비 삭제 — 함께 가는 것을 **다 적는다**(`expandDeletes` 펼침): 차단기·연결·점검·고장 이력·사진, 그리고 다른 국까지 닿는
   * 광선로 접속 해제(대국별). 정보 탭에서는 연결·기록·사진·선번장이 보이지 않으므로 여기서 말하지 않으면 모른 채 지운다.
   */
  async function remove() {
    const n = equipmentDeleteSummary(equipmentId);
    const lineCount = new Set(n.lineEnds.map((e) => e.lineId)).size;
    const byStation = new Map<string, number>();
    for (const e of n.lineEnds) byStation.set(e.farSubstation, (byStation.get(e.farSubstation) ?? 0) + 1);
    const effects = [
      alsoDeleted([['차단기', n.circuits], ['연결', n.links], ['점검 기록', n.inspections], ['고장 기록', n.maintenance], ['사진', n.photos]]),
      lineCount > 0
        ? `광선로 ${lineCount}개의 접속 설비가 해제됩니다 — 대국 ${[...byStation].map(([name, k]) => `${name || EMPTY} ${k}개`).join(' · ')}.`
        : null,
    ].filter((x): x is string => x != null);
    if (!(await confirm(deleteConfirm('설비', eq!.name, effects)))) return;
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
      actions={<Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>}
      /* 패널 탭 — 제목 띠 아래 고정 띠, 줄을 고르게 채운다(§3.7). 긴 정보 탭을 내려도 탭은 남는다. */
      tabs={<Tabs {...tabs.list} variant="panel" aria-label="설비 상세" items={TABS} onChange={setTab} />}
      /* 탭을 바꾸면 본문은 맨 위에서 연다(탭 띠는 고정이라 스크롤이 탭을 넘어 남는다). */
      scrollKey={tab}
      body="scroll"
    >
        <div {...tabs.panel} className="flex flex-col gap-3">
          {tab === '정보' && (
            <>
              <EquipmentInfoCard
                eq={eq} catalog={catalog} onDelete={remove}
                /* 없는 절을 만드는 길은 정보 카드 끝의 작은 단추다(머리 띠에는 닫기만) — 차단기가 하나도 없을 때·슬롯이 없을 때만.
                   누르면 차단기는 편집 창이 그 줄로, 슬롯은 슬롯 카드가 슬롯 수 칸을 연 채로 선다. */
                footer={(eq.circuitCount === 0 || (!hasSlots && !slotEditing)) && (
                  <EditOnly>
                    {eq.circuitCount === 0 && <Button variant="ghost" size="xs" onClick={addBreaker}>차단기 추가</Button>}
                    {!hasSlots && !slotEditing && <Button variant="ghost" size="xs" onClick={() => setSlotEditing(true)}>슬롯 수 지정</Button>}
                  </EditOnly>
                )}
              />
              <CircuitCard equipmentId={equipmentId} onEdit={(at) => setBreakers({ at })} onAdd={addBreaker} onOpenPower={onOpenPower && (() => onOpenPower(equipmentId))} />
              {(hasSlots || slotEditing) && (
                <PanelsCard
                  equipmentId={equipmentId} panelCount={eq.panelCount} onOpenBlock={onOpenBlock}
                  editCount={slotEditing} onEditingChange={setSlotEditing}
                />
              )}
            </>
          )}
          {tab === '연결' && <LinkList equipmentId={equipmentId} substationId={eq.substationId} onOpenPower={onOpenPower && (() => onOpenPower(equipmentId))} />}
          {tab === '점검·고장' && (
            <>
              <RecordsTab equipmentId={equipmentId} kind="inspections" dateField="inspectedAt" extraField="result" dateLabel={R.inspectedAt} extraLabel={R.result} sectionTitle="점검 기록" emptyMessage="점검 기록이 없습니다" />
              <RecordsTab equipmentId={equipmentId} kind="maintenance" dateField="occurredAt" extraField="action" dateLabel={R.occurredAt} extraLabel={R.action} sectionTitle="고장 기록" emptyMessage="고장 기록이 없습니다" />
            </>
          )}
          {tab === '사진' && <PhotoCard equipmentId={equipmentId} />}
          {tab === '이력' && <HistoryTab equipmentId={equipmentId} />}
        </div>
      <BreakerEditor equipmentId={equipmentId} equipmentName={eq.name} count={eq.circuitCount} open={breakers !== null} focusNo={breakers?.at ?? null} onAdd={addBreaker} onClose={() => setBreakers(null)} />
      {confirmDialog}
    </ViewCard>
  );
}
