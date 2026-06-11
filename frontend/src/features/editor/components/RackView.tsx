import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveRackModules } from '../../workingCopy/hooks';
import { RackSlotGrid } from './rack/RackSlotGrid';

interface Props {
  equipmentId: string;
}

/**
 * P11: 12-슬롯 고정 그리드 RackView.
 * 추가는 인라인 콤보박스(EmptySlot 클릭 → CategoryComboboxPopover),
 * 편집/상세는 통합 상세 패널(모듈 클릭 → openDetail → AssetDetailBody).
 */
export function RackView({ equipmentId }: Props) {
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로. 랙 존재 확인은 substation 전역
  // effective assets 에서(floorId 불필요), 모듈은 effectiveRackModulesMapped 로.
  const effectiveAssets = useEffectiveAssets();
  const rackModules = useEffectiveRackModules(equipmentId);

  const rack = useMemo(
    () => effectiveAssets.find((e) => e.id === equipmentId),
    [effectiveAssets, equipmentId],
  );
  const modules = useMemo(
    () => [...rackModules].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)),
    [rackModules],
  );

  if (!rack) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-content-faint">랙 장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <RackSlotGrid rackEquipmentId={equipmentId} modules={modules} />
    </div>
  );
}
