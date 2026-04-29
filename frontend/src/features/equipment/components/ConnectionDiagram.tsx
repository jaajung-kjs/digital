import { useCallback, useEffect, useMemo } from 'react';
import { CABLE_COLORS } from '../../../types/connection';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';


interface ConnectionDiagramProps {
  floorId: string;
  equipmentId: string;
}

export function ConnectionDiagram({
  floorId,
  equipmentId,
}: ConnectionDiagramProps) {
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const editorCables = useEditorStore((s) => s.localCables);
  const editorRackModules = useEditorStore((s) => s.localRackModules);
  const deleteCable = useEditorStore((s) => s.deleteCable);

  // P9: derive OFD-ness from kind on the local equipment row.
  const localEqKind = editorEquipment.find((e) => e.id === equipmentId)?.kind;
  const isOfd = localEqKind === 'OFD';

  // Snapshot overlay: when active, show snapshot data instead of editor data
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotCables = useSnapshotStore((s) => s.cables);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);

  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;
  const localCables = snapshotActive ? (snapshotCables as unknown as LocalCable[]) : editorCables;
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
  const traceActive = usePathHighlightStore((s) => s.active);
  const cableDrawingPhase = useCableDrawingStore((s) => s.phase);

  // Unmount = context gone → clear highlight automatically.
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  // 랙이면 자식 모듈에 연결된 cable 도 "이 랙의 연결" 로 포함.
  const childModuleIds = useMemo(
    () =>
      new Set(
        editorRackModules
          .filter((m) => m.rackEquipmentId === equipmentId)
          .map((m) => m.id),
      ),
    [editorRackModules, equipmentId],
  );

  const isSelfSide = useCallback(
    (eqId: string | null | undefined, modId: string | null | undefined) =>
      eqId === equipmentId || (!!modId && childModuleIds.has(modId)),
    [equipmentId, childModuleIds],
  );

  const relevantCables = useMemo(() => {
    return localCables.filter(
      (cable) =>
        isSelfSide(cable.sourceEquipmentId, cable.sourceModuleId) ||
        isSelfSide(cable.targetEquipmentId, cable.targetModuleId),
    );
  }, [localCables, isSelfSide]);

  const handleStartCableDrawing = () => {
    clearHighlight();
    // Find this equipment to compute its center position
    const eq = localEquipment.find((e) => e.id === equipmentId);
    if (!eq) return;
    const center = { x: eq.positionX + eq.width / 2, y: eq.positionY + eq.height / 2 };
    // Activate cable tool and pre-set source (skip selectingSource phase)
    useEditorStore.getState().setTool('cable');
    useCableDrawingStore.getState().setSource(equipmentId, center);
    // Close equipment detail panel so user can draw on canvas
    useEditorStore.getState().setDetailPanelEquipmentId(null);
  };

  return (
    <div>
      <div className="p-3">
        {/* Add connection button — OFD connections are managed via FiberPathManager, hidden during snapshot preview */}
        {!snapshotActive && !isOfd && (
        <div className="mb-3">
          {cableDrawingPhase !== 'idle' ? (
            <div className="text-center text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
              캔버스에서 경로를 그리세요
            </div>
          ) : (
            <button
              onClick={handleStartCableDrawing}
              className="w-full px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              + 연결 추가
            </button>
          )}
        </div>
        )}

        {relevantCables.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantCables.map((cable: LocalCable) => {
            const sourceIsSelf = isSelfSide(cable.sourceEquipmentId, cable.sourceModuleId);
            const selfModuleId = sourceIsSelf ? cable.sourceModuleId : cable.targetModuleId;
            const remoteEqId = sourceIsSelf ? cable.targetEquipmentId : cable.sourceEquipmentId;
            const remoteModuleId = sourceIsSelf ? cable.targetModuleId : cable.sourceModuleId;

            const selfModule = selfModuleId
              ? editorRackModules.find((m) => m.id === selfModuleId)
              : null;
            const localEqName =
              selfModule?.name ?? localEquipment.find((e) => e.id === equipmentId)?.name ?? '';

            const remoteModule = remoteModuleId
              ? editorRackModules.find((m) => m.id === remoteModuleId)
              : null;
            const remoteName =
              remoteModule?.name ??
              (remoteEqId ? localEquipment.find((e) => e.id === remoteEqId)?.name ?? '' : '');
            const isTracing = tracingCableId === cable.id && isTraceLoading;
            const isCardSelected = traceActive && tracingCableId === cable.id;

            const handleClick = () => {
              if (isCardSelected) {
                clearHighlight();
              } else {
                startTrace(cable.id, floorId);
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
                        className="rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280',
                          color: '#ffffff',
                        }}
                      >
                        {cable.categoryName || cable.categoryCode || cable.cableType}
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
                {isCardSelected && !snapshotActive && (
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
