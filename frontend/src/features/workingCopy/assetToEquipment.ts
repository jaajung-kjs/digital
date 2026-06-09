import type { Asset } from '../../types/asset';
import type { FloorPlanEquipment } from '../../types/floorPlan';
import type { EquipmentKind } from '../../types/equipmentKind';
import { EQUIPMENT_KINDS } from '../../types/equipmentKind';

/**
 * AssetType.placementKind 의 DB 원시값 → 프론트 EquipmentKind.
 * DB 는 분전반을 'DIST' 약어로 저장하지만 프론트 계약 kind 는 'DISTRIBUTION'.
 * (백엔드 assetPlanMapper.ts 의 PLACEMENT_TO_KIND 와 동일 규칙.)
 */
function normalizeKind(placementKind: string | null | undefined): EquipmentKind {
  if (placementKind === 'DIST') return 'DISTRIBUTION';
  if (placementKind && (EQUIPMENT_KINDS as string[]).includes(placementKind)) {
    return placementKind as EquipmentKind;
  }
  // null / unknown placementKind — 안전 기본값. throw 하지 않는다.
  return 'RACK';
}

/**
 * 배치(placement) 정보를 가진 Asset → 캔버스용 FloorPlanEquipment.
 *
 * Asset 의 배치 컬럼 (positionX/Y, width2d/height2d, ...) 을 평면도 장비 형태로 옮긴다.
 * 값이 없으면 sensible default (0 / null) 로 채워 캔버스가 안전하게 렌더할 수 있게 한다.
 */
export function assetToEquipment(a: Asset): FloorPlanEquipment {
  return {
    id: a.id,
    kind: normalizeKind(a.assetType?.placementKind),
    name: a.name,
    positionX: a.positionX ?? 0,
    positionY: a.positionY ?? 0,
    width: a.width2d ?? 0,
    height: a.height2d ?? 0,
    rotation: a.rotation ?? 0,
    totalU: a.totalU ?? null,
    description: a.description ?? null,
    manager: a.manager ?? null,
    installDate: a.installDate ?? null,
    height3d: null,
    frontImageUrl: null,
    rearImageUrl: null,
    properties: a.attributes ?? undefined,
  };
}
