import { useState } from 'react';
import { useEffectiveAssetConnections, type AssetConnection } from '../hooks/useEffectiveAssetConnections';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSelection } from '../../workspace/SelectionContext';
import { X } from 'lucide-react';
import { CABLE_TYPES } from '../constants';
import { formatCableLength } from '../../../utils/cable/pathLength';

type Conn = AssetConnection; // 연결 목록 단일 빌더의 행 타입(끝점 이름은 단일 리졸버 — DTO 스냅샷 아님).
const epId = (e: Conn['source']) => e.assetId;

export function SubstationConnectionsTable({ connections, typeFilter, onDelete, onUpdate, onSelectAsset }: {
  connections: Conn[]; typeFilter: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { label?: string | null; cableType?: string }) => void;
  onSelectAsset: (id: string) => void;
}) {
  const rows = typeFilter ? connections.filter((c) => c.cableType === typeFilter) : connections;
  if (!rows.length) return <p className="p-4 text-sm text-content-faint">연결 없음</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-content-muted border-b border-line">
        <th className="p-2">출발</th><th className="p-2">도착</th><th className="p-2">유형</th><th className="p-2">라벨</th><th className="p-2">길이</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-line hover:bg-surface-2">
            <td className="p-2"><button className="text-primary hover:underline" onClick={() => epId(c.source) && onSelectAsset(epId(c.source)!)}>{c.source.name}</button></td>
            <td className="p-2"><button className="text-primary hover:underline" onClick={() => epId(c.target) && onSelectAsset(epId(c.target)!)}>{c.target.name}</button></td>
            <td className="p-2">
              <select aria-label="유형" value={c.cableType} onChange={(e) => onUpdate(c.id, { cableType: e.target.value })}
                className="text-xs border border-line rounded px-1 py-0.5">
                {CABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td className="p-2">
              <input aria-label="라벨" defaultValue={c.label ?? ''} key={c.id + (c.label ?? '')}
                onBlur={(e) => { const v = e.target.value || null; if (v !== c.label) onUpdate(c.id, { label: v }); }}
                className="w-20 text-xs border border-line rounded px-1 py-0.5" placeholder="-" />
            </td>
            <td className="p-2 text-content-muted tabular-nums">{formatCableLength(c.totalLength)}</td>
            <td className="p-2"><button aria-label="연결 삭제" onClick={() => onDelete(c.id)} className="text-content-faint hover:text-danger"><X size={14} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TYPES = ['', ...CABLE_TYPES];

export function SubstationConnectionsView(_: { substationId: string }) {
  // 연결 목록 단일 빌더(null=전체). 끝점 이름은 단일 리졸버로 effective 자산에서 해소되므로
  // staged 이름 변경·랙모듈/분기 endpoint 도 올바로 보인다(종전 DTO 스냅샷 이름 드리프트 제거).
  const connections = useEffectiveAssetConnections(null);
  const sel = useSelection();
  const [typeFilter, setTypeFilter] = useState('');
  return (
    <div className="h-full overflow-auto">
      <div className="p-2 border-b border-line flex gap-2 items-center">
        <span className="text-xs text-content-muted">유형</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm border border-line rounded px-1 py-0.5">
          {TYPES.map((t) => <option key={t} value={t}>{t || '전체'}</option>)}
        </select>
        <span className="text-xs text-content-faint">{connections.length}건</span>
      </div>
      <SubstationConnectionsTable
        connections={connections} typeFilter={typeFilter}
        onDelete={(id) => { if (window.confirm('이 연결을 삭제할까요?')) useSubstationWorkingCopy.getState().stageCableDelete(id); }}
        onUpdate={(id, patch) => useSubstationWorkingCopy.getState().stageCableUpdate(id, patch)}
        onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
      />
    </div>
  );
}
