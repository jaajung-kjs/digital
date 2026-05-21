import { useMemo } from 'react';
import { useFiberPaths } from './useFiberPaths';
import { useOfdDirectory } from './useOfdDirectory';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { composePendingPath } from '../pending';
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
  deletedCableIds: string[],
): FiberPathDetail[] {
  const deletedSet = new Set(deletedCableIds);

  // Find cables relevant to this OFD with fiber path assignments
  const fiberCables = localCables.filter(
    (c) =>
      c.cableType === 'FIBER' &&
      c.fiberPathId &&
      c.fiberPortNumber != null &&
      (c.sourceEquipmentId === ofdId || c.targetEquipmentId === ofdId)
  );

  // 모든 path 에 대해 (1) saved 의 deleted cable 을 sideA/sideB 에서 제거 (2) pending cable 을 overlay
  if (fiberCables.length === 0 && deletedSet.size === 0) return paths;

  const equipMap = new Map(localEquipment.map((e) => [e.id, e.name]));

  return paths.map((path) => {
    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      // (1) deleted saved cable 제거 — backend snapshot 의 sideA/sideB 라도 frontend 가 지웠으면 null
      let sideA = port.sideA && deletedSet.has(port.sideA.cableId) ? null : port.sideA;
      let sideB = port.sideB && deletedSet.has(port.sideB.cableId) ? null : port.sideB;

      // (2) pending cable overlay
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
 * Single source of truth for port status: backend data + local cables + pending fiber paths merged.
 * Used by FiberPathManager and ConnectionDiagram.
 */
export function usePortStatus(ofdId: string) {
  const { data: paths, isLoading } = useFiberPaths(ofdId);
  const localCables = useEditorStore((s) => s.localCables);
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const pendingFiberPaths = useEditorStore((s) => s.pendingFiberPaths);
  const deletedFiberPathIds = useEditorStore((s) => s.deletedFiberPathIds);
  const deletedCableIds = useEditorStore((s) => s.deletedCableIds);

  const directory = useOfdDirectory();
  const mergedPaths = useMemo(() => {
    if (!paths) return [];
    // pending canonical → FiberPathDetail (directory 로 OFD 정보 합성). saved 와
    // 같은 shape 으로 만들어 cable overlay 가 양쪽 균일 적용.
    const activeSaved = paths.filter((p) => !deletedFiberPathIds.includes(p.id));
    const activePending = pendingFiberPaths
      .filter((fp) => fp.ofdAId === ofdId || fp.ofdBId === ofdId)
      .map((fp) => composePendingPath(fp, directory));
    return mergePendingCables(
      [...activeSaved, ...activePending],
      localCables,
      localEquipment,
      ofdId,
      deletedCableIds,
    );
  }, [paths, localCables, localEquipment, ofdId, pendingFiberPaths, deletedFiberPathIds, deletedCableIds, directory]);

  return { mergedPaths, isLoading };
}
