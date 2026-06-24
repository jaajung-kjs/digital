/**
 * 자산 분류는 `assetType.role` 직접 비교(=== 'ofd' 등)로 한다 — 단일 소스.
 * role 은 백엔드 backfill+DTO 와 staged 생성에서 항상 채워지므로 폴백/판정 헬퍼가 필요 없다.
 * (과거 isOfd/isDist/isConduit/isDistributor 는 P2 에서 제거됨.)
 *
 * 여기 남는 것은 role 분류가 아닌 인스턴스 판정 하나뿐:
 */

/** 랙 모듈 = 부모(랙) + 슬롯을 가진 Asset 자식. (substationStore/commit 공유 판정.) */
export function isRackModuleAsset(
  a: { parentAssetId?: unknown; slotIndex?: unknown } | null | undefined,
): boolean {
  return a != null && a.parentAssetId != null && a.slotIndex != null;
}
