import type { Asset } from '../../types/asset';
import { isRackModuleAsset } from '../workingCopy/assetClassify';
import { feedersOfPanel } from '../assets/distributionSubtree';
import { toMapById } from '../../utils/byId';

/**
 * 분전 피더(FEEDER) asset id 의 표시 라벨을 부모 체인으로 해소하는 **단일 공유 헬퍼**.
 *
 * 반환값: 피더 이름 (예: "DC 48V Main"). 케이블은 피더로 직접 그려지므로
 * (CB = 피더로 가는 출력 케이블, 별도 노드 없음) endpoint 의 라벨 = 피더 이름이다.
 * 피더 계층이 아니면(타입 코드·부모 role 불일치) null 을 반환 →
 * 호출측이 일반(설비/모듈/external) 라벨 경로로 빠진다.
 *
 * STRICT 가드:
 *   - feeder.assetType.role === 'feeder'
 *   - parent(panel).assetType.role === 'panel'
 *
 * 이 헬퍼를 `buildEndpointNameResolver`(연결 목록)와 `cableTracer`(토폴로지/경로추적)가
 * 공유하여 뷰 간 라벨 드리프트를 차단한다. (cableTracer 는 이름 fallback 이 없어
 * 여기서 반드시 피더 이름을 돌려줘야 한다.)
 */
export function resolveBranchLabel(assetId: string, assetMap: Map<string, Asset>): string | null {
  const feeder = assetMap.get(assetId);
  if (!feeder || feeder.assetType?.role !== 'feeder') return null;
  const panel = feeder.parentAssetId ? assetMap.get(feeder.parentAssetId) : undefined;
  if (panel?.assetType?.role !== 'panel') return null;
  return feeder.name;
}

/**
 * 연결(케이블) endpoint(assetId) → 표시명 **단일 리졸버**. 랙모듈 → 자기 이름, 분전 피더 →
 * 피더 이름, 그 외 → 설비명. effective assets 기반이라 staged 변경(이름 등)도 반영한다.
 *
 * 이전엔 연결 목록이 3곳에서 제각각 이름을 해소해(상세 패널 '(미상)', 변전소 뷰는 케이블 DTO 의
 * 저장-스냅샷 이름) 같은 케이블이 화면마다 다른 이름으로 보이는 드리프트가 있었다 — 여기로 통일.
 */
export function buildEndpointNameResolver(assets: Asset[]): (assetId: string | null | undefined) => string {
  const byId = toMapById(assets);
  // 분전 피더 라벨맵 — 단일 O(n) 패스. feeder(→ DIST 분전반)면 피더 이름.
  //   (이전엔 분전반마다 feedersOfPanel 을 호출해 전 자산을 재순회 → O(n²).)
  const feederLabel = new Map<string, string>();
  for (const f of assets) {
    const label = resolveBranchLabel(f.id, byId);
    if (label !== null) feederLabel.set(f.id, label);
  }
  return (assetId) => {
    if (!assetId) return '';
    const a = byId.get(assetId);
    if (a && isRackModuleAsset(a)) return a.name;
    return feederLabel.get(assetId) ?? a?.name ?? '';
  };
}

/**
 * 한 자산의 "self-side" endpoint 판정기 — 자기 자신 + 자식 랙모듈 + 자식 분전 피더.
 * 케이블 endpoint 가 자식(모듈/피더)이어도 "이 자산의 연결"로 본다(단일 판정).
 */
export function buildSelfSideChecker(assets: Asset[], assetId: string): (id: string | null | undefined) => boolean {
  const childModules = new Set(
    assets.filter((a) => isRackModuleAsset(a) && a.parentAssetId === assetId).map((a) => a.id),
  );
  const childFeeders = new Set(feedersOfPanel(assets, assetId).map((f) => f.id));
  const childConduits = new Set(
    assets.filter((a) => a.parentAssetId === assetId && a.assetType?.role === 'slot').map((a) => a.id),
  );
  return (id) => !!id && (id === assetId || childModules.has(id) || childFeeders.has(id) || childConduits.has(id));
}
