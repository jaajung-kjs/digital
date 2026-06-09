import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { RackView } from '../../../../editor/components/RackView';
import { SnapshotRackView } from '../SnapshotRackView';
import { PresetActionsBar } from '../../../../rack/components/PresetActionsBar';
import { EditorInspectorPanel } from './EditorInspectorPanel';

interface PanelProps {
  equipmentId: string;
}

export function RackEquipmentPanel({ equipmentId }: PanelProps) {
  return (
    <EditorInspectorPanel
      equipmentId={equipmentId}
      spatialLabel="내부 설비"
      spatial={<RackInternal equipmentId={equipmentId} />}
    />
  );
}

export function RackInternal({ equipmentId }: { equipmentId: string }) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  if (snapshotActive) return <SnapshotRackView equipmentId={equipmentId} />;
  return (
    <div className="flex flex-col h-full">
      <PresetActionsBar rackEquipmentId={equipmentId} />
      <div className="flex-1 min-h-0">
        <RackView equipmentId={equipmentId} />
      </div>
    </div>
  );
}
