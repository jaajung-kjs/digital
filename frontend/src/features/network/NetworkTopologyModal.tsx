/**
 * Network Topology Modal — cable trace 결과를 React Flow 로 시각화.
 *
 * 입력 = useNetworkTopologyStore.traceResult (cableTracer 결과). 변전소 단위로 노드 그룹화 후,
 * BC-tree (vertex 공유) 또는 SPQR (edge 공유) layout 으로 좌표 계산. fiberPath edge 만 그림.
 *
 * 시드 cable 의 fiberPathId 강조 (빨강), 시드가 속한 ring (파랑), 그 ring 을 포함하는 composite
 * ring (보라), 분기점 (호박색 테두리). highlightedFpId 만 바뀌어도 layout 은 재계산 안 함.
 *
 * 테스트 도구 (모달 한정 — 닫으면 초기화): 노드 클릭으로 최단경로(홉 수) 찾기, 엣지 호버 × 로
 * 경로 끊기, '경로 추가' 로 가상 엣지 추가. base 레이아웃은 절대 재계산하지 않고 — 변경은
 * 고정 화면 위 오버레이로만 표시해 before/after 비교가 가능하게 한다. 경로 표시 중에는 경로
 * 외 엣지·노드를 흐려(포커스 디밍) 경로가 도드라지게 한다.
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { toMapById } from '../../utils/byId';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNetworkTopologyStore } from './store';
import { computeLayoutBCTree } from './layout/bcTreeLayout';
import { computeLayoutSPQR } from './layout/spqrLayout';
import { FloatingEdge } from './edges/FloatingEdge';
import { TopologyTestControls } from './TopologyTestControls';
import { findShortestPath, type GraphEdge } from './pathfinding';
import type { TraceNode, TraceRing } from '../pathTrace/types';

const TIER_COLOR = {
  seed: '#dc2626',
  seedRing: '#2563eb',
  superRing: '#7c3aed',
  junction: '#f59e0b',
  default: '#9ca3af',
} as const;
type Tier = keyof typeof TIER_COLOR;

const EDGE_STYLE: Record<Tier, { stroke: string; width: number }> = {
  seed: { stroke: TIER_COLOR.seed, width: 3 },
  seedRing: { stroke: TIER_COLOR.seedRing, width: 2.5 },
  superRing: { stroke: TIER_COLOR.superRing, width: 2 },
  junction: { stroke: TIER_COLOR.junction, width: 1.5 },
  default: { stroke: TIER_COLOR.default, width: 1.5 },
};

// 테스트 오버레이 엣지 스타일 — 우선순위 끊김 > 경로 > 추가 (기존 tier 위).
// path = 도면 경로 trace 와 통일: 실선 + glow(drop-shadow).
const TEST_EDGE_STYLE = {
  cut: { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.4 },
  path: { stroke: '#16a34a', strokeWidth: 5, filter: 'drop-shadow(0 0 4px #16a34a)' },
  added: { stroke: '#0d9488', strokeWidth: 2, strokeDasharray: '6 3' },
} as const;

// 포커스 디밍 — 경로 표시 중 경로 외 엣지·노드 불투명도.
const DIM_OPACITY = 0.2;

// 추가 테스트 엣지 ID 접두사 — 생성(handleNodeClick)과 식별(handleRemoveEdge)이 공유.
const TEST_EDGE_ID_PREFIX = 'test-add-';

type NodeTier = Exclude<Tier, 'seed'>;
type PathRole = 'start' | 'end' | 'anchor';

const ROLE_BADGE: Record<PathRole, { text: string; color: string }> = {
  start: { text: '시작', color: '#16a34a' },
  end: { text: '종료', color: '#dc2626' },
  anchor: { text: '추가 시작', color: '#0d9488' },
};

type SubstationNodeData = {
  name: string;
  ofdName: string;
  modules: { id: string; name: string }[];
  tier: NodeTier;
  pathRole?: PathRole;
};

function SubstationNode({ data }: NodeProps<Node<SubstationNodeData>>) {
  const { name, ofdName, modules, tier, pathRole } = data;
  const borderColor = TIER_COLOR[tier];
  const borderWidth = tier === 'seedRing' || tier === 'junction' ? 2 : 1;
  const role = pathRole ? ROLE_BADGE[pathRole] : null;

  return (
    <div className="relative" style={{ minWidth: 160 }}>
      {role && (
        <span
          style={{
            position: 'absolute',
            top: -9,
            right: -6,
            zIndex: 1,
            background: role.color,
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 8,
          }}
        >
          {role.text}
        </span>
      )}
      <div
        className="rounded-lg bg-surface shadow-sm overflow-hidden"
        style={{
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow: role ? `0 0 0 3px ${role.color}` : undefined,
        }}
      >
        {/* Floating edge 가 노드 중심 기준 경계점을 계산하므로 핸들 위치 무관 — 단일 (hidden) 핸들 한 쌍만 둠. */}
        <Handle type="target" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%' }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, top: '50%', left: '50%' }} />
        <div className="bg-surface-2 px-2.5 py-1.5 border-b border-line">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-content truncate">{name}</span>
            {tier === 'junction' && (
              <span className="ml-1 shrink-0 text-[10px] text-amber-600 font-medium">분기점</span>
            )}
          </div>
        </div>
        <div className="px-2.5 py-1.5">
          <div className="text-[11px] text-content-muted truncate">{ofdName}</div>
          {modules.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {modules.slice(0, 3).map((m) => (
                <div key={m.id} className="text-[10px] text-content-muted truncate">
                  · {m.name}
                </div>
              ))}
              {modules.length > 3 && (
                <div className="text-[10px] text-content-faint">+ {modules.length - 3}개</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { substation: SubstationNode };
const edgeTypes = { floating: FloatingEdge };

interface SubstationGroup {
  id: string;
  name: string;
  ofdNode: TraceNode | null;
  modules: TraceNode[];
}

function groupBySubstation(nodes: TraceNode[]): SubstationGroup[] {
  const groups = new Map<string, SubstationGroup>();
  for (const n of nodes) {
    const key = n.substationName || n.substationId || n.nodeId;
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: n.substationName || n.nodeName, ofdNode: null, modules: [] });
    }
    const g = groups.get(key)!;
    if (n.materialCategoryCode === 'EQP-OFD') g.ofdNode = n;
    else g.modules.push(n);
  }
  return Array.from(groups.values());
}

