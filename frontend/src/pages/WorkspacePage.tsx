import { useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { NodeStatusView } from '../features/assets/components/NodeStatusView';
import { SubstationStatusView } from '../features/assets/components/SubstationStatusView';
import { FiberRegisterView } from '../features/fiber/components/FiberRegisterView';
import { PowerView } from '../features/power/components/PowerView';
import { WorkspaceNavContext, type WorkspaceNav } from '../features/workspace/WorkspaceNavContext';
import { useSelectionStore } from '../features/workspace/selectionStore';
import { useEditorSelectionBridge } from '../features/workspace/useEditorSelectionBridge';
import { useSubstationFloors } from '../features/workspace/useSubstationFloors';
import { useWorkingCopyLoader, useEffectiveAssets } from '../features/workingCopy/hooks';
import { floorAnchor } from '../features/workingCopy/floorAnchor';
import { toMapById } from '../utils/byId';
import { useSubstationWorkingCopy } from '../features/workingCopy/substationStore';
import { workspaceFloorUrl } from '../features/workspace/workspaceUrls';
import { WorkingCopyCommitBar } from '../features/workingCopy/WorkingCopyCommitBar';
import { useOrganizationStore } from '../stores/organizationStore';
import type { NodeKind } from '../hooks/useNodeAssets';

const VIEWS = [
  { key: 'status', label: '현황' },
  { key: 'plan', label: '평면도' },
  { key: 'fiber', label: '선번장' },
  { key: 'power', label: '계통' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

// ──────────────────────────────────────────────────────────────────────────
// 단일 노드-aware 워크스페이스 셸.
//
// 활성 노드(activeNode)는 URL 의 변전소(/substations/:id/workspace) 이거나,
// 그 외(`/` 라우트)에서는 organizationStore 의 viewingNode(본부·사업소)다.
// 모든 노드 타입이 동일한 탭(현황/평면도/연결)을 갖는다. 탭별 컨텍스트 규칙:
//
// - 현황: 항상 활성 노드의 NodeStatusView(본부·사업소=교차 변전소, 변전소=자기 자산).
// - 평면도:
//   · 변전소 활성: (activeNode.id, ?floor ?? 첫 층) — 자산 없이 즉시 에디터.
//   · 본부·사업소 활성: 선택 자산의 (substationId, floorId). 선택 자산이 없거나
//     층이 없으면 안내문. 본부·사업소는 고유 층이 없으므로 추측하지 않는다.
// - 연결: 변전소=자기 연결, 본부·사업소=선택 자산 변전소의 연결(없으면 안내문).
// - 커밋 바: 컨텍스트 변전소(변전소=자신, 본부·사업소=선택 자산이 로드된 변전소).
// ──────────────────────────────────────────────────────────────────────────

export function WorkspacePage() {
  const { substationId } = useParams<{ substationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { viewingNodeId, findNode } = useOrganizationStore();

  // 활성 노드: URL 변전소 우선, 없으면 viewingNode(본부·사업소·변전소).
  const activeNode = useMemo<{ type: NodeKind; id: string } | null>(() => {
    if (substationId) return { type: 'substation', id: substationId };
    const node = viewingNodeId ? findNode(viewingNodeId) : null;
    if (!node || node.type === 'floor') return null;
    return { type: node.type as NodeKind, id: node.id };
  }, [substationId, viewingNodeId, findNode]);

  const isSubstationNode = activeNode?.type === 'substation';

  const rawView = searchParams.get('view') ?? (searchParams.get('tab') === 'plan' ? 'plan' : null);
  const view: ViewKey =
    rawView === 'plan' ? 'plan'
    : rawView === 'fiber' ? 'fiber'
    : rawView === 'power' ? 'power'
    : 'status';

  // 공유 선택(본부·사업소 평면도/연결 컨텍스트의 근원). 변전소도 에디터 선택 브리지에 사용.
  // SSOT: 워크스페이스 단일 선택 store(React·캔버스 핸들러 양쪽 접근).
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);

  // 활성 노드가 바뀌면(다른 본부·사업소·변전소 클릭) 이전 선택을 리셋한다. 안 그러면 stale 선택이
  // 남아(특히 본부·사업소는 working copy 가 안 바뀌어 assetsById 에 옛 자산이 남음) 평면도가 옛
  // 자산의 층으로 잘못 열린다. render-phase 리셋 — 자식(그리드 ?assetId 자동선택 등) effect 보다
  // 먼저 settle 되어 딥링크 선택과 경쟁하지 않는다.
  const [prevNodeId, setPrevNodeId] = useState<string | null>(activeNode?.id ?? null);
  if ((activeNode?.id ?? null) !== prevNodeId) {
    setPrevNodeId(activeNode?.id ?? null);
    setSelectedAssetId(null);
  }

  // 온디맨드 로드된 working copy(본부·사업소: 선택 자산의 변전소를 NodeStatusView 가 로드).
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);
  const effective = useEffectiveAssets();

  // 변전소 노드: 층은 ?floor ?? 첫 층. 본부·사업소: 선택 자산의 층(파생, 추측 금지).
  const { data: floors = [] } = useSubstationFloors(isSubstationNode ? activeNode?.id : undefined);
  const floorParam = searchParams.get('floor');

  // 선택 자산의 floor 표현(anchor) — 미배치 자산(랙 모듈·회로·포트)은 부모 설비로 해소.
  // 예: 모듈을 선택하고 평면도로 가면 그 모듈의 랙(=anchor)의 floor/substation 을 연다.
  // 단일 floorAnchor 로 해소(깊이 무관) — 도면 위치 해소의 단일 정답.
  const assetsById = useMemo(() => toMapById(effective), [effective]);
  const selectedAsset = selectedAssetId ? assetsById.get(selectedAssetId) : undefined;
  const selectedAnchor = selectedAssetId ? floorAnchor(selectedAssetId, assetsById) : null;

  // 평면도/연결이 가리키는 컨텍스트 변전소·층 — anchor 기준(미배치 자산도 커버).
  const contextSubstationId = isSubstationNode
    ? (activeNode?.id ?? null)
    : (selectedAnchor?.substationId ?? selectedAsset?.substationId ?? null);
  const planFloorId = isSubstationNode
    ? (floorParam ?? selectedAnchor?.floorId ?? floors[0]?.id ?? null)
    : (selectedAnchor?.floorId ?? null);

  const nav: WorkspaceNav = useMemo(() => ({
    gotoFloor: (floorId, assetId) => {
      if (isSubstationNode) {
        // 변전소: URL 파라미터로 층·자산 진입. 포커스 파라미터는 단일 ?assetId=
        // (FloorPlanEditor 가 평면도 딥링크 포커스로 소비).
        setSearchParams((p) => {
          p.set('view', 'plan'); p.delete('tab'); p.set('floor', floorId);
          if (assetId) p.set('assetId', assetId); else p.delete('assetId');
          return p;
        });
      } else {
        // 본부·사업소: 층은 선택 자산에서 파생 — ?floor 없이 공유 선택만 바꿔 제자리에서
        // 그 자산의 평면도로 진입(변전소 라우트로 이동하지 않음). 현황 복귀 시 활성 노드 유지.
        if (assetId) setSelectedAssetId(assetId);
        setSearchParams((p) => { p.set('view', 'plan'); p.delete('tab'); return p; });
      }
    },
    gotoAsset: (assetId, hint) => {
      // 단일 해소: 자산의 floor anchor(직접 배치된 가장 가까운 조상)로 소속 층·변전소를 푼다.
      // 로컬 working copy 에 없으면(타 변전소 OFD 대국 등) hint.floorId 로 폴백.
      const anchor = floorAnchor(assetId, assetsById);
      const targetSubstationId = anchor?.substationId ?? null;
      const targetFloorId = anchor?.floorId ?? hint?.floorId ?? null;

      // 같은 컨텍스트 변전소 안 → 제자리 평면도 진입(라우트 유지, gotoFloor 로직 재사용).
      if (targetSubstationId && targetSubstationId === contextSubstationId && targetFloorId) {
        setSelectedAssetId(assetId);
        nav.gotoFloor(targetFloorId, assetId);
        return;
      }
      // 타 변전소(또는 본부·사업소 컨텍스트) → 그 변전소 워크스페이스 평면도로 라우트 이동.
      // ?assetId= 포커스 페이로드를 동반해 도착 후 자동 reveal+center.
      if (targetSubstationId && targetFloorId) {
        navigate(workspaceFloorUrl(targetSubstationId, targetFloorId, { assetId }));
        return;
      }
      // 변전소 미해소(로컬에 없고 floorId 만 앎 — OFD 대국) → 층→변전소 리다이렉트 셸 경유.
      // 셸이 floorId 로 substationId 를 풀어 같은 ?assetId= 포커스 URL 로 수렴시킨다.
      if (targetFloorId) {
        navigate(`/floors/${targetFloorId}/plan?assetId=${assetId}`);
      }
    },
  }), [isSubstationNode, setSearchParams, setSelectedAssetId, navigate, assetsById, contextSubstationId]);

  // 평면도 에디터가 활성일 때만 에디터↔공유 선택 브리지를 돈다.
  useEditorSelectionBridge(selectedAssetId, view === 'plan');

  // 컨텍스트 변전소의 통합 working copy 를 store 에 로드(idempotent).
  // 변전소 노드: 자기 변전소. 본부·사업소: 선택 자산이 가리키는 변전소(없으면 no-op).
  // (본부·사업소는 NodeStatusView 도 선택 시 같은 변전소를 온디맨드 로드 — idempotent 가드.)
  useWorkingCopyLoader(contextSubstationId);

  if (!activeNode) {
    return (
      <div className="h-full bg-surface overflow-hidden flex flex-col">
        <div className="p-8 text-sm text-content-muted">좌측 트리에서 본부·사업소·변전소를 선택하세요.</div>
      </div>
    );
  }

  const switchView = (key: ViewKey) =>
    setSearchParams((p) => { p.set('view', key); p.delete('tab'); return p; });

  // 평면도 탭 클릭 동작: 변전소는 첫 층으로 gotoFloor(URL 파라미터), 본부·사업소는 view만 전환.
  const onClickPlan = () => {
    if (isSubstationNode && planFloorId) nav.gotoFloor(planFloorId);
    else switchView('plan');
  };

  // 커밋 바 노출 변전소: 컨텍스트 변전소. 본부·사업소는 로드된 변전소가 컨텍스트와
  // 일치할 때만(선택 자산의 변전소). 미선택이면 로드된 변전소(NodeStatusView 가 로드한
  // 것)에 바인딩해, 현황에서 stage 한 편집의 커밋 바가 유지되도록 한다.
  const commitSubstationId = isSubstationNode
    ? activeNode.id
    : (contextSubstationId ?? loadedSubstationId);

  const selectPrompt = (
    <div className="p-6 text-sm text-content-muted">현황에서 설비를 선택하면 그 설비의 평면도를 봅니다.</div>
  );

  return (
    <WorkspaceNavContext.Provider value={nav}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-surface">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => (v.key === 'plan' ? onClickPlan() : switchView(v.key))}
                  className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
                    view === v.key
                      ? 'bg-primary text-white'
                      : 'text-content-muted hover:bg-surface-2'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
            {isSubstationNode && view === 'plan' && floors.length > 0 && (
              <select
                value={planFloorId ?? ''}
                onChange={(e) => nav.gotoFloor(e.target.value)}
                className="text-sm px-2 py-1.5 border border-line rounded bg-surface text-content">
                {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
          {commitSubstationId && <WorkingCopyCommitBar substationId={commitSubstationId} />}
          <div className="flex-1 min-h-0 relative">
            {/*
              평면도 에디터는 탭 전환 시 언마운트하지 않고 CSS 로만 숨긴다.
              언마운트→resetEditor→재마운트 경로를 타면 뷰포트가 0,0 으로
              리셋되므로 마운트를 유지해 editorStore 의 zoom/pan 상태를 보존한다.
              visibility 만 끄고(invisible) absolute 크기는 유지한다 — 컨테이너
              크기가 안 바뀌어 ResizeObserver 가 안 돌고, 캔버스 버퍼가 유지돼
              탭 복귀 시 설비·케이블이 즉시 보인다. key={planFloorId} 로 "층 변경"
              시에만 리마운트(변전소: 층 드롭다운; 본부·사업소: 선택 자산의 층).
              에디터는 floorId 만으로 floor.substationId 를 풀어 그 변전소의 통합
              working copy 를 self-load 한다(useFloorPlanData) — 본부·사업소가
              선택 자산의 변전소 평면도를 그대로 띄울 수 있는 이유.
            */}
            {planFloorId ? (
              <div className={view === 'plan' ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}>
                <FloorPlanEditor key={planFloorId} floorId={planFloorId} active={view === 'plan'} />
              </div>
            ) : view === 'plan' ? (
              <div className="absolute inset-0 bg-surface overflow-hidden">
                {isSubstationNode ? (
                  <div className="p-6 text-sm text-content-muted">등록된 층이 없습니다.</div>
                ) : (
                  selectPrompt
                )}
              </div>
            ) : null}
            {view === 'status' ? (
              <div className="absolute inset-0 bg-surface overflow-hidden">
                {isSubstationNode ? (
                  <SubstationStatusView substationId={activeNode.id} />
                ) : (
                  <NodeStatusView nodeType={activeNode.type} nodeId={activeNode.id} />
                )}
              </div>
            ) : null}
            {view === 'fiber' ? (
              <div className="absolute inset-0 bg-surface overflow-hidden">
                {contextSubstationId ? (
                  <FiberRegisterView substationId={contextSubstationId} />
                ) : (
                  selectPrompt
                )}
              </div>
            ) : null}
            {view === 'power' ? (
              <div className="absolute inset-0 bg-surface overflow-hidden">
                {contextSubstationId ? (
                  <PowerView substationId={contextSubstationId} />
                ) : (
                  selectPrompt
                )}
              </div>
            ) : null}
          </div>
        </div>
    </WorkspaceNavContext.Provider>
  );
}
