import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BusyOverlay, Button, CollapsibleRail, EmptyState, ErrorStrip, isCancelKey, PageHeader, PageState, Tabs, useTabs, type TabItem } from '../../components/ui';
import { ConflictDialog } from '../components/ConflictDialog';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { SaveBar } from '../components/SaveBar';
import { StatusView } from '../components/status/StatusView';
import { rowsFromNode, rowsFromWorkingCopy, type StatusRow } from '../components/status/statusRows';
import { useV2OrgTree } from '../hooks';
import { useCatalog, useNodeEquipment } from '../model/hooks';
import { bySubstation, effectiveRows, substationName } from '../model/store/effective';
import { useCommit } from '../model/store/useCommit';
import { useWorkingCopy, workingCopyStore } from '../model/store/workingCopy';
import { ancestorPath, flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useUnsavedMark } from '../useUnsavedMark';
import { useWorkspaceRoute, VIEW_MODES, type ViewMode } from '../useWorkspaceRoute';
import { AddEquipmentDialog } from '../components/equipment/AddEquipmentDialog';
import { AddRackDialog } from '../components/equipment/AddRackDialog';
import { EquipmentDetail } from '../components/equipment/EquipmentDetail';
import { RackDetail } from '../components/equipment/RackDetail';
import { RackPlanView } from '../components/plan/RackPlanView';
import { LineSheetView } from '../components/lines/LineSheetView';
import { EquipmentPlaceholder } from './workspace/EquipmentPlaceholder';

const VIEW_TABS: readonly TabItem<ViewMode>[] = VIEW_MODES.map((v) => ({ key: v, label: v }));
const NO_ROWS: StatusRow[] = [];

/**
 * 작업 공간 — 조직 트리에서 국을 고르면 **그 국을 들를 뿐**이다(`ensureLoaded`). 확인 상자도 버리기도
 * 없다: 변경안은 공사 단위로 쌓이고, 국을 옮겨도 사라지지 않는다. 본부·지사는 서버가 센 노드 범위
 * 현황(읽기 전용)을 보인다.
 */
