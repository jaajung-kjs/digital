/**
 * 케이블 끝점 공용 유틸 — `roleAt`(이 자산 쪽 역할), `other`(반대편 자산 id).
 * 여러 케이블 shape(CableLike / TraceCable / Cable)에서 동일 로직이 중복 정의돼 있던 것을
 * 구조적 타입 하나로 통합한다.
 */
export interface CableEndpointFields {
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: string | null;
  targetRole?: string | null;
}

/** 주어진 자산 끝점의 역할(IN/OUT 등). 자산이 source면 sourceRole, 아니면 targetRole. */
export const roleAt = (c: CableEndpointFields, assetId: string): string | null =>
  (c.sourceAssetId === assetId ? c.sourceRole : c.targetRole) ?? null;

/** 주어진 자산의 반대편 끝점 자산 id. */
export const other = (c: CableEndpointFields, assetId: string): string | null =>
  (c.sourceAssetId === assetId ? c.targetAssetId : c.sourceAssetId) ?? null;

/**
 * OPGW(변전소간 광 트렁크) 판정 — 양끝 역할이 모두 IN 인 FIBER 케이블.
 * 곳곳에 흩어져 있던 인라인 'IN && IN'(일부는 FIBER 체크 누락) 을 단일 규칙으로 통일.
 */
export const isOpgwTwin = (c: CableEndpointFields & { cableType?: string | null }): boolean =>
  c.cableType === 'FIBER' && c.sourceRole === 'IN' && c.targetRole === 'IN';
