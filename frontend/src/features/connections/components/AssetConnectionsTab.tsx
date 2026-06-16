import { useMemo } from 'react';
import { useAssetDiagram } from '../hooks/useAssetConnections';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useTraceGraph } from '../../trace/traceGraph';
import { resolveHighlight } from '../../workspace/selectionHighlight';
import { DiagramTree } from './DiagramTree';

interface Props { assetId: string }

export function AssetConnectionsTab({ assetId }: Props) {
  const { groups, isLoading } = useAssetDiagram(assetId);
  const prepareTopology = usePathHighlightStore((s) => s.prepareTopology);
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const selectedCore = useSelectionStore((s) => s.selectedCore);
  const selectedCableId = useSelectionStore((s) => s.selectedCableId);
  const { graph } = useTraceGraph();

  // active 컴포넌트 = 도면 하이라이트와 *동일한* 규칙(resolveHighlight)으로 결정 →
  // "선택 표시" 와 "도면 하이라이트" 가 절대 어긋나지 않는다. (예전엔 selectedCore===comp.core
  // 로만 판단해 기본값 null 이 첫 core-null 컴포넌트와 우연히 일치, 하이라이트와 불일치.)
  const activeSeed = useMemo(() => {
    if (selectedAssetId !== assetId) return null;
    const cables = (graph?.cables ?? []) as never[];
    const comps = groups.flatMap((g) => g.components);
    const action = resolveHighlight(assetId, selectedCore, selectedCableId, cables, comps);
    return action.kind === 'diagram' ? action.comp.seedCableId : null;
  }, [selectedAssetId, assetId, selectedCore, selectedCableId, graph, groups]);

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
            const isActive = activeSeed === comp.seedCableId;
            return (
              <div key={comp.seedCableId} className={`flex items-start border-b border-line ${isActive ? 'bg-info-bg/40' : 'hover:bg-surface-2'}`}>
                <button type="button" onClick={() => useSelectionStore.getState().setSelectedComponent(assetId, comp.core, comp.seedCableId)} className="flex-1 text-left px-3 py-2 min-w-0">
                  <DiagramTree root={comp.root} />
                </button>
                <button type="button" aria-label="상세" title="네트워크 토폴로지 보기"
                  onClick={() => prepareTopology(comp.seedCableId)}
                  className="px-2 py-2 text-xs text-primary hover:text-primary-hover flex-shrink-0">↗</button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
