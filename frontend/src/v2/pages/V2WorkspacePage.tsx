import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, useConfirm, Tabs, type TabItem } from '../../components/ui';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { AssetDetailPanel } from '../components/AssetDetailPanel';
import { AddAssetModal } from '../components/AddAssetModal';
import { StatusTable } from '../components/StatusTable';
import { SaveBar } from '../components/SaveBar';
import { ReportPanel } from '../components/ReportPanel';
import { ConflictDialog } from '../components/ConflictDialog';
import { FloorPlanView } from '../components/FloorPlanView';
import { FiberRegisterView } from '../components/FiberRegisterView';
import { PowerRegisterView } from '../components/PowerRegisterView';
import { useV2Catalog, useV2NodeAssets, useTypesById } from '../hooks';
import type { FlatOrgNode } from '../orgTreeSelectors';
import { buildStatusRows, type StatusRowsResult } from '../statusRows';

/** 스코프 밖일 때의 빈 결과 — 매번 새 객체를 만들면 useMemo 아래가 헛되이 다시 계산된다. */
const EMPTY_ROWS: StatusRowsResult = { rows: [], fieldColumns: [] };
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useCommit } from '../store/useCommit';
import type { TraceResult } from '../traceSelectors';

type ViewMode = '현황' | '평면도' | '선번장' | '계통';

const VIEW_TABS: readonly TabItem<ViewMode>[] = [
  { key: '현황', label: '현황' },
  { key: '평면도', label: '평면도' },
  { key: '선번장', label: '선번장' },
  { key: '계통', label: '계통' },
];

