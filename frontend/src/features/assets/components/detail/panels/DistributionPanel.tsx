import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../../../workingCopy/hooks';
import { useAssetTypes } from '../../../hooks/useAssetTypes';
import { useSelectionStore } from '../../../../workspace/selectionStore';
import { generateTempId } from '../../../../../utils/idHelpers';
import { feedersOfPanel, buildSubtreeAsset } from '../../../distributionSubtree';
import { buildFeederCircuits, feederGridSlots, type FeederCircuit } from '../../../../power/feederCircuits';
import { useTraceGraph } from '../../../../trace/traceGraph';

/**
 * 분전반 회로 GUI — 전원 계통(FEEDER) 목록 관리.
 * 분전반 → FEEDER 자산 계층이고, 케이블은 피더로 직접 그려진다(CB = 피더로 가는
 * 출력 케이블, 별도 분기 노드 없음). 읽기는 통합 스토어 effective assets, 쓰기는
 * stageAsset CRUD. 케이블의 회로 endpoint 는 FEEDER asset id (source/target.assetId).
 */
export function DistributionCircuits({ assetId }: { assetId: string }) {
  const effectiveAssets = useEffectiveAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const { graph } = useTraceGraph();
  const stageAssetCreate = useSubstationWorkingCopy((s) => s.stageAssetCreate);
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);

  const panel = useMemo(
    () => effectiveAssets.find((a) => a.id === assetId) ?? null,
    [effectiveAssets, assetId],
  );
  const feederType = useMemo(
    () => assetTypes.find((t) => t.role === 'feeder') ?? null,
    [assetTypes],
  );

  const feeders = useMemo(
    () => feedersOfPanel(effectiveAssets, assetId),
    [effectiveAssets, assetId],
  );

  // CB 미리보기용 — 피더별 회로를 graph/feeders 변경 시 1회만 파생(매 렌더 O(N×M) 제거).
  const feederCircuits = useMemo(
    () =>
      graph
        ? new Map(feeders.map((f) => [f.id, buildFeederCircuits({ id: f.id }, graph.cables as never[], graph.nameById)]))
        : new Map<string, FeederCircuit[]>(),
    [graph, feeders],
  );

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
        parentAssetId: assetId,
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
            스크롤 없음). 피더 = 흰 모듈 카드(차단기·슬롯과 동일 언어): 좌측 가압상태 띠 +
            recessed 미니 차단기 레일 미리보기 + 요약. 클릭 → 그 피더 차단기 레일. */}
        <div className="grid grid-cols-3 gap-2 items-start">
          {feeders.map((feeder) => {
            // 점유 CB(분기). 하나라도 ON 이면 가압(energized) → 좌측 띠 success.
            const cs = feederCircuits.get(feeder.id) ?? [];
            const onCount = cs.filter((c) => c.switchState.toUpperCase() === 'ON').length;
            const energized = onCount > 0;
            return (
              <div
                key={feeder.id}
                className="group/feeder relative overflow-hidden rounded-md border border-line bg-surface shadow-sm transition-[box-shadow,border-color] duration-150 hover:border-content-faint hover:shadow-md"
              >
                {/* 클릭하면 그 피더로 바로 이동 — '선택/눌림' 상태 없음(좌측 강조 띠 제거).
                    우측 패딩(삭제버튼 자리)은 이름 줄에만 — 미니그리드·요약은 full-width. */}
                <button
                  type="button"
                  onClick={() => useSelectionStore.getState().setSelectedAssetId(feeder.id)}
                  className="block w-full px-2.5 py-2.5 text-left"
                  title="클릭해 이 계통(피더)으로 이동"
                >
                  <span className="block truncate pr-6 text-sm font-medium text-content">{feeder.name}</span>
                  {/* recessed 미니 차단기 — 고정 6열×4행(24칸, 같은 크기·모양). 스위치가 컬럼 폭을
                      채워(좁은 컬럼 < 높이라 세로 비율 유지) 과한 여백 없이 꽉 참. 빈칸=속빈 외곽선,
                      차단=회색, 가압=초록. */}
                  <span className="mt-1.5 grid grid-cols-6 gap-1 rounded bg-surface-2 p-1.5 shadow-inner">
                    {feederGridSlots(cs).slice(0, 24).map((s) => (
                      <span
                        key={s.cbNumber}
                        className={`h-3.5 rounded-[1px] ${
                          !s.occupied
                            ? 'ring-1 ring-inset ring-line'
                            : s.switchState.toUpperCase() === 'ON'
                              ? 'bg-success'
                              : 'bg-content-faint'
                        }`}
                        title={s.occupied ? `CB ${s.cbNumber} · ${s.loadName ?? ''} ${s.switchState}` : `CB ${s.cbNumber} 미사용`}
                      />
                    ))}
                  </span>
                  {/* 2줄 고정 요약 — 좁은 카드에서 한 줄로 짤리지 않게, 높이를 미리 확보(항상 2줄). */}
                  <span className="mt-1.5 block text-xs leading-tight">
                    <span className="block text-content-muted">
                      <span className="font-medium text-content">{cs.length}</span> 회로
                    </span>
                    <span className={`mt-0.5 block ${energized ? 'text-success' : 'text-content-faint'}`}>
                      {cs.length > 0 ? `${onCount} ON` : '—'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`'${feeder.name}' 전원 계통을 삭제할까요? 연결된 케이블도 함께 제거됩니다.`)) {
                      // FEEDER asset 삭제 — 부착된 케이블은 cascade 로 제거된다.
                      stageAssetDelete(feeder.id);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover/feeder:opacity-100"
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
                className="flex h-full min-h-[8rem] w-full items-center justify-center rounded-md border border-dashed border-line text-xs text-content-faint hover:border-primary hover:text-primary hover:bg-info-bg transition-colors"
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
