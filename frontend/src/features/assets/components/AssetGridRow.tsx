import { useState } from 'react';
import type { Asset } from '../../../types/asset';
import type { GridColumn } from '../columns';
import { attrValue } from '../columns';

interface Props {
  asset: Asset;
  columns: GridColumn[];
  onCommit: (id: string, patch: { name?: string; attributes?: Record<string, unknown> }) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AssetGridRow({ asset, columns, onCommit, onDuplicate, onDelete }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const cellValue = (col: GridColumn): string => {
    if (col.key in draft) return draft[col.key];
    if (col.kind === 'name') return asset.name;
    return attrValue(asset.attributes, col.key);
  };

  const commitCell = (col: GridColumn) => {
    if (!(col.key in draft)) return;
    const value = draft[col.key];
    if (col.kind === 'name') {
      if (value.trim() && value !== asset.name) onCommit(asset.id, { name: value.trim() });
    } else {
      const nextAttrs = { ...(asset.attributes ?? {}), [col.key]: value };
      onCommit(asset.id, { attributes: nextAttrs });
    }
    setDraft((d) => { const n = { ...d }; delete n[col.key]; return n; });
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-2 py-1 text-xs text-gray-500 whitespace-nowrap">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
          style={{ backgroundColor: asset.assetType.displayColor ?? '#94a3b8' }}
        />
        {asset.assetType.name}
      </td>
      {columns.map((col) => (
        <td key={col.key} className="px-1 py-0.5">
          <input
            className="w-full px-1 py-0.5 text-sm bg-transparent border border-transparent rounded hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none"
            value={cellValue(col)}
            onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
            onBlur={() => commitCell(col)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </td>
      ))}
      <td className="px-2 py-1 whitespace-nowrap text-right">
        <button onClick={() => onDuplicate(asset.id)} className="text-xs text-gray-400 hover:text-blue-600 mr-2" title="복제">⧉</button>
        <button onClick={() => onDelete(asset.id)} className="text-xs text-gray-400 hover:text-red-600" title="삭제">✕</button>
      </td>
    </tr>
  );
}
