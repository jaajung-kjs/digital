import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
import { useEffectiveAssets, useEffectiveCables } from '../../../../workingCopy/hooks';
import { useAssetTypes } from '../../../../assets/hooks/useAssetTypes';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { usePathHighlightStore } from '../../../../pathTrace/stores/pathHighlightStore';
import { generateTempId } from '../../../../../utils/idHelpers';
import {
  feederGroupsOfPanel,
  nextBranchName,
  buildSubtreeAsset,
  FEEDER_CODE,
  BRANCH_CODE,
  type FeederGroup,
} from '../../../../assets/distributionSubtree';
import type { Asset } from '../../../../../types/asset';

/**
 * 분전반 회로 GUI — 실제 배전반 차단기 뱅크 메타포.
 * 전원 계통(feeder)이 가로 컬럼, 분기 차단기(L1…)가 세로 칸. 랙 RackSlotGrid
 * 의 EmptySlot/ModuleCell 클릭 인터랙션 톤을 차용 — 칸 클릭=계통 추적,
 * +칸 클릭=분기 즉시 추가.
 */
export function DistributionCircuits({ equipmentId }: { equipmentId: string }) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  // 단계3b — 회로는 FEEDER/BRANCH Asset 계층. 읽기는 통합 스토어 effective assets,
  // 쓰기는 stageAsset CRUD. 케이블의 회로 endpoint 는 BRANCH asset id (source/target.assetId).
  const effectiveAssets = useEffectiveAssets();
  const localCables = useEffectiveCables() as unknown as {
    sourceAssetId?: string | null;
    targetAssetId?: string | null;
  }[];
  const { data: assetTypes = [] } = useAssetTypes();
  const stageAssetCreate = useSubstationWorkingCopy((s) => s.stageAssetCreate);
  const stageAssetDelete = useSubstationWorkingCopy((s) => s.stageAssetDelete);
  const startCircuitTrace = usePathHighlightStore((s) => s.startCircuitTrace);

  const panel = useMemo(
    () => effectiveAssets.find((a) => a.id === equipmentId) ?? null,
    [effectiveAssets, equipmentId],
  );
  const feederType = useMemo(
    () => assetTypes.find((t) => t.code === FEEDER_CODE) ?? null,
    [assetTypes],
  );
  const branchType = useMemo(
    () => assetTypes.find((t) => t.code === BRANCH_CODE) ?? null,
    [assetTypes],
  );

  const feederGroups = useMemo(
    () => feederGroupsOfPanel(effectiveAssets, equipmentId),
    [effectiveAssets, equipmentId],
  );

  // 분기별 연결 여부 — 칸 색을 결정 (연결됨=파랑, 빈=회색 점선).
  // 케이블 endpoint 가 BRANCH asset id 이므로 source/target.assetId 로 판정.
  const connectedBranchIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of localCables) {
      if (c.sourceAssetId) s.add(c.sourceAssetId);
      if (c.targetAssetId) s.add(c.targetAssetId);
    }
    return s;
  }, [localCables]);

  const [addingFeeder, setAddingFeeder] = useState(false);
  const [newFeeder, setNewFeeder] = useState('');

  const handleAddBranch = (feeder: Asset, branches: Asset[]) => {
    if (!panel || !branchType) return;
    stageAssetCreate(
      buildSubtreeAsset({
        id: generateTempId(),
        substationId: panel.substationId,
        type: branchType,
        name: nextBranchName(branches),
        parentAssetId: feeder.id,
        sortOrder: branches.length,
      }),
    );
  };

  const handleAddFeeder = () => {
    const name = newFeeder.trim();
    if (!name || !panel || !feederType || !branchType) return;
    const existing = feederGroups.find((g) => g.feeder.name === name);
    if (existing) {
      // 같은 이름이면 새 계통이 아니라 기존 계통에 분기 하나 더.
      handleAddBranch(existing.feeder, existing.branches);
    } else {
      // 새 계통 — FEEDER asset + 함께 L1 BRANCH asset.
      const feederId = generateTempId();
      stageAssetCreate(
        buildSubtreeAsset({
          id: feederId,
          substationId: panel.substationId,
          type: feederType,
          name,
          parentAssetId: equipmentId,
          sortOrder: feederGroups.length,
        }),
      );
      stageAssetCreate(
        buildSubtreeAsset({
          id: generateTempId(),
          substationId: panel.substationId,
          type: branchType,
          name: 'L1',
          parentAssetId: feederId,
          sortOrder: 0,
        }),
      );
    }
    setNewFeeder('');
    setAddingFeeder(false);
  };

  if (snapshotActive) {
    return (
      <div className="p-4 text-sm text-content-faint">
        과거 도면 보기 중에는 회로를 편집할 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[480px]">
      <div className="overflow-y-auto p-3">
        {feederGroups.length === 0 && (
          <p className="text-xs text-content-faint mb-3">
            전원 계통을 추가해 분전반 회로를 구성하세요.
          </p>
        )}
        {/* 3열 고정 — 실제 배전반 뱅크처럼. 넘치면 다음 행으로 wrap (가로
            스크롤 없음). */}
        <div className="grid grid-cols-3 gap-2 items-start">
            {feederGroups.map(({ feeder, branches }: FeederGroup) => (
              <div
                key={feeder.id}
                className="rounded-md border border-line bg-surface overflow-hidden"
              >
                {/* feeder 헤더 — 메인 차단기 라벨. 추적 / 삭제 */}
                <div className="relative bg-surface-2 border-b border-line group/feeder">
                  <button
                    type="button"
                    onClick={() => startCircuitTrace(branches.map((b) => b.id))}
                    className="w-full px-2 py-2.5 pr-7 text-left hover:bg-info-bg transition-colors"
                    title="이 계통 전체 연결 추적"
                  >
                    <span className="block text-sm font-semibold text-content-muted truncate">
                      {feeder.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(`'${feeder.name}' 계통과 그 분기 ${branches.length}개를 삭제할까요?`)
                      ) {
                        // FEEDER asset 삭제 — 하위 BRANCH 는 subtree cascade.
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

                {/* 분기 차단기 칸 세로 스택 */}
                <div className="p-1.5 flex flex-col gap-1">
                  {branches.map((c) => {
                    const connected = connectedBranchIds.has(c.id);
                    return (
                      <div key={c.id} className="relative group/branch">
                        <button
                          type="button"
                          onClick={() => startCircuitTrace([c.id])}
                          className={`w-full px-2 py-2 rounded text-xs font-medium text-center transition-colors ${
                            connected
                              ? 'bg-info-bg border border-primary text-primary hover:bg-info-bg'
                              : 'bg-surface-2 border border-dashed border-line text-content-faint hover:bg-surface-2'
                          }`}
                          title={connected ? '연결됨 — 클릭해 계통 추적' : '미연결 분기'}
                        >
                          {c.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (confirm(`'${c.name}' 분기를 삭제할까요?`)) stageAssetDelete(c.id); }}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-surface border border-line text-danger leading-none opacity-0 group-hover/branch:opacity-100 hover:bg-danger-bg transition-opacity flex items-center justify-center"
                          title="분기 삭제"
                          aria-label="분기 삭제"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}

                  {/* + 분기 — RackView EmptySlot 톤 */}
                  <button
                    type="button"
                    onClick={() => handleAddBranch(feeder, branches)}
                    className="w-full px-2 py-2 rounded text-xs text-content-faint border border-dashed border-line hover:border-primary hover:text-primary hover:bg-info-bg transition-colors"
                  >
                    ＋ 분기
                  </button>
                </div>
              </div>
            ))}

            {/* + 전원 계통 — 클릭 시에만 inline 입력 노출 (상시 input 제거) */}
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
