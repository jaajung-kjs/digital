import { useMemo } from 'react';
import { useFiberPaths } from './useFiberPaths';
import { useEditorStore, selectChanges } from '../../editor/stores/editorStore';
import type { FiberPathDetail, FiberPortStatus } from '../types';

/**
 * Merge changeSet pending cable creates/deletes into the fiber path port statuses
 * so the UI reflects unsaved changes immediately.
 */
function mergePendingChanges(
  paths: FiberPathDetail[],
  changeSet: ReturnType<typeof useEditorStore.getState>['changeSet'],
  localEquipment: { id: string; name: string }[],
  ofdId: string,
): FiberPathDetail[] {
  const cableCreates = selectChanges(changeSet, 'cable:create')
    .filter((c) => c.cableType === 'FIBER' && c.fiberPathId && c.fiberPortNumber);
  const cableDeletes = new Set(selectChanges(changeSet, 'cable:delete').map((c) => c.cableId));

  if (cableCreates.length === 0 && cableDeletes.size === 0) return paths;

  const equipMap = new Map(localEquipment.map((e) => [e.id, e.name]));

  return paths.map((path) => {
    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      let sideA = port.sideA && !cableDeletes.has(port.sideA.cableId) ? port.sideA : null;
      let sideB = port.sideB && !cableDeletes.has(port.sideB.cableId) ? port.sideB : null;

      for (const cable of cableCreates) {
        if (cable.fiberPathId !== path.id || cable.fiberPortNumber !== port.portNumber) continue;

        const isLocalA = path.ofdA.id === ofdId;
        const isConnectingToOfdAsSource = cable.sourceEquipmentId === ofdId;
        const otherEquipId = isConnectingToOfdAsSource ? cable.targetEquipmentId : cable.sourceEquipmentId;
        const otherName = equipMap.get(otherEquipId) ?? '?';

        const usage = { cableId: cable.localId, equipmentId: otherEquipId, equipmentName: otherName };

        if (isLocalA) {
          sideA = sideA ?? usage;
        } else {
          sideB = sideB ?? usage;
        }
      }

      return { ...port, sideA, sideB };
    });

    return { ...path, ports: newPorts };
  });
}

/**
 * Single source of truth for port status: backend data + pending changeSet merged.
 * Used by FiberPathManager and ConnectionDiagram.
 */
export function usePortStatus(ofdId: string) {
  const { data: paths, isLoading } = useFiberPaths(ofdId);
  const changeSet = useEditorStore((s) => s.changeSet);
  const localEquipment = useEditorStore((s) => s.localEquipment);

  const mergedPaths = useMemo(() => {
    if (!paths) return [];
    return mergePendingChanges(paths, changeSet, localEquipment, ofdId);
  }, [paths, changeSet, localEquipment, ofdId]);

  return { mergedPaths, isLoading };
}
