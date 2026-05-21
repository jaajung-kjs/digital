import { useEditorStore, type LocalCable } from '../stores/editorStore';
import { calculatePathLength } from '../../../utils/cable/pathLength';
import { getEquipmentCenter } from '../../../utils/floorplan/elementSystem';

/**
 * 설비가 움직이거나 크기가 변할 때 그 설비를 source/target 으로 가진 케이블의
 * endpoint (pathPoints[0] / [last]) 를 새 설비 중심으로 갱신.
 *
 * 드래그 / 리사이즈 도중 pointermove 마다 호출되는 라이브 sync — canvas 가
 * store 의 cable pathPoints 를 매 프레임 다시 그리므로 케이블이 설비를
 * 따라가는 것처럼 보임.
 */
export function syncCableEndpointsTo(movedEquipmentId: string): void {
  const store = useEditorStore.getState();
  const eq = store.localEquipment.find((e) => e.id === movedEquipmentId);
  if (!eq) return;
  const c = getEquipmentCenter(eq);
  const newCenter: [number, number] = [c.x, c.y];
  // 모듈 endpoint 케이블도 부모 랙 이동에 따라와야 함 — 모듈은 별도 좌표 없이
  // 부모 랙 중심으로 렌더됨.
  const ownedModuleIds = new Set(
    store.localRackModules
      .filter((m) => m.rackEquipmentId === movedEquipmentId)
      .map((m) => m.id),
  );
  const patches = new Map<string, Partial<LocalCable>>();
  for (const cable of store.localCables) {
    if (!cable.pathPoints || cable.pathPoints.length < 2) continue;
    const isSource =
      cable.sourceEquipmentId === movedEquipmentId ||
      (!!cable.sourceModuleId && ownedModuleIds.has(cable.sourceModuleId));
    const isTarget =
      cable.targetEquipmentId === movedEquipmentId ||
      (!!cable.targetModuleId && ownedModuleIds.has(cable.targetModuleId));
    if (!isSource && !isTarget) continue;
    const pts = cable.pathPoints.map((p) => [...p] as [number, number]);
    if (isSource) pts[0] = newCenter;
    if (isTarget) pts[pts.length - 1] = newCenter;
    patches.set(cable.id, { pathPoints: pts, ...calculatePathLength(pts) });
  }
  store.updateCables(patches);
}
