/**
 * 자산 분류 단일 소스. "랙 모듈 = 부모(랙) + 슬롯을 가진 Asset 자식" 규칙을 한 곳에서만 정의해
 * substationStore/substationCommit 등이 같은 판정을 공유하게 한다(드리프트 시 커밋 경로가
 * 모듈을 오분류해 필드를 드롭하던 위험 제거).
 */
export function isRackModuleAsset(
  a: { parentAssetId?: unknown; slotIndex?: unknown } | null | undefined,
): boolean {
  return a != null && a.parentAssetId != null && a.slotIndex != null;
}
