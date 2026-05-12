import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { RackHeader } from './rack/RackHeader';
import { RackSlotGrid } from './rack/RackSlotGrid';

interface Props {
  equipmentId: string;
}

/**
 * P11: 12-슬롯 고정 그리드 RackView.
 * 추가는 인라인 콤보박스(EmptySlot 클릭 → CategoryComboboxPopover),
 * 편집은 중앙 모달(RackModuleDialog, 모듈 클릭).
 */
export function RackView({ equipmentId }: Props) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localRackModules = useEditorStore((s) => s.localRackModules);

  const rack = useMemo(
    () => localEquipment.find((e) => e.id === equipmentId),
    [localEquipment, equipmentId],
  );
  const modules = useMemo(
    () =>
      localRackModules
        .filter((m) => m.rackEquipmentId === equipmentId)
        .sort((a, b) => a.slotIndex - b.slotIndex),
    [localRackModules, equipmentId],
  );

  const used = modules.reduce((sum, m) => sum + m.slotSpan, 0);

  if (!rack) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">랙 장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <RackHeader used={used} />
      <RackSlotGrid rackEquipmentId={equipmentId} modules={modules} />
    </div>
  );
}
