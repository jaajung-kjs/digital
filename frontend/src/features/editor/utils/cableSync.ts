import { type LocalCable } from '../stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { cableDtoToLocal, type CableDetailDTO } from '../../workingCopy/cableToLocal';
import { floorAnchor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { calculatePathLength } from '../../../utils/cable/pathLength';
import { getAssetCenter } from '../../../utils/floorplan/elementSystem';

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
export function syncCableEndpointsTo(movedAssetId: string): void {
  const wc = useSubstationWorkingCopy.getState();
  const assets = wc.effectiveAssets();
  const movedAsset = assets.find((a) => a.id === movedAssetId);
  if (!movedAsset) return;
  const c = getAssetCenter(movedAsset);
  const newCenter: [number, number] = [c.x, c.y];
  // 끝점이 이 설비를 floor anchor(렌더 대표)로 갖는 케이블이 따라와야 한다.
  // 랙을 옮기면 그 모듈 endpoint 케이블이, 분전반을 옮기면 회로 endpoint 케이블이
  // 같이 따라옴 — anchor 가 곧 placed ancestor 이므로 깊이에 무관하게 동작.
  const assetsById = toMapById(assets);
  // cable 의 polymorphic endpoint id(설비/모듈/회로)의 anchor 가 movedAssetId 인가.
  const anchoredToMoved = (endpointId: string | null | undefined): boolean =>
    !!endpointId && floorAnchor(endpointId, assetsById)?.id === movedAssetId;
  const patches: Record<string, Partial<LocalCable>> = {};
  for (const raw of wc.effectiveCables()) {
    const cable = cableDtoToLocal(raw as unknown as CableDetailDTO);
    if (!cable.pathPoints || cable.pathPoints.length < 2) continue;
    // cableDtoToLocal 의 sourceAssetId 는 polymorphic(설비/모듈/회로 id) — anchor 입력으로 적합.
    const isSource = anchoredToMoved(cable.sourceAssetId);
    const isTarget = anchoredToMoved(cable.targetAssetId);
    if (!isSource && !isTarget) continue;
    const pts = cable.pathPoints.map((p) => [...p] as [number, number]);
    if (isSource) pts[0] = newCenter;
    if (isTarget) pts[pts.length - 1] = newCenter;
    patches[cable.id] = { pathPoints: pts, ...calculatePathLength(pts) };
  }
  wc.stageCableUpdates(patches as Record<string, Record<string, unknown>>);
}