function computeRingHighlights(
  rings: TraceRing[],
  highlightedFpId: string | null,
): { seedRingNodes: Set<string>; seedRingEdges: Set<string>; superRingNodes: Set<string>; superRingEdges: Set<string> } {
  const seedRingNodes = new Set<string>();
  const seedRingEdges = new Set<string>();
  const superRingNodes = new Set<string>();
  const superRingEdges = new Set<string>();
  if (!highlightedFpId) return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };

  const seedRing = rings.find((r) => r.level === 0 && r.edgeIds.includes(highlightedFpId));
  if (seedRing) {
    for (const id of seedRing.nodeIds) seedRingNodes.add(id);
    for (const id of seedRing.edgeIds) seedRingEdges.add(id);
    const superRing = rings.find((r) => r.level === 1 && r.childRingIds.includes(seedRing.id));
    if (superRing) {
      for (const id of superRing.nodeIds) superRingNodes.add(id);
      for (const id of superRing.edgeIds) superRingEdges.add(id);
    }
  }
  return { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges };
}

/** base fiberPath edge — 그래프 위상 + tier 스타일 메타. */
type GraphEdgeMeta = { id: string; source: string; target: string; tier: Tier; label?: string };

export function NetworkTopologyModal() {
  const modalOpen = useNetworkTopologyStore((s) => s.modalOpen);
  const traceResult = useNetworkTopologyStore((s) => s.traceResult);
  const highlightedFpId = useNetworkTopologyStore((s) => s.highlightedFiberPathId);
  const isLoading = useNetworkTopologyStore((s) => s.isLoading);
  const error = useNetworkTopologyStore((s) => s.error);
  const close = useNetworkTopologyStore((s) => s.close);

  // ── 테스트 상태 (모달 한정) ───────────────────────────────────────────────
  const [cutEdgeIds, setCutEdgeIds] = useState<Set<string>>(new Set<string>());
  const [addedEdges, setAddedEdges] = useState<GraphEdge[]>([]);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [pathEnd, setPathEnd] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addAnchor, setAddAnchor] = useState<string | null>(null);
  const addCounter = useRef(0);

  const resetTestState = useCallback(() => {
    addCounter.current = 0;
    setCutEdgeIds(new Set<string>());
    setAddedEdges([]);
    setPathStart(null);
    setPathEnd(null);
    setAddMode(false);
    setAddAnchor(null);
  }, []);

  // traceResult 가 바뀌면(닫기→null, 재열기→새 객체) 테스트 상태 초기화.
  useEffect(() => {
    resetTestState();
  }, [traceResult, resetTestState]);

  // ESC — addMode 중이면 addMode 취소, 아니면 경로찾기 선택 해제. (도면 ESC=해제와 통일)
  useEffect(() => {
    if (!addMode && pathStart == null && pathEnd == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addMode) {
        setAddMode(false);
        setAddAnchor(null);
      } else {
        setPathStart(null);
        setPathEnd(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode, pathStart, pathEnd]);

  // Layout 은 traceResult 만으로 결정 — highlightedFpId/테스트 상태 변경 시 재계산 안 함.
  const layoutData = useMemo(() => {
    if (!traceResult) return null;
    const groups = groupBySubstation(traceResult.nodes);
    const ofdToGroup = new Map<string, string>();
    for (const g of groups) if (g.ofdNode) ofdToGroup.set(g.ofdNode.nodeId, g.id);

    const hasSPQR = traceResult.rings.some((r) => r.level === 1);
    const layoutInput = { nodeIds: groups.map((g) => g.id), ofdToGroup, edges: traceResult.edges, rings: traceResult.rings };
    const positions = hasSPQR ? computeLayoutSPQR(layoutInput) : computeLayoutBCTree(layoutInput);

    // 분기점 = OFD 가 2개 이상의 level-0 ring 에 포함. ring 통계도 동일 loop 에서.
    const ringCount = new Map<string, number>();
    let fundamental = 0;
    let composite = 0;
    for (const r of traceResult.rings) {
      if (r.level === 0) {
        fundamental++;
        for (const nid of r.nodeIds) ringCount.set(nid, (ringCount.get(nid) ?? 0) + 1);
      } else {
        composite++;
      }
    }
    return { groups, ofdToGroup, positions, ringCount, fundamental, composite };
  }, [traceResult]);

  // base 그래프 — 노드 + fiberPath 엣지(위상·tier). 6가지 테스트 상태와 무관.
  const baseGraph = useMemo<{ nodes: Node<SubstationNodeData>[]; graphEdges: GraphEdgeMeta[] }>(() => {
    if (!traceResult || !layoutData) return { nodes: [], graphEdges: [] };
    const { groups, ofdToGroup, positions, ringCount } = layoutData;
    const { seedRingNodes, seedRingEdges, superRingNodes, superRingEdges } = computeRingHighlights(
      traceResult.rings,
      highlightedFpId,
    );

    const nodes: Node<SubstationNodeData>[] = groups.map((g) => {
      const ofdId = g.ofdNode?.nodeId;
      let tier: NodeTier = 'default';
      if (ofdId) {
        if (seedRingNodes.has(ofdId)) tier = 'seedRing';
        else if (superRingNodes.has(ofdId)) tier = 'superRing';
        else if ((ringCount.get(ofdId) ?? 0) >= 2) tier = 'junction';
      }
      return {
        id: g.id,
        type: 'substation',
        position: positions.get(g.id) ?? { x: 0, y: 0 },
        data: {
          name: g.name,
          ofdName: g.ofdNode?.nodeName ?? '',
          modules: g.modules.map((m) => ({ id: m.nodeId, name: m.nodeName })),
          tier,
        },
      };
    });

    // FiberPath edge 만 그림 — cable edge 는 변전소 안 표현이라 그래프에서 생략.
    const graphEdges: GraphEdgeMeta[] = [];
    for (const e of traceResult.edges) {
      if (e.type !== 'fiberPath') continue;
      const source = ofdToGroup.get(e.sourceAssetId);
      const target = ofdToGroup.get(e.targetAssetId);
      if (!source || !target) continue;
      const tier: Tier = e.fiberPathId === highlightedFpId
        ? 'seed'
        : seedRingEdges.has(e.id)
          ? 'seedRing'
          : superRingEdges.has(e.id)
            ? 'superRing'
            : 'default';
      // Label = 포트번호 (#N) 만 — 변전소명은 양 끝 노드 박스에 이미 표시됨.
      const label = e.fiberPortNumber != null ? `#${e.fiberPortNumber}` : undefined;
      graphEdges.push({ id: e.id, source, target, tier, label });
    }
    return { nodes, graphEdges };
  }, [traceResult, layoutData, highlightedFpId]);

  // 경로찾기 그래프 = (base + 추가) − 끊김.
  const routableEdges = useMemo<GraphEdge[]>(() => {
    const all: GraphEdge[] = [
      ...baseGraph.graphEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      ...addedEdges,
    ];
    return all.filter((e) => !cutEdgeIds.has(e.id));
  }, [baseGraph, addedEdges, cutEdgeIds]);

  // 최단 경로(홉 수) — start/end 둘 다 선택됐을 때만.
  const foundPath = useMemo<string[] | null>(() => {
    if (!pathStart || !pathEnd) return null;
    return findShortestPath(routableEdges, pathStart, pathEnd);
  }, [routableEdges, pathStart, pathEnd]);
  const foundPathEdgeIds = useMemo(() => new Set(foundPath ?? []), [foundPath]);

  // 경로상 노드 = foundPath 엣지들의 양 끝 합집합 (시작·종료·중간 노드).
  // foundPath 엣지는 항상 routableEdges 안에 있으므로 거기서 endpoint 를 찾는다.
  const pathNodeIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    if (!foundPath) return ids;
    const byId = toMapById(routableEdges);
    for (const eid of foundPath) {
      const e = byId.get(eid);
      if (e) {
        ids.add(e.source);
        ids.add(e.target);
      }
    }
    return ids;
  }, [foundPath, routableEdges]);

  // 경로가 화면에 표시 중인지 — 포커스 디밍 on/off 게이트.
  const pathActive = foundPathEdgeIds.size > 0;

  // ── 엣지 제거 (× 클릭) — 추가 엣지는 완전 삭제, base 엣지는 끊김 토글 ────────
  const handleRemoveEdge = useCallback((edgeId: string) => {
    if (edgeId.startsWith(TEST_EDGE_ID_PREFIX)) {
      setAddedEdges((prev) => prev.filter((e) => e.id !== edgeId));
      return;
    }
    setCutEdgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) next.delete(edgeId);
      else next.add(edgeId);
      return next;
    });
  }, []);

  // ── 노드 클릭 — addMode 면 경로 추가, 아니면 경로찾기 시작/종료 ──────────────
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (addMode) {
        if (!addAnchor) {
          setAddAnchor(nodeId);
        } else if (nodeId !== addAnchor) {
          const id = `${TEST_EDGE_ID_PREFIX}${addCounter.current++}`;
          setAddedEdges((prev) => [...prev, { id, source: addAnchor, target: nodeId }]);
          setAddMode(false);
          setAddAnchor(null);
        }
        return;
      }
      // 선택된 엣드포인트 재클릭 → 그 엣드포인트만 해제.
      if (nodeId === pathStart) {
        setPathStart(null);
        return;
      }
      if (nodeId === pathEnd) {
        setPathEnd(null);
        return;
      }
      // 미선택 노드 → 빈 슬롯 채우기. 둘 다 차 있으면 무동작.
      if (!pathStart) setPathStart(nodeId);
      else if (!pathEnd) setPathEnd(nodeId);
    },
    [addMode, addAnchor, pathStart, pathEnd],
  );

  const handleToggleAddMode = useCallback(() => {
    setAddMode((prev) => !prev);
    setAddAnchor(null);
  }, []);

  // 빈 캔버스 클릭 → 경로찾기 해제 + addMode 취소 (중립 상태로).
  const handlePaneClick = useCallback(() => {
    setPathStart(null);
    setPathEnd(null);
    setAddMode(false);
    setAddAnchor(null);
  }, []);

  const handleClearStart = useCallback(() => setPathStart(null), []);
  const handleClearEnd = useCallback(() => setPathEnd(null), []);

  // 노드 id → 표시 이름 — 컨트롤 바 칩 라벨용.
  const nodeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of baseGraph.nodes) m.set(n.id, n.data.name);
    return m;
  }, [baseGraph]);

  // ── 렌더용 노드 — pathRole 배지 주입 + 포커스 디밍 ─────────────────────────
  const rfNodes = useMemo<Node[]>(() => {
    return baseGraph.nodes.map((n) => {
      let pathRole: PathRole | undefined;
      if (n.id === pathStart) pathRole = 'start';
      else if (n.id === pathEnd) pathRole = 'end';
      else if (n.id === addAnchor) pathRole = 'anchor';
      const dim = pathActive && !pathNodeIds.has(n.id);
      if (!pathRole && !dim) return n as Node;
      const next: Node = pathRole ? { ...n, data: { ...n.data, pathRole } } : { ...n };
      if (dim) next.style = { ...n.style, opacity: DIM_OPACITY };
      return next;
    });
  }, [baseGraph, pathStart, pathEnd, addAnchor, pathActive, pathNodeIds]);

  // ── 렌더용 엣지 — 끊김 > 경로 > 추가 > 기존 tier. 경로 표시 중엔 경로 외 디밍. ──
  const rfEdges = useMemo<Edge[]>(() => {
    const labelStyle = { fontSize: 10, fill: '#6b7280' };
    const addedLabelStyle = { fontSize: 10, fill: '#0d9488' };
    const labelBgStyle = { fill: '#ffffff', fillOpacity: 0.85 };
    const data = { onRemove: handleRemoveEdge };

    // 선택된 스타일에 디밍을 적용해 React Flow Edge 로 변환 — base/추가 엣지 공통.
    const toRfEdge = (
      e: GraphEdge,
      onPath: boolean,
      style: Edge['style'],
      label: string | undefined,
      baseLabelStyle: { fontSize: number; fill: string },
    ): Edge => {
      const dim = pathActive && !onPath;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'floating',
        label,
        labelStyle: dim ? { ...baseLabelStyle, opacity: DIM_OPACITY } : baseLabelStyle,
        labelBgStyle,
        style: dim ? { ...style, opacity: DIM_OPACITY } : style,
        data,
      };
    };

    const result: Edge[] = [];
    for (const e of baseGraph.graphEdges) {
      const onPath = foundPathEdgeIds.has(e.id);
      let style: Edge['style'];
      if (cutEdgeIds.has(e.id)) {
        style = { ...TEST_EDGE_STYLE.cut };
      } else if (onPath) {
        style = { ...TEST_EDGE_STYLE.path };
      } else {
        const s = EDGE_STYLE[e.tier];
        style = { stroke: s.stroke, strokeWidth: s.width };
      }
      result.push(toRfEdge(e, onPath, style, e.label, labelStyle));
    }
    // 추가 엣지 — 끊김 대상 아님(× 누르면 완전 삭제). 경로상이면 경로 스타일.
    for (const e of addedEdges) {
      const onPath = foundPathEdgeIds.has(e.id);
      const style = onPath ? { ...TEST_EDGE_STYLE.path } : { ...TEST_EDGE_STYLE.added };
      result.push(toRfEdge(e, onPath, style, '추가', addedLabelStyle));
    }
    return result;
  }, [baseGraph, addedEdges, cutEdgeIds, foundPathEdgeIds, pathActive, handleRemoveEdge]);

  if (!modalOpen) return null;

  // document.body 로 포털 — 현황 탭 등에서 에디터 래퍼가 invisible(visibility:hidden)
  // 이면 모달이 그 상속을 받아 backdrop·패널이 투명해지던 버그 방지. 항상 뷰포트 최상위.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="bg-surface rounded-lg shadow-xl w-[min(1200px,95vw)] h-[min(800px,90vh)] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <div>
            <h3 className="text-sm font-semibold text-content">네트워크 토폴로지</h3>
            {traceResult && layoutData && (
              <p className="text-[11px] text-content-muted mt-0.5">
                {traceResult.nodes.length}개 노드 · {layoutData.fundamental}개 링 · 상위링 {layoutData.composite}개
              </p>
            )}
          </div>
          <button onClick={close} className="text-content-faint hover:text-content text-lg leading-none" aria-label="닫기">
            ×
          </button>
        </div>

        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
              <span className="text-sm text-content-muted">불러오는 중...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-danger">{error}</span>
            </div>
          )}
          {!isLoading && !error && rfNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-content-faint">표시할 네트워크 토폴로지가 없습니다.</span>
            </div>
          )}
          {!isLoading && !error && rfNodes.length > 0 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.02}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              onNodeClick={(_, node) => handleNodeClick(node.id)}
              onPaneClick={handlePaneClick}
            >
              <Background gap={20} size={1} color="#e5e7eb" />
              <Controls showInteractive={false} />
              <TopologyTestControls
                addMode={addMode}
                addAnchor={addAnchor}
                hasStart={pathStart != null}
                hasEnd={pathEnd != null}
                pathFound={foundPath != null}
                startLabel={pathStart ? nodeNameById.get(pathStart) ?? pathStart : null}
                endLabel={pathEnd ? nodeNameById.get(pathEnd) ?? pathEnd : null}
                cutCount={cutEdgeIds.size}
                addCount={addedEdges.length}
                onToggleAddMode={handleToggleAddMode}
                onReset={resetTestState}
                onClearStart={handleClearStart}
                onClearEnd={handleClearEnd}
              />
            </ReactFlow>
          )}
        </div>

        <div className="px-4 py-2 border-t border-line flex items-center gap-4 text-[11px] text-content-muted flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-red-600" /> 시드 경로
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-blue-600" /> 같은 링
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-purple-600" /> 상위 링
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border-2 border-amber-500 bg-white" /> 분기점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-1 bg-green-600" /> 찾은 경로
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-teal-600" /> 추가
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-gray-400" /> 끊김
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
