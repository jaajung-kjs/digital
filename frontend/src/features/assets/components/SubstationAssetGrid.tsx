import { useMemo, useState } from 'react';
import { useAssetTypes } from '../hooks/useAssetTypes';
import {
  useSubstationAssets, useCreateAsset, useUpdateAsset, useDeleteAsset, useDuplicateAsset,
} from '../hooks/useSubstationAssets';
import { buildColumns } from '../columns';
import { AssetGridRow } from './AssetGridRow';
import { AssetDetailPanel } from './AssetDetailPanel';
import { assetAlert } from '../alerts';
import { buildCsv, downloadCsv } from '../exportCsv';

interface Props { substationId: string }

export function SubstationAssetGrid({ substationId }: Props) {
  const { data: types = [] } = useAssetTypes();
  const { data: assets = [], isLoading } = useSubstationAssets(substationId);
  const createAsset = useCreateAsset(substationId);
  const updateAsset = useUpdateAsset(substationId);
  const deleteAsset = useDeleteAsset(substationId);
  const duplicateAsset = useDuplicateAsset(substationId);

  const [filterTypeId, setFilterTypeId] = useState<string>('');
  const [newTypeId, setNewTypeId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertOnly, setAlertOnly] = useState(false);

  const today = useMemo(() => new Date(), []);

  const visible = useMemo(
    () => (filterTypeId ? assets.filter((a) => a.assetTypeId === filterTypeId) : assets),
    [assets, filterTypeId],
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
    createAsset.mutate(
      { substationId, assetTypeId: newTypeId, name: newName.trim() },
      { onSuccess: () => setNewName('') },
    );
  };

  const selectedAsset = shown.find((a) => a.id === selectedId) ?? assets.find((a) => a.id === selectedId);

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
          disabled={!newTypeId || !newName.trim() || createAsset.isPending}
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
                onCommit={(id, patch) => updateAsset.mutate({ id, ...patch })}
                onDuplicate={(id) => duplicateAsset.mutate(id)}
                onDelete={(id) => { if (confirm('이 자산을 삭제할까요?')) deleteAsset.mutate(id); }}
              />
            ))}
          </tbody>
        </table>
      )}
      </div>
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          onClose={() => setSelectedId(null)}
          onPatch={(id, patch) => updateAsset.mutate({ id, ...patch })}
        />
      )}
    </div>
  );
}
