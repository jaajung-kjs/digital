import { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { Asset } from '../../../types/asset';
import type { GridColumn } from '../columns';
import { Badge, IconButton } from '../../../components/ui';

interface Props {
  asset: Asset;
  columns: GridColumn[];
  onCommit: (id: string, patch: { name?: string }) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  alert?: { label: string } | null;
  onSelect?: () => void;
}

export function AssetGridRow({ asset, columns, onCommit, onDuplicate, onDelete, alert, onSelect }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const cellValue = (col: GridColumn): string => {
    if (col.key in draft) return draft[col.key];
    return asset.name;
  };

  const commitCell = (col: GridColumn) => {
    if (!(col.key in draft)) return;
    const value = draft[col.key];
    if (value.trim() && value !== asset.name) onCommit(asset.id, { name: value.trim() });
    setDraft((d) => { const n = { ...d }; delete n[col.key]; return n; });
  };

  return (
    <tr className="border-b border-line hover:bg-surface-2">
      <td onClick={onSelect} className="px-2 py-2 text-xs text-content-muted whitespace-nowrap cursor-pointer">
        {/* ISA-101: 종류 점은 무채색(설비=중립). 색은 상태 배지에만 사용. */}
        <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle bg-eq-3" />
        {asset.assetType.name}
        {alert && <Badge status="warning" className="ml-1 align-middle">{alert.label}</Badge>}
      </td>
      {columns.map((col) => (
        <td key={col.key} className="px-1 py-0.5">
          <input
            className="w-full px-1 py-1 text-sm bg-transparent border border-transparent rounded hover:border-line focus:border-primary focus:bg-surface focus:outline-none text-content"
            value={cellValue(col)}
            onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
            onBlur={() => commitCell(col)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </td>
      ))}
      <td className="px-2 py-1 whitespace-nowrap text-right">
        <IconButton aria-label="복제" title="복제" className="p-1 mr-1 text-content-faint hover:text-primary" onClick={() => onDuplicate(asset.id)}>
          <Copy size={15} />
        </IconButton>
        <IconButton aria-label="삭제" title="삭제" className="p-1 text-content-faint hover:text-danger" onClick={() => onDelete(asset.id)}>
          <Trash2 size={15} />
        </IconButton>
      </td>
    </tr>
  );
}
