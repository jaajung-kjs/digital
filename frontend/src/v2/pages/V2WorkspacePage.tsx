import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetFieldDefs } from '@twin/core';
import { useNavigate } from 'react-router-dom';
import type { CablePickRequest } from '../cablePick';
import { Button, EmptyState, ErrorStrip, PageState, useConfirm, Tabs, useTabs, type TabItem, EMPTY, isCancelKey, PageHeader } from '../../components/ui';
import { OrgTreePanel } from '../components/OrgTreePanel';
import { AssetDetailPanel } from '../components/detail/AssetDetailPanel';
import { StatusOverview } from '../components/StatusOverview';
import { SaveBar } from '../components/SaveBar';
import { confirmDiscard, unsavedPrompt } from '../leaveGuard';
import { useUnsavedMark } from '../useUnsavedMark';
import { ReportPanel } from '../components/ReportPanel';
import { ConflictDialog } from '../components/ConflictDialog';
import { FloorPlanView } from '../components/floorplan/FloorPlanView';
import { FiberRegisterView } from '../components/registers/FiberRegisterView';
import { PowerRegisterView } from '../components/registers/PowerRegisterView';
import { useV2Catalog, useV2NodeAssets, useTypesById, useV2OrgTree } from '../hooks';
import { ancestorPath, flattenTree, type FlatOrgNode } from '../orgTreeSelectors';
import { useWorkspaceRoute, VIEW_MODES, type ViewMode } from '../useWorkspaceRoute';
import { buildStatusRows, type StatusRowsResult } from '../statusRows';

/** 스코프 밖일 때의 빈 결과 — 매번 새 객체를 만들면 useMemo 아래가 헛되이 다시 계산된다. */
const EMPTY_ROWS: StatusRowsResult = { rows: [], fieldColumns: [] };
import { useAllInspections, useEffectiveAssets, useEffectiveFloors } from '../store/useWorkingCopy';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useCommit } from '../store/useCommit';
import type { TraceResult } from '../traceSelectors';

/* 탭 목록은 판 어휘에서 나온다 — 판을 하나 더할 때 고칠 곳이 둘이면 하나만 고쳐진다. */
const VIEW_TABS: readonly TabItem<ViewMode>[] = VIEW_MODES.map((v) => ({ key: v, label: v }));

