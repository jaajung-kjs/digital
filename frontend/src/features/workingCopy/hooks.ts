import { useEffect, useMemo } from 'react';
import {
  useSubstationWorkingCopy,
  assetDescriptor,
  cableDescriptor,
  fiberPathDescriptor,
  recordDescriptorOf,
  sumOverlaysDirty,
  type CollectionKey,
  type InspectionRow,
  type LogRow,
  type PhotoRow,
} from './substationStore';
import type { RecordTypeKey } from './recordTypes';
import { mergeEffective } from './effective';
import { assetsByIdMap, cableOnFloor } from './floorAnchor';
import type { Asset } from '../../types/asset';
import { useEditorStore, selectFloorSettingsDirty } from '../editor/stores/editorStore';

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

export function useEffectiveFiberPaths() {
  const saved = useSubstationWorkingCopy((s) => s.saved.fiberPaths);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.fiberPaths);
  return useMemo(() => mergeEffective(saved, overlay, fiberPathDescriptor), [saved, overlay]);
}

/**
 * 자산 하위레코드(inspections/logs/photos)의 staged effective(저장 대기 create + pending update).
 * saved 는 []이므로 결과 = staged creates. 레지스트리-파생 descriptor 로 컬렉션 무관 단일 구현 —
 * 종전의 useEffectiveInspections/Logs/Photos 는 이걸 감싸는 thin wrapper(back-compat).
 */
export function useEffectiveRecords<T = Record<string, unknown> & { id: string }>(
  key: RecordTypeKey,
): T[] {
  const saved = useSubstationWorkingCopy((s) => s.saved[key as CollectionKey]);
  const overlay = useSubstationWorkingCopy((s) => s.overlays[key as CollectionKey]);
  const descriptor = recordDescriptorOf(key);
  return useMemo(
    () => mergeEffective(saved as never[], overlay as never, descriptor as never) as T[],
    [saved, overlay, descriptor],
  );
}

/** staged 점검 — useEffectiveRecords('inspections') 의 thin wrapper. */
export function useEffectiveInspections(): InspectionRow[] {
  return useEffectiveRecords<InspectionRow>('inspections');
}

/** staged 고장이력 — useEffectiveRecords('logs') 의 thin wrapper. */
export function useEffectiveLogs(): LogRow[] {
  return useEffectiveRecords<LogRow>('logs');
}

/** staged 사진 — useEffectiveRecords('photos') 의 thin wrapper. */
export function useEffectivePhotos(): PhotoRow[] {
  return useEffectiveRecords<PhotoRow>('photos');
}

/**
 * SSOT-2d Task 4 — 한 층(floorId)의 배치(placement)-레벨 설비를
 * effective(saved+overlay) 에서 뽑아 Asset[] 로 반환한다.
 *
 * 캔버스 hot path 용: saved/overlay 슬라이스 ref 는 load/stage 때만 바뀌므로
 * useMemo 로 변환 결과 배열의 참조가 변경 없을 때 안정(referentially stable)하다.
 * 필터: 같은 층 AND 랙-모듈 자식(parentAssetId && slotIndex!=null) 제외.
 */
/** 한 층의 배치(placement) Asset — 캔버스가 Asset 을 직접 투영(북극성 ③). 랙모듈 자식 제외. */
export function useEffectiveEquipment(floorId: string): Asset[] {
  const saved = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  return useMemo(() => {
    const eff = mergeEffective(saved, overlay, assetDescriptor);
    return eff.filter((a) => a.floorId === floorId && !(a.parentAssetId && a.slotIndex != null));
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
    // 단계3a — 멤버십은 단일 endpoint assetId + floorAnchor 하나로. branch endpoint 는
    // branch→feeder→panel 으로 해소되어 회로 특수처리(distributionEquipmentId 증강) 불필요.
    const assetsById = assetsByIdMap(effAssets);
    const effCables = mergeEffective(savedCables, overlayCables, cableDescriptor);
    return effCables.filter((c) =>
      cableOnFloor(c as unknown as Parameters<typeof cableOnFloor>[0], floorId, assetsById),
    );
  }, [savedAssets, overlayAssets, savedCables, overlayCables, floorId]);
}

/** assets overlay 슬라이스 직접 구독(staged 변경 여부 등 overlay 자체가 필요할 때). */
export function useEffectiveAssetsOverlay() {
  return useSubstationWorkingCopy((s) => s.overlays.assets);
}

/** 전 컬렉션 staged 변경 합계(creates+updates+deletes). 0 이면 깨끗함. 레지스트리 단일 소스. */
export function useWorkingCopyDirty() {
  const overlays = useSubstationWorkingCopy((s) => s.overlays);
  return useMemo(() => sumOverlaysDirty(overlays), [overlays]);
}

/**
 * USP Task 1 — 단일 dirty 신호.
 *
 * 통합 working-copy overlay(assets/cables/fiber/inspections/logs/photos)의 staged 변경
 * 합계에 floor-level 설정(배경) staged 여부를 더한다. 0 이면 저장할 게 없다 → 저장 바 숨김.
 * (사진·로그·점검은 substationStore 컬렉션으로 흡수돼 wc 에 이미 포함된다.)
 */
export function useUnifiedDirty(): number {
  const wc = useWorkingCopyDirty();
  const floorDirty = useEditorStore(selectFloorSettingsDirty);
  return wc + (floorDirty ? 1 : 0);
}

/**
 * USP Task 3 — useUnifiedDirty 의 non-hook 판본.
 *
 * 이탈 가드(beforeunload)나 네비게이션 confirm 처럼 React 렌더 밖(이벤트 핸들러)에서
 * 같은 단일 dirty 신호를 즉시 읽어야 할 때 사용한다. getState() 로 통합 working copy
 * overlay 와 editorStore 의 pending 큐 / floor 설정 staged 여부를 합산한다. 0 이면
 * 저장할 게 없다(드래프트/hasChanges 폐지 후의 단일 진실).
 */
export function getUnifiedDirtyCount(): number {
  const wc = useSubstationWorkingCopy.getState();
  const overlay = sumOverlaysDirty(wc.overlays); // 사진·로그·점검 포함
  const es = useEditorStore.getState();
  return overlay + (selectFloorSettingsDirty(es) ? 1 : 0);
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
