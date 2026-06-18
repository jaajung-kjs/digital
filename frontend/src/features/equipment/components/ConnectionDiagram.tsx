import { useMemo } from 'react';
import { CABLE_COLORS, normalizeCableColor } from '../../../types/connection';
import { type LocalCable } from '../../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { cableToAddress } from '../../workspace/selectionHighlight';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';
import { buildEndpointNameResolver, buildSelfSideChecker } from '../../connections/endpointName';
import { cableDtoToLocal, type CableDetailDTO } from '../../workingCopy/cableToLocal';
import { useTraceGraph, remoteSlotSubstation } from '../../trace/traceGraph';
import {
  useEffectiveAssets,
  useEffectiveCables,
} from '../../workingCopy/hooks';


interface ConnectionDiagramProps {
  equipmentId: string;
}

export function ConnectionDiagram({
  equipmentId,
}: ConnectionDiagramProps) {
  // SSOT-2d3a Task 5 — editorStore 영속 컬렉션 대신 통합 스토어 effective 를 읽는다.
  // 설비/랙모듈은 effective assets 에서 매핑, 케이블/회로/파이버패스는 effective 훅.
  const effectiveAssets = useEffectiveAssets();
  // effective 케이블은 nested source/target — flat LocalCable 로 매핑(끝점 lookup).
  const localCables: LocalCable[] = useEffectiveCables().map((c) =>
    cableDtoToLocal(c as unknown as CableDetailDTO),
  );
  const stageCableDelete = useSubstationWorkingCopy((s) => s.stageCableDelete);

  const selectedCableId = useSelectionStore((s) => s.selectedCableId);

  // 연결 판정·끝점 이름은 연결 목록(AssetConnectionsSection)과 같은 단일 소스
  // (connections/endpointName). self-side = 자기 자신 + 자식 랙모듈 + 자식 분전 분기.
  const isSelfSide = useMemo(
    () => buildSelfSideChecker(effectiveAssets, equipmentId),
    [effectiveAssets, equipmentId],
  );

  // 광 케이블 경로 라벨: 신모델 — cable.number(심선 번호) + remoteSlotSubstation(슬롯 대국 변전소).
  const { graph } = useTraceGraph();

  const relevantCables = useMemo(() => {
    return localCables.filter(
      (cable) =>
        isSelfSide(cable.sourceAssetId) || isSelfSide(cable.targetAssetId),
    );
  }, [localCables, isSelfSide]);

  // endpoint asset id → 표시명(모듈/분기/설비 순). 연결 목록과 동일한 단일 리졸버.
  const nameOfEndpoint = useMemo(
    () => buildEndpointNameResolver(effectiveAssets),
    [effectiveAssets],
  );

  return (
    <div>
      <div className="p-3">
        {relevantCables.length === 0 ? (
          <div className="text-center text-sm text-content-faint py-2">
            연결 정보가 없습니다.
          </div>
        ) : (
        <div className="space-y-2">
          {relevantCables.map((cable: LocalCable) => {
            const sourceIsSelf = isSelfSide(cable.sourceAssetId);
            // endpoint 의 flat id(sourceAssetId 자리)는 단일 asset id —
            //   분기면 branch asset id, 모듈이면 모듈 id, 그 외엔 설비 id.
            const selfAssetId = sourceIsSelf ? cable.sourceAssetId : cable.targetAssetId;
            const remoteAssetId = sourceIsSelf ? cable.targetAssetId : cable.sourceAssetId;

            // self 가 이 설비 본체면 설비명, 자식 모듈/분기면 그 노드명.
            const localEqName =
              nameOfEndpoint(selfAssetId) || nameOfEndpoint(equipmentId) || '';
            const remoteName = nameOfEndpoint(remoteAssetId);
            const isCardSelected = selectedCableId === cable.id;

            const handleClick = () => {
              const sel = useSelectionStore.getState();
              if (sel.selectedCableId === cable.id) {
                sel.setSelectedAssetId(null);
                return;
              }
              const addr = graph ? cableToAddress(cable.id, equipmentId, graph) : null;
              sel.setSelectedComponent(addr?.assetId ?? equipmentId, addr?.core ?? null, cable.id);
            };

            const handleDelete = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!confirm(`${remoteName} 연결을 삭제하시겠습니까?`)) return;
              stageCableDelete(cable.id);
              useSelectionStore.getState().setSelectedAssetId(null);
            };

            return (
              <div key={cable.id}>
                <div
                  onClick={handleClick}
                  className={`group relative rounded border px-3 py-2 transition-colors cursor-pointer ${
                    isCardSelected
                      ? 'border-primary bg-info-bg ring-1 ring-primary/30'
                      : 'border-line bg-surface hover:bg-info-bg'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-content">
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
                      <div className="my-0.5 h-px w-12 bg-line" />
                    </div>

                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-content">
                        {remoteName}
                      </p>
                    </div>
                  </div>
                  {cable.cableType === 'FIBER' && cable.number != null && (() => {
                    const slotId = [cable.sourceAssetId, cable.targetAssetId].find(
                      (id) => id && graph?.codeById.get(id) === 'OFD-SLOT',
                    ) ?? null;
                    const route = graph && slotId ? remoteSlotSubstation(slotId, graph) : null;
                    return (
                      <p className="mt-1 text-xs text-content-faint text-center truncate">
                        {(route ?? '경로')}{` #${cable.number}`}
                      </p>
                    );
                  })()}
                </div>
                {isCardSelected && (
                  <div className="flex justify-end pr-1">
                    <button
                      onClick={handleDelete}
                      className="text-xs text-content-faint hover:text-danger transition-colors"
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
