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
 * OPGW(변전소간 광 트렁크) 판정 — **구조만**: 양끝(슬롯↔슬롯) 역할이 모두 IN.
 * IN-IN 은 OPGW 에만 나타나므로 cableType 라벨 불필요(전원 피더 IN 은 OUT-IN).
 */
export const isOpgwTwin = (c: CableEndpointFields): boolean =>
  c.sourceRole === 'IN' && c.targetRole === 'IN';
