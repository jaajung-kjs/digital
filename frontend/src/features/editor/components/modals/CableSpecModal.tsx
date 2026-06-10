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
    // endpoint 는 "정밀 자산 하나"만 — 백엔드 assertCableEndpointsValid 가
    // equipmentId/moduleId/circuitId 중 정확히 하나를 요구한다. 회로>모듈>설비 우선
    // (모듈/회로면 그 id 만, 부모 설비 id 는 넣지 않는다). 도면 위치는 floorAnchor 가
    // 이 정밀 id 를 부모(랙/분전반)로 해소해 시각화한다 — 데이터엔 진짜 endpoint 만.
    const oneEndpoint = (eqId?: string | null, modId?: string | null, circId?: string | null) =>
      circId
        ? { equipmentId: null, moduleId: null, circuitId: circId }
        : modId
          ? { equipmentId: null, moduleId: modId, circuitId: null }
          : { equipmentId: eqId ?? null, moduleId: null, circuitId: null };
    // 단계3a — endpoint 단일 assetId 동기화. 설비/모듈 endpoint 는 정밀 asset id
    //   (moduleId ?? equipmentId) 를 assetId 로 stage 한다 → READ 가 floorAnchor 로 해소.
    //   회로 endpoint 는 picker 가 아직 옛 circuitId 를 주므로(분기 asset 전환은 3b)
    //   assetId 는 null 로 두고 기존 nested 만 유지(회로 DRAWING 깨지 않음).
    const oneAssetId = (eqId?: string | null, modId?: string | null, circId?: string | null) =>
      circId ? null : (modId ?? eqId ?? null);
    // SSOT-2d Task 4 — 케이블 생성을 통합 스토어 stage 액션으로.
    useSubstationWorkingCopy.getState().stageCableCreate({
      id: newCableId,
      sourceAssetId: oneAssetId(data.sourceEquipmentId, data.sourceModuleId, data.sourceCircuitId),
      targetAssetId: oneAssetId(data.targetEquipmentId, data.targetModuleId, data.targetCircuitId),
      source: oneEndpoint(data.sourceEquipmentId, data.sourceModuleId, data.sourceCircuitId),
      target: oneEndpoint(data.targetEquipmentId, data.targetModuleId, data.targetCircuitId),
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
