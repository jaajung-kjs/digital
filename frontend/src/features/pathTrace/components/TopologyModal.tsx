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
    mode,
    traceResult,
    selectedRingId,
    highlightedNodeIds,
    highlightedEdgeIds,
    selectRing,
    clearHighlight,
  } = usePathHighlightStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // ESC to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clearHighlight();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clearHighlight]);

  // Reset zoom/pan when trace changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [traceResult]);

  const layout = useMemo(() => {
    if (!traceResult) return null;
    return computeLayout(traceResult.nodes, traceResult.edges);
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

  // Derive title from trace result
  const title = useMemo(() => {
    if (!traceResult || traceResult.edges.length === 0) return '연결 경로 상세';
    const firstEdge = traceResult.edges[0];
    const cableType = firstEdge.cableType ?? firstEdge.type;
    const sourceNode = traceResult.nodes.find((n) => n.isSource);
    const startName = sourceNode?.equipmentName ?? '';
    return `연결 경로 상세 — ${cableType} (${startName} 기준)`;
  }, [traceResult]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.2, Math.min(3, prev - e.deltaY * 0.001)));
  }, []);

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

  if (!active || mode !== 'modal' || !traceResult || !layout) return null;

  const vb = layout.viewBox;
  const viewBox = `${-pan.x} ${-pan.y} ${vb.width / zoom} ${vb.height / zoom}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button
            onClick={clearHighlight}
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
        <div className="relative flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            className="h-full w-full"
            viewBox={viewBox}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          >
            {/* Edges */}
            {traceResult.edges.map((edge) => (
              <TopologyEdge
                key={edge.id}
                edge={edge}
                nodeMap={nodeMap}
                isHighlighted={highlightedEdgeIds.has(edge.id)}
              />
            ))}
            {/* Substation boxes */}
            {layout.substations.map((sub) => (
              <SubstationBox
                key={sub.substationId}
                substation={sub}
                highlightedNodeIds={highlightedNodeIds}
                sourceNodeIds={sourceNodeIds}
              />
            ))}
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
