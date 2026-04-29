import { useEffect, useMemo, useRef } from 'react';
import type { RoomConnection } from '../../../types/connection';
import type { FloorPlanCable } from '../../../types/floorPlan';
import { useEditorStore, type LocalCable } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { CABLE_COLORS } from '../../../types/connection';

/** Check if a cable matches the current filter set (DB category codes) */
function cableMatchesFilter(
  materialCategoryCode: string | undefined | null,
  filters: string[]
): boolean {
  if (!materialCategoryCode) return true; // no category = always show
  return filters.includes(materialCategoryCode);
}
import {
  renderConnections,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';
import { CableWaypointHandles } from './CableWaypointHandles';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useOfdConnectionFlowStore } from '../../fiber/stores/ofdConnectionFlowStore';
import { useCableHitTestStore } from '../stores/cableHitTestStore';

interface ConnectionOverlayProps {
  floorId: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function mapCablesToRenderable(
  cables: LocalCable[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];
  for (const cable of cables) {
    const sourcePos = equipmentPositions.get(cable.sourceEquipmentId);
    const targetPos = equipmentPositions.get(cable.targetEquipmentId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.materialCategoryName || cable.materialCategoryCode || undefined,
      color: cable.color || cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280',
      pathPoints: cable.pathPoints ?? undefined,
      pathLength: cable.pathLength ?? undefined,
      totalLength: cable.totalLength ?? undefined,
      materialCategoryCode: cable.materialCategoryCode ?? undefined,
    });
  }
  return result;
}

function mapPlanCablesToRenderable(
  cables: FloorPlanCable[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];
  for (const cable of cables) {
    const sourcePos = equipmentPositions.get(cable.sourceEquipmentId);
    const targetPos = equipmentPositions.get(cable.targetEquipmentId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: cable.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: cable.cableType,
      label: cable.label || cable.materialCategoryName || cable.materialCategoryCode || undefined,
      color: cable.color || cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280',
      pathPoints: cable.pathPoints ?? undefined,
      pathLength: cable.pathLength,
      totalLength: cable.totalLength,
      materialCategoryCode: cable.materialCategoryCode,
    });
  }
  return result;
}

