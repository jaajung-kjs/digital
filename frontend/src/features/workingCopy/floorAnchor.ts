import type { Asset } from '../../types/asset';

/**
 * Floor anchor (렌더 대표) — 컨테인먼트 계층(변전소→…→랙→모듈→포트 / 분전반→회로)
 * 에서 "도면에 직접 배치된 가장 가까운 조상"을 찾는 순수 함수 모음.
 *
 * 원칙: 도면은 floorId+positionX/Y 를 가진(=직접 배치된) Asset 만 그린다. 랙 모듈,
 * 분전반 회로처럼 별도 좌표가 없는 내부 endpoint 는 자신의 placed ancestor(floorAnchor)
 * 위치로 시각화한다. 논리 모델/DB 는 진짜 내부 endpoint id 를 그대로 보존하고,
 * 위치/렌더링만 anchor 로 해소한다.
 *
 * 모두 pure — assetsById 맵(또는 리스트)을 받아 effective assets 위에서도 동작.
 */

const MAX_HOPS = 8;

/** 도면에 직접 배치된 Asset 인가 — floorId + 좌표 + 크기를 가졌는가. */
export function isFloorPlaced(asset: Asset | null | undefined): boolean {
  if (!asset) return false;
  return (
    asset.floorId != null &&
    asset.positionX != null &&
    asset.positionY != null &&
    asset.width2d != null &&
    asset.height2d != null
  );
}

/** Asset 리스트 → id 맵 헬퍼. */
export function assetsByIdMap(assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}

/**
 * assetId 의 floor anchor(렌더 대표 Asset)를 반환한다.
 * - 자신이 placed 면 자신.
 * - 아니면 parentAssetId 로 거슬러 올라가 placed ancestor 를 찾는다.
 * - cycle/depth 가드: 최대 MAX_HOPS, visited set. placed ancestor 없으면 null.
 */
export function floorAnchor(
  assetId: string | null | undefined,
  assetsById: Map<string, Asset>,
): Asset | null {
  if (!assetId) return null;
  const visited = new Set<string>();
  let current: Asset | undefined = assetsById.get(assetId);
  let hops = 0;
  while (current && hops < MAX_HOPS) {
    if (visited.has(current.id)) return null; // cycle
    visited.add(current.id);
    if (isFloorPlaced(current)) return current;
    if (current.parentAssetId == null) return null;
    current = assetsById.get(current.parentAssetId);
    hops++;
  }
  return null;
}

/**
 * assetId 의 anchor 중심 좌표 — anchor 의 (positionX+width/2, positionY+height/2).
 * placed ancestor 가 없으면 null.
 */
export function anchorPosition(
  assetId: string | null | undefined,
  assetsById: Map<string, Asset>,
): { x: number; y: number } | null {
  const anchor = floorAnchor(assetId, assetsById);
  if (!anchor) return null;
  // isFloorPlaced 가 true 면 좌표/크기 모두 non-null 보장.
  const x = (anchor.positionX as number) + (anchor.width2d as number) / 2;
  const y = (anchor.positionY as number) + (anchor.height2d as number) / 2;
  return { x, y };
}

/** 도면 좌표계 사각형 — anchor 의 좌상단 + 크기. */
export interface FloorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * "이 asset 이 도면 어디에 보이는가" 의 단일 choke-point.
 *
 * assetId(또는 현재 선택) 를 floor anchor(직접 배치된 가장 가까운 조상)로 해소해
 * 그 anchor 의 도면 사각형(좌상단 x/y + width/height)을 반환한다. 하이라이트·뷰포트
 * 포커스 등 "선택 → 도면 위치" 가 필요한 모든 경로는 이 함수 하나만 통과한다.
 *
 * - 자신이 placed → 자신의 rect.
 * - 미배치 모듈/회로/포트 → 부모 설비(랙/OFD/분전반)의 rect (임의 깊이).
 * - placed ancestor 없음(orphan)/cycle/unknown → null.
 *
 * effectiveAssets 리스트를 받아 effective(saved+overlay) 위에서 동작한다.
 */
export function floorTargetFor(
  assetId: string | null | undefined,
  effectiveAssets: Asset[],
): FloorRect | null {
  const anchor = floorAnchor(assetId, assetsByIdMap(effectiveAssets));
  if (!anchor) return null;
  // isFloorPlaced 가 true 면 좌표/크기 모두 non-null 보장.
  return {
    x: anchor.positionX as number,
    y: anchor.positionY as number,
    width: anchor.width2d as number,
    height: anchor.height2d as number,
  };
}

/** 케이블 endpoint — 정밀 id 하나(설비/모듈/회로 중 하나). */
export interface CableEndpoint {
  equipmentId?: string | null;
  moduleId?: string | null;
  circuitId?: string | null;
}
