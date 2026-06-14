/**
 * OFD 포트에서 cable drawing 시작 — 일반 cable drawing flow 의 source 로 진입.
 * 캔버스에서 도착 설비 클릭 → OfdPortPicker / pickingTargetModule → CableSpecModal
 * → addCable (spec 완전 포함) 의 통일 흐름.
 */

import { useEditorStore } from '../editor/stores/editorStore';
import { useInteractionStore } from '../editor/stores/interactionStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { getEquipmentCenter } from '../../utils/floorplan/elementSystem';

/**
 * @deprecated Task 5 에서 삭제 예정 — 구 FiberPathManager 전용(현재 미마운트).
 * P6 Task 2 에서 fiberPathId/portNumber → slotId/coreNumber 로 시그니처 변경.
 */
export function startOfdCableDrawing(ofdEquipmentId: string, slotId: string, coreNumber: number): void {
  const editor = useEditorStore.getState();
  const asset = useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === ofdEquipmentId);
  if (!asset) return;
  editor.setPreselectedCableDisplayGroup('광');
  useInteractionStore.getState().cableSetSource(slotId, getEquipmentCenter(asset), {
    slotId,
    coreNumber,
  });
}
