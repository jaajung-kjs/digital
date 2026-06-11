import { useMemo } from 'react';
import { useOfdDirectory } from './useOfdDirectory';
import { useFiberPaths } from './useFiberPaths';
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
export interface EffectiveCable {
  id: string;
  cableType?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  // 단계4b — endpoint = 단일 assetId(구 nested source/target {equipmentId,moduleId} 폐지).
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
}

/**
 * 이 변전소의 staged 케이블을 fiber path 의 **로컬 side** 에만 overlay 한다.
 *
 * 배경(2026-06-10 재수정): 통합 working copy 는 변전소-범위(substation-scoped)다 —
 * effective cables 에는 *이 변전소* 케이블만 있다. fiber path 의 상대 대국(remote OFD)
 * tail 케이블은 보통 다른 변전소에 있어 effective 에서 절대 보이지 않는다. 따라서
 * remote side 를 effective 케이블로 채우려 하면 항상 "상대 대국 미연결" 이 된다.
 *
 * 해결: remote side(cross-substation)는 backend `useFiberPaths(ofdId)` 가 이미 올바로
 * 계산해 준 값을 그대로 둔다. 로컬 side(보고 있는 OFD = ofdId 에 닿는 쪽)만 이 변전소
 * staged 케이블로 다시 계산(override)해 방금 그린/지운 케이블이 즉시 미리보기되게 한다.
 *
 * 로컬 side 매핑(backend buildPortStatuses 규약과 동일): path.ofdA.id === ofdId 이면
 * 로컬 = sideA, 아니면 로컬 = sideB. effective 는 삭제된 케이블을 이미 제외하므로
 * 로컬 side 를 effective 로 *덮어쓰면* staged 추가/삭제가 모두 반영된다.
 */
export function overlayLocalStagedCables(
  paths: FiberPathDetail[],
  effectiveCables: EffectiveCable[],
  resolveName: (id: string) => string,
  ofdId: string,
): FiberPathDetail[] {
  const fiberCables = effectiveCables.filter(
    (c) => c.cableType === 'FIBER' && c.fiberPathId && c.fiberPortNumber != null,
  );

  const usageFor = (cable: EffectiveCable, otherAssetId: string | null | undefined): FiberPortUsage => {
    const id = otherAssetId ?? '';
    return { cableId: cable.id, assetId: id, assetName: resolveName(id) };
  };

  return paths.map((path) => {
    // 로컬 = 보고 있는 OFD(ofdId)에 닿는 side. backend 규약과 동일하게 ofdA→sideA.
    const localIsA = path.ofdA.id === ofdId;
    const localOfdId = localIsA ? path.ofdA.id : path.ofdB.id;

    const newPorts: FiberPortStatus[] = path.ports.map((port) => {
      // 로컬 side 는 effective 케이블로 다시 계산 — staged 추가는 채워지고, staged
      // 삭제는 (effective 에 없으므로) null 로 비워진다. remote side(backend)는 그대로.
      let localUsage: FiberPortUsage | null = null;
      for (const cable of fiberCables) {
        if (cable.fiberPathId !== path.id || cable.fiberPortNumber !== port.portNumber) continue;
        // endpoint = 단일 assetId. 로컬 OFD 에 닿는 쪽을 찾고 반대쪽(자국 설비)을 usage 로.
        if (cable.sourceAssetId === localOfdId) {
          localUsage = usageFor(cable, cable.targetAssetId);
          break;
        }
        if (cable.targetAssetId === localOfdId) {
          localUsage = usageFor(cable, cable.sourceAssetId);
          break;
        }
      }

      return localIsA
        ? { ...port, sideA: localUsage }
        : { ...port, sideB: localUsage };
    });

    return { ...path, ports: newPorts };
  });
}

/**
 * Single source of truth for port status — **하이브리드**.
 *
 * base: backend `useFiberPaths(ofdId)` 가 fiber path 의 `cables` 관계로 양쪽 side
 * (cross-substation)를 올바로 계산해 준다 → remote side 의 단일 진실.
 * overlay: 이 변전소의 staged fiber path 추가/삭제 + staged 케이블을 로컬 side 에만
 * 덮어 즉시 미리보기.
 *
 * - staged 삭제된 path: backend 에는 있지만 effective 에는 없음 → 제거.
 * - staged 신규 path: effective 에는 있지만 backend 에는 없음 → empty-port 합성 후 추가
 *   (로컬 side 는 effective 케이블로 채워지고, remote side 는 저장 전까지 빈 채 — 허용).
 * - staged 케이블 추가/삭제: 로컬 side 를 effective 로 override.
 */
export function usePortStatus(ofdId: string) {
  const backendQuery = useFiberPaths(ofdId);
  const effectiveFiberPaths = useEffectiveFiberPaths();
  const effectiveCables = useEffectiveCables();
  const effectiveAssets = useEffectiveAssets();
  const directory = useOfdDirectory();

  const backendPaths = backendQuery.data;

  const mergedPaths = useMemo(() => {
    const backend = backendPaths ?? [];

    // 이 OFD 와 관련된 effective fiber path(staged+saved flat row).
    const ofdEffPaths = (effectiveFiberPaths as unknown as Array<{
      id: string; ofdAId: string; ofdBId: string; portCount: number; description?: string | null;
    }>).filter((fp) => fp.ofdAId === ofdId || fp.ofdBId === ofdId);
    const effIds = new Set(ofdEffPaths.map((fp) => fp.id));

    // 1. backend base 에서 staged-삭제된 path 제거(effective 에 없으면 삭제됨).
    let paths: FiberPathDetail[] = backend.filter((p) => effIds.has(p.id));

    // 2. staged-신규 path(effective 엔 있고 backend 엔 없음) 합성해서 추가.
    const backendIds = new Set(backend.map((p) => p.id));
    const stagedNew = composeFiberPaths(
      ofdEffPaths.filter((fp) => !backendIds.has(fp.id)),
      directory,
    );
    paths = [...paths, ...stagedNew];

    // 3. 로컬 side 만 이 변전소 staged 케이블로 overlay(remote side 는 backend 유지).
    const assetNameById = new Map((effectiveAssets as Asset[]).map((a) => [a.id, a.name]));
    const resolveName = (id: string): string =>
      assetNameById.get(id) ?? directory.get(id)?.name ?? '?';

    return overlayLocalStagedCables(
      paths,
      effectiveCables as unknown as EffectiveCable[],
      resolveName,
      ofdId,
    );
  }, [backendPaths, effectiveFiberPaths, effectiveCables, effectiveAssets, ofdId, directory]);

  return { mergedPaths, isLoading: backendQuery.isLoading };
}
