import { X } from 'lucide-react';
import { CABLE_TYPES } from '../constants';
import { SectionEmpty } from '../../assets/components/detail/SectionShell';
import { formatCableLength } from '../../../utils/cable/pathLength';

interface Endpoint { assetId: string | null; name: string }
// effective 케이블은 totalLength(cm)를 들고 있다. 표시 시 formatCableLength 로 환산.
interface Conn { id: string; source: Endpoint; target: Endpoint; cableType: string; label: string | null; totalLength?: number | null }
interface Props {
  assetId: string;
  connections: Conn[];
  onDelete: (cableId: string) => void;
  onUpdate: (cableId: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (assetId: string) => void;
}

const epId = (e: Endpoint) => e.assetId;

export function AssetConnectionsSection({ assetId, connections, onDelete, onUpdate, onSelectAsset }: Props) {
  if (!connections.length) return <SectionEmpty>연결 없음</SectionEmpty>;
  return (
    <div className="space-y-0.5">
      {connections.map((c) => {
        const isSource = epId(c.source) === assetId;
        const other = isSource ? c.target : c.source;
        const otherId = epId(other);
        return (
          <div key={c.id} className="flex items-center gap-2 text-sm py-0.5">
            <button className="flex-1 text-left text-primary hover:underline truncate"
              onClick={() => otherId && onSelectAsset(otherId)}>{other.name}</button>
            <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
              className="text-xs border border-line rounded px-1 py-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              {CABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input key={c.id + (c.label ?? '')} aria-label="라벨" defaultValue={c.label ?? ''}
              onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
              className="w-16 text-xs border border-line rounded px-1 py-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder="라벨" />
            <span className="text-xs text-content-muted tabular-nums shrink-0 w-12 text-right">{formatCableLength(c.totalLength)}</span>
            <button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-content-faint hover:text-danger shrink-0"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
