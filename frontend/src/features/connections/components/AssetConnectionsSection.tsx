import { X } from 'lucide-react';
import { CABLE_TYPES } from '../constants';

interface Endpoint { equipmentId: string | null; moduleId: string | null; name: string }
interface Conn { id: string; source: Endpoint; target: Endpoint; cableType: string; label: string | null; length: number | null }
interface Props {
  assetId: string;
  connections: Conn[];
  onDelete: (cableId: string) => void;
  onUpdate: (cableId: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (assetId: string) => void;
}

const epId = (e: Endpoint) => e.equipmentId ?? e.moduleId;

export function AssetConnectionsSection({ assetId, connections, onDelete, onUpdate, onSelectAsset }: Props) {
  if (!connections.length) return <p className="text-xs text-gray-400">연결 없음</p>;
  return (
    <div className="space-y-0.5">
      {connections.map((c) => {
        const isSource = epId(c.source) === assetId;
        const other = isSource ? c.target : c.source;
        const otherId = epId(other);
        return (
          <div key={c.id} className="flex items-center gap-2 text-sm py-0.5">
            <button className="flex-1 text-left text-blue-700 hover:underline truncate"
              onClick={() => otherId && onSelectAsset(otherId)}>{other.name}</button>
            <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
              className="text-xs border border-gray-200 rounded px-1 py-0.5 shrink-0">
              {CABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input key={c.id + (c.label ?? '')} aria-label="라벨" defaultValue={c.label ?? ''}
              onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
              className="w-16 text-xs border border-gray-200 rounded px-1 py-0.5 shrink-0" placeholder="라벨" />
            <button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-content-faint hover:text-danger shrink-0"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
