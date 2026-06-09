import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset } from '../../../types/asset';
import type { CollectionDescriptor } from '../../workingCopy/descriptor';
import { useAssetTypes } from '../hooks/useAssetTypes';
import { useSubstationAssets } from '../hooks/useSubstationAssets';
import { useRegisterStore } from '../registerStore';
import { mergeEffective } from '../../workingCopy/effective';
import { commitRegister } from '../commit';
import { generateTempId } from '../../../utils/idHelpers';
import { buildColumns } from '../columns';
import { AssetGridRow } from './AssetGridRow';
import { AssetDetailPanel } from './AssetDetailPanel';
import { ConflictDialog } from '../../workingCopy/ConflictDialog';
import { assetAlert } from '../alerts';
import { buildCsv, downloadCsv } from '../exportCsv';
import { useSelection } from '../../workspace/SelectionContext';

const ASSET_DESCRIPTOR: CollectionDescriptor<Asset, Partial<Asset>> = {
  name: 'assets',
  idOf: (a: Asset) => a.id,
  versionOf: (a: Asset) => a.updatedAt ?? null,
  isTemp: (id: string) => id.startsWith('temp-'),
};

// 로딩 중(data===undefined) 매 렌더 새 [] 가 생기면 load 이펙트가 무한 재실행 → 안정 참조 사용.
const EMPTY_ASSETS: Asset[] = [];

interface Props { substationId: string }

export function SubstationAssetGrid({ substationId }: Props) {
  const { data: types = [] } = useAssetTypes();
  const { data, isLoading } = useSubstationAssets(substationId);
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

  const effective = useMemo(
    () => mergeEffective(assets, overlay, ASSET_DESCRIPTOR),
    [assets, overlay],
  );

  const [filterTypeId, setFilterTypeId] = useState<string>('');
  const [newTypeId, setNewTypeId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const sel = useSelection();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = sel ? sel.selectedAssetId : localSelected;
  const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;
  const [alertOnly, setAlertOnly] = useState(false);
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

  const today = useMemo(() => new Date(), []);

  const visible = useMemo(
    () => (filterTypeId ? effective.filter((a) => a.assetTypeId === filterTypeId) : effective),
    [effective, filterTypeId],
  );

  const shown = useMemo(
    () => (alertOnly ? visible.filter((a) => assetAlert(a, today)) : visible),
    [visible, alertOnly, today],
  );

  const columns = useMemo(() => {
    const usedTypeIds = new Set(visible.map((a) => a.assetTypeId));
    const usedTypes = types.filter((t) => usedTypeIds.has(t.id));
    return buildColumns(usedTypes.length ? usedTypes : []);
  }, [visible, types]);

  const handleAdd = () => {
    if (!newTypeId || !newName.trim()) return;
    const type = types.find((t) => t.id === newTypeId);
    if (!type) return;
    const newId = generateTempId();
    const newAsset: Asset = {
      id: newId,
      substationId,
      assetTypeId: newTypeId,
      assetType: {
        id: type.id,
        code: type.code,
        name: type.name,
        group: type.group,
        displayColor: type.displayColor,
        fieldTemplate: type.fieldTemplate,
      },
      name: newName.trim(),
      parentAssetId: null,
      floorId: null,
      roomText: null,
      attributes: {},
      installDate: null,
      warrantyUntil: null,
      replaceDue: null,
      manager: null,
      description: null,
      status: null,
      sortOrder: 0,
      updatedAt: '',
    };
    useRegisterStore.getState().stageCreate(newId, newAsset);
    setNewName('');
  };

  const handleDuplicate = (id: string) => {
    const src = effective.find((a) => a.id === id);
    if (!src) return;
    const newId = generateTempId();
    const dup: Asset = {
      ...src,
      id: newId,
      name: `${src.name} (복제)`,
      updatedAt: '',
      sortOrder: 0,
    };
    useRegisterStore.getState().stageCreate(newId, dup);
  };

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
      <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-2 mb-3">
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
        >
          <option value="">전체 종류</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <button
          onClick={() => setAlertOnly((v) => !v)}
          className={`text-sm px-2 py-1 rounded ${alertOnly ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}
        >임박만</button>
        <button
          onClick={() => downloadCsv(`장비대장_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(shown, columns))}
          className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-700"
        >내보내기</button>
        {dirty > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-amber-700">미커밋 {dirty}건</span>
            <button onClick={handleCommit} disabled={committing} className="px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">커밋</button>
            <button onClick={() => useRegisterStore.getState().revert()} className="px-2 py-1 rounded bg-gray-100">되돌리기</button>
          </div>
        )}
        <div className="flex-1" />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={newTypeId}
          onChange={(e) => setNewTypeId(e.target.value)}
        >
          <option value="">종류 선택</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1"
          placeholder="이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          onClick={handleAdd}
          disabled={!newTypeId || !newName.trim()}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300"
        >+ 추가</button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400">아직 등록된 자산이 없습니다. 위에서 종류를 고르고 이름을 입력해 추가하세요.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 text-left">
              <th className="px-2 py-1 text-xs font-semibold text-gray-500">종류</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-xs font-semibold text-gray-500">{c.label}</th>
              ))}
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <AssetGridRow
                key={a.id}
                asset={a}
                columns={columns}
                alert={assetAlert(a, today)}
                onSelect={() => setSelectedId(a.id)}
                onCommit={(id, patch) => useRegisterStore.getState().stageUpdate(id, patch)}
                onDuplicate={(id) => handleDuplicate(id)}
                onDelete={(id) => { if (confirm('이 자산을 삭제할까요?')) useRegisterStore.getState().stageDelete(id, ASSET_DESCRIPTOR.isTemp(id)); }}
              />
            ))}
          </tbody>
        </table>
      )}
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
