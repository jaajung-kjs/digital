import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../editor/stores/snapshotStore';
import { useOfdFlow, useInteractionStore } from '../../../editor/stores/interactionStore';
import { ConnectionDiagram } from '../ConnectionDiagram';
import { FiberPathManager } from '../../../fiber/components/FiberPathManager';

/* ================================================================
   Connections Tab - center aligned text
   ================================================================ */

export function ConnectionsTab({
  equipmentId,
  floorId,
}: {
  equipmentId: string;
  floorId: string;
}) {
  // P9: kind sourced from the editor store, dropping the legacy materialCategoryCode prop.
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localKind = localEquipment.find((e) => e.id === equipmentId)?.kind;
  const isOfd = localKind === 'OFD';
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotFiberPaths = useSnapshotStore((s) => s.fiberPaths);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const ofdFlow = useOfdFlow();
  const ofdPhase = ofdFlow?.phase ?? 'idle';
  const ofdDirection = ofdFlow?.direction ?? null;
  const ofdFlowOfdId = ofdFlow?.ofdId ?? null;
  const selectPort = useInteractionStore((s) => s.ofdSelectPort);
  const cancelOfd = useInteractionStore((s) => s.cancel);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const navigate = useNavigate();

  // Is the OFD flow active and targeting THIS equipment?
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  const handlePortConnect = useCallback((portNumber: number, fiberPathId: string) => {
    if (isFlowActive) {
      // OFD flow is active (either direction): delegate to state machine
      selectPort(fiberPathId, portNumber);
    } else {
      // Direct port click without active flow: start OFD-as-source
      const store = useInteractionStore.getState();
      store.ofdStartFromOfd(equipmentId);
      store.ofdSelectPort(fiberPathId, portNumber);
    }
  }, [isFlowActive, selectPort, equipmentId]);

  const handlePortDelete = useCallback((cableId: string) => {
    deleteCable(cableId);
  }, [deleteCable]);

  // In snapshot mode, show read-only fiber paths for OFD
  if (snapshotActive && isOfd) {
    const ofdPaths = snapshotFiberPaths.filter(
      (fp) => fp.ofdAId === equipmentId || fp.ofdBId === equipmentId
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
                    <span className="ml-2 text-xs text-gray-400">
                      {path.portCount}코어
                    </span>
                    {path.description && (
                      <p className="mt-1 text-xs text-gray-500">{path.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4">
          <ConnectionDiagram floorId={floorId} equipmentId={equipmentId} />
        </div>
      </div>
    );
  }

  // C2: In snapshot mode, block all destructive actions
  if (snapshotActive) {
    return (
      <div>
        {isOfd && (
          <FiberPathManager
            ofdId={equipmentId}
            onNavigateRemote={(remoteRoomId) => {
              navigate(`/floors/${remoteRoomId}/plan`);
            }}
          />
        )}
        <div className="p-4">
          <ConnectionDiagram floorId={floorId} equipmentId={equipmentId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Banner: OFD port selection */}
      {isFlowActive && (
        <div className="mx-4 mt-3 mb-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            {ofdDirection === 'ofdAsTarget' ? '포트를 선택하여 연결을 완료하세요' : '포트를 선택하세요'}
          </p>
          <button onClick={cancelOfd} className="text-xs text-blue-500 hover:text-blue-700 font-medium">취소</button>
        </div>
      )}
      {/* Banner: waiting for target on canvas */}
      {ofdPhase === 'selectingTarget' && ofdFlowOfdId === equipmentId && (
        <div className="mx-4 mt-3 mb-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-700">캔버스에서 대상 설비를 클릭하세요</p>
        </div>
      )}
      {isOfd && (
        <FiberPathManager
          ofdId={equipmentId}
          onPortConnect={handlePortConnect}
          onPortDelete={handlePortDelete}
          onNavigateRemote={(remoteRoomId) => {
            const { hasChanges } = useEditorStore.getState();
            if (hasChanges) {
              if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
              // localStorage 자동 백업이 동작 중이므로 별도 저장 불필요
            }
            navigate(`/floors/${remoteRoomId}/plan`);
          }}
        />
      )}
      <div className="p-4">
        <ConnectionDiagram floorId={floorId} equipmentId={equipmentId} />
      </div>
    </div>
  );
}