export default function V2WorkspacePage() {
  const { confirm, confirmDialog } = useConfirm();
  const loadingWorkingCopy = useV2WorkingCopy((st) => st.loading);
  /**
   * **보고 있는 자리는 주소가 안다** — 고른 조직·판·자산·장비·포트(`useWorkspaceRoute`).
   *
   * 예전에는 전부 이 컴포넌트의 `useState` 였고, 그래서 북마크도 공유도 새로고침 복원도
   * 없었으며 뒤로가기는 앱 밖으로 나갔다.
   */
  const route = useWorkspaceRoute();
  const { data: orgTree } = useV2OrgTree();
  const selected: FlatOrgNode | null = useMemo(() => {
    if (route.nodeId == null || !orgTree) return null;
    return flattenTree(orgTree).find((n) => n.id === route.nodeId) ?? null;
  }, [orgTree, route.nodeId]);
  /**
   * 화면이 그리는 자리 — **다 읽은 것**이다(주소가 가리키는 것이 아니라).
   *
   * 변전소를 옮기면 조회가 끝날 때까지 이전 변전소가 이름째 그대로 서 있다가, 다 읽으면
   * 이름과 내용이 **같은 순간에** 바뀐다. 예전에는 부르는 즉시 비워서 45ms 동안 빈 화면이
   * 스쳤고(재어 보았다), 그것이 「화면이 깜빡인다」로 보였다.
   *
   * 왼쪽 트리는 주소를 따라 **바로** 옮겨 간다 — 누른 것이 눌린 것으로 보여야 한다.
   */
  const loadedSubstationId = useV2WorkingCopy((st) => st.substationId);
  const shown: FlatOrgNode | null = useMemo(() => {
    if (!loadingWorkingCopy || selected?.kind !== 'substation' || !orgTree) return selected;
    /* 아직 아무것도 못 읽었으면 보여 줄 이전 화면이 없다 — 그때는 「불러오는 중」이 정직하다. */
    return flattenTree(orgTree).find((n) => n.id === loadedSubstationId) ?? selected;
  }, [loadingWorkingCopy, selected, orgTree, loadedSubstationId]);
  /** 뿌리에서 지금 보고 있는 것까지 — 머리줄이 「어디의 무엇인가」를 적는다. */
  const orgPath = useMemo(
    () => (orgTree ? ancestorPath(flattenTree(orgTree), shown?.id ?? null) : []),
    [orgTree, shown],
  );
  const selectedAssetId = route.assetId;
  /**
   * 표·도면에서 **켜져 보일 줄** — 누른 것 그 자체다.
   *
   * 장비를 누르면 패널은 그 장비를 품은 설비를 연다(장비는 제 패널을 갖지 않는다). 그런데
   * 켜지는 줄까지 설비로 옮겨 버리면, 광단말 B 를 눌렀는데 판암 송광치 줄에 불이 들어온다 —
   * 누른 것과 켜진 것이 다른 화면은 사람이 자기가 뭘 눌렀는지 의심하게 만든다.
   */
  const highlightedAssetId = route.partId ?? route.assetId;
  /** 상세 패널이 열자마자 골라 줄 포트 — 표의 한 줄이 포트 하나를 가리킬 때 쓴다. */
  const focusPortId = route.portId;
  /** 설비 패널을 열되 구성 격자에서 고른 상태로 둘 장비. */
  const focusPartId = route.partId;
  const viewMode = route.view;
  const navigate = useNavigate();
  /* 저장 안 한 변경이 있으면 셸이 다른 메뉴로 넘어가는 것을 막는다 — 「이동」을 고르면
     셸이 이 `revert` 로 버린다. 묻기만 하고 안 버리면 상자가 거짓말을 한다. */
  useUnsavedMark(useV2WorkingCopy((st) => st.dirtyCount()), useV2WorkingCopy((st) => st.revert));
  /* 뷰 탭과 그 아래 내용이 같은 이름표를 나눠 갖는다 — 스크린리더가 둘을 잇는다. */
  const viewTabs = useTabs(viewMode);
  /**
   * 「이 포트에서 케이블을 시작해 달라」는 한 번짜리 요청 — 상세 패널 → 평면도.
   *
   * 상태가 아니라 **명령**이라 평면도가 받아 소비하면 지운다. 남겨 두면 평면도로 다시
   * 들어올 때마다 케이블 도구가 저 혼자 켜진다.
   */
  const [cableStartPortId, setCableStartPortId] = useState<string | null>(null);
  /**
   * 평면도가 보낸 「포트를 골라 달라」 — 상세 패널의 포트 탭이 고르는 모드로 돌아간다.
   *
   * 이 페이지가 들고 있는 이유: 평면도와 상세 패널을 나란히 놓는 것이 여기다. 예전에는
   * 평면도가 제 안에 판을 하나 더 그려서, 상세 패널이 열려 있으면 384px 패널이 둘 섰다.
   */
  const [cablePick, setCablePick] = useState<CablePickRequest | null>(null);
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

  const handleSelect = async (n: FlatOrgNode | null) => {
    /* 고른 것을 다시 누르면 놓는다 — 표와 같은 규칙(`selectableRow`). 아무것도 안 고른
       설비 관리는 「무엇을 볼지 고르세요」라는 정당한 상태다. */
    if (n == null) {
      route.selectNode(null);
      setTraceResult(null);
      return;
    }
    const st = useV2WorkingCopy.getState();
    if (n.kind === 'substation') {
      /* 같은 변전소를 다시 눌러도 다시 읽지 않는다 — 고쳐 둔 것이 날아간다. */
      if (n.id === st.substationId && route.nodeId === n.id) return;
      /* 묻고 **버리는** 일은 `confirmDiscard` 가 함께 쥔다 — 버리는 일이 「다른 변전소를 새로
         읽는」 부수 효과에 얹혀 있으면, 같은 변전소로 돌아오는 길에서는 안 버려진다. */
      const mayLeave = await confirmDiscard(st, (dirty) => confirm(unsavedPrompt(dirty)));
      if (!mayLeave) return;
    }
    /* 자산·장비·포트는 딸려 가지 않는다 — 저기 있던 자산이 여기 있을 리 없다. */
    route.selectNode(n.id);
    setTraceResult(null); // 변전소 전환 시 추적 결과 클리어
  };

  /**
   * 고른 변전소의 워킹 카피를 읽어 온다 — **주소가 정한 결과**를 따라간다.
   *
   * 예전에는 트리를 누르는 자리에서 곧장 불렀다. 그러면 주소로 바로 들어온 사람(북마크·
   * 공유 링크·새로고침)에게는 아무것도 안 실린다.
   */
  useEffect(() => {
    if (selected?.kind !== 'substation') return;
    const st = useV2WorkingCopy.getState();
    /* 이미 들고 있거나 지금 읽는 중이면 다시 부르지 않는다 — 고쳐 둔 것이 날아가고,
       같은 조회가 두 번 떠난다. */
    if (st.substationId !== selected.id && st.pendingSubstationId !== selected.id) void st.load(selected.id);
  }, [selected]);

  /**
   * 자산 선택의 단일 지점.
   *
   * `portId` 까지 주면 상세 패널이 **포트 탭을 열고 그 포트를 고른 상태**로 뜬다.
   * 선번장의 한 줄은 심선 하나라, 그 줄을 누르면 포트 판에서 그 포트를 직접 누른 것과
   * 같아야 한다 — 안 그러면 표에서 고른 것과 패널이 보여 주는 것이 서로 다른 뜻이 된다.
   */
  /**
   * 본부·지사 현황에서 개체를 누르면 — **그 변전소로 데려가며 그 설비를 연다.**
   *
   * 상세 패널은 워킹 카피를 읽고, 워킹 카피는 **한 변전소의 것**이다(저장도 그 단위다).
   * 그래서 남의 변전소 자산을 그 자리에서 열면 「지금 무엇을 고치는 중인가」가 흐려진다.
   * 대신 그 변전소로 옮겨 주고 같은 화면(설비 현황)에서 패널을 연다 — 누른 것이 열린다는
   * 약속은 지키면서, 무엇을 보고 있는지는 화면이 계속 말한다.
   */
  const openInSubstation = useCallback(
    (id: string) => {
      const row = (nodeAssetsRef.current ?? []).find((r) => r.id === id);
      if (!row) return;
      /* 장비는 제 패널을 갖지 않는다 — 그 설비를 열고 그 장비를 고른 상태로 둔다. */
      const rootId = row.parentAssetId ?? row.id;
      const partId = row.parentAssetId ? row.id : null;
      const params = new URLSearchParams({ view: viewMode, asset: rootId });
      if (partId) params.set('part', partId);
      navigate(`/n/${row.substationId}?${params.toString()}`);
    },
    [navigate, viewMode],
  );

  const handleSelectAssetId = useCallback((id: string | null, portId?: string | null) => {
    /* **장비는 제 패널을 갖지 않는다.** 설비 패널을 열고 그 장비를 구성 격자에서 고른 상태로
       둔다 — 장비마다 다른 것은 상태·설치일·담당자 네 줄뿐인데, 그것을 보려고 패널이 통째로
       바뀌면 「지금 어느 설비를 보고 있나」가 사라지고 대부분 빈 탭 넷이 다시 뜬다.
       (사진·점검·고장이력은 설비의 것이고, 포트는 설비 포트 탭이 장비별로 묶어 보여준다.) */
    const assets = useV2WorkingCopy.getState().effectiveAssets();
    const target = id ? assets.find((a) => a.id === id) : null;
    const parent = target?.parentAssetId ? assets.find((a) => a.id === target.parentAssetId) : null;

    route.selectAsset(parent ? parent.id : id, parent ? target!.id : null, portId ?? null);
    setTraceResult(null); // 자산 선택 변경 시 추적 결과 클리어
  }, [route]);

  /**
   * **Esc 는 고른 것을 놓는다** — 화면이 무엇이든.
   *
   * 고르는 판이 다섯(현황·선번장·계통·평면도·조직 트리)인데 놓는 방법이 판마다 달랐고,
   * 표에서는 아예 없었다. 「다시 누르면 풀린다」(`selectableRow`)와 짝이 되는 규칙을
   * 여기 한 번만 적는다 — 판마다 적으면 빠뜨리는 판이 생긴다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e)) return;
      route.selectAsset(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route]);

  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  /* 분류 이름은 카탈로그가 안다 — 현황이 그것으로 접는다(설비·장비 같은 축). */
  const categoryNames = useMemo(
    () => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])),
    [catalog.data?.categories],
  );
  /** 설비 품목으로 놓은 설비는 설비 품목이 곧 분류 — 이름·격자를 여기서 읽는다(글자로 굳혀 두지 않는다). */
  const assembliesById = useMemo(
    () => new Map((catalog.data?.assemblies ?? []).map((a) => [a.id, a])),
    [catalog.data],
  );

  // ── 변전소 스코프: 화면이 보는 것(저장한 것 + 아직 저장 안 한 것) ──
  const substationId = useV2WorkingCopy((s) => s.substationId);
  const overlays = useV2WorkingCopy((s) => s.overlays);
  const effectiveAssets = useEffectiveAssets();
  const floors = useEffectiveFloors();
  const inspections = useAllInspections();

  // 스테이지 발생(overlays 변경) 시 stale 추적 클리어
  useEffect(() => {
    if (traceResult) setTraceResult(null);
    // overlays 참조가 바뀔 때만 실행 (traceResult 의존 금지 — 무한 루프)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays]);

  const substationRows = useMemo<StatusRowsResult>(() => {
    if (shown?.kind !== 'substation' || substationId !== shown.id) return EMPTY_ROWS;
    const inspectionsByAsset = new Map<string, string[]>();
    for (const log of inspections) {
      const list = inspectionsByAsset.get(log.assetId);
      if (list) list.push(log.inspectedAt);
      else inspectionsByAsset.set(log.assetId, [log.inspectedAt]);
    }
    return buildStatusRows({
      assets: effectiveAssets,
      floors,
      typesById,
      inspectionsByAsset,
      assembliesById,
      categoryNames,
    });
  }, [shown, substationId, effectiveAssets, floors, inspections, typesById, assembliesById, categoryNames]);

  // ── 노드 스코프 (본부/지사): useV2NodeAssets ────────────────────────────
  const isNodeScope = shown != null && shown.kind !== 'substation';
  const nodeAssetsQuery = useV2NodeAssets(isNodeScope ? shown.id : null);
  /* 누른 개체가 어느 변전소의 것인지는 이 목록만 안다 — 콜백이 매번 새로 만들어지지 않게 ref 로 읽는다. */
  const nodeAssetsRef = useRef(nodeAssetsQuery.data);
  nodeAssetsRef.current = nodeAssetsQuery.data;

  /* 본부·지사도 **변전소와 같은 것을 본다** — 설치일·담당자·마지막 점검일까지 서버가 함께
     싣는다. 예전에는 그 값들이 없어 본부 현황에만 열이 통째로 비었고, 같은 화면이 범위만
     바뀐다는 규칙이 거기서 깨졌다. */
  const nodeRows = useMemo<StatusRowsResult>(() => {
    if (!isNodeScope) return EMPTY_ROWS;
    const rows = (nodeAssetsQuery.data ?? []).map((r) => ({
      id: r.id,
      typeName: r.typeName,
      categoryName: r.categoryName ?? '',
      kind: (r.isAssembly ? '설비' : '장비') as '설비' | '장비',
      /* 본부·지사에서 「어디에」는 변전소다 — 층은 그 변전소로 들어가서 본다. */
      where: r.substationName,
      name: r.name,
      location: r.parentName ?? EMPTY,
      lastInspectedAt: r.lastInspectedAt,
      status: r.status,
      substationName: r.substationName,
      fieldValues: r.fieldValues,
      // 본부·지사 표는 서버 요약이라 설비 묶음을 알 수 없다 — 접을 것이 없다.
      assemblyRootId: null,
      depth: 0,
    }));
    return { rows, fieldColumns: assetFieldDefs() };
  }, [isNodeScope, nodeAssetsQuery.data]);

  const { rows, fieldColumns } = shown?.kind === 'substation' ? substationRows : nodeRows;
  const nodeScope = isNodeScope;

  // 이 변전소를 실제로 보고 있는가 — 뷰 분기의 전제.
  const inSubstationScope = shown?.kind === 'substation' && substationId === shown.id;

  /**
   * 포트를 고르라는 요청을 받으면 **상세 패널을 그 자산으로 옮긴다**.
   *
   * 다 고른 뒤(`null`) 원래 자산으로 되돌리지는 **않는다**. 고를 자산은 도면에서 눌러
   * 정한 것이라 캔버스의 선택도 이미 그리로 가 있다 — 패널만 되돌리면 도면은 송광치를
   * 고른 채인데 패널은 OFD 를 보여 주는, 둘이 어긋난 화면이 된다.
   */
  const handlePickPort = useCallback(
    (req: CablePickRequest | null) => {
      setCablePick(req);
      if (req && route.assetId !== req.assetId) route.selectAsset(req.assetId);
    },
    [route],
  );

  // 상세 패널: 변전소 스코프 + selectedAssetId 가 effective assets 에 있을 때만
  const showDetailPanel =
    shown?.kind === 'substation' &&
    selectedAssetId != null &&
    effectiveAssets.some((a) => a.id === selectedAssetId);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-line bg-sidebar" data-testid="v2-org-tree">
          <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col" data-testid="v2-main">
          {shown == null && (
            <EmptyState
              title="선택된 조직/변전소가 없습니다"
              description="왼쪽에서 변전소를 고르면 현황·평면도·선번장·계통을 볼 수 있습니다."
            />
          )}
          {shown != null && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 머리줄은 앱 전체가 한 컴포넌트를 쓴다(`PageHeader`) — 화면명 · 어디의
                  무엇인가 · 여기서 할 수 있는 일. 탭은 그 아래 제 줄에 선다: 예전에는
                  제목·탭·버튼이 한 줄에 섞여 있어서 「화면 이름」이 어디에도 없었다. */}
              <PageHeader
                title="설비 현황"
                path={<span data-testid="v2-selected">{orgPath.map((n) => n.name).join(' › ')}</span>}
                actions={
                  <>
                    {inSubstationScope && (
                      /* 산출 내역는 지금 스테이징된 변경의 공량을 보는 화면이다. 예전엔 진입점이
                         저장 바 뿐이라 **변경을 만들어야만 볼 수 있었다**(고친 것이 없으면
                         사라진다). 상시 노출로 옮긴다. */
                      <Button variant="secondary" size="sm" onClick={() => setReportOpen(true)}>
                        산출 내역
                      </Button>
                    )}
                    {/* 저장은 대장과 **같은 자리**에 선다 — 고친 것이 있을 때만 나타난다. */}
                    <SaveBar onCommit={commit} isCommitting={isCommitting} />
                  </>
                }
              />
              {inSubstationScope && (
                <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface px-4">
                  <Tabs {...viewTabs.list} items={VIEW_TABS} onChange={route.setView} className="-mb-px" />
                </div>
              )}
              {/* 알림 띠는 **머리줄 밖**, 캔버스 위에 뜬다 — 머리줄과 같은 상자에 넣으면
                  제목이 두 줄로 접힌 것처럼 읽힌다(대장 편집 바와 같은 규칙). */}
              {commitError && (
                <div className="shrink-0 px-4 pt-4">
                  <ErrorStrip message={commitError} onDismiss={clearCommitError} />
                </div>
              )}

              {/* **아직 아무것도 못 읽었을 때만** 「불러오는 중」이다 — 이미 보고 있던 변전소가
                  있으면 그것이 그대로 서 있다가 다 읽은 순간 한 번에 바뀐다(깜빡임 없음). */}
              {shown.kind === 'substation' && substationId !== shown.id ? (
                <PageState />
              ) : (
                /* 이 자리가 뷰 탭의 내용이다 — 탭과 이름표를 나눠 갖는다. */
                <div {...viewTabs.panel} className="flex min-h-0 flex-1 overflow-hidden">
                  {/* 평면도 뷰 */}
                  {inSubstationScope && viewMode === '평면도' ? (
                    <FloorPlanView
                      substationId={substationId}
                      selectedAssetId={highlightedAssetId}
                      onSelectAsset={handleSelectAssetId}
                      traceResult={traceResult}
                      cableStartPortId={cableStartPortId}
                      onCableStartConsumed={() => setCableStartPortId(null)}
                      onPickPort={handlePickPort}
                    />
                  ) : inSubstationScope && viewMode === '선번장' ? (
                    <FiberRegisterView
                      substationId={substationId}
                      selectedAssetId={highlightedAssetId}
                      /* 판에서 포트를 골라도 표가 따라 칠해진다 — 선택이 사는 자리는 주소 하나다. */
                      selectedPortId={focusPortId}
                      containerId={route.containerId}
                      onPickContainer={route.setContainer}
                      onSelectAsset={handleSelectAssetId}
                    />
                  ) : inSubstationScope && viewMode === '계통' ? (
                    <PowerRegisterView
                      assemblies={catalog.data?.assemblies}
                      types={catalog.data?.types}
                      substationId={substationId}
                      selectedAssetId={highlightedAssetId}
                      selectedPortId={focusPortId}
                      onSelectAsset={handleSelectAssetId}
                    />
                  ) : (
                    /* 현황 뷰 (기본) — **스크롤은 표가 쥔다**. 여기서 감싸 스크롤하면
                       도구바(검색)까지 함께 쓸려 올라간다. */
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                      <StatusOverview
                        rows={rows}
                        fieldColumns={fieldColumns}
                        selectedId={highlightedAssetId}
                        onSelectAsset={handleSelectAssetId}
                        nodeScope={nodeScope}
                        /* 본부·지사에서는 **누른다고 옮기지 않는다** — 옮기는 것은 또렷한 한 번이다.
                           (상세 패널은 워킹 카피를 읽고, 그것은 한 변전소의 것이다.) */
                        onOpenElsewhere={nodeScope ? openInSubstation : undefined}
                      />
                      </div>
                    </div>
                  )}

                  {/* 상세가 앉을 자리 — **늘 있다.**
                      예전에는 고른 것이 있을 때만 이 열이 생겨, 표에서 한 줄 누를 때마다 표가
                      384px 씩 좁아졌다 폈다 했다. 여기서 하는 일은 대부분 「골라서 본다」라 열렸다
                      닫혔다가 잦은데, 그때마다 열 너비가 다시 잡히고 눈이 따라간 자리가 어긋난다.
                      자리를 못 박아 두면 표는 한 번 잡힌 폭 그대로다(Figma·VS Code 의 검사기 레일).
                      자리는 **화면이** 정하고 내용은 패널이 채운다 — 그래야 비었을 때도 같은 폭이다. */}
                  {inSubstationScope && (
                  <aside className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface">
                  {showDetailPanel ? (
                    <AssetDetailPanel
                      key={selectedAssetId}
                      assetId={selectedAssetId!}
                      focusPortId={focusPortId}
                      focusPartId={focusPartId}
                      onSelectAsset={handleSelectAssetId}
                      onTrace={setTraceResult}
                      onClearTrace={() => setTraceResult(null)}
                      traceResult={traceResult}
                      cablePick={cablePick}
                      /* 이미 평면도를 보고 있으면 「평면도에서 보기」를 두지 않는다 —
                         지금 있는 곳으로 가는 버튼은 눌러도 아무 일이 없다. */
                      onShowOnFloorPlan={viewMode === '평면도' ? undefined : () => route.setView('평면도')}
                      onConnectPort={(portId) => {
                        // 이을 자리는 평면도에 있다 — 화면부터 옮기고 그 포트로 도구를 무장한다.
                        route.setView('평면도');
                        setCableStartPortId(portId);
                      }}
                    />
                  ) : (
                    <EmptyState
                      title="고른 설비가 없습니다"
                      description="표나 도면에서 하나를 누르세요."
                    />
                  )}
                  </aside>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>


      {/* 산출 내역 패널 (조건부 마운트 — 닫힌 상태에서 store 구독/계산 방지) */}
      {reportOpen && <ReportPanel open onClose={() => setReportOpen(false)} />}

      {/* 충돌 다이얼로그 */}
      {conflicts != null && conflicts.length > 0 && substationId != null && (
        <ConflictDialog conflicts={conflicts} substationId={substationId} onClear={clearConflicts} />
      )}
      {confirmDialog}
    </div>
  );
}
