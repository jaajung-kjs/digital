import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathHighlightStore } from '../stores/pathHighlightStore';
import { computeLayout } from '../utils/layoutEngine';
import type { LayoutNode } from '../utils/layoutEngine';
import { SubstationBox } from './SubstationBox';
import { TopologyEdge } from './TopologyEdge';
import { RingSelector } from './RingSelector';

export function TopologyModal() {
  const {
    active,
    modalOpen,
    traceResult,
    selectedRingId,
    highlightedNodeIds,
    highlightedEdgeIds,
    selectRing,
    closeModal,
  } = usePathHighlightStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // ESC to close
  useEffect(() => {
    if (!active) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, closeModal]);

  // Native wheel handler to prevent page scroll (React onWheel is passive)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      setZoom((prev) => Math.max(0.2, Math.min(3, prev - e.deltaY * 0.001)));
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const layout = useMemo(() => {
    if (!traceResult) return null;
    return computeLayout(traceResult.nodes, traceResult.edges, traceResult.rings);
  }, [traceResult]);

  const nodeMap = useMemo(() => {
    if (!layout) return new Map<string, LayoutNode>();
    const map = new Map<string, LayoutNode>();
    for (const sub of layout.substations) {
      for (const node of sub.nodes) {
        map.set(node.equipmentId, node);
      }
    }
    return map;
  }, [layout]);

  const sourceNodeIds = useMemo(() => {
    if (!traceResult) return new Set<string>();
    return new Set(
      traceResult.nodes.filter((n) => n.isSource || n.isTarget).map((n) => n.equipmentId),
    );
  }, [traceResult]);

  // Equipment → substation mapping for separating intra/inter-substation edges
  const equipToSubstation = useMemo(() => {
    if (!traceResult) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const n of traceResult.nodes) {
      map.set(n.equipmentId, n.substationId);
    }
    return map;
  }, [traceResult]);


  // Compute bounding box of relevant substations (all or highlighted ring)
  const fitBounds = useMemo(() => {
    if (!layout) return null;

    let subs = layout.substations;
    if (highlightedNodeIds.size > 0) {
      const filtered = subs.filter((s) =>
        s.nodes.some((n) => highlightedNodeIds.has(n.equipmentId)),
      );
      if (filtered.length > 0) subs = filtered;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of subs) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.width);
      maxY = Math.max(maxY, s.y + s.height);
    }

    const pad = 60;
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }, [layout, highlightedNodeIds]);

  // Auto-fit: reset zoom/pan when fitBounds changes (trace change or ring selection)
  useEffect(() => {
    if (!fitBounds) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [fitBounds]);

  // Derive title from trace result
  const title = useMemo(() => {
    if (!traceResult || traceResult.edges.length === 0) return '연결 경로 상세';
    const firstEdge = traceResult.edges[0];
    const cableType = firstEdge.cableType ?? firstEdge.type;
    const sourceNode = traceResult.nodes.find((n) => n.isSource);
    const startName = sourceNode?.equipmentName ?? '';
    return `연결 경로 상세 — ${cableType} (${startName} 기준)`;
  }, [traceResult]);


  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x) / zoom,
        y: dragStart.current.panY + (e.clientY - dragStart.current.y) / zoom,
      });
    },
    [dragging, zoom],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  if (!active || !modalOpen || !traceResult || !layout || !fitBounds) return null;

  // viewBox based on fitBounds: auto-fits to content, zoom/pan offsets from there
  const viewBox = `${fitBounds.x - pan.x} ${fitBounds.y - pan.y} ${fitBounds.w / zoom} ${fitBounds.h / zoom}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onWheel={(e) => e.stopPropagation()}>
      <div className="flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button
            onClick={closeModal}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* SVG area */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            className="h-full w-full"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          >
            {/* Inter-substation edges (behind boxes) */}
            {traceResult.edges.map((edge) => {
              const srcSub = equipToSubstation.get(edge.sourceEquipmentId);
              const tgtSub = equipToSubstation.get(edge.targetEquipmentId);
              if (srcSub === tgtSub) return null; // rendered on top later
              return (
                <TopologyEdge
                  key={edge.id}
                  edge={edge}
                  nodeMap={nodeMap}
                  isHighlighted={highlightedEdgeIds.has(edge.id)}
                />
              );
            })}
            {/* Substation boxes */}
            {layout.substations.map((sub) => (
              <SubstationBox
                key={sub.substationId}
                substation={sub}
                highlightedNodeIds={highlightedNodeIds}
                sourceNodeIds={sourceNodeIds}
              />
            ))}
            {/* Intra-substation cable edges (on top of boxes) */}
            {traceResult.edges.map((edge) => {
              const srcSub = equipToSubstation.get(edge.sourceEquipmentId);
              const tgtSub = equipToSubstation.get(edge.targetEquipmentId);
              if (srcSub !== tgtSub) return null;
              return (
                <TopologyEdge
                  key={edge.id}
                  edge={edge}
                  nodeMap={nodeMap}
                  isHighlighted={highlightedEdgeIds.has(edge.id)}
                />
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="6">
              <line x1="0" y1="3" x2="20" y2="3" stroke="#6b7280" strokeWidth="2" />
            </svg>
            케이블
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="6">
              <line
                x1="0"
                y1="3"
                x2="20"
                y2="3"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            </svg>
            광경로
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12">
              <circle cx="6" cy="6" r="5" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1.5" />
            </svg>
            시작점
          </span>
        </div>

        {/* Ring selector */}
        <RingSelector
          rings={traceResult.rings}
          selectedRingId={selectedRingId}
          onSelectRing={selectRing}
        />
      </div>
    </div>
  );
}
