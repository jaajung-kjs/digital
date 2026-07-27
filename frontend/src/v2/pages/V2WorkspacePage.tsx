import { useMemo, useState } from 'react';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { StatusTable } from '../components/StatusTable';
import { useV2Catalog, useV2NodeAssets, useTypesById } from '../hooks';
import type { FlatOrgNode } from '../orgTreeSelectors';
import { buildStatusRows, type StatusRow } from '../statusRows';
import { useV2WorkingCopy } from '../store/workingCopyStore';

export default function V2WorkspacePage() {
  const [selected, setSelected] = useState<FlatOrgNode | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const handleSelect = (n: FlatOrgNode) => {
    setSelected(n);
    setSelectedAssetId(null);
    if (n.kind === 'substation') void useV2WorkingCopy.getState().load(n.id);
  };

  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  const categoryNameById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data],
  );

  // ── 변전소 스코프: working copy effective state ──────────────────────────
  const substationId = useV2WorkingCopy((s) => s.substationId);
  const savedFloors = useV2WorkingCopy((s) => s.saved.floors);
  const savedInspectionLogs = useV2WorkingCopy((s) => s.saved.inspectionLogs);

  const effectiveAssets = useV2WorkingCopy((s) => s.effectiveAssets);
  const effectiveInspectionsFor = useV2WorkingCopy((s) => s.effectiveInspectionsFor);

  const substationRows = useMemo<StatusRow[]>(() => {
    if (selected?.kind !== 'substation' || substationId !== selected.id) return [];
    const assets = effectiveAssets();
    const inspectionsByAsset = new Map<string, string[]>();
    for (const log of savedInspectionLogs) {
      const existing = inspectionsByAsset.get(log.assetId) ?? [];
      existing.push(log.inspectedAt);
      inspectionsByAsset.set(log.assetId, existing);
    }
    // merge overlay inspections
    for (const a of assets) {
      const overlayLogs = effectiveInspectionsFor(a.id);
      if (overlayLogs.length) {
        inspectionsByAsset.set(a.id, overlayLogs.map((l) => l.inspectedAt));
      }
    }
    return buildStatusRows({
      assets,
      floors: savedFloors,
      typesById,
      categoryNameById,
      inspectionsByAsset,
    });
  }, [selected, substationId, effectiveAssets, savedFloors, savedInspectionLogs, effectiveInspectionsFor, typesById, categoryNameById]);

  // ── 노드 스코프 (본부/지사): useV2NodeAssets ────────────────────────────
  const isNodeScope = selected != null && selected.kind !== 'substation';
  const nodeAssetsQuery = useV2NodeAssets(isNodeScope ? selected.id : null);

  const nodeRows = useMemo<StatusRow[]>(() => {
    if (!isNodeScope) return [];
    return (nodeAssetsQuery.data ?? []).map((r) => ({
      id: r.id,
      typeName: r.typeName,
      categoryName: r.categoryName,
      name: r.name,
      location: r.parentName ?? '—',
      installDate: null,
      manager: null,
      lastInspectedAt: null,
      status: r.status,
      substationName: r.substationName,
    }));
  }, [isNodeScope, nodeAssetsQuery.data]);

  const rows = selected?.kind === 'substation' ? substationRows : nodeRows;
  const nodeScope = isNodeScope;

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree">
        <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
        {selected == null && (
          <div className="p-4 text-sm text-content-muted">좌측에서 조직/변전소를 선택하세요</div>
        )}
        {selected != null && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-line px-4 py-2 text-sm font-semibold text-content" data-testid="v2-selected">
              {selected.name}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <StatusTable
                rows={rows}
                selectedId={selectedAssetId}
                onSelectAsset={setSelectedAssetId}
                nodeScope={nodeScope}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
