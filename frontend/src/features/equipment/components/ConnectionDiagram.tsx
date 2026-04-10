import { useEffect, useMemo, useState } from 'react';
import { CABLE_BADGE_CLASSES } from '../../../types/connection';
import { getCableTypeFromMaterial } from '../../../types/material';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { isTempId } from '../../../utils/idHelpers';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { useConnectionCreationStore } from '../../connections/stores/connectionCreationStore';
import { CableMaterialPicker } from '../../materials/components/CableMaterialPicker';
import { useRecentMaterialsStore } from '../../materials/stores/recentMaterialsStore';


interface ConnectionDiagramProps {
  roomId: string;
  equipmentId: string;
  /** Equipment category from SSOT — OFD connections are managed via FiberPathManager */
  category?: string;
}

export function ConnectionDiagram({
  roomId,
  equipmentId,
  category,
}: ConnectionDiagramProps) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localCables = useEditorStore((s) => s.localCables);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const selectCable = usePathHighlightStore((s) => s.selectCable);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
  const traceActive = usePathHighlightStore((s) => s.active);
  const startCreation = useConnectionCreationStore((s) => s.startCreation);
  const creationPhase = useConnectionCreationStore((s) => s.phase);
  const addRecent = useRecentMaterialsStore((s) => s.addRecent);
  const [showCableSelector, setShowCableSelector] = useState(false);

  // Unmount = context gone → clear highlight automatically.
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  const relevantCables = useMemo(() => {
    return localCables.filter(
      (cable) =>
        cable.sourceEquipmentId === equipmentId ||
        cable.targetEquipmentId === equipmentId
    );
  }, [localCables, equipmentId]);

  const handleMaterialSelect = ({ categoryId, categoryCode, specParams, specification }: {
    categoryId: string;
    categoryCode: string;
    specParams: Record<string, unknown>;
    specification: string;
  }) => {
    const cableType = getCableTypeFromMaterial(categoryCode);
    startCreation(equipmentId, cableType, categoryId, categoryCode, specParams, specification);
    addRecent('cable', {
      categoryId,
      categoryCode,
      categoryName: specification,
      specParams,
      specification,
    });
    setShowCableSelector(false);
  };

  return (
    <div>
      <div className="p-3">
        {/* Add connection button — OFD connections are managed via FiberPathManager */}
        {category !== 'OFD' && (
        <div className="mb-3">
          {creationPhase === 'selectingTarget' ? (
            <div className="text-center text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
              캔버스에서 연결할 설비를 클릭하세요
            </div>
          ) : (
            <button
              onClick={() => { setShowCableSelector(true); clearHighlight(); }}
              className="w-full px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              + 연결 추가
            </button>
          )}
        </div>
        )}

        {/* Cable material selector modal */}
        {showCableSelector && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setShowCableSelector(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-80 overflow-hidden max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">케이블 종류/규격 선택</h3>
              </div>
              <div className="p-4">
                <CableMaterialPicker
                  value={null}
                  onChange={handleMaterialSelect}
                />
              </div>
            </div>
          </div>
        )}

        {relevantCables.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantCables.map((cable: LocalCable) => {
            const isSource = cable.sourceEquipmentId === equipmentId;
            const localEqSelf = localEquipment.find((e) => e.id === (isSource ? cable.sourceEquipmentId : cable.targetEquipmentId));
            const remoteEq = localEquipment.find((e) => e.id === (isSource ? cable.targetEquipmentId : cable.sourceEquipmentId));
            const localEqName = localEqSelf?.name ?? '';
            const remoteName = remoteEq?.name ?? '';
            const isTracing = tracingCableId === cable.id && isTraceLoading;
            const isCardSelected = traceActive && tracingCableId === cable.id;

            const handleClick = () => {
              if (isCardSelected) {
                clearHighlight();
              } else if (isTempId(cable.id)) {
                selectCable(cable.id);
              } else {
                startTrace(cable.id, roomId);
              }
            };

            const handleDelete = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!confirm(`${remoteName} 연결을 삭제하시겠습니까?`)) return;
              deleteCable(cable.id);
              clearHighlight();
            };

            return (
              <div key={cable.id}>
                <div
                  onClick={handleClick}
                  className={`group relative rounded border px-3 py-2 transition-colors cursor-pointer ${
                    isCardSelected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                      : isTempId(cable.id)
                        ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                        : 'border-gray-200 bg-white hover:bg-blue-50'
                  } ${isTracing ? 'ring-2 ring-blue-400 animate-pulse' : ''}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {localEqName}
                      </p>
                    </div>

                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          CABLE_BADGE_CLASSES[cable.cableType] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {cable.materialCategoryCode || cable.cableType}
                      </span>
                      <div className="my-0.5 h-px w-12 bg-gray-300" />
                    </div>

                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {remoteName}
                      </p>
                    </div>
                  </div>
                  {cable.cableType === 'FIBER' && cable.fiberPortNumber != null && (
                    <p className="mt-1 text-[11px] text-gray-400 text-center truncate">
                      광경로
                      {` #${cable.fiberPortNumber}`}
                    </p>
                  )}
                </div>
                {isCardSelected && (
                  <div className="flex justify-end pr-1">
                    <button
                      onClick={handleDelete}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Path trace result detail */}
      <PathTraceDetail />
    </div>
  );
}
