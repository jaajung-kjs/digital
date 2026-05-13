import { useEditorStore } from '../stores/editorStore';

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
  const newCenter: [number, number] = [
    eq.positionX + eq.width / 2,
    eq.positionY + eq.height / 2,
  ];
  for (const cable of store.localCables) {
    if (!cable.pathPoints || cable.pathPoints.length < 2) continue;
    const isSource = cable.sourceEquipmentId === movedEquipmentId;
    const isTarget = cable.targetEquipmentId === movedEquipmentId;
    if (!isSource && !isTarget) continue;
    const pts = cable.pathPoints.map((p) => [...p] as [number, number]);
    if (isSource) pts[0] = newCenter;
    if (isTarget) pts[pts.length - 1] = newCenter;
    store.updateCable(cable.id, { pathPoints: pts });
  }
}
