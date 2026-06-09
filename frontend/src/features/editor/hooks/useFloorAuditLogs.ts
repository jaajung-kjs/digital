import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { equipmentToAssetCreate } from '../../workingCopy/equipmentToAsset';
import { useKindToAssetTypeId } from '../../assets/useKindToAssetTypeId';
import type { AuditLog } from '../../../types/maintenance';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { Asset } from '../../../types/asset';
import type { WorkingCopyRow } from '../../workingCopy/substationStore';

const VERSION_KEYS = {
  all: ['room-versions'] as const,
  list: (floorId: string) => [...VERSION_KEYS.all, floorId] as const,
};

const DEFAULT_MAJOR_GRID_SIZE = 60;

/**
 * Fetch a past version of the plan. The response has the SAME structure
 * as the current plan (FloorPlanDetail) — cables and fiberPaths included.
 */
async function fetchVersionPlan(floorId: string, version: number): Promise<FloorPlanDetail> {
  const { data } = await api.get<{ data: FloorPlanDetail }>(
    `/floors/${floorId}/plan?version=${version}`
  );
  return data.data;
}

/** Clear editor selection and detail panel in one call */
function clearEditorFocus() {
  const store = useEditorStore.getState();
  store.clearSelection();
  store.setDetailPanelEquipmentId(null);
}

export function useFloorAuditLogs(floorId: string | undefined) {
  return useQuery({
    queryKey: VERSION_KEYS.list(floorId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: AuditLog[] }>(
        `/floors/${floorId}/versions`
      );
      return data.data;
    },
    enabled: !!floorId,
  });
}