export function ConnectionOverlay({ floorId: _roomId, canvasRef }: ConnectionOverlayProps) {
  const viewMode = useEditorStore((s) => s.viewMode);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const connectionFilters = useEditorStore((s) => s.connectionFilters);
  const selectedCableId = useEditorStore((s) => s.selectedCableId);
  const setSelectedCableId = useEditorStore((s) => s.setSelectedCableId);

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const snapshotCables = useSnapshotStore((s) => s.cables);

  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;

  const editorCables = useEditorStore((s) => s.localCables);

  const highlightActive = usePathHighlightStore((s) => s.active);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const ofdFlowPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const ofdFlowHoveredId = useOfdConnectionFlowStore((s) => s.hoveredEquipmentId);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Use localCables directly (no merge needed), or snapshot cables in preview mode
  const connections = snapshotActive ? snapshotCables : null;
  const cables = snapshotActive ? null : editorCables;

  const equipmentPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const eq of localEquipment) {
      map.set(eq.id, { x: eq.positionX, y: eq.positionY, width: eq.width, height: eq.height });
    }
    return map;
  }, [localEquipment]);

  const renderableConnections = useMemo(() => {
    const all = snapshotActive
      ? (connections ? mapPlanCablesToRenderable(connections, equipmentPositions) : [])
      : (cables ? mapCablesToRenderable(cables, equipmentPositions) : []);
    // null = filters not yet initialized → show all cables
    if (connectionFilters === null) return all;
    return all.filter((c) =>
      cableMatchesFilter(c.materialCategoryCode, connectionFilters)
    );
  }, [connections, cables, snapshotActive, equipmentPositions, connectionFilters]);

  // Build hit-test entries from connection identity only (not viewport-dependent)
  const hitTestEntries = useMemo(() => {
    const all = snapshotActive
      ? (connections ? mapPlanCablesToRenderable(connections, equipmentPositions) : [])
      : (cables ? mapCablesToRenderable(cables, equipmentPositions) : []);
    // null = filters not yet initialized → include all for hit testing
    if (connectionFilters === null) {
      return all
        .filter((c) => c.id && c.pathPoints && c.pathPoints.length >= 2)
        .map((c) => ({ id: c.id!, pathPoints: c.pathPoints! }));
    }
    return all
      .filter((c) =>
        cableMatchesFilter(c.materialCategoryCode, connectionFilters)
        && c.id && c.pathPoints && c.pathPoints.length >= 2
      )
      .map((c) => ({ id: c.id!, pathPoints: c.pathPoints! }));
  }, [connections, cables, snapshotActive, equipmentPositions, connectionFilters]);

  // Populate cable hit test store for useCanvasEvents
  const setCableHitEntries = useCableHitTestStore((s) => s.setCables);
  useEffect(() => {
    setCableHitEntries(hitTestEntries);
  }, [hitTestEntries, setCableHitEntries]);

  // Render cables on overlay canvas
  useEffect(() => {
    if (viewMode !== 'edit-2d' || !overlayRef.current) return;

    const canvas = overlayRef.current;
    const parentCanvas = canvasRef.current;
    if (!parentCanvas) return;

    canvas.width = parentCanvas.width;
    canvas.height = parentCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const context: ConnectionRenderContext = { ctx, zoom, panX, panY, selectedCableId };

    // Path highlight: show only trace cables, hide the rest
    const isHighlighting = highlightActive;
    if (isHighlighting) {
      const emphasized = renderableConnections.filter((c) => c.id && highlightedEdgeIds.has(c.id));
      const emphasizedWithHighlight = emphasized.map((c) => ({ ...c, highlighted: true }));
      renderConnections(context, emphasizedWithHighlight);

      // Glow rects around highlighted equipment
      const scale = zoom / 100;
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, panX, panY);
      for (const [eqId, pos] of equipmentPositions) {
        if (!highlightedNodeIds.has(eqId)) continue;
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - 2, pos.y - 2, pos.width + 4, pos.height + 4);
      }
      ctx.restore();
    } else {
      renderConnections(context, renderableConnections);
    }

    // OFD flow: highlight OFD source
    if (ofdFlowPhase === 'selectingTarget' && ofdFlowOfdId) {
      const ofdPos = equipmentPositions.get(ofdFlowOfdId);
      if (ofdPos) {
        const scale = zoom / 100;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX, panY);
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(ofdPos.x - 3, ofdPos.y - 3, ofdPos.width + 6, ofdPos.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('출발', ofdPos.x + ofdPos.width / 2, ofdPos.y - 8);
        ctx.restore();
      }
    }

    // OFD flow: hover highlight on target
    if (ofdFlowPhase === 'selectingTarget' && ofdFlowHoveredId && ofdFlowHoveredId !== ofdFlowOfdId) {
      const hoverPos = equipmentPositions.get(ofdFlowHoveredId);
      if (hoverPos) {
        const scale = zoom / 100;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX, panY);
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(hoverPos.x - 3, hoverPos.y - 3, hoverPos.width + 6, hoverPos.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('도착', hoverPos.x + hoverPos.width / 2, hoverPos.y - 8);
        ctx.restore();
      }
    }
  }, [viewMode, renderableConnections, zoom, panX, panY, equipmentPositions, canvasRef,
    highlightActive, highlightedNodeIds, highlightedEdgeIds,
    ofdFlowPhase, ofdFlowOfdId, ofdFlowHoveredId]);

  // ESC key: cancel creation or clear highlight
  useEffect(() => {
    if (viewMode !== 'edit-2d') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ofdFlowPhase !== 'idle') useOfdConnectionFlowStore.getState().cancel();
        if (highlightActive) clearHighlight();
        if (selectedCableId) setSelectedCableId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, ofdFlowPhase, highlightActive, clearHighlight, selectedCableId, setSelectedCableId]);

  // Find selected cable for waypoint handles
  const selectedCable = useMemo(() => {
    if (!selectedCableId) return null;
    // Build a RoomConnection-compatible shape for CableWaypointHandles
    const toWaypointCable = (c: FloorPlanCable | LocalCable): RoomConnection => ({
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId,
      targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      pathPoints: c.pathPoints ?? undefined,
      pathLength: c.pathLength ?? undefined,
      totalLength: c.totalLength ?? undefined,
      color: c.color ?? undefined,
      label: c.label ?? undefined,
      materialCategoryCode: c.materialCategoryCode ?? undefined,
      sourceEquipment: { id: c.sourceEquipmentId, name: '', rackId: null, floorId: null },
      targetEquipment: { id: c.targetEquipmentId, name: '', rackId: null, floorId: null },
    } as RoomConnection);

    if (snapshotActive && connections) {
      const found = connections.find((c) => c.id === selectedCableId);
      return found ? toWaypointCable(found) : null;
    }
    if (cables) {
      const cable = cables.find((c) => c.id === selectedCableId);
      if (!cable) return null;
      return toWaypointCable(cable);
    }
    return null;
  }, [selectedCableId, connections, cables, snapshotActive]);

  if (viewMode !== 'edit-2d') return null;

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />


      {/* Waypoint handles for selected cable */}
      {selectedCable && selectedCable.pathPoints && selectedCable.pathPoints.length >= 2 && (
        <CableWaypointHandles
          cable={selectedCable}
          zoom={zoom}
          panX={panX}
          panY={panY}
        />
      )}

      {/* Status bar: OFD connection flow */}
      {ofdFlowPhase === 'selectingTarget' && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
          style={{ zIndex: 15 }}
        >
          <span className="text-sm text-blue-600">
            연결할 설비를 클릭하세요
          </span>
        </div>
      )}

      <ConnectionLegend />
    </>
  );
}
