import { type LocalCable } from '../stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { assetToEquipment } from '../../workingCopy/assetToEquipment';
import { calculatePathLength } from '../../../utils/cable/pathLength';
import { getEquipmentCenter } from '../../../utils/floorplan/elementSystem';

/**
 * 설비가 움직이거나 크기가 변할 때 그 설비를 source/target 으로 가진 케이블의
 * endpoint (pathPoints[0] / [last]) 를 새 설비 중심으로 갱신.
 *
 * 드래그 / 리사이즈 도중 pointermove 마다 호출되는 라이브 sync — canvas 가
 * effective cable pathPoints 를 매 프레임 다시 그리므로 케이블이 설비를
 * 따라가는 것처럼 보임.
 *
 * SSOT-2d Task 4 — 읽기/쓰기 모두 통합 스토어로. effective assets 에서 이동한
 * 설비와 그 자식 모듈을 찾고, effective cables 의 endpoint 를 stageCableUpdates
 * 로 패치한다.
 */
export function syncCableEndpointsTo(movedEquipmentId: string): void {
  const wc = useSubstationWorkingCopy.getState();
  const assets = wc.effectiveAssets();
  const movedAsset = assets.find((a) => a.id === movedEquipmentId);
  if (!movedAsset) return;
  const eq = assetToEquipment(movedAsset);
  const c = getEquipmentCenter(eq);
  const newCenter: [number, number] = [c.x, c.y];
  // 모듈 endpoint 케이블도 부모 랙 이동에 따라와야 함 — 모듈은 별도 좌표 없이
  // 부모 랙 중심으로 렌더됨.
  const ownedModuleIds = new Set(
    assets
      .filter((a) => a.parentAssetId === movedEquipmentId && a.slotIndex != null)
      .map((a) => a.id),
  );
  const patches: Record<string, Partial<LocalCable>> = {};
  for (const raw of wc.effectiveCables()) {
    const cable = raw as unknown as LocalCable;
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
    patches[cable.id] = { pathPoints: pts, ...calculatePathLength(pts) };
  }
  wc.stageCableUpdates(patches as Record<string, Record<string, unknown>>);
}
