import { useMemo } from 'react';
import { useRoomConnections } from '../../connections/hooks/useRoomConnections';
import { CABLE_TYPE_COLORS } from '../types/equipment';
import type { RoomConnection } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useMergedConnections } from '../../connections/hooks/useMergedConnections';
import { isTempId } from '../../../utils/idHelpers';

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

  const allConnections = useMergedConnections(backendConnections, changeSet, localEquipment);

  const relevantConnections = useMemo(() => {
    return allConnections.filter(
      (conn) =>
        conn.sourceEquipmentId === equipmentId ||
        conn.targetEquipmentId === equipmentId
    );
  }, [allConnections, equipmentId]);

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
    <div className="p-3">
      <div className="space-y-2">
        {relevantConnections.map((conn: RoomConnection) => {
          const isSource = conn.sourceEquipmentId === equipmentId;
          const localEq = isSource ? conn.sourceEquipment : conn.targetEquipment;
          const remoteEquipment = isSource ? conn.targetEquipment : conn.sourceEquipment;
          const isPending = isTempId(conn.id);

          return (
            <div
              key={conn.id}
              className={`rounded border px-3 py-2 ${isPending ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}
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
                    {conn.cableType}
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
                <p className="text-[10px] text-amber-600 mt-1 text-center">미저장</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
