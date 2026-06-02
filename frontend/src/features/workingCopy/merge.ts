import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable, PendingFiberPath } from '../editor/stores/editorStore';
import type { OfdDirectoryEntry } from '../fiber/hooks/useOfdDirectory';
import { composePendingPath } from '../fiber/pending';

/**
 * 도면 working copy 의 머지 함수 — 모든 소비처가 여기서 import 한다.
 * "saved + overlay" 를 합쳐 effective 상태를 반환. 머지 로직 버그가 생기면 한 곳만 고친다.
 */

type FiberPathOverlay = {
  deletedFiberPathIds: string[];
  pendingFiberPaths: PendingFiberPath[];
};

type CableOverlay = {
  deletedCableIds: string[];
  localCables: LocalCable[];
};

type OfdDirectory = Map<string, OfdDirectoryEntry>;

export function mergeFiberPaths(
  saved: FiberPathDetail[],
  ed: FiberPathOverlay,
  directory: OfdDirectory,
): FiberPathDetail[] {
  const deletedSet = new Set(ed.deletedFiberPathIds);
  const active = saved.filter((fp) => !deletedSet.has(fp.id));
  const pending = ed.pendingFiberPaths.map((fp) => composePendingPath(fp, directory));
  return [...active, ...pending];
}

export function mergeCables(saved: LocalCable[], ed: CableOverlay): LocalCable[] {
  const deletedSet = new Set(ed.deletedCableIds);
  const result = saved.filter((c) => !deletedSet.has(c.id));
  const savedIds = new Set(result.map((c) => c.id));
  for (const c of ed.localCables) {
    if (!savedIds.has(c.id)) result.push(c);
  }
  return result;
}
