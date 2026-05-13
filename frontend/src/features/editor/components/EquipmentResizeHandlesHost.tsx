import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { EquipmentResizeHandles } from './EquipmentResizeHandles';

/**
 * 캔버스 오버레이 — 선택된 설비가 정확히 1 개이고 select 도구 모드일 때
 * 그 설비의 8 모서리·꼭지점 리사이즈 핸들을 띄운다. 케이블 그리기/스냅샷
 * 미리보기 등 다른 모드에서는 숨김 (편집 모드 한정).
 */
export function EquipmentResizeHandlesHost() {
  const tool = useEditorStore((s) => s.tool);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const snapshotActive = useSnapshotStore((s) => s.active);

  if (snapshotActive) return null;
  if (tool !== 'select') return null;
  if (selectedIds.length !== 1) return null;

  const selected = localEquipment.find((eq) => eq.id === selectedIds[0]);
  if (!selected) return null;

  return (
    <EquipmentResizeHandles
      equipment={selected}
      zoom={zoom}
      panX={panX}
      panY={panY}
    />
  );
}
