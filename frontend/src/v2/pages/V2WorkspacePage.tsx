import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { AssetDetailPanel } from '../components/AssetDetailPanel';
import { AddAssetModal } from '../components/AddAssetModal';
import { StatusTable } from '../components/StatusTable';
import { SaveBar } from '../components/SaveBar';
import { ConflictDialog } from '../components/ConflictDialog';
import { FloorPlanView } from '../components/FloorPlanView';
import { useV2Catalog, useV2NodeAssets, useTypesById } from '../hooks';
import type { FlatOrgNode } from '../orgTreeSelectors';
import { buildStatusRows, type StatusRow } from '../statusRows';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useCommit } from '../store/useCommit';

type ViewMode = '현황' | '평면도';

export default function V2WorkspacePage() {
  const [selected, setSelected] = useState<FlatOrgNode | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('현황');

  const { commit, isCommitting, conflicts, clearConflicts, error: commitError, clearError: clearCommitError } = useCommit();

  const handleSelect = (n: FlatOrgNode) => {
    const st = useV2WorkingCopy.getState();
    if (n.kind === 'substation') {
      if (n.id === st.substationId) { setSelected(n); return; } // same substation re-click: no reload/discard
      if (st.dirtyCount() > 0 && !window.confirm('저장하지 않은 변경이 있습니다. 폐기하고 이동할까요?')) return;
    }
    setSelected(n);
    setSelectedAssetId(null);
    if (n.kind === 'substation') void st.load(n.id);
  };

  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  const categoryNameById = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data],
  );

  // ── 변전소 스코프: working copy effective state (반응형 슬라이스 구독) ──
  const substationId = useV2WorkingCopy((s) => s.substationId);
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const substationRows = useMemo<StatusRow[]>(() => {
    if (selected?.kind !== 'substation' || substationId !== selected.id) return [];
    const assets = mergeEffective(saved.assets, overlays.assets);
    const inspectionsByAsset = new Map<string, string[]>();
    for (const log of mergeEffective(saved.inspectionLogs, overlays.inspections)) {
      const list = inspectionsByAsset.get(log.assetId);
      if (list) list.push(log.inspectedAt);
      else inspectionsByAsset.set(log.assetId, [log.inspectedAt]);
    }
    return buildStatusRows({
      assets,
      floors: saved.floors,
      typesById,
      categoryNameById,
      inspectionsByAsset,
    });
  }, [selected, substationId, saved, overlays, typesById, categoryNameById]);

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

  // 상세 패널: 변전소 스코프 + selectedAssetId 가 effective assets 에 있을 때만
  const showDetailPanel =
    selected?.kind === 'substation' &&
    selectedAssetId != null &&
    mergeEffective(saved.assets, overlays.assets).some((a) => a.id === selectedAssetId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree">
          <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
          {selected == null && (
            <div className="p-4 text-sm text-content-muted">좌측에서 조직/변전소를 선택하세요</div>
          )}
          {selected != null && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 헤더: 선택 노드 이름 + 뷰 토글 (변전소 스코프에서만) */}
              <div className="flex shrink-0 items-center border-b border-line px-4 py-2">
                <span className="text-sm font-semibold text-content" data-testid="v2-selected">
                  {selected.name}
                </span>
                {selected.kind === 'substation' && substationId === selected.id && (
                  <div className="ml-4 flex gap-0">
                    {(['현황', '평면도'] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`px-3 py-1 text-sm transition-colors ${
                          viewMode === mode
                            ? 'border-b-2 border-primary font-medium text-primary'
                            : 'text-content-muted hover:text-content'
                        }`}
                        onClick={() => setViewMode(mode)}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* 평면도 뷰 */}
                {selected.kind === 'substation' && substationId === selected.id && viewMode === '평면도' ? (
                  <>
                    <FloorPlanView
                      substationId={substationId}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={setSelectedAssetId}
                    />
                    {showDetailPanel && (
                      <AssetDetailPanel
                        key={selectedAssetId}
                        assetId={selectedAssetId!}
                        onSelectAsset={setSelectedAssetId}
                      />
                    )}
                  </>
                ) : (
                  /* 현황 뷰 (기본) */
                  <>
                    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
                      {/* 자산 추가 버튼 (변전소 스코프에서만 표시) */}
                      {selected.kind === 'substation' && substationId === selected.id && (
                        <div className="shrink-0 border-b border-line px-3 py-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Plus size={14} />}
                            onClick={() => setAddModalOpen(true)}
                          >
                            자산 추가
                          </Button>
                        </div>
                      )}
                      <StatusTable
                        rows={rows}
                        selectedId={selectedAssetId}
                        onSelectAsset={setSelectedAssetId}
                        nodeScope={nodeScope}
                      />
                    </div>
                    {showDetailPanel && (
                      <AssetDetailPanel
                        key={selectedAssetId}
                        assetId={selectedAssetId!}
                        onSelectAsset={setSelectedAssetId}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 저장바 (dirty > 0 일 때만 표시) */}
      <SaveBar onCommit={commit} isCommitting={isCommitting} error={commitError} onClearError={clearCommitError} />

      {/* 자산 추가 모달 (미배치 추가) */}
      {substationId != null && (
        <AddAssetModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          substationId={substationId}
        />
      )}

      {/* 충돌 다이얼로그 */}
      {conflicts != null && conflicts.length > 0 && substationId != null && (
        <ConflictDialog
          conflicts={conflicts}
          substationId={substationId}
          onClear={clearConflicts}
        />
      )}
    </div>
  );
}
