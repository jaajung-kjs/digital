import type { QueryClient } from '@tanstack/react-query';
import { useEditorStore } from '../editor/stores/editorStore';
import { mergeFiberPaths, mergeCables } from './merge';
import { resolveCableIds, resolveRackModuleIds, resolveCircuitIds } from './resolvers';
import type { IdMaps } from './idMaps';
import { RACK_MODULE_KEYS } from '../rack/hooks/useRackModules';
import type { FloorPlanDetail } from '../../types/floorPlan';
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';
import type { OfdDirectoryEntry } from '../fiber/hooks/useOfdDirectory';

type OfdDirectory = Map<string, OfdDirectoryEntry>;

/**
 * 저장 트랜잭션의 client-side 마무리. `PUT /floors/:id/plan` 응답 직후 호출.
 *
 * 순서가 결정적 — 각 단계가 다음 단계의 *gap 0* 을 보장한다:
 *   1. tempId → realId 매핑 적용 (working copy 안 참조 갱신)
 *   2. saved 캐시(React Query) 를 effective 상태로 미리 채움 ← clearPendingData 전!
 *   3. overlay 비우기 (clearPendingData)
 *   4. invalidate — eventual consistency 검증용
 */
export function commitWorkingCopy(opts: {
  floorId: string;
  idMaps: IdMaps;
  queryClient: QueryClient;
  ofdDirectory: OfdDirectory;
}): void {
  const { floorId, idMaps, queryClient, ofdDirectory } = opts;

  // 1. tempId resolution
  const ed = useEditorStore.getState();
  ed.setCables(ed.localCables.map((c) => resolveCableIds(c, idMaps)));
  ed.setRackModules(ed.localRackModules.map((m) => resolveRackModuleIds(m, idMaps)));
  ed.setDistributionCircuits(
    ed.localDistributionCircuits.map((c) => resolveCircuitIds(c, idMaps)),
  );

  // 2. saved 캐시 optimistic update (clearPendingData *전에*!)
  const current = useEditorStore.getState();

  // 2a. ['floorPlan', floorId] — stagedBg 패턴 (기존 useFloorPlanData.ts:213-227 유지)
  if (
    current.stagedBackgroundDrawing !== undefined ||
    current.stagedBackgroundOpacity !== undefined
  ) {
    queryClient.setQueryData<FloorPlanDetail | undefined>(['floorPlan', floorId], (old) => {
      if (!old) return old;
      return {
        ...old,
        ...(current.stagedBackgroundDrawing !== undefined
          ? { backgroundDrawing: current.stagedBackgroundDrawing }
          : {}),
        ...(current.stagedBackgroundOpacity !== undefined
          ? { backgroundOpacity: current.stagedBackgroundOpacity }
          : {}),
      };
    });
  }

  // 2b. ['fiber-paths'] — merged effective state
  queryClient.setQueryData<FiberPathDetail[] | undefined>(['fiber-paths'], (old) => {
    if (!old) return old;
    return mergeFiberPaths(old, current, ofdDirectory);
  });

  // 2c. ['cables'] — merged effective state
  queryClient.setQueryData<LocalCable[] | undefined>(['cables'], (old) => {
    if (!old) return old;
    return mergeCables(old, current);
  });

  // 3. overlay 비우기 — 이제 안전 (캐시에 새 상태 박혀 있음)
  ed.clearPendingData();

  // 4. invalidate (eventual consistency)
  queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
  queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
  queryClient.invalidateQueries({ queryKey: ['cables'] });
  queryClient.invalidateQueries({ queryKey: ['ofd-directory'] }); // ← 추가됨 (이전엔 누락)
  queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });
}
