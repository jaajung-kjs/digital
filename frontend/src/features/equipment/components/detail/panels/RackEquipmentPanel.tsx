import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { RackView } from '../../../../editor/components/RackView';
import { SnapshotRackView } from '../SnapshotRackView';
import { GenericEquipmentPanel } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function RackEquipmentPanel({ equipmentId, floorId }: PanelProps) {
  const snapshotActive = useSnapshotStore((s) => s.active);

  return (
    <GenericEquipmentPanel
      equipmentId={equipmentId}
      floorId={floorId}
      extraTabs={[
        {
          key: 'rack',
          label: '내부 설비',
          render: () =>
            snapshotActive ? (
              <SnapshotRackView equipmentId={equipmentId} />
            ) : (
              <RackView equipmentId={equipmentId} />
            ),
        },
      ]}
    />
  );
}
