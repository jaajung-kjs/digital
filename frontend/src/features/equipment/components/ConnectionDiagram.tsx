import { useCallback, useEffect, useMemo } from 'react';
import { CABLE_COLORS, normalizeCableColor } from '../../../types/connection';
import { type LocalCable } from '../../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { useOfdDirectory } from '../../fiber/hooks/useOfdDirectory';
import { branchAssetIdsOfPanel, feederGroupsOfPanel } from '../../assets/distributionSubtree';
import { composeFiberPaths } from '../../workingCopy/merge';
import { cableDtoToLocal, type CableDetailDTO } from '../../workingCopy/cableToLocal';
import { buildCableFiberPathLabel } from '../../fiber/label';
import {
  useEffectiveAssets,
  useEffectiveCables,
  useEffectiveFiberPaths,
} from '../../workingCopy/hooks';
import { assetToEquipment } from '../../workingCopy/assetToEquipment';
import { assetToRackModule } from '../../workingCopy/assetToRackModule';


interface ConnectionDiagramProps {
  equipmentId: string;
}

export function ConnectionDiagram({
  equipmentId,
}: ConnectionDiagramProps) {
  // SSOT-2d3a Task 5 — editorStore 영속 컬렉션 대신 통합 스토어 effective 를 읽는다.
  // 설비/랙모듈은 effective assets 에서 매핑, 케이블/회로/파이버패스는 effective 훅.
  const effectiveAssets = useEffectiveAssets();
  const editorEquipment = useMemo(
    () => effectiveAssets.map(assetToEquipment),
    [effectiveAssets],
  );
  const editorRackModules = useMemo(
    () =>
      effectiveAssets
        .filter((a) => a.parentAssetId && a.slotIndex != null)
        .map(assetToRackModule),
    [effectiveAssets],
  );
  // effective 케이블은 nested source/target — flat LocalCable 로 매핑(끝점 lookup).
  const editorCables = useEffectiveCables().map((c) =>
    cableDtoToLocal(c as unknown as CableDetailDTO),
  );
  const stageCableDelete = useSubstationWorkingCopy((s) => s.stageCableDelete);

  // Snapshot overlay: when active, show snapshot data instead of editor data
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotCables = useSnapshotStore((s) => s.cables);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);

  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;
  const localCables = snapshotActive ? (snapshotCables as unknown as LocalCable[]) : editorCables;
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const isTraceLoading = usePathHighlightStore((s) => s.isLoading);
  const traceActive = usePathHighlightStore((s) => s.active);

  // Unmount = context gone → clear highlight automatically.
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  // 랙이면 자식 모듈, 분전반이면 자식 회로에 연결된 cable 도 "이 설비의 연결".
  const childModuleIds = useMemo(
    () =>
      new Set(
        editorRackModules
          .filter((m) => m.rackEquipmentId === equipmentId)
          .map((m) => m.id),
      ),
    [editorRackModules, equipmentId],
  );
  // 단계3b — 회로는 BRANCH asset. 이 분전반 하위 분기 asset id 집합 + branch id→라벨.
  const childBranchIds = useMemo(
    () => branchAssetIdsOfPanel(effectiveAssets, equipmentId),
    [effectiveAssets, equipmentId],
  );
  // 케이블 endpoint = branch asset id → "피더명/분기명" 라벨. substation 전역 분전반에서.
  const branchLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const panel of effectiveAssets) {
      if (panel.assetType?.placementKind !== 'DIST') continue;
      for (const { feeder, branches } of feederGroupsOfPanel(effectiveAssets, panel.id)) {
        for (const branch of branches) m.set(branch.id, `${feeder.name}/${branch.name}`);
      }
    }
    return m;
  }, [effectiveAssets]);

  // endpoint = 단일 asset id (flat sourceEquipmentId 자리). 모듈/분기 자식이면 이 설비의 연결.
  const isSelfSide = useCallback(
    (
      assetId: string | null | undefined,
      modId: string | null | undefined,
    ) =>
      assetId === equipmentId ||
      (!!modId && childModuleIds.has(modId)) ||
      (!!assetId && childBranchIds.has(assetId)),
    [equipmentId, childModuleIds, childBranchIds],
  );

  // git-like: 케이블의 fiberPathLabel 을 read-time 에 합성하기 위한 path 맵.
  // 통합 스토어 effective fiber paths(saved+staged, deletes 반영) 를 directory 로 합성 —
  // 저장 전에도 commit 후와 동일 라벨.
  const effectiveFiberPaths = useEffectiveFiberPaths();
  const ofdDirectory = useOfdDirectory();
  const fiberPathById = useMemo(() => {
    const composed = composeFiberPaths(
      effectiveFiberPaths as unknown as Array<{
        id: string;
        ofdAId: string;
        ofdBId: string;
        portCount: number;
        description?: string | null;
      }>,
      ofdDirectory,
    );
    return new Map(composed.map((p) => [p.id, p]));
  }, [effectiveFiberPaths, ofdDirectory]);

  const relevantCables = useMemo(() => {
    return localCables.filter(
      (cable) =>
        isSelfSide(cable.sourceEquipmentId, cable.sourceModuleId) ||
        isSelfSide(cable.targetEquipmentId, cable.targetModuleId),
    );
  }, [localCables, isSelfSide]);

  return (
    <div>
      <div className="p-3">
        {relevantCables.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantCables.map((cable: LocalCable) => {
            const sourceIsSelf = isSelfSide(
              cable.sourceEquipmentId,
              cable.sourceModuleId,
            );
            // endpoint 의 flat id(sourceEquipmentId 자리)는 단일 asset id —
            //   분기면 branch asset id, 그 외엔 모듈/설비 id.
            const selfAssetId = sourceIsSelf ? cable.sourceEquipmentId : cable.targetEquipmentId;
            const selfModuleId = sourceIsSelf ? cable.sourceModuleId : cable.targetModuleId;
            const remoteAssetId = sourceIsSelf ? cable.targetEquipmentId : cable.sourceEquipmentId;
            const remoteModuleId = sourceIsSelf ? cable.targetModuleId : cable.sourceModuleId;

            const selfModule = selfModuleId
              ? editorRackModules.find((m) => m.id === selfModuleId)
              : null;
            const localEqName =
              selfModule?.name ??
              (selfAssetId ? branchLabelById.get(selfAssetId) : null) ??
              localEquipment.find((e) => e.id === equipmentId)?.name ??
              '';

            const remoteModule = remoteModuleId
              ? editorRackModules.find((m) => m.id === remoteModuleId)
              : null;
            const remoteName =
              remoteModule?.name ??
              (remoteAssetId ? branchLabelById.get(remoteAssetId) : null) ??
              (remoteAssetId ? localEquipment.find((e) => e.id === remoteAssetId)?.name ?? '' : '');
            const isTracing = tracingCableId === cable.id && isTraceLoading;
            const isCardSelected = traceActive && tracingCableId === cable.id;

            const handleClick = () => {
              if (isCardSelected) {
                clearHighlight();
              } else {
                startTrace(cable.id);
              }
            };

            const handleDelete = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!confirm(`${remoteName} 연결을 삭제하시겠습니까?`)) return;
              stageCableDelete(cable.id);
              clearHighlight();
            };

            return (
              <div key={cable.id}>
                <div
                  onClick={handleClick}
                  className={`group relative rounded border px-3 py-2 transition-colors cursor-pointer ${
                    isCardSelected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                      : 'border-gray-200 bg-white hover:bg-blue-50'
                  } ${isTracing ? 'ring-2 ring-blue-400 animate-pulse' : ''}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {localEqName}
                      </p>
                    </div>

                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: normalizeCableColor(cable.displayColor) || CABLE_COLORS[cable.cableType] || '#6b7280',
                          color: '#ffffff',
                        }}
                      >
                        {cable.categoryName || cable.categoryCode || cable.cableType}
                      </span>
                      <div className="my-0.5 h-px w-12 bg-gray-300" />
                    </div>

                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {remoteName}
                      </p>
                    </div>
                  </div>
                  {cable.cableType === 'FIBER' && cable.fiberPortNumber != null && (
                    <p className="mt-1 text-[11px] text-gray-400 text-center truncate">
                      {cable.fiberPathLabel ?? buildCableFiberPathLabel(cable, fiberPathById) ?? '경로'}
                      {` #${cable.fiberPortNumber}`}
                    </p>
                  )}
                </div>
                {isCardSelected && !snapshotActive && (
                  <div className="flex justify-end pr-1">
                    <button
                      onClick={handleDelete}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Path trace result detail */}
      <PathTraceDetail />
    </div>
  );
}
