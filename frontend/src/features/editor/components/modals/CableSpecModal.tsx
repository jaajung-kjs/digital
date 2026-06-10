import { useMemo, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
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
import { useToastStore } from '../../stores/toastStore';

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
    const pathPoints: [number, number][] = [];
    if (data.sourcePosition) pathPoints.push([data.sourcePosition.x, data.sourcePosition.y]);
    pathPoints.push(...data.waypoints);
    if (data.targetPosition) pathPoints.push([data.targetPosition.x, data.targetPosition.y]);
    const cableType = getCableTypeFromMaterial(selectedCat.code);

    // pathPoints 가 cm 좌표 — calculatePathLength 가 cm 길이를 직접 돌려준다.
    const { pathLength, bufferLength, totalLength } = calculatePathLength(pathPoints);

    // For OFD ports we attach the fiberPath via either side. The model uses
    // single `fiberPathId / fiberPortNumber` fields so target-side wins when
    // both endpoints are OFDs (rare; usually only one side is fiber-tracked).
    const fiberPathId = data.targetFiberPathId ?? data.sourceFiberPathId ?? null;
    const fiberPortNumber = data.targetPortNumber ?? data.sourcePortNumber ?? null;

    const newCableId = generateTempId();
    // SSOT-2d Task 4 — 케이블 생성을 통합 스토어 stage 액션으로.
    useSubstationWorkingCopy.getState().stageCableCreate({
      id: newCableId,
      // 정규 shape — nested source/target 만. 스토어 effective(층 필터·삭제 캐스케이드)와
      // 커밋 페이로드(백엔드 cableEndpoint)가 이 nested 형태를 요구한다. 렌더/트레이서가
      // 먹는 flat 뷰는 cableDtoToLocal 이 nested 에서 파생(+anchor 로 위치 해소)하므로
      // 여기서 flat sourceEquipmentId/... 를 denormalize 하지 않는다(변조 제거).
      source: {
        equipmentId: data.sourceEquipmentId ?? null,
        moduleId: data.sourceModuleId ?? null,
        circuitId: data.sourceCircuitId ?? null,
      },
      target: {
        equipmentId: data.targetEquipmentId ?? null,
        moduleId: data.targetModuleId ?? null,
        circuitId: data.targetCircuitId ?? null,
      },
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
    useEditorStore.getState().setSelectedCableId(newCableId);
    useEditorStore.getState().setTool('select');
    useToastStore.getState().showToast('케이블을 연결했습니다');
  };

  const handleCancel = () => {
    useInteractionStore.getState().cancel();
    useEditorStore.getState().setTool('select');
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
          <p className="text-sm text-content-faint text-center py-6">
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
                    ? 'border-primary bg-info-bg ring-1 ring-primary/30'
                    : 'border-line hover:bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: swatch }}
                />
                <span className="text-sm text-content text-left flex-1 truncate">
                  {cat.name}
                </span>
                {cat.displayGroup && (
                  <span className="text-[11px] text-content-faint">
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
