import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { RACK_SLOT_COUNT } from '../../../../types/rackModule';
import type { Asset } from '../../../../types/asset';
import { EmptySlot } from './EmptySlot';
import { ModuleCell } from './ModuleCell';
import { CategoryComboboxPopover } from './CategoryComboboxPopover';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import { availableSpanAt, buildRackModule, nextNameFor } from '../../utils/slotGeometry';
import { SlotRailGrid } from '../../../../components/SlotRailGrid';

interface Props {
  rackEquipmentId: string;
  modules: Asset[];
}

/**
 * 12-슬롯 고정 그리드.
 *
 * 중요: 모든 그리드 아이템 (ModuleCell, EmptySlot, 드래그 인디케이터) 은
 * 자기 자리를 **explicit gridRowStart/End** 로 선언한다. auto-flow 를 쓰지
 * 않으므로 드래그 인디케이터가 원본 셀과 같은 슬롯에 겹쳐도 원본 셀이
 * 다른 슬롯으로 밀려나지 않는다 (이전 버전 버그).
 */
export function RackSlotGrid({ rackEquipmentId, modules }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const addingAtSlot = useEditorStore((s) => s.addingAtSlot);
  const setAddingAtSlot = useEditorStore((s) => s.setAddingAtSlot);
  const { data: categories } = useRackModuleCategories();

  const anchorRef = useRef<DOMRect | null>(null);

  const handleEmptyClick = (slotIndex: number, anchor: DOMRect) => {
    anchorRef.current = anchor;
    setAddingAtSlot({ rackEquipmentId, slotIndex });
  };

  // 슬롯 기하(availableSpanAt) 용 non-null shape — 랙모듈 Asset 은 slotIndex/slotSpan 가 항상 채워짐.
  const sizedModules = modules.map((m) => ({
    id: m.id,
    slotIndex: m.slotIndex ?? 0,
    slotSpan: m.slotSpan ?? 1,
  }));

  const handlePick = (catId: string) => {
    if (!addingAtSlot) return;
    const cat = (categories ?? []).find((c) => c.id === catId);
    if (!cat) return;
    const avail = availableSpanAt(sizedModules, addingAtSlot.slotIndex);
    if (avail < 1) {
      setAddingAtSlot(null);
      return;
    }
    const slotSpan = Math.min(cat.defaultSlotSpan, avail);
    // SSOT-2d Task 4 — 랙모듈 생성을 통합 스토어 stage 액션으로.
    useSubstationWorkingCopy.getState().stageRackModuleCreate(buildRackModule({
      rackEquipmentId,
      category: cat,
      slotIndex: addingAtSlot.slotIndex,
      slotSpan,
      name: nextNameFor(modules, cat),
    }));
    setAddingAtSlot(null);
  };

  // 각 슬롯이 어떤 모듈에 속하는지 (없으면 빈 슬롯).
  // 자식들은 모두 explicit grid 위치를 가지므로 순서/구분 신경 안 써도 됨.
  const moduleBySlot = new Map<number, Asset>();
  for (const m of modules) moduleBySlot.set(m.slotIndex ?? 0, m);
  const occupiedAny = new Set<number>();
  for (const m of modules) {
    const start = m.slotIndex ?? 0;
    const span = m.slotSpan ?? 1;
    for (let i = start; i < start + span; i++) occupiedAny.add(i);
  }

  const children: React.ReactNode[] = [];
  for (let i = 0; i < RACK_SLOT_COUNT; i++) {
    const mod = moduleBySlot.get(i);
    if (mod) {
      children.push(
        <ModuleCell
          key={mod.id}
          module={mod}
          siblings={modules}
          gridRef={gridRef}
        />,
      );
      continue;
    }
    if (occupiedAny.has(i)) continue; // 위쪽 모듈이 차지한 slot — 아무 것도 안 그림
    const isActive =
      !!addingAtSlot &&
      addingAtSlot.rackEquipmentId === rackEquipmentId &&
      addingAtSlot.slotIndex === i;
    children.push(
      <EmptySlot
        key={`empty-${i}`}
        slotIndex={i}
        isActive={isActive}
        onClick={(anchor) => handleEmptyClick(i, anchor)}
      />,
    );
  }

  const isEmpty = modules.length === 0;

  return (
    <div className="flex-1 px-2 pb-2 min-h-0 relative">
      {/* 랙 프레임 — SlotRailGrid 공용 컴포넌트(랙·OFD 공유). */}
      <SlotRailGrid slotCount={RACK_SLOT_COUNT} gridRef={gridRef}>
        {children}
      </SlotRailGrid>
      {isEmpty && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-4"
        >
          <div className="bg-surface/90 backdrop-blur-sm border border-info rounded-lg px-4 py-3 text-center shadow-sm">
            <p className="text-sm text-content font-medium">비어 있는 랙입니다</p>
            <p className="text-xs text-content-muted mt-1">슬롯을 클릭해서 모듈 추가</p>
            <p className="text-xs text-content-faint mt-0.5">또는 상단 [프리셋 적용]</p>
          </div>
        </div>
      )}
      {addingAtSlot && addingAtSlot.rackEquipmentId === rackEquipmentId && anchorRef.current && (
        <CategoryComboboxPopover
          anchorRect={anchorRef.current}
          availableSpan={availableSpanAt(sizedModules, addingAtSlot.slotIndex)}
          onPick={(c) => handlePick(c.id)}
          onCancel={() => setAddingAtSlot(null)}
        />
      )}
    </div>
  );
}
