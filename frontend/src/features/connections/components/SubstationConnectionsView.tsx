import { useState } from 'react';
import { useSubstationConnections } from '../hooks/useSubstationConnections';
import { useCableMutations } from '../hooks/useCableMutations';
import { useSelection } from '../../workspace/SelectionContext';

interface Endpoint { equipmentId: string | null; moduleId: string | null; name: string }
interface Conn { id: string; source: Endpoint; target: Endpoint; cableType: string; label: string | null; length: number | null }
const epId = (e: Endpoint) => e.equipmentId ?? e.moduleId;
const EDIT_TYPES = ['AC', 'DC', 'LAN', 'FIBER', 'GROUND'];

export function SubstationConnectionsTable({ connections, typeFilter, onDelete, onUpdate, onSelectAsset }: {
  connections: Conn[]; typeFilter: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (id: string) => void;
}) {
  const rows = typeFilter ? connections.filter((c) => c.cableType === typeFilter) : connections;
  if (!rows.length) return <p className="p-4 text-sm text-gray-400">연결 없음</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-500 border-b">
        <th className="p-2">출발</th><th className="p-2">도착</th><th className="p-2">유형</th><th className="p-2">라벨</th><th className="p-2">길이</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b hover:bg-gray-50">
            <td className="p-2"><button className="text-blue-700 hover:underline" onClick={() => epId(c.source) && onSelectAsset(epId(c.source)!)}>{c.source.name}</button></td>
            <td className="p-2"><button className="text-blue-700 hover:underline" onClick={() => epId(c.target) && onSelectAsset(epId(c.target)!)}>{c.target.name}</button></td>
            <td className="p-2">
              <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
                className="text-xs border border-gray-200 rounded px-1 py-0.5">
                {EDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td className="p-2">
              <input aria-label="라벨" defaultValue={c.label ?? ''} key={c.id + (c.label ?? '')}
                onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
                className="w-20 text-xs border border-gray-200 rounded px-1 py-0.5" placeholder="-" />
            </td>
            <td className="p-2 text-gray-500">{c.length ?? '-'}</td>
            <td className="p-2"><button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-gray-300 hover:text-red-500">✕</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TYPES = ['', 'AC', 'DC', 'LAN', 'FIBER', 'GROUND'];

export function SubstationConnectionsView({ substationId }: { substationId: string }) {
  const { data: connections = [] } = useSubstationConnections(substationId);
  const { deleteCable, updateCable } = useCableMutations();
  const sel = useSelection();
  const [typeFilter, setTypeFilter] = useState('');
  return (
    <div className="h-full overflow-auto">
      <div className="p-2 border-b flex gap-2 items-center">
        <span className="text-xs text-gray-500">유형</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm border rounded px-1 py-0.5">
          {TYPES.map((t) => <option key={t} value={t}>{t || '전체'}</option>)}
        </select>
        <span className="text-xs text-gray-400">{connections.length}건</span>
      </div>
      <SubstationConnectionsTable
        connections={connections} typeFilter={typeFilter}
        onDelete={(id) => deleteCable.mutate(id)}
        onUpdate={(id, patch) => updateCable.mutate({ id, patch })}
        onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
      />
    </div>
  );
}
