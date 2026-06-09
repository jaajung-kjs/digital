import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { FiberPathManager } from '../../../../fiber/components/FiberPathManager';
import { PathTraceDetail } from '../../../../pathTrace/components/PathTraceDetail';
import { startOfdCableDrawing } from '../../../../fiber/startOfdCableDrawing';
import { EditorInspectorPanel } from './EditorInspectorPanel';

interface PanelProps {
  equipmentId: string;
}

export function OfdEquipmentPanel({ equipmentId }: PanelProps) {
  return (
    <EditorInspectorPanel
      equipmentId={equipmentId}
      spatialLabel="경로"
      snapshotSlot="fourth"
      spatial={<OfdPathsView equipmentId={equipmentId} />}
    />
  );
}

export function OfdPathsView({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const snapshotActive = useSnapshotStore((s) => s.active);
  const deleteCable = useEditorStore((s) => s.deleteCable);

  const handleNavigateRemote = (remoteRoomId: string) => {
    const { hasChanges } = useEditorStore.getState();
    if (hasChanges) {
      if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
    }
    navigate(`/floors/${remoteRoomId}/plan`);
  };

  if (snapshotActive) {
    return (
      <div>
        <FiberPathManager ofdId={equipmentId} onNavigateRemote={handleNavigateRemote} />
        <PathTraceDetail />
      </div>
    );
  }

  return (
    <div>
      <FiberPathManager
        ofdId={equipmentId}
        onPortConnect={(portNumber, fiberPathId) => startOfdCableDrawing(equipmentId, fiberPathId, portNumber)}
        onPortDelete={(cableId) => deleteCable(cableId)}
        onNavigateRemote={handleNavigateRemote}
      />
      <PathTraceDetail />
    </div>
  );
}
