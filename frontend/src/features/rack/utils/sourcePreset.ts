import type { Asset } from '../../../types/asset';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

/**
 * RACK equipment 의 source preset 추적.
 *
 * 데이터 위치: Asset 전용 컬럼 `sourcePresetId`(#7). 이 유틸은 그 컬럼을 직접
 * 읽고, 갱신 시 stageAssetUpdate 로 동일 컬럼을 스테이징한다 — round-trip 은
 * 백엔드 source_preset_id 컬럼으로 영속.
 */

export function readSourcePresetId(asset: Asset | undefined): string | null {
  return asset?.sourcePresetId ?? null;
}

/**
 * 랙의 source preset id 를 갱신 (저장/불러오기/사이드바 배치 시 호출).
 * SSOT-2d3a Task 2 — 통합 스토어 effective 에서 현재 랙을 찾아 sourcePresetId 컬럼을
 * stageAssetUpdate 로 직접 스테이징한다.
 */
export function updateRackSourcePreset(rackEquipmentId: string, presetId: string | null): void {
  const store = useSubstationWorkingCopy.getState();
  const rackAsset = store.effectiveAssets().find((a) => a.id === rackEquipmentId);
  if (!rackAsset) return;
  store.stageAssetUpdate(rackEquipmentId, { sourcePresetId: presetId ?? null });
}
