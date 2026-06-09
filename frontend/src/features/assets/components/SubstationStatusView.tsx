import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset } from '../../../types/asset';
import type { CollectionDescriptor } from '../../workingCopy/descriptor';
import { useSubstationAssets } from '../hooks/useSubstationAssets';
import { useRegisterStore } from '../registerStore';
import { mergeEffective } from '../../workingCopy/effective';
import { commitRegister } from '../commit';
import { useSelection } from '../../workspace/SelectionContext';
import { NodeStatusView } from './NodeStatusView';
import { AssetDetailPanel } from './AssetDetailPanel';
import { ConflictDialog } from '../../workingCopy/ConflictDialog';

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

const ASSET_DESCRIPTOR: CollectionDescriptor<Asset, Partial<Asset>> = {
  name: 'assets',
  idOf: (a: Asset) => a.id,
  versionOf: (a: Asset) => a.updatedAt ?? null,
  isTemp: (id: string) => id.startsWith('temp-'),
};

// 로딩 중(data===undefined) 매 렌더 새 [] 가 생기면 load 이펙트가 무한 재실행 → 안정 참조 사용.
const EMPTY_ASSETS: Asset[] = [];

export function SubstationStatusView({ substationId }: { substationId: string }) {
  const { data } = useSubstationAssets(substationId);
  const assets = data ?? EMPTY_ASSETS;
  const queryClient = useQueryClient();

  const overlay = useRegisterStore((s) => s.overlay);
  const dirty = useRegisterStore((s) => s.dirtyCount());

  // saved 가 바뀌면 working copy 를 다시 로드 — 단, 스테이징된 편집이 없을 때만(클로버 방지).
  useEffect(() => {
    if (useRegisterStore.getState().dirtyCount() === 0) {
      useRegisterStore.getState().load(substationId, assets);
    }
  }, [substationId, assets]);

  // 인스펙터는 effective(스테이징 편집 반영)에서 선택 자산을 찾는다 — 그리드와 동일.
  const effective = useMemo(
    () => mergeEffective(assets, overlay, ASSET_DESCRIPTOR),
    [assets, overlay],
  );

  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;

  const [conflicts, setConflicts] = useState<{ id: string; name?: string }[] | null>(null);
  const [committing, setCommitting] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  // ?assetId= 딥링크 소비 — 자산 로드 후 자동 선택, 파라미터 제거.
  useEffect(() => {
    const assetId = searchParams.get('assetId');
    if (!assetId) return;
    if (!effective.find((a) => a.id === assetId)) return;  // 아직 로드 안 됨 → 다음 렌더에 재시도
    setSelectedId(assetId);
    setSearchParams((p) => { p.delete('assetId'); return p; }, { replace: true });
    // deps: effective(자산 로드 대기)+searchParams 만. set* 는 안정 식별자라 의도적 생략.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, searchParams]);

  const handleCommit = async () => {
    if (committing) return;
    setCommitting(true);
    try {
      const r = await commitRegister(substationId, queryClient);
      if (!r.ok) setConflicts(r.conflicts ?? []);
    } finally {
      setCommitting(false);
    }
  };

  const selectedAsset = effective.find((a) => a.id === selectedId);

  return (
    <div className="flex h-full">
      <div className="flex-1 min-h-0 flex flex-col">
        {dirty > 0 && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-amber-50 text-sm">
            <span className="text-amber-700">미커밋 {dirty}건</span>
            <button onClick={handleCommit} disabled={committing} className="px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">커밋</button>
            <button onClick={() => useRegisterStore.getState().revert()} className="px-2 py-1 rounded bg-gray-100">되돌리기</button>
          </div>
        )}
        <div className="flex-1 min-h-0">
          {/* 리스트는 useNodeAssets(커밋본) 기준 — 인스펙터 편집은 registerStore 오버레이에 스테이지되고
              커밋 시 nodeAssets 무효화로 리스트에 반영된다(읽기-커밋 설계). */}
          <NodeStatusView nodeType="substation" nodeId={substationId} />
        </div>
      </div>
      {selectedAsset && (
        <AssetDetailPanel
          key={selectedAsset.id}
          asset={selectedAsset}
          onClose={() => setSelectedId(null)}
          onPatch={(id, patch) => useRegisterStore.getState().stageUpdate(id, patch)}
        />
      )}
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          onClose={() => setConflicts(null)}
          onReloadLatest={async () => {
            await queryClient.invalidateQueries({ queryKey: ['assets', substationId] });
            const fresh = queryClient.getQueryData<Asset[]>(['assets', substationId]) ?? [];
            useRegisterStore.getState().refreshBaseVersions(fresh);
            setConflicts(null);  // overlay 보존 — baseVersion 만 최신화하여 재커밋 가능
          }}
        />
      )}
    </div>
  );
}
