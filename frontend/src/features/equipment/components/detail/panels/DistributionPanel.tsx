import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
import { useEffectiveAssets, useEffectiveCables } from '../../../../workingCopy/hooks';
import { useAssetTypes } from '../../../../assets/hooks/useAssetTypes';
import { useSelectionStore } from '../../../../workspace/selectionStore';
import { generateTempId } from '../../../../../utils/idHelpers';
import { feedersOfPanel, buildSubtreeAsset, FEEDER_CODE } from '../../../../assets/distributionSubtree';
import { buildFeederCircuits } from '../../../../power/feederCircuits';
import { useTraceGraph } from '../../../../trace/traceGraph';

/**
 * 분전반 회로 GUI — 전원 계통(FEEDER) 목록 관리.
 * 분전반 → FEEDER 자산 계층이고, 케이블은 피더로 직접 그려진다(CB = 피더로 가는
 * 출력 케이블, 별도 분기 노드 없음). 읽기는 통합 스토어 effective assets, 쓰기는
 * stageAsset CRUD. 케이블의 회로 endpoint 는 FEEDER asset id (source/target.assetId).
 */
export function DistributionCircuits({ equipmentId }: { equipmentId: string }) {
  const effectiveAssets = useEffectiveAssets();
  const localCables = useEffectiveCables() as unknown as {
    sourceAssetId?: string | null;
    targetAssetId?: string | null;
  }[];
  const { data: assetTypes = [] } = useAssetTypes();
  const { graph } = useTraceGraph();
  const stageAssetCreate = useSubstationWorkingCopy((s) => s.stageAssetCreate);
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);

  const panel = useMemo(
    () => effectiveAssets.find((a) => a.id === equipmentId) ?? null,
    [effectiveAssets, equipmentId],
  );
  const feederType = useMemo(
    () => assetTypes.find((t) => t.code === FEEDER_CODE) ?? null,
    [assetTypes],
  );

  const feeders = useMemo(
    () => feedersOfPanel(effectiveAssets, equipmentId),
    [effectiveAssets, equipmentId],
  );

  // 피더별 연결 여부 — 칸 색을 결정 (연결됨=파랑, 빈=회색 점선).
  // 케이블 endpoint 가 FEEDER asset id 이므로 source/target.assetId 로 판정.
  const connectedFeederIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of localCables) {
      if (c.sourceAssetId) s.add(c.sourceAssetId);
      if (c.targetAssetId) s.add(c.targetAssetId);
    }
    return s;
  }, [localCables]);

  const [addingFeeder, setAddingFeeder] = useState(false);
  const [newFeeder, setNewFeeder] = useState('');

  const handleAddFeeder = () => {
    const name = newFeeder.trim();
    if (!name || !panel || !feederType) return;
    if (feeders.some((f) => f.name === name)) {
      setNewFeeder('');
      setAddingFeeder(false);
      return;
    }
    stageAssetCreate(
      buildSubtreeAsset({
        id: generateTempId(),
        substationId: panel.substationId,
        type: feederType,
        name,
        parentAssetId: equipmentId,
        sortOrder: feeders.length,
      }),
    );
    setNewFeeder('');
    setAddingFeeder(false);
  };

  return (
    <div className="flex flex-col max-h-[480px]">
      <div className="overflow-y-auto p-3">
        {feeders.length === 0 && (
          <p className="text-xs text-content-faint mb-3">
            전원 계통(피더)을 추가해 분전반 회로를 구성하세요. 케이블은 계통에 직접 연결됩니다.
          </p>
        )}
        {/* 3열 고정 — 실제 배전반 뱅크처럼. 넘치면 다음 행으로 wrap (가로
            스크롤 없음). */}
        <div className="grid grid-cols-3 gap-2 items-start">
          {feeders.map((feeder) => {
            const connected = connectedFeederIds.has(feeder.id);
            return (
              <div
                key={feeder.id}
                className="relative rounded-md border border-line bg-surface overflow-hidden group/feeder"
              >
                <button
                  type="button"
                  onClick={() => useSelectionStore.getState().setSelectedAssetId(feeder.id)}
                  className={`w-full px-2 py-3 pr-7 text-left transition-colors ${
                    connected
                      ? 'bg-info-bg hover:bg-info-bg border-l-2 border-l-primary'
                      : 'bg-surface hover:bg-surface-2'
                  }`}
                  title={connected ? '연결됨 — 클릭해 선택' : '미연결 계통 — 클릭해 선택'}
                >
                  <span className="block text-sm font-semibold text-content-muted truncate">
                    {feeder.name}
                  </span>
                  {(() => {
                    const cs = graph ? buildFeederCircuits({ id: feeder.id }, graph.cables as never[], graph.nameById) : [];
                    const used = cs.filter((c) => c.occupied).length;
                    return (
                      <>
                        <span className="mt-0.5 block text-[11px] text-content-faint">CB {used}/{cs.length}</span>
                        <span className="mt-1 flex flex-wrap gap-0.5">
                          {cs.map((c) => (
                            <span
                              key={c.cbNumber}
                              className={`inline-block h-2 w-2 rounded-[1px] ${
                                !c.occupied
                                  ? 'bg-surface-2'
                                  : c.switchState.toUpperCase() === 'ON'
                                    ? 'bg-success'
                                    : 'bg-content-faint'
                              }`}
                              title={`CB ${c.cbNumber}${c.occupied ? ` · ${c.loadName ?? ''} ${c.switchState}` : ' 빈'}`}
                            />
                          ))}
                        </span>
                      </>
                    );
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`'${feeder.name}' 전원 계통을 삭제할까요? 연결된 케이블도 함께 제거됩니다.`)) {
                      // FEEDER asset 삭제 — 부착된 케이블은 cascade 로 제거된다.
                      stageAssetDelete(feeder.id);
                    }
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface border border-line text-danger leading-none opacity-0 group-hover/feeder:opacity-100 hover:bg-danger-bg transition-opacity flex items-center justify-center"
                  title="계통 삭제"
                  aria-label="계통 삭제"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {/* + 전원 계통 — 클릭 시에만 inline 입력 노출 */}
          <div>
            {addingFeeder ? (
              <div className="rounded-md border border-primary bg-surface p-2 flex flex-col gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newFeeder}
                  onChange={(e) => setNewFeeder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFeeder();
                    if (e.key === 'Escape') {
                      setAddingFeeder(false);
                      setNewFeeder('');
                    }
                  }}
                  placeholder="예: DC 48V Main"
                  className="w-full text-xs border border-line rounded px-2 py-1.5 focus:outline-none focus:border-primary"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleAddFeeder}
                    disabled={!newFeeder.trim()}
                    className="flex-1 text-xs py-1 bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingFeeder(false);
                      setNewFeeder('');
                    }}
                    className="px-2 text-xs py-1 text-content-muted hover:bg-surface-2 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingFeeder(true)}
                className="w-full h-16 rounded-md border border-dashed border-line text-xs text-content-faint hover:border-primary hover:text-primary hover:bg-info-bg transition-colors"
              >
                ＋ 전원 계통
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
