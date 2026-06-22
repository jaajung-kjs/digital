/**
 * 자산 분류 단일 소스. "무엇이 OFD/분전반/통로/분배설비/랙모듈인가"를 여기서만 정의한다.
 *
 * 왜 단일화: 분류 기준이 곳곳에 흩어지면(예: OFD 를 어디선 code==='OFD', 어디선
 * placementKind==='OFD' 로 판정) 드리프트가 생겨 "스테이징 OFD(code 미정)를 한쪽만 못 알아봄"
 * 같은 버그가 난다. 모든 소비처가 아래 함수만 쓰면 그 계열이 구조적으로 사라진다.
 *
 * 식별 규칙:
 * - 배치형(OFD/DIST): code(커밋 후 확정) 또는 placementKind(스테이징·배치) 둘 중 하나라도 일치.
 *   에디터로 막 만든 자산은 placementKind 만, 커밋된 자산은 code 를 가지므로 둘 다 봐야 한다.
 * - 연결형(conduit/distributor): connectionKind.
 */
export type AssetTypeLike =
  | { code?: string | null; placementKind?: string | null; connectionKind?: string | null }
  | null
  | undefined;

/** OFD(광단국) — 경로슬롯 컨테이너. */
export function isOfd(t: AssetTypeLike): boolean {
  return t?.placementKind === 'OFD' || t?.code === 'OFD';
}
/** 분전반(DIST) — 피더 컨테이너. */
export function isDist(t: AssetTypeLike): boolean {
  return t?.placementKind === 'DIST' || t?.code === 'DIST';
}
/** 통로(conduit) — 경로슬롯. */
export function isConduit(t: AssetTypeLike): boolean {
  return t?.connectionKind === 'conduit';
}
/** 분배설비(distributor) — 피더/충전기/UPS 등 IN/OUT 구분 대상. */
export function isDistributor(t: AssetTypeLike): boolean {
  return t?.connectionKind === 'distributor';
}

/** 랙 모듈 = 부모(랙) + 슬롯을 가진 Asset 자식. (substationStore/commit 공유 판정.) */
export function isRackModuleAsset(
  a: { parentAssetId?: unknown; slotIndex?: unknown } | null | undefined,
): boolean {
  return a != null && a.parentAssetId != null && a.slotIndex != null;
}
