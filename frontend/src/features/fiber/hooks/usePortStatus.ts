import { useMemo } from 'react';
import { useFiberPaths } from './useFiberPaths';
import { useEditorStore, type LocalCable, type PendingFiberPath } from '../../editor/stores/editorStore';
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
 * Convert pending fiber paths into FiberPathDetail-like objects for display.
 */
function pendingToFiberPaths(
  pendingPaths: PendingFiberPath[],
  ofdId: string,
  localEquipment: { id: string; name: string }[],
): FiberPathDetail[] {
  const equipMap = new Map(localEquipment.map((e) => [e.id, e.name]));

  return pendingPaths
    .filter((fp) => fp.ofdAId === ofdId || fp.ofdBId === ofdId)
    .map((fp) => ({
      id: fp.id,
      ofdA: {
        id: fp.ofdAId,
        name: equipMap.get(fp.ofdAId) ?? '?',
        substationName: equipMap.get(fp.ofdAId) ?? '?',
        floorId: null,
      },
      ofdB: {
        id: fp.ofdBId,
        name: equipMap.get(fp.ofdBId) ?? '?',
        substationName: equipMap.get(fp.ofdBId) ?? '?',
        floorId: null,
      },
      portCount: fp.portCount,
      description: fp.description ?? null,
      ports: Array.from({ length: fp.portCount }, (_, i) => ({
        portNumber: i + 1,
        sideA: null,
        sideB: null,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
}

/**
 * Single source of truth for port status: backend data + local cables + pending fiber paths merged.
 * Used by FiberPathManager and ConnectionDiagram.
 */
export function usePortStatus(ofdId: string) {
  const { data: paths, isLoading } = useFiberPaths(ofdId);
  const localCables = useEditorStore((s) => s.localCables);
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const pendingFiberPaths = useEditorStore((s) => s.pendingFiberPaths);
  const deletedFiberPathIds = useEditorStore((s) => s.deletedFiberPathIds);

  const mergedPaths = useMemo(() => {
    if (!paths) return [];
    // Filter out deleted paths
    const activePaths = paths.filter((p) => !deletedFiberPathIds.includes(p.id));
    // Merge local cables into saved paths
    const withCables = mergePendingCables(activePaths, localCables, localEquipment, ofdId);
    // Add pending fiber paths
    const pending = pendingToFiberPaths(pendingFiberPaths, ofdId, localEquipment);
    return [...withCables, ...pending];
  }, [paths, localCables, localEquipment, ofdId, pendingFiberPaths, deletedFiberPathIds]);

  return { mergedPaths, isLoading };
}
