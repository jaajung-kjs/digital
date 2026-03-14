import { useEffect, useMemo, useState } from 'react';
import { useRoomConnections } from '../../connections/hooks/useRoomConnections';
import { CABLE_TYPES, CABLE_BADGE_CLASSES } from '../../../types/connection';
import type { CableType, RoomConnection } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useMergedConnections } from '../../connections/hooks/useMergedConnections';
import { isTempId } from '../../../utils/idHelpers';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { useConnectionCreationStore } from '../../connections/stores/connectionCreationStore';


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
  const addChange = useEditorStore((s) => s.addChange);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);
  const selectCable = usePathHighlightStore((s) => s.selectCable);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
  const traceActive = usePathHighlightStore((s) => s.active);
  const startCreation = useConnectionCreationStore((s) => s.startCreation);
  const creationPhase = useConnectionCreationStore((s) => s.phase);
  const [showCableSelector, setShowCableSelector] = useState(false);

  // Unmount = context gone → clear highlight automatically.
  // Covers: tab switch, equipment change, panel close — no heuristic calls needed.
  useEffect(() => () => clearHighlight(), [clearHighlight]);

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

  const handleStartCreation = (cableType: CableType) => {
    startCreation(equipmentId, cableType);
    setShowCableSelector(false);
  };

  return (
    <div>
      <div className="p-3">
        {/* Add connection button */}
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

        {/* Cable type selector modal */}
        {showCableSelector && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setShowCableSelector(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-64 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">케이블 종류 선택</h3>
              </div>
              <div className="p-2">
                {CABLE_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleStartCreation(opt.value)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: opt.color }}
                    />
                    <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {relevantConnections.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantConnections.map((conn: RoomConnection) => {
            const isSource = conn.sourceEquipmentId === equipmentId;
            const localEq = isSource ? conn.sourceEquipment : conn.targetEquipment;
            const remoteEquipment = isSource ? conn.targetEquipment : conn.sourceEquipment;
            const isTracing = tracingCableId === conn.id && isTraceLoading;
            const isCardSelected = traceActive && tracingCableId === conn.id;

            const handleClick = () => {
              if (isCardSelected) {
                clearHighlight();
              } else if (isTempId(conn.id)) {
                // Pending cables: select without API trace
                selectCable(conn.id);
              } else {
                startTrace(conn.id, roomId);
              }
            };

            const handleDelete = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!confirm(`${remoteEquipment.name} 연결을 삭제하시겠습니까?`)) return;
              addChange({ type: 'cable:delete', cableId: conn.id });
              setHasChanges(true);
              clearHighlight();
            };

            return (
              <div key={conn.id}>
                <div
                  onClick={handleClick}
                  className={`group relative rounded border px-3 py-2 transition-colors cursor-pointer ${
                    isCardSelected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                      : isTempId(conn.id)
                        ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                        : 'border-gray-200 bg-white hover:bg-blue-50'
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
                          CABLE_BADGE_CLASSES[conn.cableType] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {conn.cableType}
                      </span>
                      <div className="my-0.5 h-px w-12 bg-gray-300" />
                    </div>

                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {remoteEquipment.name}
                      </p>
                    </div>
                  </div>
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
