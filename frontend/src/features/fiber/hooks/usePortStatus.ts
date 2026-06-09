import { useMemo } from 'react';
import { useOfdDirectory } from './useOfdDirectory';
import {
  useEffectiveFiberPaths,
  useEffectiveCables,
  useEffectiveAssets,
} from '../../workingCopy/hooks';
import { composeFiberPaths } from '../../workingCopy/merge';
import type { Asset } from '../../../types/asset';
import type { FiberPathDetail, FiberPortStatus } from '../types';

/**
 * 통합 스토어 effective cable 한쪽 끝의 폴리모픽 endpoint(equipmentId | moduleId).
 * cable.service DTO(connections 뷰와 동일)는 source/target 를 nested 객체로 준다.
 */
interface EffectiveCableEndpoint {
  equipmentId?: string | null;
  moduleId?: string | null;
}
interface EffectiveCable {
  id: string;
  cableType?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  source?: EffectiveCableEndpoint | null;
  target?: EffectiveCableEndpoint | null;
}

/**
 * Merge effective cables into the fiber path port statuses
 * so the UI reflects unsaved changes immediately.
 *
 * 통합 스토어로 이관(2d-3a T4): saved + staged 케이블 모두 effective cables 단일
 * 소스에서 온다. 따라서 별도의 "saved deleted" 필터가 필요 없다 — 삭제된 케이블은
 * effective 에서 이미 빠져 있으므로 단순히 effective 케이블만 overlay 하면 된다.
 */
function overlayEffectiveCables(
  paths: FiberPathDetail[],
  effectiveCables: EffectiveCable[],
  assetNameById: Map<string, string>,
  ofdId: string,
): FiberPathDetail[] {
  // Find fiber cables relevant to this OFD with fiber path assignments
  const fiberCables = effectiveCables.filter(
    (c) =>
      c.cableType === 'FIBER' &&
      c.fiberPathId &&
      c.fiberPortNumber != null &&
      (c.source?.equipmentId === ofdId || c.target?.equipmentId === ofdId),
  );

  if (fiberCables.length === 0) return paths;

  return paths.map((path) => {
    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      let sideA = port.sideA;
      let sideB = port.sideB;

      for (const cable of fiberCables) {
        if (cable.fiberPathId !== path.id || cable.fiberPortNumber !== port.portNumber) continue;

        const isLocalA = path.ofdA.id === ofdId;
        const isConnectingToOfdAsSource = cable.source?.equipmentId === ofdId;
        // 반대쪽 끝 — endpoint 가 모듈이면 moduleId, 아니면 equipmentId.
        const otherEnd = isConnectingToOfdAsSource ? cable.target : cable.source;
        const otherId = otherEnd?.moduleId ?? otherEnd?.equipmentId ?? '';
        const otherName = assetNameById.get(otherId) ?? '?';

        const usage = { cableId: cable.id, equipmentId: otherId, equipmentName: otherName };

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
 * Single source of truth for port status: effective fiber paths (통합 스토어) +
 * effective cables 를 합성/overlay 하여 만든다. FiberPathManager 와 ConnectionDiagram 사용.
 *
 * 이전: useFiberPaths(per-OFD denorm) + editorStore.pending/deleted overlay.
 * 이관 후: saved+staged 가 모두 통합 스토어 effective 에 있으므로 그것만 소스로 쓴다.
 */
export function usePortStatus(ofdId: string) {
  const effectiveFiberPaths = useEffectiveFiberPaths();
  const effectiveCables = useEffectiveCables();
  const effectiveAssets = useEffectiveAssets();
  const directory = useOfdDirectory();

  const mergedPaths = useMemo(() => {
    // 이 OFD 와 관련된 effective fiber path 만.
    const ofdPaths = (effectiveFiberPaths as unknown as Array<{
      id: string; ofdAId: string; ofdBId: string; portCount: number; description?: string | null;
    }>).filter((fp) => fp.ofdAId === ofdId || fp.ofdBId === ofdId);

    const composed = composeFiberPaths(ofdPaths, directory);

    // 케이블 endpoint 이름 lookup — effective assets (top + 랙모듈 자식) 전체.
    const assetNameById = new Map(
      (effectiveAssets as Asset[]).map((a) => [a.id, a.name]),
    );

    return overlayEffectiveCables(
      composed,
      effectiveCables as unknown as EffectiveCable[],
      assetNameById,
      ofdId,
    );
  }, [effectiveFiberPaths, effectiveCables, effectiveAssets, ofdId, directory]);

  // 통합 스토어는 항상 로드돼 있고(에디터 진입 시 load), per-OFD fetch 가 없으므로
  // 별도 로딩 상태가 없다. 호출측 호환을 위해 isLoading: false 고정.
  return { mergedPaths, isLoading: false };
}
