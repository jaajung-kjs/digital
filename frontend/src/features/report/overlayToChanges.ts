import type { Asset } from '../../types/asset';
import type {
  PlanSnapshot,
  ReportPreviewChanges,
  EquipmentSnapshotItem,
  CableSnapshotItem,
} from '../../types/constructionReport';
import { mergeEffective } from '../workingCopy/effective';
import { cableOnFloor } from '../workingCopy/floorAnchor';
import { toMapById } from '../../utils/byId';
import {
  assetDescriptor,
  cableDescriptor,
  type WorkingCopyRow,
} from '../workingCopy/substationStore';
import type { Overlay } from '../workingCopy/overlay';
import { cableDtoToLocal, type CableDetailDTO } from '../workingCopy/cableToLocal';

// ──────────────────────────────────────────────────────────────────────────
// #3 Task 2 — 활성 층 오버레이 → report-preview 의 before/after 스냅샷 쌍.
//
// 엔진은 before↔after 를 id 로 diff 한다(생성=after only / 삭제=before only /
// 수정=양쪽). 따라서 활성 층 범위에서 saved(=before)·effective(=after) 를 각각
// PlanSnapshot 으로 만든 뒤, 동일한(byte-identical) 항목은 양쪽에서 제거해
// 변경분만 남긴 작은 payload 를 만든다.
//
// floor-scope:
//   - assets: floorId === activeFloorId (랙모듈 자식 포함 — 모듈도 floorId 상속).
//   - cables: source/target 의 {equipmentId, moduleId} 중 하나라도 그 층 asset id
//     (useEffectiveFloorCables 의 floor-cable predicate 재사용).
// ──────────────────────────────────────────────────────────────────────────

type Cable = WorkingCopyRow;

interface SavedCollections {
  assets: Asset[];
  cables: Cable[];
}
interface Overlays {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Cable, Partial<Cable>>;
}

/**
 * Asset → 설계서 equipment 스냅샷 항목.
 *
 * 자재코드 정본은 백엔드가 `assetTypeId` → AssetType.code 로 해소한다. staged-create
 * 설비는 assetType 이 placeholder({ placementKind })라 `assetType.code` 가 없으므로,
 * assetTypeId 를 함께 보내야 BOM/노무가 산출된다. code/name 은 표시용으로 같이 보낸다.
 */
function assetToSnapshot(a: Asset): EquipmentSnapshotItem {
  return {
    id: a.id,
    name: a.name,
    assetTypeId: a.assetTypeId ?? null,
    materialCategoryCode: a.assetType?.code ?? null,
    materialCategoryName: a.assetType?.name ?? null,
    // #7: Asset.attributes 제거 — 설비 specParams 는 더 이상 자산 속성에서 오지 않는다.
    specParams: null,
    positionX: a.positionX ?? 0,
    positionY: a.positionY ?? 0,
  };
}

/** effective Cable row(DTO) → 설계서 cable 스냅샷 항목. 자재코드 ← categoryCode. */
function cableToSnapshot(c: Cable): CableSnapshotItem {
  const local = cableDtoToLocal(c as unknown as CableDetailDTO);
  return {
    id: local.id,
    materialCategoryCode: local.categoryCode ?? null,
    materialCategoryName: local.categoryName ?? null,
    specification: local.specification ?? null,
    totalLength: local.totalLength ?? null,
    sourceAssetId: local.sourceAssetId,
    targetAssetId: local.targetAssetId,
  };
}

function buildSnapshot(assets: Asset[], cables: Cable[]): PlanSnapshot {
  return {
    equipment: assets.map(assetToSnapshot),
    cables: cables.map(cableToSnapshot),
  };
}

/**
 * 변경분만 남기기: id 별로 before/after 를 비교해 동등하면 양쪽에서 제거.
 * (created → after only, deleted → before only, updated → 양쪽 유지.)
 */
function pruneUnchanged<T extends { id: string }>(
  before: T[],
  after: T[],
): { before: T[]; after: T[] } {
  const beforeMap = toMapById(before);
  const afterMap = toMapById(after);
  const keepBefore: T[] = [];
  const keepAfter: T[] = [];
  for (const b of before) {
    const a = afterMap.get(b.id);
    if (a && JSON.stringify(a) === JSON.stringify(b)) continue; // unchanged — 상쇄
    keepBefore.push(b);
  }
  for (const a of after) {
    const b = beforeMap.get(a.id);
    if (b && JSON.stringify(a) === JSON.stringify(b)) continue;
    keepAfter.push(a);
  }
  return { before: keepBefore, after: keepAfter };
}

/**
 * 활성 층 staged 변경을 report-preview 입력(before/after 스냅샷 쌍)으로 변환.
 *
 * before = 저장된(saved) 활성 층 설비/케이블, after = effective(saved+overlay)
 * 활성 층 설비/케이블. 변경 없는(동등한) 항목은 양쪽에서 제거해 변경분만 남긴다.
 */
export function overlayToChanges(
  saved: SavedCollections,
  overlays: Overlays,
  activeFloorId: string,
): ReportPreviewChanges {
  // ── before: saved 활성 층 ──
  // 멤버십: endpoint 단일 assetId 를 floorAnchor 로 해소(모듈→랙·분기→분전반)해 이 층인 케이블.
  const savedFloorAssets = saved.assets.filter((a) => a.floorId === activeFloorId);
  const savedAssetsById = toMapById(saved.assets);
  const savedFloorCables = saved.cables.filter((c) =>
    cableOnFloor(c as { sourceAssetId?: string | null; targetAssetId?: string | null }, activeFloorId, savedAssetsById),
  );

  // ── after: effective(saved+overlay) 활성 층 ──
  const allEffAssets = mergeEffective(saved.assets, overlays.assets, assetDescriptor);
  const effAssets = allEffAssets.filter((a) => a.floorId === activeFloorId);
  const effAssetsById = toMapById(allEffAssets);
  const effCables = mergeEffective(saved.cables, overlays.cables, cableDescriptor).filter((c) =>
    cableOnFloor(c as { sourceAssetId?: string | null; targetAssetId?: string | null }, activeFloorId, effAssetsById),
  );

  const before = buildSnapshot(savedFloorAssets, savedFloorCables);
  const after = buildSnapshot(effAssets, effCables);

  const eq = pruneUnchanged(before.equipment, after.equipment);
  const cb = pruneUnchanged(before.cables, after.cables);

  return {
    before: { equipment: eq.before, cables: cb.before },
    after: { equipment: eq.after, cables: cb.after },
  };
}
