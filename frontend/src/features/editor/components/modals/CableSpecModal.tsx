import { useMemo, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
  useCableDrawing,
  useInteractionStore,
  getCableDrawing,
} from '../../stores/interactionStore';
import { useCableCategories } from '../../../cables/hooks/useCableCategories';
import { getCableTypeFromMaterial } from '../../../../types/material';
import type { CableCategory } from '../../../../types/cableCategory';
import { calculatePathLength } from '../../../../utils/cable/pathLength';
import { generateTempId } from '../../../../utils/idHelpers';
import { MaterialSelectionModal } from '../MaterialSelectionModal';

export function CableSpecModalWrapper() {
  return <CableSpecModal />;
}

/**
 * P9: cable category picker shown after the user finishes drawing source →
 * waypoints → target. Categories filtered by `preselectedCableDisplayGroup`
 * (sidebar pill), or all categories when no group is preselected.
 *
 * CM-B: pathPoints 자체가 cm 단위이므로 scaleRatio 인자 없이 길이 계산.
 */
function CableSpecModal() {
  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const addCable = useEditorStore((s) => s.addCable);
  const preselectedGroup = useEditorStore(
    (s) => s.preselectedCableDisplayGroup,
  );
  const { data: cableCategories } = useCableCategories();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Reset selection when the modal opens.
  useEffect(() => {
    if (phase === 'selectingSpec') {
      setSelectedCategoryId(null);
    }
  }, [phase]);

  const visibleCategories = useMemo<CableCategory[]>(() => {
    const all = (cableCategories ?? []).filter((c) => c.isActive);
    if (!preselectedGroup) return all;
    return all.filter((c) => c.displayGroup === preselectedGroup);
  }, [cableCategories, preselectedGroup]);

  if (phase !== 'selectingSpec') return null;

  const selectedCat = selectedCategoryId
    ? visibleCategories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedCat) return;
    const data = getCableDrawing();
    if (!data) return;
    const pathPoints = useInteractionStore.getState().cableGetPathPoints();
    const cableType = getCableTypeFromMaterial(selectedCat.code);

    // pathPoints 가 cm 좌표 — calculatePathLength 가 cm 길이를 직접 돌려준다.
    const { pathLength, bufferLength, totalLength } = calculatePathLength(pathPoints);

    // For OFD ports we attach the fiberPath via either side. The model uses
    // single `fiberPathId / fiberPortNumber` fields so target-side wins when
    // both endpoints are OFDs (rare; usually only one side is fiber-tracked).
    const fiberPathId = data.targetFiberPathId ?? data.sourceFiberPathId ?? null;
    const fiberPortNumber = data.targetPortNumber ?? data.sourcePortNumber ?? null;

    addCable({
      id: generateTempId(),
      sourceEquipmentId: data.sourceEquipmentId ?? '',
      targetEquipmentId: data.targetEquipmentId ?? '',
      sourceModuleId: data.sourceModuleId ?? null,
      targetModuleId: data.targetModuleId ?? null,
      cableType,
      categoryId: selectedCat.id,
      categoryCode: selectedCat.code,
      categoryName: selectedCat.name,
      displayColor: selectedCat.displayColor,
      specParams: {},
      specification: selectedCat.name,
      pathPoints,
      pathLength,
      bufferLength,
      totalLength,
      fiberPathId,
      fiberPortNumber,
    });

    useInteractionStore.getState().cancel();
  };

  const handleCancel = () => {
    useInteractionStore.getState().cancel();
  };

  return (
    <MaterialSelectionModal
      title={
        preselectedGroup
          ? `케이블 — ${preselectedGroup}`
          : '케이블 카테고리 선택'
      }
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!selectedCat}
      selectedLabel={selectedCat?.name}
    >
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {visibleCategories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            사용 가능한 카테고리가 없습니다.
          </p>
        ) : (
          visibleCategories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            const swatch = cat.displayColor ?? '#9ca3af';
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  active
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: swatch }}
                />
                <span className="text-sm text-gray-800 text-left flex-1 truncate">
                  {cat.name}
                </span>
                {cat.displayGroup && (
                  <span className="text-[11px] text-gray-400">
                    {cat.displayGroup}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </MaterialSelectionModal>
  );
}
