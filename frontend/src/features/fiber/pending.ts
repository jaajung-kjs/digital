/**
 * Pending (unsaved) FiberPath 를 FiberPathDetail shape 으로 변환.
 *
 * editorStore.pendingFiberPaths 가 minimal shape (id, ofdAId, ofdBId, portCount,
 * description) 만 보유. 토폴로지/포트 grid 등 saved 와 같은 shape 으로 다루기 위해
 * FiberPathDetail 로 lift — 단 ports[] 는 아직 cable 안 꽂혔으니 빈 배열.
 *
 * 그동안 4곳에 동일 변환이 흩어져 있었음 (network/store, pathHighlightStore 의 두
 * 분기, usePortStatus.pendingToFiberPaths). 단일 정의로 통합.
 */

import type { PendingFiberPath } from '../editor/stores/editorStore';
import type { FiberPathDetail } from './types';

interface EquipNameLookup {
  get(id: string): { name: string } | undefined;
}

export function pendingToFiberPathDetail(
  fp: PendingFiberPath,
  equipMap: EquipNameLookup,
): FiberPathDetail {
  const ofdA = equipMap.get(fp.ofdAId);
  const ofdB = equipMap.get(fp.ofdBId);
  const now = new Date().toISOString();
  return {
    id: fp.id,
    ofdA: { id: fp.ofdAId, name: ofdA?.name ?? '?', substationName: '', floorId: null },
    ofdB: { id: fp.ofdBId, name: ofdB?.name ?? '?', substationName: '', floorId: null },
    portCount: fp.portCount,
    description: fp.description ?? null,
    ports: [],
    createdAt: now,
    updatedAt: now,
  };
}
