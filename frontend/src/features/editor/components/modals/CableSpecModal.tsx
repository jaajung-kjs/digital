import { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useCableDrawingStore } from '../../../connections/stores/cableDrawingStore';
import { useRecentMaterialsStore } from '../../../materials/stores/recentMaterialsStore';
import { CableMaterialPicker } from '../../../materials/components/CableMaterialPicker';
import { getCableTypeFromMaterial } from '../../../../types/material';
import { calculatePathLength } from '../../../../utils/cable/pathLength';
import { generateTempId } from '../../../../utils/idHelpers';
import { MaterialSelectionModal } from '../MaterialSelectionModal';

export function CableSpecModalWrapper() {
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  return <CableSpecModal scaleRatio={scaleRatio} />;
}

function CableSpecModal({ scaleRatio }: { scaleRatio: number | null }) {
  const phase = useCableDrawingStore((s) => s.phase);
  const addCable = useEditorStore((s) => s.addCable);
  const addRecentCable = useRecentMaterialsStore((s) => s.addRecent);
  const [pendingValue, setPendingValue] = useState<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    displayColor: string | null;
    specParams: Record<string, unknown>;
    specification: string;
  } | null>(null);

  // Reset pending value when modal opens
  useEffect(() => {
    if (phase === 'selectingSpec') {
      setPendingValue(null);
    }
  }, [phase]);

  if (phase !== 'selectingSpec') return null;

  const handleConfirm = () => {
    if (!pendingValue) return;
    const { categoryId, categoryCode, categoryName, displayColor, specParams, specification } = pendingValue;
    const store = useCableDrawingStore.getState();
    const pathPoints = store.getPathPoints();
    const cableType = getCableTypeFromMaterial(categoryCode);

    let pathLength = 0;
    let bufferLength = 4;
    let totalLength = 4;
    if (scaleRatio && scaleRatio > 0) {
      const calc = calculatePathLength(pathPoints, scaleRatio);
      pathLength = calc.pathLength;
      bufferLength = calc.bufferLength;
      totalLength = calc.totalLength;
    }

    addCable({
      id: generateTempId(),
      sourceEquipmentId: store.sourceEquipmentId!,
      targetEquipmentId: store.targetEquipmentId!,
      cableType,
      materialCategoryId: categoryId,
      materialCategoryCode: categoryCode,
      materialCategoryName: categoryName,
      displayColor,
      specParams,
      specification,
      pathPoints,
      pathLength,
      bufferLength,
      totalLength,
    });

    addRecentCable('cable', {
      categoryId,
      categoryCode,
      categoryName,
      specParams,
      specification,
    });

    store.complete();
  };

  const handleCancel = () => {
    useCableDrawingStore.getState().cancel();
  };

  return (
    <MaterialSelectionModal
      title="케이블 자재 선택"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!pendingValue}
      selectedLabel={pendingValue?.specification}
    >
      <CableMaterialPicker
        value={pendingValue ? { categoryId: pendingValue.categoryId, specParams: pendingValue.specParams } : null}
        onChange={setPendingValue}
      />
    </MaterialSelectionModal>
  );
}
