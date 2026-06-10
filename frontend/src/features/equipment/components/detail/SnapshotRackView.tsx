import { useMemo } from 'react';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../editor/stores/snapshotStore';

/* ================================================================
   Snapshot Rack View — read-only internal equipment from snapshot
   ================================================================ */

export function SnapshotRackView({ equipmentId }: { equipmentId: string }) {
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);

  const internalEquipment = useMemo(
    () => snapshotEquipment.filter((e) => e.parentEquipmentId === equipmentId),
    [snapshotEquipment, equipmentId]
  );

  if (internalEquipment.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-content-faint">
        내부 설비 없음
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {internalEquipment.map((eq) => (
        <div
          key={eq.id}
          onClick={() => setDetailPanelEquipmentId(eq.id)}
          className="border border-line rounded px-3 py-2 hover:bg-info-bg cursor-pointer transition-colors"
        >
          <p className="text-sm font-medium text-content-muted truncate">{eq.name}</p>
          {eq.materialCategoryCode && (
            <p className="text-xs text-content-faint">{eq.materialCategoryCode}</p>
          )}
        </div>
      ))}
    </div>
  );
}
