import { useMemo } from 'react';
import { useOfdDirectory } from './useOfdDirectory';
import {
  useEffectiveFiberPaths,
  useEffectiveCables,
  useEffectiveAssets,
} from '../../workingCopy/hooks';
import { composeFiberPaths } from '../../workingCopy/merge';
import type { Asset } from '../../../types/asset';
import type { FiberPathDetail, FiberPortStatus, FiberPortUsage } from '../types';

/**
 * 통합 스토어 effective cable 한쪽 끝의 폴리모픽 endpoint(equipmentId | moduleId).
 * cable.service DTO(connections 뷰와 동일)는 source/target 를 nested 객체로 준다.
 */
export interface EffectiveCableEndpoint {
  equipmentId?: string | null;
  moduleId?: string | null;
}
export interface EffectiveCable {
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
 *
 * 양쪽 채움(2026-06-10 fix): 이전엔 현재 보고 있는 OFD(ofdId)에 닿는 케이블에서만
 * **로컬 side** 를 채워 → 상대 대국(remote side)이 항상 미연결로 표시됐다. 백엔드
 * `buildPortStatuses` 처럼 각 path 의 ofdA/ofdB 양쪽 케이블에서 sideA/sideB 를 모두
 * 채운다. 이렇게 해야 topology tracer 도 OFD↔OFD 를 양쪽 포트로 연결할 수 있다.
 */
export function overlayEffectiveCables(
  paths: FiberPathDetail[],
  effectiveCables: EffectiveCable[],
  resolveName: (id: string) => string,
): FiberPathDetail[] {
  const fiberCables = effectiveCables.filter(
    (c) => c.cableType === 'FIBER' && c.fiberPathId && c.fiberPortNumber != null,
  );

  if (fiberCables.length === 0) return paths;

  // endpoint 가 모듈이면 moduleId, 아니면 equipmentId 로 식별(폴리모픽).
  const touches = (ep: EffectiveCableEndpoint | null | undefined, id: string): boolean =>
    !!ep && (ep.equipmentId === id || ep.moduleId === id);
  const otherIdOf = (ep: EffectiveCableEndpoint | null | undefined): string =>
    ep?.moduleId ?? ep?.equipmentId ?? '';
  const usageFor = (cable: EffectiveCable, otherEnd: EffectiveCableEndpoint | null | undefined): FiberPortUsage => {
    const id = otherIdOf(otherEnd);
    return { cableId: cable.id, equipmentId: id, equipmentName: resolveName(id) };
  };

  return paths.map((path) => {
    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      let sideA = port.sideA;
      let sideB = port.sideB;

      for (const cable of fiberCables) {
        if (cable.fiberPathId !== path.id || cable.fiberPortNumber !== port.portNumber) continue;

        // side A: ofdA 에 닿는 케이블 → remote = ofdA 에 닿지 않은 반대쪽 끝.
        if (sideA == null) {
          if (touches(cable.source, path.ofdA.id)) sideA = usageFor(cable, cable.target);
          else if (touches(cable.target, path.ofdA.id)) sideA = usageFor(cable, cable.source);
        }
        // side B: ofdB 에 닿는 케이블 → remote = ofdB 에 닿지 않은 반대쪽 끝.
        if (sideB == null) {
          if (touches(cable.source, path.ofdB.id)) sideB = usageFor(cable, cable.target);
          else if (touches(cable.target, path.ofdB.id)) sideB = usageFor(cable, cable.source);
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
    // 상대 대국이 타 변전소 OFD 라 effective assets 에 없을 수 있으므로 OFD
    // directory 를 fallback 으로 사용(전역 OFD 목록 → 타 변전소 이름까지 해소).
    const assetNameById = new Map(
      (effectiveAssets as Asset[]).map((a) => [a.id, a.name]),
    );
    const resolveName = (id: string): string =>
      assetNameById.get(id) ?? directory.get(id)?.name ?? '?';

    return overlayEffectiveCables(
      composed,
      effectiveCables as unknown as EffectiveCable[],
      resolveName,
    );
  }, [effectiveFiberPaths, effectiveCables, effectiveAssets, ofdId, directory]);

  // 통합 스토어는 항상 로드돼 있고(에디터 진입 시 load), per-OFD fetch 가 없으므로
  // 별도 로딩 상태가 없다. 호출측 호환을 위해 isLoading: false 고정.
  return { mergedPaths, isLoading: false };
}
