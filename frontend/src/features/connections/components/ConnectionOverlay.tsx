import { useEffect, useMemo, useRef } from 'react';
import type { CableType, RoomConnection } from '../../../types/connection';
import { useRoomConnections } from '../hooks/useRoomConnections';
import { useMergedConnections } from '../hooks/useMergedConnections';
import { useConnectionEditorStore, setHitTestData } from '../hooks/useConnectionEditor';
import { useEditorStore, type ChangeEntry } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import {
  renderConnections,
  CABLE_COLORS,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';
import { ConnectionCreatePopover, ConnectionEditDialog } from './ConnectionEditor';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
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

  const isConnectionMode = viewMode === 'connection';

  const sourceEquipmentId = useConnectionEditorStore((s) => s.sourceEquipmentId);
  const targetEquipmentId = useConnectionEditorStore((s) => s.targetEquipmentId);
  const showEditor = useConnectionEditorStore((s) => s.showEditor);
  const editingCable = useConnectionEditorStore((s) => s.editingCable);
  const resetConnectionEditor = useConnectionEditorStore((s) => s.resetConnectionEditor);

  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);

  const changeSet = useEditorStore((s) => s.changeSet);

  const highlightActive = usePathHighlightStore((s) => s.active);
  const highlightMode = usePathHighlightStore((s) => s.mode);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);

  const { data: backendConnections } = useRoomConnections(roomId, isConnectionMode);

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

  const editorEquipmentList = useMemo(() => {
    return localEquipment.map((eq) => ({ id: eq.id, name: eq.name, category: eq.category }));
  }, [localEquipment]);

  // Build renderable connections with cable type filter applied
  const renderableConnections = useMemo(() => {
    if (!connections) return [];
    const all = mapConnectionsToRenderable(connections, equipmentPositions);
    if (connectionFilters.length === 0) return all;
    return all.filter((c) => connectionFilters.includes(c.cableType as CableType));
  }, [connections, equipmentPositions, connectionFilters]);

  // Update module-level hit-test data for useCanvasEvents double-click handling
  useEffect(() => {
    setHitTestData(renderableConnections, connections ?? []);
  }, [renderableConnections, connections]);

  // Render
  useEffect(() => {
    if (!isConnectionMode || !overlayRef.current) return;

    const canvas = overlayRef.current;
    const parentCanvas = canvasRef.current;
    if (!parentCanvas) return;

    canvas.width = parentCanvas.width;
    canvas.height = parentCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const context: ConnectionRenderContext = { ctx, zoom, panX, panY };

    // Path highlight: split into dimmed vs emphasized connections
    const isHighlighting = highlightActive && highlightMode === 'canvas';
    if (isHighlighting) {
      // Render non-highlighted connections dimmed
      const dimmed = renderableConnections.filter((c) => !c.id || !highlightedEdgeIds.has(c.id));
      const emphasized = renderableConnections.filter((c) => c.id && highlightedEdgeIds.has(c.id));

      ctx.save();
      ctx.globalAlpha = 0.15;
      renderConnections(context, dimmed);
      ctx.restore();

      // Render highlighted connections with emphasis
      const emphasizedWithHighlight = emphasized.map((c) => ({ ...c, highlighted: true }));
      renderConnections(context, emphasizedWithHighlight);

      // Draw glow rects around highlighted equipment
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

    // Highlight source equipment
    if (sourceEquipmentId) {
      const sourcePos = equipmentPositions.get(sourceEquipmentId);
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

    // Highlight target equipment
    if (targetEquipmentId) {
      const targetPos = equipmentPositions.get(targetEquipmentId);
      if (targetPos) {
        const scale = zoom / 100;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX, panY);
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(targetPos.x - 3, targetPos.y - 3, targetPos.width + 6, targetPos.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('도착', targetPos.x + targetPos.width / 2, targetPos.y - 8);
        ctx.restore();
      }
    }
  }, [isConnectionMode, renderableConnections, zoom, panX, panY, equipmentPositions, canvasRef, sourceEquipmentId, targetEquipmentId, highlightActive, highlightMode, highlightedNodeIds, highlightedEdgeIds]);

  // ESC key
  useEffect(() => {
    if (!isConnectionMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resetConnectionEditor();
        clearHighlight();
        useOfdConnectionFlowStore.getState().cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnectionMode, resetConnectionEditor, clearHighlight]);

  // Reset on leave
  useEffect(() => {
    if (!isConnectionMode) {
      resetConnectionEditor();
      clearHighlight();
      useOfdConnectionFlowStore.getState().cancel();
    }
  }, [isConnectionMode, resetConnectionEditor, clearHighlight]);

  // Clean up hit-test data when leaving connection mode
  useEffect(() => {
    if (!isConnectionMode) {
      setHitTestData([], []);
    }
  }, [isConnectionMode]);

  if (!isConnectionMode) return null;

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />

      {/* Status bar */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
        style={{ zIndex: 15 }}
      >
        {ofdPhase === 'selectingPort' && (
          <span className="text-sm text-blue-600">상세 패널에서 포트를 선택하세요</span>
        )}
        {ofdPhase === 'selectingTarget' && (
          <span className="text-sm text-green-600">대상 설비를 클릭하세요</span>
        )}
        {ofdPhase === 'idle' && !sourceEquipmentId && !editingCable && (
          <span className="text-sm text-gray-600">
            설비를 클릭하여 연결 &middot; 케이블을 더블클릭하여 수정
          </span>
        )}
        {ofdPhase === 'idle' && sourceEquipmentId && !showEditor && (
          <span className="text-sm text-blue-600">
            도착 설비를 클릭하세요{' '}
            <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-300 rounded text-gray-500">ESC</kbd>{' '}
            취소
          </span>
        )}
        {ofdPhase === 'idle' && showEditor && (
          <span className="text-sm text-green-600">케이블 타입을 선택하세요</span>
        )}
      </div>

      {/* Create popover */}
      {showEditor && sourceEquipmentId && targetEquipmentId && ofdPhase === 'idle' && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ zIndex: 25 }}
        >
          <ConnectionCreatePopover
            sourceEquipmentId={sourceEquipmentId}
            targetEquipmentId={targetEquipmentId}
            equipmentList={editorEquipmentList}
            onClose={resetConnectionEditor}
          />
        </div>
      )}

      {/* Edit dialog (double-click) */}
      {editingCable && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ zIndex: 25 }}
        >
          <ConnectionEditDialog
            cable={editingCable}
            equipmentList={editorEquipmentList}
            onClose={resetConnectionEditor}
          />
        </div>
      )}

      <ConnectionLegend />
    </>
  );
}
