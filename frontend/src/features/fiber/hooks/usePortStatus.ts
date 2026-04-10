import { useMemo } from 'react';
import { useFiberPaths } from './useFiberPaths';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import type { FiberPathDetail, FiberPortStatus } from '../types';

/**
 * Merge localCables into the fiber path port statuses
 * so the UI reflects unsaved changes immediately.
 */
function mergePendingCables(
  paths: FiberPathDetail[],
  localCables: LocalCable[],
  localEquipment: { id: string; name: string }[],
  ofdId: string,
): FiberPathDetail[] {
  // Find cables relevant to this OFD with fiber path assignments
  const fiberCables = localCables.filter(
    (c) =>
      c.cableType === 'FIBER' &&
      c.fiberPathId &&
      c.fiberPortNumber != null &&
      (c.sourceEquipmentId === ofdId || c.targetEquipmentId === ofdId)
  );

  if (fiberCables.length === 0) return paths;

  const equipMap = new Map(localEquipment.map((e) => [e.id, e.name]));

  return paths.map((path) => {
    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      let sideA = port.sideA;
      let sideB = port.sideB;

      for (const cable of fiberCables) {
        if (cable.fiberPathId !== path.id || cable.fiberPortNumber !== port.portNumber) continue;

        const isLocalA = path.ofdA.id === ofdId;
        const isConnectingToOfdAsSource = cable.sourceEquipmentId === ofdId;
        const otherEquipId = isConnectingToOfdAsSource ? cable.targetEquipmentId : cable.sourceEquipmentId;
        const otherName = equipMap.get(otherEquipId) ?? '?';

        const usage = { cableId: cable.id, equipmentId: otherEquipId, equipmentName: otherName };

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
 * Single source of truth for port status: backend data + local cables merged.
 * Used by FiberPathManager and ConnectionDiagram.
 */
export function usePortStatus(ofdId: string) {
  const { data: paths, isLoading } = useFiberPaths(ofdId);
  const localCables = useEditorStore((s) => s.localCables);
  const localEquipment = useEditorStore((s) => s.localEquipment);

  const mergedPaths = useMemo(() => {
    if (!paths) return [];
    return mergePendingCables(paths, localCables, localEquipment, ofdId);
  }, [paths, localCables, localEquipment, ofdId]);

  return { mergedPaths, isLoading };
}
