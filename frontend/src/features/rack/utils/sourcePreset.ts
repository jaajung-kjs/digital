import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

/**
 * RACK equipment 의 source preset 추적.
 *
 * 데이터 위치: Asset 전용 컬럼 `sourcePresetId`(#7). FE 캐리어는 여전히
 * Equipment.properties.sourcePresetId 이며(assetToEquipment 가 컬럼→properties 로
 * 재구성, equipmentToAsset 가 properties→컬럼 으로 역매핑) 이 유틸은 그 캐리어를
 * 읽고/쓴다 — round-trip 은 백엔드 source_preset_id 컬럼으로 영속.
 */

interface RackProperties {
  sourcePresetId?: string;
  [key: string]: unknown;
}

export function readSourcePresetId(eq: FloorPlanEquipment | undefined): string | null {
  if (!eq) return null;
  const props = (eq.properties as RackProperties | null | undefined) ?? null;
  const id = props?.sourcePresetId;
  return typeof id === 'string' ? id : null;
}

function withSourcePresetId(eq: FloorPlanEquipment, presetId: string | null): FloorPlanEquipment {
  const prev = (eq.properties as RackProperties | null | undefined) ?? {};
  const next: RackProperties = { ...prev };
  if (presetId) {
    next.sourcePresetId = presetId;
  } else {
    delete next.sourcePresetId;
  }
  // 빈 객체면 DB JSON 컬럼 noise 안 쌓이게 null 로.
  return { ...eq, properties: Object.keys(next).length > 0 ? next : null };
}

/**
 * 랙의 source preset id 를 갱신 (저장/불러오기/사이드바 배치 시 호출).
 * SSOT-2d3a Task 2 — 통합 스토어 effective 에서 현재 랙을 찾아 properties 를 머지한 뒤
 * stageEquipmentUpdate 로 스테이징한다(properties ↔ attributes 라운드트립).
 */
export function updateRackSourcePreset(rackEquipmentId: string, presetId: string | null): void {
  const store = useSubstationWorkingCopy.getState();
  const rackAsset = store.effectiveAssets().find((a) => a.id === rackEquipmentId);
  if (!rackAsset) return;
  // 전용 컬럼 sourcePresetId 를 FloorPlanEquipment.properties 모양으로 보고 머지.
  const eqLike = {
    properties: rackAsset.sourcePresetId ? { sourcePresetId: rackAsset.sourcePresetId } : null,
  } as FloorPlanEquipment;
  const next = withSourcePresetId(eqLike, presetId);
  store.stageEquipmentUpdate(rackEquipmentId, { properties: next.properties });
}
