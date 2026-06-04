import { useMemo, useState } from 'react';
import { useAssetTypes } from '../hooks/useAssetTypes';
import {
  useSubstationAssets, useCreateAsset, useUpdateAsset, useDeleteAsset, useDuplicateAsset,
} from '../hooks/useSubstationAssets';
import { buildColumns } from '../columns';
import { AssetGridRow } from './AssetGridRow';

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

  const visible = useMemo(
    () => (filterTypeId ? assets.filter((a) => a.assetTypeId === filterTypeId) : assets),
    [assets, filterTypeId],
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

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
        >
          <option value="">전체 종류</option>
          {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
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
      ) : visible.length === 0 ? (
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
            {visible.map((a) => (
              <AssetGridRow
                key={a.id}
                asset={a}
                columns={columns}
                onCommit={(id, patch) => updateAsset.mutate({ id, ...patch })}
                onDuplicate={(id) => duplicateAsset.mutate(id)}
                onDelete={(id) => { if (confirm('이 자산을 삭제할까요?')) deleteAsset.mutate(id); }}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
