import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useOfdConnectionFlowStore } from '../../../../fiber/stores/ofdConnectionFlowStore';
import { FiberPathManager } from '../../../../fiber/components/FiberPathManager';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function OfdEquipmentPanel({ equipmentId, floorId }: PanelProps) {
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  return (
    <BaseEquipmentTabsPanel
      equipmentId={equipmentId}
      floorId={floorId}
      fourthTab={{
        label: '경로',
        render: () => <OfdPathsView equipmentId={equipmentId} />,
      }}
      initialTab={isFlowActive ? 'fourth' : 'info'}
    />
  );
}

function OfdPathsView({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const snapshotActive = useSnapshotStore((s) => s.active);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const ofdDirection = useOfdConnectionFlowStore((s) => s.direction);
  const cancelOfd = useOfdConnectionFlowStore((s) => s.cancel);
  const selectPort = useOfdConnectionFlowStore((s) => s.selectPort);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const updateCable = useEditorStore((s) => s.updateCable);
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  if (snapshotActive) {
    return (
      <FiberPathManager
        ofdId={equipmentId}
        onNavigateRemote={(remoteRoomId) => navigate(`/floors/${remoteRoomId}/plan`)}
      />
    );
  }

  return (
    <div>
      {isFlowActive && (
        <div className="mx-4 mt-3 mb-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            {ofdDirection === 'ofdAsTarget' ? '포트를 선택하여 연결을 완료하세요' : '포트를 선택하세요'}
          </p>
          <button onClick={cancelOfd} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
            취소
          </button>
        </div>
      )}
      {ofdPhase === 'selectingTarget' && ofdFlowOfdId === equipmentId && (
        <div className="mx-4 mt-3 mb-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-700">캔버스에서 대상 설비를 클릭하세요</p>
        </div>
      )}
      <FiberPathManager
        ofdId={equipmentId}
        onPortConnect={(portNumber, fiberPathId) => {
          if (isFlowActive) {
            selectPort(fiberPathId, portNumber);
          } else {
            const store = useOfdConnectionFlowStore.getState();
            store.startFromOfd(equipmentId);
            store.selectPort(fiberPathId, portNumber);
          }
        }}
        onPortDelete={(cableId) => deleteCable(cableId)}
        onPortSwitch={(cableId, _eqId, newFiberPathId, newPortNumber) => {
          updateCable(cableId, { fiberPathId: newFiberPathId, fiberPortNumber: newPortNumber });
        }}
        onNavigateRemote={(remoteRoomId) => {
          const { hasChanges } = useEditorStore.getState();
          if (hasChanges) {
            if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
          }
          navigate(`/floors/${remoteRoomId}/plan`);
        }}
      />
    </div>
  );
}
