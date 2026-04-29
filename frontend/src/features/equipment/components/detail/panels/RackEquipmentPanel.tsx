import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { RackView } from '../../../../editor/components/RackView';
import { SnapshotRackView } from '../SnapshotRackView';
import { PresetActionsBar } from '../../../../rack/components/PresetActionsBar';
import { GenericEquipmentPanel } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

/**
 * P10: the "내부 설비" tab now stacks a preset action bar (apply / save)
 * on top of the existing slot grid. The bar is hidden in snapshot view
 * (read-only).
 */
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
              <div className="flex flex-col h-full">
                <PresetActionsBar rackEquipmentId={equipmentId} />
                <div className="flex-1 min-h-0">
                  <RackView equipmentId={equipmentId} />
                </div>
              </div>
            ),
        },
      ]}
    />
  );
}
