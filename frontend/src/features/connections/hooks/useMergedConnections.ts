import { useMemo } from 'react';
import type { RoomConnection } from '../../../types/connection';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { type ChangeEntry, selectChanges } from '../../editor/stores/editorStore';

/**
 * Merge backend connections with local pending cable changes from the changeSet.
 * Shared by ConnectionOverlay and ConnectionDiagram.
 */
export function useMergedConnections(
  backendConnections: RoomConnection[] | undefined,
  changeSet: ChangeEntry[],
  localEquipment: FloorPlanEquipment[],
): RoomConnection[] {
  return useMemo(() => {
    const base = backendConnections ?? [];

    const cableCreates = selectChanges(changeSet, 'cable:create');
    const cableUpdates = selectChanges(changeSet, 'cable:update');
    const cableDeletions = selectChanges(changeSet, 'cable:delete');

    const updatedIds = new Set(cableUpdates.map((c) => c.id));
    const deletedIds = new Set(cableDeletions.map((c) => c.cableId));
    const equipById = new Map(localEquipment.map((e) => [e.id, e]));

    const merged = base
      .filter((c) => !deletedIds.has(c.id))
      .map((c) => {
        if (updatedIds.has(c.id)) {
          const update = cableUpdates.find((u) => u.id === c.id)!;
          return { ...c, ...update };
        }
        return c;
      });

    for (const cable of cableCreates) {
      if (deletedIds.has(cable.localId)) continue;
      const srcEq = equipById.get(cable.sourceEquipmentId);
      const tgtEq = equipById.get(cable.targetEquipmentId);
      merged.push({
        id: cable.localId,
        sourceEquipmentId: cable.sourceEquipmentId,
        targetEquipmentId: cable.targetEquipmentId,
        cableType: cable.cableType,
        label: cable.label,
        length: cable.length,
        color: cable.color,
        fiberPathId: cable.fiberPathId,
        fiberPortNumber: cable.fiberPortNumber,
        sourceEquipment: { id: cable.sourceEquipmentId, name: srcEq?.name ?? '', rackId: null, roomId: null },
        targetEquipment: { id: cable.targetEquipmentId, name: tgtEq?.name ?? '', rackId: null, roomId: null },
      });
    }

    return merged;
  }, [backendConnections, changeSet, localEquipment]);
}
