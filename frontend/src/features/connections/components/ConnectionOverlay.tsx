import { useEffect, useMemo, useRef } from 'react';
import type { CableType, RoomConnection } from '../../../types/connection';
import { useRoomConnections } from '../hooks/useRoomConnections';
import { useMergedConnections } from '../hooks/useMergedConnections';
import { useEditorStore, type ChangeEntry } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { CABLE_COLORS } from '../../../types/connection';
import {
  renderConnections,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useConnectionCreationStore } from '../stores/connectionCreationStore';
import { useOfdConnectionFlowStore } from '../../fiber/stores/ofdConnectionFlowStore';

interface ConnectionOverlayProps {
  roomId: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function mapConnectionsToRenderable(
  connections: RoomConnection[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];
  for (const conn of connections) {
    const sourcePos = equipmentPositions.get(conn.sourceEquipmentId);
    const targetPos = equipmentPositions.get(conn.targetEquipmentId);
    if (!sourcePos || !targetPos) continue;
    result.push({
      id: conn.id,
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: conn.cableType,
      label: conn.label,
      color: conn.color || CABLE_COLORS[conn.cableType] || '#6b7280',
    });
  }
  return result;
}

export function ConnectionOverlay({ roomId, canvasRef }: ConnectionOverlayProps) {
  const viewMode = useEditorStore((s) => s.viewMode);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const connectionFilters = useEditorStore((s) => s.connectionFilters);

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const snapshotCables = useSnapshotStore((s) => s.cables);

  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;

  const changeSet = useEditorStore((s) => s.changeSet);

  const highlightActive = usePathHighlightStore((s) => s.active);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const creationPhase = useConnectionCreationStore((s) => s.phase);
  const creationSourceId = useConnectionCreationStore((s) => s.sourceEquipmentId);
  const hoveredEquipmentId = useConnectionCreationStore((s) => s.hoveredEquipmentId);
  const cancelCreation = useConnectionCreationStore((s) => s.cancel);

  const ofdFlowPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const ofdFlowHoveredId = useOfdConnectionFlowStore((s) => s.hoveredEquipmentId);

  const { data: backendConnections } = useRoomConnections(roomId, viewMode === 'edit-2d');

  const overlayRef = useRef<HTMLCanvasElement>(null);

  const emptyChangeSet = useMemo(() => [] as ChangeEntry[], []);
  const mergedConnections = useMergedConnections(
    snapshotActive ? undefined : backendConnections,
    snapshotActive ? emptyChangeSet : changeSet,
    localEquipment,
  );
  const connections = snapshotActive ? snapshotCables : mergedConnections;

  const equipmentPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const eq of localEquipment) {
      map.set(eq.id, { x: eq.positionX, y: eq.positionY, width: eq.width, height: eq.height });
    }
    return map;
  }, [localEquipment]);

  const renderableConnections = useMemo(() => {
    if (!connections) return [];
    const all = mapConnectionsToRenderable(connections, equipmentPositions);
    if (connectionFilters.length === 0) return [];
    return all.filter((c) => connectionFilters.includes(c.cableType as CableType));
  }, [connections, equipmentPositions, connectionFilters]);

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

    const context: ConnectionRenderContext = { ctx, zoom, panX, panY };

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

    // Connection creation: highlight source equipment
    if (creationPhase === 'selectingTarget' && creationSourceId) {
      const sourcePos = equipmentPositions.get(creationSourceId);
      if (sourcePos) {
        const scale = zoom / 100;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX, panY);
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(sourcePos.x - 3, sourcePos.y - 3, sourcePos.width + 6, sourcePos.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('출발', sourcePos.x + sourcePos.width / 2, sourcePos.y - 8);
        ctx.restore();
      }
    }

    // Connection creation: hover highlight on target
    if (creationPhase === 'selectingTarget' && hoveredEquipmentId && hoveredEquipmentId !== creationSourceId) {
      const hoverPos = equipmentPositions.get(hoveredEquipmentId);
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
    creationPhase, creationSourceId, hoveredEquipmentId,
    ofdFlowPhase, ofdFlowOfdId, ofdFlowHoveredId]);

  // ESC key: cancel creation or clear highlight
  useEffect(() => {
    if (viewMode !== 'edit-2d') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (creationPhase !== 'idle') cancelCreation();
        if (ofdFlowPhase !== 'idle') useOfdConnectionFlowStore.getState().cancel();
        if (highlightActive) clearHighlight();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, creationPhase, cancelCreation, ofdFlowPhase, highlightActive, clearHighlight]);

  if (viewMode !== 'edit-2d') return null;

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />

      {/* Status bar: connection creation mode */}
      {creationPhase === 'selectingTarget' && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
          style={{ zIndex: 15 }}
        >
          <span className="text-sm text-blue-600">
            연결할 설비를 클릭하세요
          </span>
        </div>
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
