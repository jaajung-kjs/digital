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
  const load = useSubstationWorkingCopy((s) => s.load);
  useEffect(() => {
    if (substationId) void load(substationId);
  }, [substationId, load]);
}
