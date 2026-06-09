import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelection } from '../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSubstationStatusRows } from '../useSubstationStatusRows';
import { NodeStatusView } from './NodeStatusView';
import { AssetDetailPanel } from './AssetDetailPanel';

export function StatusSummary({ total, items }: { total: number; items: { key: string; label: string; count: number }[] }) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span className="text-xs px-2 py-1 rounded bg-gray-100 font-medium">전체 {total}</span>
      {items.map((c) => (
        <span key={c.key} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{c.label} {c.count}</span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 4 — 현황을 통합 store(useSubstationWorkingCopy)로.
//
// 리스트는 useSubstationStatusRows(useNodeAssets + store overlay 라이브 머지).
// 인스펙터는 effective(스테이징 반영)에서 선택 자산을 찾고, onPatch 는
// stageAssetUpdate 로 store 에 스테이지한다 — 따라서 편집이 인스펙터와 리스트
// 양쪽에 즉시 반영된다(단일 소스). 커밋은 워크스페이스의 WorkingCopyCommitBar
// (T2)가 담당하므로 여기엔 커밋 바/충돌 처리가 없다.
// ──────────────────────────────────────────────────────────────────────────

export function SubstationStatusView({ substationId }: { substationId: string }) {
  const rows = useSubstationStatusRows(substationId);
  const effective = useEffectiveAssets();

  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;

  const [searchParams, setSearchParams] = useSearchParams();
  // ?assetId= 딥링크 소비 — 자산 로드 후 자동 선택, 파라미터 제거.
  useEffect(() => {
    const assetId = searchParams.get('assetId');
    if (!assetId) return;
    if (!effective.find((a) => a.id === assetId)) return; // 아직 로드 안 됨 → 다음 렌더에 재시도
    setSelectedId(assetId);
    setSearchParams((p) => { p.delete('assetId'); return p; }, { replace: true });
    // deps: effective(자산 로드 대기)+searchParams 만. set* 는 안정 식별자라 의도적 생략.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, searchParams]);

  // 인스펙터는 effective(스테이징 편집 반영)에서 선택 자산을 찾는다 — 리스트와 동일 소스.
  const selectedAsset = effective.find((a) => a.id === selectedId);

  return (
    <div className="flex h-full">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <NodeStatusView nodeType="substation" nodeId={substationId} rows={rows} />
        </div>
      </div>
      {selectedAsset && (
        <AssetDetailPanel
          key={selectedAsset.id}
          asset={selectedAsset}
          onClose={() => setSelectedId(null)}
          onPatch={(id, patch) => useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)}
        />
      )}
    </div>
  );
}
