import type { FiberPathDetail } from './types';

/**
 * fiber path 의 표시 라벨 — 'local' OFD 관점에서 `local-remote` substation 이름.
 * 백엔드 cable.service.ts `buildFiberPathLabel` 의 프론트 미러(단일 SoT). substation
 * 이름이 비면 OFD 이름으로 폴백 (cableTracer 가 기존에 쓰던 규약과 동일).
 */
export function fiberPathLabelFor(fp: FiberPathDetail, localOfdId: string): string {
  const local = fp.ofdA.id === localOfdId ? fp.ofdA : fp.ofdB;
  const remote = fp.ofdA.id === localOfdId ? fp.ofdB : fp.ofdA;
  return `${local.substationName || local.name}-${remote.substationName || remote.name}`;
}

type CableEndpoints = {
  sourceEquipmentId?: string | null;
  targetEquipmentId?: string | null;
  fiberPathId?: string | null;
};

/**
 * working-copy 케이블의 fiberPathLabel 합성 — 케이블이 붙은 OFD 쪽이 local.
 * 백엔드가 commit 후 denormalize 하는 값을 read-time 에 동일하게 파생해, 저장 전후로
 * 화면이 바뀌지 않게 한다. fiberPath 가 없으면 null → 호출부가 '경로' 로 폴백.
 */
export function buildCableFiberPathLabel(
  cable: CableEndpoints,
  pathById: Map<string, FiberPathDetail>,
): string | null {
  if (!cable.fiberPathId) return null;
  const fp = pathById.get(cable.fiberPathId);
  if (!fp) return null;
  // 케이블의 source/target 중 ofdB 와 닿으면 ofdB 가 local, 아니면 ofdA (백엔드와 동일 규약).
  const localOfdId =
    cable.sourceEquipmentId === fp.ofdB.id || cable.targetEquipmentId === fp.ofdB.id
      ? fp.ofdB.id
      : fp.ofdA.id;
  return fiberPathLabelFor(fp, localOfdId);
}
