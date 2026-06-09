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

/**
 * 통합 스토어(substationStore)의 effective fiber paths 합성용.
 *
 * 통합 스토어는 fiber path 를 backend 의 *flat DB row* (`{ id, ofdAId, ofdBId,
 * portCount, description? }`) 로 들고 있다 — saved 든 staged-create 든 동일 shape.
 * (per-OFD `/equipment/:id/fiber-paths` 엔드포인트가 주던 denorm `FiberPathDetail`
 * 와 달리 ofdA/ofdB 객체·ports 가 없다.) 따라서 표시/trace 용 `FiberPathDetail`
 * 로 만들려면 OFD directory 로 양쪽 이름/변전소명을 합성하고 빈 ports 를 채워야
 * 한다 — 이는 pending path 합성(composePendingPath)과 정확히 같은 작업이므로 재사용.
 *
 * 포트 점유(sideA/sideB)는 여기서 채우지 않는다 — 호출측이 effective cables 를
 * overlay(mergePendingCables)하여 saved+staged 케이블 모두에서 일관되게 채운다.
 */
type FiberPathIntentRow = {
  id: string;
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string | null;
};

export function composeFiberPaths(
  effective: FiberPathIntentRow[],
  directory: OfdDirectory,
): FiberPathDetail[] {
  return effective.map((fp) =>
    composePendingPath(
      {
        id: fp.id,
        ofdAId: fp.ofdAId,
        ofdBId: fp.ofdBId,
        portCount: fp.portCount,
        description: fp.description ?? null,
      } as PendingFiberPath,
      directory,
    ),
  );
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
