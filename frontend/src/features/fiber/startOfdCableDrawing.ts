/**
 * OFD 포트에서 cable drawing 시작 — 일반 cable drawing flow 의 source 로 진입.
 * 캔버스에서 도착 설비 클릭 → OfdPortPicker / pickingTargetModule → CableSpecModal
 * → addCable (spec 완전 포함) 의 통일 흐름.
 */

import { useEditorStore } from '../editor/stores/editorStore';
import { useInteractionStore } from '../editor/stores/interactionStore';
import { getEquipmentCenter } from '../../utils/floorplan/elementSystem';

export function startOfdCableDrawing(ofdEquipmentId: string, fiberPathId: string, portNumber: number): void {
  const editor = useEditorStore.getState();
  const ofd = editor.localEquipment.find((e) => e.id === ofdEquipmentId);
  if (!ofd) return;
  editor.setPreselectedCableDisplayGroup('광');
  useInteractionStore.getState().cableSetSource(ofdEquipmentId, getEquipmentCenter(ofd), {
    fiberPathId,
    portNumber,
  });
}