export function useDeleteAuditLog(floorId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      await api.delete(`/floors/${floorId}/versions/${logId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.list(floorId!) });
    },
  });
}

export function usePatchAuditLogContext(floorId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, context }: { logId: string; context: Record<string, unknown> }) => {
      await api.patch(`/floors/${floorId}/versions/${logId}`, { context });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.list(floorId!) });
    },
  });
}

/**
 * Preview a past version via the Snapshot Overlay — editor state is never touched.
 * Uses the same plan API with a version query parameter.
 */
export function usePreviewSnapshot(floorId: string | undefined) {
  const mutation = useMutation({
    mutationFn: async ({ version }: { version: number }) => {
      if (!floorId) throw new Error('floorId is required');
      return fetchVersionPlan(floorId, version);
    },
  });

  const enter = async (logId: string, label: string, version: number) => {
    if (!floorId) return;
    const plan = await mutation.mutateAsync({ version });

    useSnapshotStore.getState().enter(logId, label, {
      equipment: plan.equipment,
      cables: plan.cables ?? [],
      fiberPaths: plan.fiberPaths ?? [],
      gridSize: plan.gridSize,
      majorGridSize: plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE,
    });

    clearEditorFocus();
  };

  const exit = () => {
    useSnapshotStore.getState().exit();
  };

  return { enter, exit, isPending: mutation.isPending };
}

/**
 * 버전 복원 스냅샷(FloorPlanDetail)을 통합 스토어 stage 로 적용한다(2d-3a T4).
 *
 * 이전: editorStore 로컬 설비/케이블 상태를 통째로 교체했다.
 * 이관 후: 스냅샷의 equipment/cables 를 Asset[]/Cable[] 로 매핑한 뒤
 * `stageReplaceFloorFromSnapshot(floorId, ...)` 으로 현 floor 의 effective 와 diff 하여
 * create/update/delete 를 단일 undo 스텝으로 stage 한다. 사용자가 커밋 바에서 확정.
 *
 * - plan.equipment(FloorPlanEquipment, REAL id) → Asset: equipmentToAssetCreate 로
 *   매핑하되 tempId 자리에 실제 id 를 그대로 넣어 기존 row update 로 인식되게 한다.
 *   assetTypeId 는 kindToAssetTypeId(kind) 로 해소(없으면 해당 item skip + warn).
 * - plan.cables(flat) → nested Cable({ source:{equipmentId,moduleId,circuitId}, ... }).
 *
 * grid 설정은 여전히 editor 로컬 상태이므로 그대로 적용한다(working copy 컬렉션 아님).
 */
function applyPlanToEditor(
  plan: FloorPlanDetail,
  floorId: string,
  kindToAssetTypeId: (kind: FloorPlanDetail['equipment'][number]['kind']) => string | undefined,
) {
  const editor = useEditorStore.getState();
  const wc = useSubstationWorkingCopy.getState();
  const substationId = wc.substationId;

  useSnapshotStore.getState().exit();
  clearEditorFocus();

  const assets: Asset[] = [];
  if (substationId) {
    for (const eq of plan.equipment) {
      const assetTypeId = kindToAssetTypeId(eq.kind);
      if (!assetTypeId) {
        // kind→assetType 미해소 — 매핑 불가 항목은 건너뛴다(복원 본체를 막지 않음).
        console.warn(`[version-restore] assetTypeId 미해소로 설비 스킵: kind=${eq.kind} id=${eq.id}`);
        continue;
      }
      // tempId 자리에 실제 id — 스냅샷 설비는 기존(REAL) id 이므로 update 로 인식.
      assets.push(equipmentToAssetCreate(eq, { substationId, floorId, assetTypeId, tempId: eq.id }));
    }
  }

  const cables: WorkingCopyRow[] = (plan.cables ?? []).map((c) => ({
    id: c.id ?? '',
    source: {
      equipmentId: c.sourceEquipmentId ?? null,
      moduleId: c.sourceModuleId ?? null,
      circuitId: c.sourceCircuitId ?? null,
    },
    target: {
      equipmentId: c.targetEquipmentId ?? null,
      moduleId: c.targetModuleId ?? null,
      circuitId: c.targetCircuitId ?? null,
    },
    cableType: c.cableType ?? 'LAN',
    categoryId: c.categoryId ?? null,
    categoryCode: c.categoryCode ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    specParams: c.specParams ?? null,
    pathPoints: c.pathPoints ?? null,
    pathLength: c.pathLength ?? null,
    bufferLength: c.bufferLength ?? 4,
    totalLength: c.totalLength ?? null,
    label: c.label ?? null,
    fiberPathId: c.fiberPathId ?? null,
    fiberPortNumber: c.fiberPortNumber ?? null,
  }));

  wc.stageReplaceFloorFromSnapshot(floorId, { assets, cables });

  editor.setGridSize(plan.gridSize);
  editor.setMajorGridSize(plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE);
}

/**
 * Restore a past version: load into editor for actual editing.
 * If plan data is already in the store (from preview), reuses it — no extra API call.
 */
export function useLoadSnapshot(floorId: string | undefined) {
  // kind→assetType 해소기는 hook 이므로 컴포넌트 hook 시점에 받아 stage 매핑에 넘긴다.
  const kindToAssetTypeId = useKindToAssetTypeId();

  const mutation = useMutation({
    mutationFn: async (version: number) => {
      if (!floorId) throw new Error('floorId is required');
      return fetchVersionPlan(floorId, version);
    },
    onSuccess: (plan) => {
      if (!floorId) return;
      applyPlanToEditor(plan, floorId, kindToAssetTypeId);
    },
  });

  /** Restore from preview — reuses plan data already in the snapshot store */
  const restoreFromPreview = () => {
    if (!floorId) return;
    const snap = useSnapshotStore.getState();
    if (!snap.active || !snap.snapshotId) return;

    const versionLabel = snap.label ?? '이전 버전';

    const plan = {
      equipment: snap.equipment,
      cables: snap.cables,
      fiberPaths: snap.fiberPaths,
      gridSize: snap.gridSize,
      majorGridSize: snap.majorGridSize,
    } as unknown as FloorPlanDetail;
    applyPlanToEditor(plan, floorId, kindToAssetTypeId);

    // Show restore banner in editor
    useEditorStore.getState().setRestoredFromVersion(versionLabel);
  };

  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending, restoreFromPreview };
}
