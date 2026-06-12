import type { Asset } from '../../types/asset';
import { isRackModuleAsset } from '../workingCopy/assetClassify';
import { branchAssetIdsOfPanel, FEEDER_CODE, BRANCH_CODE } from '../assets/distributionSubtree';
import { toMapById } from '../../utils/byId';

/**
 * 연결(케이블) endpoint(assetId) → 표시명 **단일 리졸버**. 랙모듈 → 자기 이름, 분전 분기 →
 * "피더/분기" 라벨, 그 외 → 설비명. effective assets 기반이라 staged 변경(이름 등)도 반영한다.
 *
 * 이전엔 연결 목록이 3곳에서 제각각 이름을 해소해(상세 패널 '(미상)', 변전소 뷰는 케이블 DTO 의
 * 저장-스냅샷 이름) 같은 케이블이 화면마다 다른 이름으로 보이는 드리프트가 있었다 — 여기로 통일.
 */
export function buildEndpointNameResolver(assets: Asset[]): (assetId: string | null | undefined) => string {
  const byId = toMapById(assets);
  // 분전 분기 라벨맵 — 단일 O(n) 패스. branch → feeder(→ DIST 분전반)면 "피더/분기".
  //   (이전엔 분전반마다 feederGroupsOfPanel 을 호출해 전 자산을 재순회 → O(n²).)
  const branchLabel = new Map<string, string>();
  for (const b of assets) {
    if (b.assetType?.code !== BRANCH_CODE) continue;
    const feeder = b.parentAssetId ? byId.get(b.parentAssetId) : undefined;
    if (feeder?.assetType?.code !== FEEDER_CODE) continue;
    const panel = feeder.parentAssetId ? byId.get(feeder.parentAssetId) : undefined;
    if (panel?.assetType?.placementKind !== 'DIST') continue;
    branchLabel.set(b.id, `${feeder.name}/${b.name}`);
  }
  return (assetId) => {
    if (!assetId) return '';
    const a = byId.get(assetId);
    if (a && isRackModuleAsset(a)) return a.name;
    return branchLabel.get(assetId) ?? a?.name ?? '';
  };
}

/**
 * 한 자산의 "self-side" endpoint 판정기 — 자기 자신 + 자식 랙모듈 + 자식 분전 분기.
 * 케이블 endpoint 가 자식(모듈/분기)이어도 "이 자산의 연결"로 본다(단일 판정).
 */
export function buildSelfSideChecker(assets: Asset[], assetId: string): (id: string | null | undefined) => boolean {
  const childModules = new Set(
    assets.filter((a) => isRackModuleAsset(a) && a.parentAssetId === assetId).map((a) => a.id),
  );
  const childBranches = branchAssetIdsOfPanel(assets, assetId);
  return (id) => !!id && (id === assetId || childModules.has(id) || childBranches.has(id));
}
