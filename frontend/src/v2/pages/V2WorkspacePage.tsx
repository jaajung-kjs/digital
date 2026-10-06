import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorStrip, isCancelKey, PageHeader, PageState, Tabs, useTabs, type TabItem } from '../../components/ui';
import { ConflictDialog } from '../components/ConflictDialog';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { SaveBar } from '../components/SaveBar';
import { StatusView } from '../components/status/StatusView';
import { rowsFromNode, rowsFromWorkingCopy, type StatusRow } from '../components/status/statusRows';
import { useV2OrgTree } from '../hooks';
import { useCatalog, useNodeEquipment } from '../model/hooks';
import { bySubstation, effectiveRows } from '../model/store/effective';
import { useCommit } from '../model/store/useCommit';
import { useWorkingCopy, workingCopyStore } from '../model/store/workingCopy';
import { ancestorPath, flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useUnsavedMark } from '../useUnsavedMark';
import { useWorkspaceRoute, VIEW_MODES, type ViewMode } from '../useWorkspaceRoute';
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
    () => workingCopyStore.getState().touchedSubstations().map((id) => saved.substations[id]?.name ?? id),
    // 변경안이 바뀔 때마다 다시 센다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, overlays],
  );

  /* 저장 안 한 변경이 있으면 셸이 다른 메뉴로 넘어가는 것을 막는다 — 국 사이 이동은 대상이 아니다. */
  useUnsavedMark(dirty, () => workingCopyStore.getState().revert());
  const viewTabs = useTabs(route.view);

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

  const selectedRow = rows.find((r) => r.id === route.eqId) ?? null;
  const waiting = substationId != null && (!loadedHere || !catalog.data);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar" data-testid="v2-org-tree">
          <div className="min-h-0 flex-1">
            <OrgTreePanel selectedId={selected?.id ?? null} onSelect={(n) => route.selectNode(n?.id ?? null)} />
          </div>
          <div id="v2-plan-rail" className="shrink-0 empty:hidden" />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
          {selected == null ? (
            <EmptyState title="선택된 조직/변전소가 없습니다" description="왼쪽에서 변전소를 고르면 현황·평면도를 볼 수 있습니다." />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <PageHeader
                title="설비 현황"
                path={<span data-testid="v2-selected">{orgPath.map((n) => n.name).join(' › ')}</span>}
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
              {waiting ? (
                <PageState />
              ) : (
                <div {...viewTabs.panel} className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-4">
                  {substationId && route.view === '평면도' ? (
                    <EmptyState title="평면도를 준비하고 있습니다" />
                  ) : (
                    <StatusView
                      rows={rows}
                      racks={racks}
                      selectedId={route.eqId}
                      onSelect={route.selectEquipment}
                      selectedRackId={route.rackId}
                      onSelectRack={route.selectRack}
                      nodeScope={nodeScope}
                      onOpenElsewhere={nodeScope ? (r) => navigate(`/n/${r.substationId}?eq=${r.id}`) : undefined}
                    />
                  )}
                  {substationId && (
                    <aside className="flex h-full w-[364px] shrink-0 flex-col">
                      <EquipmentPlaceholder row={selectedRow} />
                    </aside>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {commit.conflicts != null && commit.conflicts.length > 0 && (
        <ConflictDialog conflicts={commit.conflicts} onClose={commit.clearConflicts} />
      )}
    </div>
  );
}