export default function V2WorkspacePage() {
  const route = useWorkspaceRoute();
  const navigate = useNavigate();
  const { data: orgTree } = useV2OrgTree();
  const catalog = useCatalog();
  const commit = useCommit();

  const selected: FlatOrgNode | null = useMemo(() => {
    if (route.nodeId == null || !orgTree) return null;
    return flattenTree(orgTree).find((n) => n.id === route.nodeId) ?? null;
  }, [orgTree, route.nodeId]);
  const orgPath = useMemo(() => (orgTree ? ancestorPath(flattenTree(orgTree), selected?.id ?? null) : []), [orgTree, selected]);
  const substationId = selected?.kind === 'substation' ? selected.id : null;
  const nodeScope = selected != null && substationId == null;

  /* 국을 고르면 들를 뿐 — 이미 들렀으면 아무 일도 없다. */
  useEffect(() => {
    if (substationId) void workingCopyStore.getState().ensureLoaded(substationId);
  }, [substationId]);

  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const loadedHere = useWorkingCopy((s) => substationId != null && s.loaded.includes(substationId));
  const loadError = useWorkingCopy((s) => (substationId != null ? s.loadErrors[substationId] ?? null : null));
  const dirty = useWorkingCopy((s) => s.dirtyCount());
  const nodeEquipment = useNodeEquipment(nodeScope ? selected.id : null);

  const rows = useMemo(() => {
    if (substationId && catalog.data) return rowsFromWorkingCopy({ saved, overlays }, substationId, catalog.data);
    if (nodeScope) return rowsFromNode(nodeEquipment.data ?? []);
    return NO_ROWS;
  }, [substationId, nodeScope, catalog.data, saved, overlays, nodeEquipment.data]);

  const racks = useMemo(() => {
    if (!substationId) return undefined;
    const types = new Map((catalog.data?.rackTypes ?? []).map((t) => [t.id, t.name]));
    return bySubstation(effectiveRows({ saved, overlays }, 'racks'), substationId).map((r) => ({
      id: r.id, name: r.name, typeName: types.get(r.rackTypeId) ?? '—',
    }));
  }, [substationId, catalog.data?.rackTypes, saved, overlays]);

  const touched = useMemo(
    () => workingCopyStore.getState().touchedSubstations().map((id) => substationName({ saved, overlays }, id) ?? id),
    // 변경안이 바뀔 때마다 다시 센다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, overlays],
  );

  /* 저장 안 한 변경이 있으면 셸이 다른 메뉴로 넘어가는 것을 막는다 — 국 사이 이동은 대상이 아니다. */
  useUnsavedMark(dirty, () => workingCopyStore.getState().revert());
  const viewTabs = useTabs(route.view);
  /** 추가 대화상자 — 랙이면 'rack', 설비면 그 기본 랙(없으면 빈 문자열). */
  const [adding, setAdding] = useState<{ kind: 'rack' } | { kind: 'equipment'; rackId?: string } | null>(null);
  const closeAdding = () => setAdding(null);
  /** 트리 아래 평면도 자리 — 붙을 때 받는다(ref 콜백, §1.7-q). */
  const [railEl, setRailEl] = useState<HTMLElement | null>(null);

  /* Esc 는 고른 것을 놓는다. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e)) return;
      route.selectEquipment(null);
      route.selectRack(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route]);

  const waiting = (substationId != null && (!loadedHere || !catalog.data)) || (nodeScope && nodeEquipment.isLoading);
  const nodeError = nodeScope && nodeEquipment.isError ? '현황을 불러오지 못했습니다' : null;
  const retryLoad = () => { if (substationId) void workingCopyStore.getState().ensureLoaded(substationId); };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* 조직 트리는 접힌다 — 넓은 표(선번장)를 1280 에서 읽을 자리. 접는 것은 사람이 정하고 이 브라우저가 기억한다.
            평면도에서는 펼친 채 잠근다 — 트리 아래 레일(railEl)에 배경 도면 농도·레이어 도구가 산다. */}
        <CollapsibleRail
          storageKey="twin.orgTree.collapsed" title="조직" locked={substationId != null && route.view === '평면도'}
          className="w-64 border-r border-line bg-sidebar" data-testid="v2-org-tree"
        >
          {(collapse) => (
            <>
              <div className="min-h-0 flex-1">
                <OrgTreePanel selectedId={selected?.id ?? null} onSelect={(n) => route.selectNode(n?.id ?? null)} headerActions={collapse} />
              </div>
              <div ref={setRailEl} className="shrink-0 empty:hidden" />
            </>
          )}
        </CollapsibleRail>
        <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
          {selected == null ? (
            <EmptyState title="선택된 조직/변전소가 없습니다" description="왼쪽에서 변전소를 고르면 현황·선번장·평면도를 볼 수 있습니다." />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <PageHeader
                title={selected.name}
                path={orgPath.length > 1 ? <span data-testid="v2-selected">{orgPath.slice(0, -1).map((n) => n.name).join(' › ')}</span> : undefined}
                actions={<SaveBar onCommit={commit.commit} isCommitting={commit.isCommitting} substationNames={touched} issue={commit.issues[0]?.message ?? null} />}
              />
              {substationId && (
                <div className="flex h-8 shrink-0 items-end bg-surface-2 px-4">
                  <Tabs {...viewTabs.list} items={VIEW_TABS} onChange={route.setView} className="w-full" />
                </div>
              )}
              {commit.error && (
                <div className="shrink-0 px-4 pt-4">
                  <ErrorStrip message={commit.error} onDismiss={commit.clearError} />
                </div>
              )}
              {nodeError ? (
                <PageState error={nodeError} />
              ) : loadError ? (
                <PageState error={loadError} action={<Button variant="secondary" size="sm" onClick={retryLoad}>다시 시도</Button>} />
              ) : waiting ? (
                <PageState />
              ) : (
                /* 저장이 서버에 가 있는 동안은 판(본문 + 상세)을 잠근다 — 그 사이 고친 것은 저장이
                   변경안을 비울 때 사라지므로, 처음부터 받지 않는다. */
                <BusyOverlay busy={commit.isCommitting} label="저장 중…">
                  <div {...viewTabs.panel} className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-4">
                    {substationId && route.view === '평면도' ? (
                      <RackPlanView substationId={substationId} selectedRackId={route.rackId} onSelectRack={route.selectRack} railTarget={railEl} />
                    ) : substationId && route.view === '선번장' ? (
                      <LineSheetView
                        substationId={substationId}
                        selectedEquipmentId={route.eqId}
                        onSelectEquipment={route.selectEquipment}
                        focus={route.block}
                        onFocus={route.focusBlock}
                      />
                    ) : (
                      <StatusView
                        rows={rows}
                        racks={racks}
                        selectedId={route.eqId}
                        onSelect={route.selectEquipment}
                        selectedRackId={route.rackId}
                        onSelectRack={route.selectRack}
                        nodeScope={nodeScope}
                        onAddRack={substationId ? () => setAdding({ kind: 'rack' }) : undefined}
                        onAddEquipment={substationId ? (rackId) => setAdding({ kind: 'equipment', rackId }) : undefined}
                        onOpenElsewhere={nodeScope ? (r) => navigate(`/n/${r.substationId}?eq=${r.id}`) : undefined}
                      />
                    )}
                    {/* 선번장은 12열 표가 우선이다 — 1280 에서 레일까지 세우면 표가 가로로 넘친다. 그래서 고른 것이
                        있을 때만 상세가 선다(다른 판은 레일이 늘 있다, §1.7-e). */}
                    {substationId && (route.view !== '선번장' || route.eqId || route.rackId) && (
                      <aside className="flex h-full w-[364px] shrink-0 flex-col">
                        {route.eqId ? (
                          <EquipmentDetail equipmentId={route.eqId} onClose={() => route.selectEquipment(null)} onDeleted={() => route.selectEquipment(null)} onOpenBlock={route.openBlock} />
                        ) : route.rackId ? (
                          <RackDetail
                            rackId={route.rackId}
                            onClose={() => route.selectRack(null)}
                            onSelectEquipment={route.selectEquipment}
                            onDeleted={() => route.selectRack(null)}
                            onAddEquipment={(rackId) => setAdding({ kind: 'equipment', rackId })}
                          />
                        ) : (
                          <EquipmentPlaceholder row={null} />
                        )}
                      </aside>
                    )}
                  </div>
                </BusyOverlay>
              )}
            </div>
          )}
        </main>
      </div>
      {substationId && (
        <>
          <AddRackDialog substationId={substationId} open={adding?.kind === 'rack'} onClose={closeAdding} onCreated={route.selectRack} />
          <AddEquipmentDialog
            substationId={substationId}
            open={adding?.kind === 'equipment'}
            defaultRackId={adding?.kind === 'equipment' ? adding.rackId : undefined}
            onClose={closeAdding}
            onCreated={route.selectEquipment}
          />
        </>
      )}
      {commit.conflicts != null && commit.conflicts.length > 0 && (
        <ConflictDialog conflicts={commit.conflicts} onClose={commit.clearConflicts} />
      )}
    </div>
  );
}
