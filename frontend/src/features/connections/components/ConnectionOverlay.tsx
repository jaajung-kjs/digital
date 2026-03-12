import { useEffect, useMemo, useRef } from 'react';
import type { ViewMode } from '../../../types/floorPlan';
import type { CableType, RoomConnection } from '../../../types/connection';
import { useRoomConnections } from '../hooks/useRoomConnections';
import { useMergedConnections } from '../hooks/useMergedConnections';
import { useConnectionEditorStore } from '../hooks/useConnectionEditor';
import { useEditorStore, type ChangeEntry } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import {
  renderConnections,
  CABLE_COLORS,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';
import { ConnectionEditor } from './ConnectionEditor';

interface ConnectionOverlayProps {
  roomId: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** Map equipment positions to renderable connections */
function mapConnectionsToRenderable(
  connections: RoomConnection[],
  equipmentPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];

  for (const conn of connections) {
    const sourcePos = equipmentPositions.get(conn.sourceEquipmentId);
    const targetPos = equipmentPositions.get(conn.targetEquipmentId);

    if (!sourcePos || !targetPos) continue;

    const color =
      conn.color || CABLE_COLORS[conn.cableType] || '#6b7280';

    result.push({
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: conn.cableType,
      label: conn.label,
      color,
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

  // Branch data source: snapshot overlay vs editor
  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;

  const isConnectionMode = viewMode.startsWith('connection-');

  const sourceEquipmentId = useConnectionEditorStore((s) => s.sourceEquipmentId);
  const targetEquipmentId = useConnectionEditorStore((s) => s.targetEquipmentId);
  const showEditor = useConnectionEditorStore((s) => s.showEditor);
  const resetConnectionEditor = useConnectionEditorStore(
    (s) => s.resetConnectionEditor
  );

  const changeSet = useEditorStore((s) => s.changeSet);

  const { data: backendConnections } = useRoomConnections(roomId, isConnectionMode);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // In snapshot mode, skip merge computation entirely — use snapshot cables directly
  const emptyChangeSet = useMemo(() => [] as ChangeEntry[], []);
  const mergedConnections = useMergedConnections(
    snapshotActive ? undefined : backendConnections,
    snapshotActive ? emptyChangeSet : changeSet,
    localEquipment,
  );
  const connections = snapshotActive ? snapshotCables : mergedConnections;

  // Build equipment positions map
  const equipmentPositions = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();
    for (const eq of localEquipment) {
      map.set(eq.id, {
        x: eq.positionX,
        y: eq.positionY,
        width: eq.width,
        height: eq.height,
      });
    }
    return map;
  }, [localEquipment]);

  // Build equipment list for the editor from localEquipment directly
  const editorEquipmentList = useMemo(() => {
    return localEquipment.map((eq) => ({ id: eq.id, name: eq.name }));
  }, [localEquipment]);

  // Render connections and source equipment highlight
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

    if (connections) {
      const renderableConnections = mapConnectionsToRenderable(
        connections,
        equipmentPositions
      );

      // Apply user cable type filters
      const userFiltered = connectionFilters.length > 0
        ? renderableConnections.filter((c) => connectionFilters.includes(c.cableType as CableType))
        : renderableConnections;

      const context: ConnectionRenderContext = {
        ctx,
        zoom,
        panX,
        panY,
        viewMode: viewMode as ConnectionRenderContext['viewMode'],
      };

      renderConnections(context, userFiltered);
    }

    // Highlight source equipment with dashed blue border
    if (sourceEquipmentId) {
      const sourcePos = equipmentPositions.get(sourceEquipmentId);
      if (sourcePos) {
        const scale = zoom / 100;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX, panY);

        // Glow effect
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(
          sourcePos.x - 3,
          sourcePos.y - 3,
          sourcePos.width + 6,
          sourcePos.height + 6
        );
        ctx.setLineDash([]);

        // Source label
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          '출발',
          sourcePos.x + sourcePos.width / 2,
          sourcePos.y - 8
        );

        ctx.restore();
      }
    }

    // Highlight target equipment with green border when selected
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
        ctx.strokeRect(
          targetPos.x - 3,
          targetPos.y - 3,
          targetPos.width + 6,
          targetPos.height + 6
        );
        ctx.setLineDash([]);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          '도착',
          targetPos.x + targetPos.width / 2,
          targetPos.y - 8
        );

        ctx.restore();
      }
    }
  }, [
    isConnectionMode,
    connections,
    zoom,
    panX,
    panY,
    viewMode,
    equipmentPositions,
    canvasRef,
    sourceEquipmentId,
    targetEquipmentId,
    connectionFilters,
  ]);

  // ESC key to cancel connection editor flow
  useEffect(() => {
    if (!isConnectionMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resetConnectionEditor();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnectionMode, resetConnectionEditor]);

  // Reset connection editor when leaving connection mode
  useEffect(() => {
    if (!isConnectionMode) {
      resetConnectionEditor();
    }
  }, [isConnectionMode, resetConnectionEditor]);

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
        {!sourceEquipmentId && (
          <span className="text-sm text-gray-600">
            설비를 클릭하여 연결을 시작하세요
          </span>
        )}
        {sourceEquipmentId && !showEditor && (
          <span className="text-sm text-blue-600">
            도착 설비를 클릭하세요{' '}
            <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-300 rounded text-gray-500">
              ESC
            </kbd>{' '}
            취소
          </span>
        )}
        {showEditor && (
          <span className="text-sm text-green-600">
            케이블 정보를 입력하세요
          </span>
        )}
      </div>

      {/* Connection Editor popup */}
      {showEditor && sourceEquipmentId && targetEquipmentId && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ zIndex: 25 }}
        >
          <ConnectionEditor
            roomId={roomId}
            equipmentList={editorEquipmentList}
            defaultSourceId={sourceEquipmentId}
            defaultTargetId={targetEquipmentId}
            onClose={resetConnectionEditor}
          />
        </div>
      )}

      <ConnectionLegend viewMode={viewMode as ViewMode} />
    </>
  );
}
