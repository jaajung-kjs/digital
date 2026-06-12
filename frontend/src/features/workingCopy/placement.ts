import type { Asset } from '../../types/asset';
import type { EquipmentKind } from '../../types/equipmentKind';
import { EQUIPMENT_KINDS } from '../../types/equipmentKind';

/**
 * 캔버스(평면도) 투영 접근자 — Asset 을 별도 뷰모델로 materialize 하지 않고
 * 캔버스가 Asset 레코드를 *직접* 읽는다(북극성 ③ 뷰=투영). 필드명/널 차이만 여기서 흡수.
 */

/** AssetType.placementKind(DB 원시값) → 프론트 EquipmentKind. DB 는 분전반을 'DIST', 프론트는 'DISTRIBUTION'. */
export function kindOf(a: Pick<Asset, 'assetType'>): EquipmentKind {
  const pk = a.assetType?.placementKind;
  if (pk === 'DIST') return 'DISTRIBUTION';
  if (pk && (EQUIPMENT_KINDS as string[]).includes(pk)) return pk as EquipmentKind;
  return 'RACK'; // null/unknown — 안전 기본값(throw 안 함)
}
