/**
 * PendingFiberPath (canonical intent) → FiberPathDetail (view shape).
 *
 * Pending 은 두 ofd id 와 portCount 만 들고 있다. display/trace 가 필요한 name +
 * substationName 은 useOfdDirectory 가 single source.
 *
 * Saved path 는 backend 가 이미 같은 shape 으로 denorm 해서 주므로 변환 불필요.
 */

import type { PendingFiberPath } from '../editor/stores/editorStore';
import type { FiberPathDetail } from './types';
import type { OfdDirectoryEntry } from './hooks/useOfdDirectory';

export function composePendingPath(
  fp: PendingFiberPath,
  directory: Map<string, OfdDirectoryEntry>,
): FiberPathDetail {
  const side = (id: string): FiberPathDetail['ofdA'] => {
    const o = directory.get(id);
    return {
      id,
      name: o?.name ?? '?',
      substationName: o?.substationName ?? '',
      floorId: o?.floorId ?? null,
    };
  };
  const now = new Date().toISOString();
  return {
    id: fp.id,
    ofdA: side(fp.ofdAId),
    ofdB: side(fp.ofdBId),
    portCount: fp.portCount,
    description: fp.description ?? null,
    ports: Array.from({ length: fp.portCount }, (_, i) => ({
      portNumber: i + 1,
      sideA: null,
      sideB: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
}
