import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { RackView } from '../../../../editor/components/RackView';
import { SnapshotRackView } from '../SnapshotRackView';
import { PresetActionsBar } from '../../../../rack/components/PresetActionsBar';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function RackEquipmentPanel({ equipmentId, floorId }: PanelProps) {
  return (
    <BaseEquipmentTabsPanel
      equipmentId={equipmentId}
      floorId={floorId}
      defaultTabIndex={4}
      fifthTab={{
        label: '내부 설비',
        // key={equipmentId} 로 랙 전환 시 RackInternal (PresetActionsBar 포함)
        // 을 강제 remount → useState 가 새 랙의 trackedPresetId 로 init,
        // 진행 중인 다이얼로그/팝오버도 자연스럽게 초기화.
        render: () => <RackInternal key={equipmentId} equipmentId={equipmentId} />,
      }}
    />
  );
}

function RackInternal({ equipmentId }: { equipmentId: string }) {
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
