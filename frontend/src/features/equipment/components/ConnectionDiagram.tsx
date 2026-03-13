import { useMemo } from 'react';
import { useRoomConnections } from '../../connections/hooks/useRoomConnections';
import { CABLE_TYPE_COLORS } from '../types/equipment';
import type { RoomConnection } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useMergedConnections } from '../../connections/hooks/useMergedConnections';
import { isTempId } from '../../../utils/idHelpers';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { useFiberPaths } from '../../fiber/hooks/useFiberPaths';

interface ConnectionDiagramProps {
  roomId: string;
  equipmentId: string;
}

export function ConnectionDiagram({
  roomId,
  equipmentId,
}: ConnectionDiagramProps) {
  const { data: backendConnections, isLoading } = useRoomConnections(roomId);
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const changeSet = useEditorStore((s) => s.changeSet);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
  const traceActive = usePathHighlightStore((s) => s.active);

  const allConnections = useMergedConnections(backendConnections, changeSet, localEquipment);

  const relevantConnections = useMemo(() => {
    return allConnections.filter(
      (conn) =>
        conn.sourceEquipmentId === equipmentId ||
        conn.targetEquipmentId === equipmentId
    );
  }, [allConnections, equipmentId]);

  // Find OFD equipment in the room to look up fiber path substation labels
  const ofdEquipment = useMemo(
    () => localEquipment.find((eq) => eq.category === 'OFD'),
    [localEquipment],
  );
  const { data: fiberPaths } = useFiberPaths(ofdEquipment?.id ?? '', !!ofdEquipment);

  // Map: fiberPathId → "localSub-remoteSub"
  const fiberPathLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!fiberPaths || !ofdEquipment) return map;
    for (const path of fiberPaths) {
      const isLocalA = path.ofdA.id === ofdEquipment.id;
      const localSub = isLocalA ? path.ofdA.substationName : path.ofdB.substationName;
      const remoteSub = isLocalA ? path.ofdB.substationName : path.ofdA.substationName;
      map.set(path.id, `${localSub}-${remoteSub}`);
    }
    return map;
  }, [fiberPaths, ofdEquipment]);

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-gray-500">로딩 중...</div>;
  }

  if (relevantConnections.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        연결 정보가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div className="p-3">
        <div className="space-y-2">
          {relevantConnections.map((conn: RoomConnection) => {
            const isSource = conn.sourceEquipmentId === equipmentId;
            const localEq = isSource ? conn.sourceEquipment : conn.targetEquipment;
            const remoteEquipment = isSource ? conn.targetEquipment : conn.sourceEquipment;
            const isPending = isTempId(conn.id);
            const isTracing = tracingCableId === conn.id && isTraceLoading;
            const isSelected = traceActive && tracingCableId === conn.id;
            const canTrace = !isPending;

            return (
              <div
                key={conn.id}
                onClick={canTrace ? () => startTrace(conn.id, roomId) : undefined}
                className={`rounded border px-3 py-2 transition-colors ${
                  isPending
                    ? 'border-amber-200 bg-amber-50'
                    : isSelected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                      : 'border-gray-200 bg-white hover:bg-blue-50 cursor-pointer'
                } ${isTracing ? 'ring-2 ring-blue-400 animate-pulse' : ''}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm font-medium text-gray-700">
                      {localEq.name}
                    </p>
                  </div>

                  <div className="flex flex-col items-center shrink-0">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        CABLE_TYPE_COLORS[conn.cableType] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {conn.cableType === 'FIBER' && conn.fiberPathId && conn.fiberPortNumber
                        ? `FIBER ${fiberPathLabelMap.get(conn.fiberPathId) ?? ''}#${conn.fiberPortNumber}`
                        : conn.cableType}
                    </span>
                    <div className="my-0.5 h-px w-12 bg-gray-300" />
                    {conn.label && (
                      <span className="text-xs text-gray-400">
                        {conn.label}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm font-medium text-gray-700">
                      {remoteEquipment.name}
                    </p>
                  </div>
                </div>
                {isPending && (
                  <p className="text-[10px] text-amber-600 mt-1 text-center">미저장 · 저장 후 추적 가능</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Path trace result detail */}
      <PathTraceDetail />
    </div>
  );
}
