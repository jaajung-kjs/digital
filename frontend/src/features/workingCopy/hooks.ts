import { useEffect, useMemo } from 'react';
import {
  useSubstationWorkingCopy,
  assetDescriptor,
  cableDescriptor,
  distCircuitDescriptor,
  fiberPathDescriptor,
} from './substationStore';
import { mergeEffective } from './effective';
import { overlayDirtyCount } from './overlay';
import { assetToEquipment } from './assetToEquipment';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 1 — React 바인딩 훅.
//
// 2b 의 substation working-copy store(saved/overlays)에 React 가 구독하도록 한다.
// 핵심: 안정적인 saved/overlay 슬라이스에만 구독하고, 파생값(effective 배열 /
// dirty 카운트)은 useMemo 로 계산한다. 이렇게 하면 매 렌더마다 새 배열이 생겨도
// 셀렉터 반환값은 슬라이스 ref 가 바뀔 때만 변하므로 렌더 루프가 생기지 않는다.
//
// stage 액션은 set((s) => ({ overlays: { ...s.overlays, <col>: ... } })) 로
// overlays 와 해당 컬렉션 overlay 의 ref 를 둘 다 새로 만든다 — 따라서
// s.overlays.<col> / s.overlays 구독 모두 stage 시 정상적으로 재렌더된다.
// ──────────────────────────────────────────────────────────────────────────

export function useEffectiveAssets() {
  const saved = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  return useMemo(() => mergeEffective(saved, overlay, assetDescriptor), [saved, overlay]);
}

export function useEffectiveCables() {
  const saved = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.cables);
  return useMemo(() => mergeEffective(saved, overlay, cableDescriptor), [saved, overlay]);
}

export function useEffectiveDistCircuits() {
  const saved = useSubstationWorkingCopy((s) => s.saved.distributionCircuits);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.distributionCircuits);
  return useMemo(() => mergeEffective(saved, overlay, distCircuitDescriptor), [saved, overlay]);
}

export function useEffectiveFiberPaths() {
  const saved = useSubstationWorkingCopy((s) => s.saved.fiberPaths);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.fiberPaths);
  return useMemo(() => mergeEffective(saved, overlay, fiberPathDescriptor), [saved, overlay]);
}

/**
 * SSOT-2d Task 4 — 한 층(floorId)의 배치(placement)-레벨 설비를
 * effective(saved+overlay) 에서 뽑아 FloorPlanEquipment 로 변환해 반환한다.
 *
 * 캔버스 hot path 용: saved/overlay 슬라이스 ref 는 load/stage 때만 바뀌므로
 * useMemo 로 변환 결과 배열의 참조가 변경 없을 때 안정(referentially stable)하다.
 * 필터: 같은 층 AND 랙-모듈 자식(parentAssetId && slotIndex!=null) 제외.
 */
export function useEffectiveEquipment(floorId: string) {
  const saved = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  return useMemo(() => {
    const eff = mergeEffective(saved, overlay, assetDescriptor);
    return eff
      .filter((a) => a.floorId === floorId && !(a.parentAssetId && a.slotIndex != null))
      .map(assetToEquipment);
  }, [saved, overlay, floorId]);
}

/**
 * 한 랙(rackId)의 effective 랙모듈 자식만 반환한다.
 * 필터: parentAssetId === rackId AND slotIndex != null(랙 슬롯에 꽂힌 자식).
 */
export function useEffectiveRackModules(rackId: string) {
  const saved = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  return useMemo(() => {
    const eff = mergeEffective(saved, overlay, assetDescriptor);
    return eff.filter((a) => a.parentAssetId === rackId && a.slotIndex != null);
  }, [saved, overlay, rackId]);
}

/**
 * 한 층(floorId)에 닿는 effective 케이블만 반환한다.
 * effective assets 중 해당 층(top-level 또는 부모 랙이 그 층)에 있는 id 집합을 만들고,
 * source/target 의 {equipmentId, moduleId} 중 하나라도 그 집합에 속하는 케이블만 남긴다.
 */
export function useEffectiveFloorCables(floorId: string) {
  const savedAssets = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlayAssets = useSubstationWorkingCopy((s) => s.overlays.assets);
  const savedCables = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlayCables = useSubstationWorkingCopy((s) => s.overlays.cables);
  return useMemo(() => {
    const effAssets = mergeEffective(savedAssets, overlayAssets, assetDescriptor);
    const onFloor = new Set(effAssets.filter((a) => a.floorId === floorId).map((a) => a.id));
    const effCables = mergeEffective(savedCables, overlayCables, cableDescriptor);
    return effCables.filter((c) => {
      const ep = (e: unknown) => {
        const o = e as { equipmentId?: string | null; moduleId?: string | null } | undefined;
        return [o?.equipmentId, o?.moduleId];
      };
      return [...ep((c as any).source), ...ep((c as any).target)].some((x) => x != null && onFloor.has(x));
    });
  }, [savedAssets, overlayAssets, savedCables, overlayCables, floorId]);
}

/** assets overlay 슬라이스 직접 구독(staged 변경 여부 등 overlay 자체가 필요할 때). */
export function useEffectiveAssetsOverlay() {
  return useSubstationWorkingCopy((s) => s.overlays.assets);
}

/** 전 컬렉션 staged 변경 합계(creates+updates+deletes). 0 이면 깨끗함. */
export function useWorkingCopyDirty() {
  const assets = useSubstationWorkingCopy((s) => s.overlays.assets);
  const cables = useSubstationWorkingCopy((s) => s.overlays.cables);
  const distributionCircuits = useSubstationWorkingCopy((s) => s.overlays.distributionCircuits);
  const fiberPaths = useSubstationWorkingCopy((s) => s.overlays.fiberPaths);
  return useMemo(
    () =>
      overlayDirtyCount(assets) +
      overlayDirtyCount(cables) +
      overlayDirtyCount(distributionCircuits) +
      overlayDirtyCount(fiberPaths),
    [assets, cables, distributionCircuits, fiberPaths],
  );
}

/** 주어진 substationId 의 working copy 가 현재 로드돼 있는지. */
export function useWorkingCopyLoaded(substationId: string | null) {
  return useSubstationWorkingCopy((s) => s.substationId === substationId);
}

/** substationId 변경 시 working copy 를 로드(부수효과 전용 — 반환값 없음). */
export function useWorkingCopyLoader(substationId: string | null) {
  const loaded = useWorkingCopyLoaded(substationId);
  const load = useSubstationWorkingCopy((s) => s.load);
  useEffect(() => {
    if (substationId && !loaded) void load(substationId);
  }, [substationId, loaded, load]);
}
