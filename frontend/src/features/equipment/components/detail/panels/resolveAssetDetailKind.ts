import type { Asset } from '../../../../../types/asset';
import { EQUIPMENT_KIND_INFO, type DetailPanelKind, type EquipmentKind } from '../../../../../types/equipmentKind';

interface PlacedLike { kind: EquipmentKind }

/**
 * 상세 패널의 종류(detailKind)를 자산 기준으로 해석(SSOT).
 * - conduit 자산(광슬롯 등) → 'conduit-ports'(포트 GUI). 배치설비가 아니어도 동작.
 * - 그 외 배치설비 → EQUIPMENT_KIND_INFO 의 detailPanelKind.
 * - 둘 다 아니면 null(공간 섹션 없음).
 */
export function resolveAssetDetailKind(
  asset: Asset | null | undefined,
  placed: PlacedLike | null | undefined,
): DetailPanelKind | null {
  if (asset?.assetType?.connectionKind === 'conduit') return 'conduit-ports';
  if (placed) return EQUIPMENT_KIND_INFO[placed.kind]?.detailPanelKind ?? null;
  return null;
}
