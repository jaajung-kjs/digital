import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useOfdFlow, useInteractionStore } from '../../../../editor/stores/interactionStore';
import { FiberPathManager } from '../../../../fiber/components/FiberPathManager';
import { PathTraceDetail } from '../../../../pathTrace/components/PathTraceDetail';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function OfdEquipmentPanel({ equipmentId, floorId }: PanelProps) {
  const ofdFlow = useOfdFlow();
  const isFlowActive = ofdFlow?.phase === 'selectingPort' && ofdFlow?.ofdId === equipmentId;

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
  const ofdFlow = useOfdFlow();
  const ofdPhase = ofdFlow?.phase ?? 'idle';
  const ofdFlowOfdId = ofdFlow?.ofdId ?? null;
  const ofdDirection = ofdFlow?.direction ?? null;
  const cancelOfd = useInteractionStore((s) => s.cancel);
  const selectPort = useInteractionStore((s) => s.ofdSelectPort);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  if (snapshotActive) {
    return (
      <div>
        <FiberPathManager
          ofdId={equipmentId}
          onNavigateRemote={(remoteRoomId) => navigate(`/floors/${remoteRoomId}/plan`)}
        />
        {/* 포트 클릭 → trace 활성화 시 경로 상세 + "상세" 버튼이 여기 나타남 */}
        <PathTraceDetail />
      </div>
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
            // ofdAsTarget — 다른 설비에서 cable drawing 중 OFD 를 도착으로 클릭한 경우.
            // 기존 흐름 유지 (별도 통합 작업 필요).
            selectPort(fiberPathId, portNumber);
            return;
          }
          // 빈 OFD 포트 클릭 → 일반 cable drawing 의 source 로 진입.
          // 캔버스에서 도착 클릭 → CableSpecModal → addCable 일관 흐름.
          const editor = useEditorStore.getState();
          const ofd = editor.localEquipment.find((e) => e.id === equipmentId);
          if (!ofd) return;
          const center = {
            x: ofd.positionX + ofd.width / 2,
            y: ofd.positionY + ofd.height / 2,
          };
          editor.setPreselectedCableDisplayGroup('광');
          useInteractionStore.getState().cableSetSource(equipmentId, center, {
            fiberPathId,
            portNumber,
          });
        }}
        onPortDelete={(cableId) => deleteCable(cableId)}
        onNavigateRemote={(remoteRoomId) => {
          const { hasChanges } = useEditorStore.getState();
          if (hasChanges) {
            if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
          }
          navigate(`/floors/${remoteRoomId}/plan`);
        }}
      />
      {/* 포트 클릭 → trace 활성화 시 경로 상세 + "상세" 버튼이 여기 나타남.
          "상세" 클릭 = openFullNetwork → ignorePortIsolation 모드로 전체 네트워크망 모달. */}
      <PathTraceDetail />
    </div>
  );
}