export default function V2WorkspacePage() {
  const { confirm, confirmDialog } = useConfirm();
  const loadingWorkingCopy = useV2WorkingCopy((st) => st.loading);
  const [selected, setSelected] = useState<FlatOrgNode | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  /** 상세 패널이 열자마자 골라 줄 포트 — 표의 한 줄이 포트 하나를 가리킬 때 쓴다. */
  const [focusPortId, setFocusPortId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('현황');
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const {
    commit,
    isCommitting,
    conflicts,
    clearConflicts,
    error: commitError,
    clearError: clearCommitError,
  } = useCommit();

  const handleSelect = async (n: FlatOrgNode) => {
    const st = useV2WorkingCopy.getState();
    if (n.kind === 'substation') {
      if (n.id === st.substationId) {
        setSelected(n);
        return;
      } // same substation re-click: no reload/discard
      if (
        st.dirtyCount() > 0 &&
        !(await confirm({
          title: '저장하지 않은 변경',
          message: `변경 ${st.dirtyCount()}건이 사라집니다. 이동할까요?`,
          confirmLabel: '이동',
          danger: true,
        }))
      )
        return;
    }
    setSelected(n);
    setSelectedAssetId(null);
    setTraceResult(null); // 변전소 전환 시 추적 결과 클리어
    if (n.kind === 'substation') void st.load(n.id);
  };

  /**
   * 자산 선택의 단일 지점.
   *
   * `portId` 까지 주면 상세 패널이 **포트 탭을 열고 그 포트를 고른 상태**로 뜬다.
   * 선번장의 한 줄은 심선 하나라, 그 줄을 누르면 포트 판에서 그 포트를 직접 누른 것과
   * 같아야 한다 — 안 그러면 표에서 고른 것과 패널이 보여 주는 것이 서로 다른 뜻이 된다.
   */
  const handleSelectAssetId = useCallback((id: string | null, portId?: string | null) => {
    setSelectedAssetId(id);
    setFocusPortId(portId ?? null);
    setTraceResult(null); // 자산 선택 변경 시 추적 결과 클리어
  }, []);

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

  // 스테이지 발생(overlays 변경) 시 stale 추적 클리어
  useEffect(() => {
    if (traceResult) setTraceResult(null);
    // overlays 참조가 바뀔 때만 실행 (traceResult 의존 금지 — 무한 루프)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays]);

  const substationRows = useMemo<StatusRowsResult>(() => {
    if (selected?.kind !== 'substation' || substationId !== selected.id) return EMPTY_ROWS;
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

  /* 본부·지사 표는 서버 요약(자산 목록)만 받는다 — 커스텀 필드 값은 거기 없으므로 필드 열도 없다.
     예전에는 `installDate: null, manager: null` 을 채워 넣어 `—` 만 늘어선 죽은 열 두 개가 떴다. */
  const nodeRows = useMemo<StatusRowsResult>(() => {
    if (!isNodeScope) return EMPTY_ROWS;
    const rows = (nodeAssetsQuery.data ?? []).map((r) => ({
      id: r.id,
      typeName: r.typeName,
      categoryName: r.categoryName,
      name: r.name,
      location: r.parentName ?? '—',
      lastInspectedAt: null,
      status: r.status,
      substationName: r.substationName,
      fieldValues: {},
      // 본부·지사 표는 서버 요약이라 형판 묶음을 알 수 없다 — 접을 것이 없다.
      assemblyRootId: null,
      depth: 0,
    }));
    return { rows, fieldColumns: [] };
  }, [isNodeScope, nodeAssetsQuery.data]);

  const { rows, fieldColumns } = selected?.kind === 'substation' ? substationRows : nodeRows;
  const nodeScope = isNodeScope;

  // 이 변전소를 실제로 보고 있는가 — 뷰 분기와 '자산 추가' 노출의 공통 전제.
  const inSubstationScope = selected?.kind === 'substation' && substationId === selected.id;

  // 상세 패널: 변전소 스코프 + selectedAssetId 가 effective assets 에 있을 때만
  const showDetailPanel =
    selected?.kind === 'substation' &&
    selectedAssetId != null &&
    mergeEffective(saved.assets, overlays.assets).some((a) => a.id === selectedAssetId);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree">
          <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
          {selected == null && (
            <EmptyState
              title="선택된 조직/변전소가 없습니다"
              description="좌측 트리에서 변전소를 고르면 현황·평면도·선번장·계통을 볼 수 있습니다."
            />
          )}
          {selected != null && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 헤더: 선택 노드 이름 + 뷰 토글 (변전소 스코프에서만) */}
              <div className="flex shrink-0 items-center border-b border-line px-4 py-2">
                <span className="text-sm font-semibold text-content" data-testid="v2-selected">
                  {selected.name}
                </span>
                {inSubstationScope && (
                  <Tabs items={VIEW_TABS} value={viewMode} onChange={setViewMode} className="ml-4 -mb-px" />
                )}
                {inSubstationScope && (
                  /* 설계서는 지금 스테이징된 변경의 공량을 보는 화면이다. 예전엔 진입점이
                     SaveBar 뿐이라 **변경을 만들어야만 볼 수 있었다**(SaveBar 는 dirty===0
                     이면 사라진다). 상시 노출로 옮긴다. */
                  <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setReportOpen(true)}>
                    설계서
                  </Button>
                )}
              </div>

              {loadingWorkingCopy ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <span className="text-sm text-content-muted">불러오는 중…</span>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* 평면도 뷰 */}
                  {inSubstationScope && viewMode === '평면도' ? (
                    <FloorPlanView
                      substationId={substationId}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={handleSelectAssetId}
                      traceResult={traceResult}
                    />
                  ) : inSubstationScope && viewMode === '선번장' ? (
                    <FiberRegisterView
                      substationId={substationId}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={handleSelectAssetId}
                    />
                  ) : inSubstationScope && viewMode === '계통' ? (
                    <PowerRegisterView
                      substationId={substationId}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={handleSelectAssetId}
                    />
                  ) : (
                    /* 현황 뷰 (기본) — 여백은 **스크롤되는 안쪽**에 둔다. 스크롤 상자에 직접
                       주면 고정 머리글이 그 여백만큼 내려가 붙어, 그 틈으로 지나가는 행이
                       비쳐 보인다. */
                    <div className="min-w-0 flex-1 overflow-auto">
                      <div className="flex flex-col gap-3 p-4">
                      {/* 자산 추가 버튼 (변전소 스코프에서만 표시) */}
                      {inSubstationScope && (
                        <div className="shrink-0">
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
                        fieldColumns={fieldColumns}
                        selectedId={selectedAssetId}
                        onSelectAsset={handleSelectAssetId}
                        nodeScope={nodeScope}
                      />
                      </div>
                    </div>
                  )}

                  {showDetailPanel && (
                    <AssetDetailPanel
                      key={selectedAssetId}
                      assetId={selectedAssetId!}
                      focusPortId={focusPortId}
                      onSelectAsset={handleSelectAssetId}
                      onTrace={setTraceResult}
                      onClearTrace={() => setTraceResult(null)}
                      traceResult={traceResult}
                      onShowOnFloorPlan={() => setViewMode('평면도')}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 저장바 (dirty > 0 일 때만 표시) */}
      <SaveBar onCommit={commit} isCommitting={isCommitting} error={commitError} onClearError={clearCommitError} />

      {/* 자산 추가 모달 (미배치 추가) */}
      {substationId != null && (
        <AddAssetModal open={addModalOpen} onClose={() => setAddModalOpen(false)} substationId={substationId} />
      )}

      {/* 설계서 패널 (조건부 마운트 — 닫힌 상태에서 store 구독/계산 방지) */}
      {reportOpen && <ReportPanel open onClose={() => setReportOpen(false)} />}

      {/* 충돌 다이얼로그 */}
      {conflicts != null && conflicts.length > 0 && substationId != null && (
        <ConflictDialog conflicts={conflicts} substationId={substationId} onClear={clearConflicts} />
      )}
      {confirmDialog}
    </div>
  );
}
