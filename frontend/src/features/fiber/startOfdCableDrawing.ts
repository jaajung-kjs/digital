/**
 * OFD 포트에서 cable drawing 시작 — 공용 진입점.
 *
 * OFD 상세 패널의 경로탭 (OfdEquipmentPanel) 과 일반 연결탭 (ConnectionsTab) 둘 다
 * "사용자가 OFD 의 빈 포트를 클릭" 시 같은 동작을 보장한다. 옛 ofdFlow (interactionStore
 * 의 ofdStartFromOfd) 대신 일반 cable drawing flow 의 source 로 진입 — 캔버스에서
 * 도착 설비 클릭 → OfdPortPicker / pickingTargetModule → CableSpecModal → addCable
 * (spec 완전 포함) 의 통일된 흐름.
 */

import { useEditorStore } from '../editor/stores/editorStore';
import { useInteractionStore } from '../editor/stores/interactionStore';

export function startOfdCableDrawing(ofdEquipmentId: string, fiberPathId: string, portNumber: number): void {
  const editor = useEditorStore.getState();
  const ofd = editor.localEquipment.find((e) => e.id === ofdEquipmentId);
  if (!ofd) return;
  const center = {
    x: ofd.positionX + ofd.width / 2,
    y: ofd.positionY + ofd.height / 2,
  };
  editor.setPreselectedCableDisplayGroup('광');
  useInteractionStore.getState().cableSetSource(ofdEquipmentId, center, {
    fiberPathId,
    portNumber,
  });
}
