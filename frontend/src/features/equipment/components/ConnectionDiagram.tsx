import { useMemo } from 'react';
import { useRoomConnections } from '../hooks/useConnections';
import { CABLE_TYPE_COLORS } from '../types/equipment';
import type { RoomConnection } from '../../../types/connection';

interface ConnectionDiagramProps {
  roomId: string;
  equipmentId: string;
}

export function ConnectionDiagram({
  roomId,
  equipmentId,
}: ConnectionDiagramProps) {
  const { data: connections, isLoading } = useRoomConnections(roomId);

  const relevantConnections = useMemo(() => {
    if (!connections) return [];
    return connections.filter(
      (conn: RoomConnection) =>
        conn.sourceEquipment.id === equipmentId ||
        conn.targetEquipment.id === equipmentId
    );
  }, [connections, equipmentId]);

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
          const isSource = conn.sourceEquipment.id === equipmentId;
          const localEquipment = isSource ? conn.sourceEquipment : conn.targetEquipment;
          const remoteEquipment = isSource ? conn.targetEquipment : conn.sourceEquipment;

          return (
            <div
              key={conn.cable.id}
              className="rounded border border-gray-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                {/* Local equipment */}
                <div className="min-w-0 flex-1 text-right">
                  <p className="truncate text-xs font-medium text-gray-700">
                    {localEquipment.name}
                  </p>
                </div>

                {/* Cable */}
                <div className="flex flex-col items-center">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      CABLE_TYPE_COLORS[conn.cable.cableType] || 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {conn.cable.cableType}
                  </span>
                  <div className="my-0.5 h-px w-12 bg-gray-300" />
                  {conn.cable.label && (
                    <span className="text-xs text-gray-400">
                      {conn.cable.label}
                    </span>
                  )}
                </div>

                {/* Remote equipment */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-700">
                    {remoteEquipment.name}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
