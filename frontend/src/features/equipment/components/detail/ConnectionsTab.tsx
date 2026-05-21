import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../editor/stores/snapshotStore';
import { ConnectionDiagram } from '../ConnectionDiagram';
import { FiberPathManager } from '../../../fiber/components/FiberPathManager';
import { startOfdCableDrawing } from '../../../fiber/startOfdCableDrawing';

/* ================================================================
   Connections Tab — 모든 설비 종류 공용 연결탭.
   OFD 일 때만 FiberPathManager(경로 슬롯) 노출. cable card 리스트는 ConnectionDiagram.
   ================================================================ */

export function ConnectionsTab({ equipmentId }: { equipmentId: string }) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localKind = localEquipment.find((e) => e.id === equipmentId)?.kind;
  const isOfd = localKind === 'OFD';
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotFiberPaths = useSnapshotStore((s) => s.fiberPaths);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const navigate = useNavigate();

  const handleNavigateRemote = useCallback((remoteRoomId: string) => {
    const { hasChanges } = useEditorStore.getState();
    if (hasChanges) {
      if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
    }
    navigate(`/floors/${remoteRoomId}/plan`);
  }, [navigate]);

  // Snapshot mode + OFD — 읽기 전용 path 목록
  if (snapshotActive && isOfd) {
    const ofdPaths = snapshotFiberPaths.filter(
      (fp) => fp.ofdAId === equipmentId || fp.ofdBId === equipmentId,
    );
    const equipMap = new Map(snapshotEquipment.map((e) => [e.id, e.name]));
    return (
      <div>
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">경로 슬롯</h3>
          {ofdPaths.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 경로가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {ofdPaths.map((path) => {
                const remoteId = path.ofdAId === equipmentId ? path.ofdBId : path.ofdAId;
                const remoteName = equipMap.get(remoteId) ?? '알 수 없음';
                const localName = equipMap.get(equipmentId) ?? '알 수 없음';
                return (
                  <div key={path.id} className="rounded border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">
                      {localName} - {remoteName}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{path.portCount}코어</span>
                    {path.description && <p className="mt-1 text-xs text-gray-500">{path.description}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4">
          <ConnectionDiagram equipmentId={equipmentId} />
        </div>
      </div>
    );
  }

  // Snapshot mode (비-OFD) — destructive action block
  if (snapshotActive) {
    return (
      <div>
        {isOfd && (
          <FiberPathManager ofdId={equipmentId} onNavigateRemote={handleNavigateRemote} />
        )}
        <div className="p-4">
          <ConnectionDiagram equipmentId={equipmentId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {isOfd && (
        <FiberPathManager
          ofdId={equipmentId}
          onPortConnect={(portNumber, fiberPathId) => startOfdCableDrawing(equipmentId, fiberPathId, portNumber)}
          onPortDelete={(cableId) => deleteCable(cableId)}
          onNavigateRemote={handleNavigateRemote}
        />
      )}
      <div className="p-4">
        <ConnectionDiagram equipmentId={equipmentId} />
      </div>
    </div>
  );
}
