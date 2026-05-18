import { useCallback, useEffect, useMemo } from 'react';
import { CABLE_COLORS } from '../../../types/connection';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';


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
  const editorDistCircuits = useEditorStore((s) => s.localDistributionCircuits);
  const deleteCable = useEditorStore((s) => s.deleteCable);

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

  // Unmount = context gone → clear highlight automatically.
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  // 랙이면 자식 모듈, 분전반이면 자식 회로에 연결된 cable 도 "이 설비의 연결".
  const childModuleIds = useMemo(
    () =>
      new Set(
        editorRackModules
          .filter((m) => m.rackEquipmentId === equipmentId)
          .map((m) => m.id),
      ),
    [editorRackModules, equipmentId],
  );
  const childCircuitIds = useMemo(
    () =>
      new Set(
        editorDistCircuits
          .filter((c) => c.distributionEquipmentId === equipmentId)
          .map((c) => c.id),
      ),
    [editorDistCircuits, equipmentId],
  );

  const isSelfSide = useCallback(
    (
      eqId: string | null | undefined,
      modId: string | null | undefined,
      circuitId: string | null | undefined,
    ) =>
      eqId === equipmentId ||
      (!!modId && childModuleIds.has(modId)) ||
      (!!circuitId && childCircuitIds.has(circuitId)),
    [equipmentId, childModuleIds, childCircuitIds],
  );

  const relevantCables = useMemo(() => {
    return localCables.filter(
      (cable) =>
        isSelfSide(cable.sourceEquipmentId, cable.sourceModuleId, cable.sourceCircuitId) ||
        isSelfSide(cable.targetEquipmentId, cable.targetModuleId, cable.targetCircuitId),
    );
  }, [localCables, isSelfSide]);

  return (
    <div>
      <div className="p-3">
        {relevantCables.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantCables.map((cable: LocalCable) => {
            const sourceIsSelf = isSelfSide(
              cable.sourceEquipmentId,
              cable.sourceModuleId,
              cable.sourceCircuitId,
            );
            const selfModuleId = sourceIsSelf ? cable.sourceModuleId : cable.targetModuleId;
            const selfCircuitId = sourceIsSelf ? cable.sourceCircuitId : cable.targetCircuitId;
            const remoteEqId = sourceIsSelf ? cable.targetEquipmentId : cable.sourceEquipmentId;
            const remoteModuleId = sourceIsSelf ? cable.targetModuleId : cable.sourceModuleId;
            const remoteCircuitId = sourceIsSelf ? cable.targetCircuitId : cable.sourceCircuitId;

            const selfModule = selfModuleId
              ? editorRackModules.find((m) => m.id === selfModuleId)
              : null;
            const selfCircuit = selfCircuitId
              ? editorDistCircuits.find((c) => c.id === selfCircuitId)
              : null;
            const localEqName =
              selfModule?.name ??
              (selfCircuit ? `${selfCircuit.feederName}/${selfCircuit.branchName}` : null) ??
              localEquipment.find((e) => e.id === equipmentId)?.name ??
              '';

            const remoteModule = remoteModuleId
              ? editorRackModules.find((m) => m.id === remoteModuleId)
              : null;
            const remoteCircuit = remoteCircuitId
              ? editorDistCircuits.find((c) => c.id === remoteCircuitId)
              : null;
            const remoteName =
              remoteModule?.name ??
              (remoteCircuit
                ? `${remoteCircuit.feederName}/${remoteCircuit.branchName}`
                : null) ??
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
                      경로
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
