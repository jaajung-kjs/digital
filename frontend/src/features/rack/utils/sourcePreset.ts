import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../../editor/stores/editorStore';

/**
 * RACK equipment 의 source preset 추적.
 *
 * 데이터 위치: Equipment.properties JSON (스키마 주석에 "RACK kind 는
 * properties 거의 비어있음" 으로 우리 metadata 전용 자리로 사용). 백엔드
 * 컬럼 추가 없이 round-trip 보존.
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
 * 변경된 localEquipment 를 store 에 commit + hasChanges 표시.
 */
export function updateRackSourcePreset(rackEquipmentId: string, presetId: string | null): void {
  const store = useEditorStore.getState();
  const next = store.localEquipment.map((eq) =>
    eq.id === rackEquipmentId ? withSourcePresetId(eq, presetId) : eq,
  );
  store.setLocalEquipment(next);
  store.setHasChanges(true);
}
