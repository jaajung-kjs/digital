import { useMemo, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useCableDrawingStore } from '../../../connections/stores/cableDrawingStore';
import { useCableCategories } from '../../../cables/hooks/useCableCategories';
import { getCableTypeFromMaterial } from '../../../../types/material';
import type { CableCategory } from '../../../../types/cableCategory';
import { calculatePathLength } from '../../../../utils/cable/pathLength';
import { generateTempId } from '../../../../utils/idHelpers';
import { MaterialSelectionModal } from '../MaterialSelectionModal';

export function CableSpecModalWrapper() {
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  return <CableSpecModal scaleRatio={scaleRatio} />;
}

/**
 * P9: cable category picker shown after the user finishes drawing source →
 * waypoints → target. Categories filtered by `preselectedCableDisplayGroup`
 * (sidebar pill), or all categories when no group is preselected.
 */
function CableSpecModal({ scaleRatio }: { scaleRatio: number | null }) {
  const phase = useCableDrawingStore((s) => s.phase);
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
    const store = useCableDrawingStore.getState();
    const pathPoints = store.getPathPoints();
    const cableType = getCableTypeFromMaterial(selectedCat.code);

    let pathLength = 0;
    let bufferLength = 4;
    let totalLength = 4;
    if (scaleRatio && scaleRatio > 0) {
      const calc = calculatePathLength(pathPoints, scaleRatio);
      pathLength = calc.pathLength;
      bufferLength = calc.bufferLength;
      totalLength = calc.totalLength;
    }

    // For OFD ports we attach the fiberPath via either side. The model uses
    // single `fiberPathId / fiberPortNumber` fields so target-side wins when
    // both endpoints are OFDs (rare; usually only one side is fiber-tracked).
    const fiberPathId = store.targetFiberPathId ?? store.sourceFiberPathId ?? null;
    const fiberPortNumber = store.targetPortNumber ?? store.sourcePortNumber ?? null;

    addCable({
      id: generateTempId(),
      sourceEquipmentId: store.sourceEquipmentId ?? '',
      targetEquipmentId: store.targetEquipmentId ?? '',
      sourceModuleId: store.sourceModuleId ?? null,
      targetModuleId: store.targetModuleId ?? null,
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

    store.complete();
  };

  const handleCancel = () => {
    useCableDrawingStore.getState().cancel();
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
