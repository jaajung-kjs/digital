import { ConnectionDiagram } from '../ConnectionDiagram';

/**
 * 비-OFD 설비의 기본 4번째 탭 — cable card 리스트 (ConnectionDiagram).
 * OFD 는 OfdEquipmentPanel 이 fourthTab 을 '경로' 로 override 하므로 여기 도달하지 않음.
 */
export function ConnectionsTab({ equipmentId }: { equipmentId: string }) {
  return (
    <div className="p-4">
      <ConnectionDiagram equipmentId={equipmentId} />
    </div>
  );
}
