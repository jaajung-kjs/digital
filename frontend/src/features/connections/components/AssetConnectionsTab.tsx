import { useEffect } from 'react';
import { useAssetDiagram } from '../hooks/useAssetConnections';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { DiagramTree } from './DiagramTree';

interface Props { assetId: string }

export function AssetConnectionsTab({ assetId }: Props) {
  const { groups, isLoading } = useAssetDiagram(assetId);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const openTopology = usePathHighlightStore((s) => s.openTopology);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);

  useEffect(() => () => clearHighlight(), [assetId, clearHighlight]);

  if (isLoading) return <div className="flex items-center justify-center py-8 text-xs text-content-faint">불러오는 중…</div>;
  if (groups.length === 0) return <div className="flex items-center justify-center py-8 text-xs text-content-faint">연결된 케이블이 없습니다.</div>;

  return (
    <div className="flex flex-col gap-0">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border-b border-line">
            {group.color && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />}
            <span className="text-xs font-semibold text-content-muted">{group.label}</span>
            <span className="ml-auto text-xs text-content-faint">{group.components.length}</span>
          </div>
          {group.components.map((comp) => {
            const isActive = tracingCableId === comp.seedCableId;
            return (
              <div key={comp.seedCableId} className={`flex items-start border-b border-line ${isActive ? 'bg-info-bg/40' : 'hover:bg-surface-2'}`}>
                <button type="button" onClick={() => startTrace(comp.seedCableId)} className="flex-1 text-left px-3 py-2 min-w-0">
                  <DiagramTree root={comp.root} />
                </button>
                <button type="button" aria-label="상세" title="네트워크 토폴로지 보기"
                  onClick={() => { startTrace(comp.seedCableId); openTopology(); }}
                  className="px-2 py-2 text-xs text-primary hover:text-primary-hover flex-shrink-0">↗</button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
