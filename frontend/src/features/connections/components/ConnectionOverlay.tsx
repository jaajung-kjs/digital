import { useEffect, useRef } from 'react';
import type { ViewMode } from '../../../types/floorPlan';
import type { RoomConnection } from '../../../types/connection';
import { useRoomConnections } from '../hooks/useRoomConnections';
import { useEditorStore } from '../../editor/stores/editorStore';
import {
  renderConnections,
  CABLE_COLORS,
  type RenderableConnection,
  type ConnectionRenderContext,
} from '../../editor/renderers/connectionRenderer';
import { ConnectionLegend } from './ConnectionLegend';

interface ConnectionOverlayProps {
  roomId: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** Map equipment positions from the editor's localRacks */
function mapConnectionsToRenderable(
  connections: RoomConnection[],
  rackPositions: Map<string, { x: number; y: number; width: number; height: number }>
): RenderableConnection[] {
  const result: RenderableConnection[] = [];

  for (const conn of connections) {
    const sourcePos = rackPositions.get(conn.sourcePort.equipmentId);
    const targetPos = rackPositions.get(conn.targetPort.equipmentId);

    if (!sourcePos || !targetPos) continue;

    const color =
      conn.cable.color || CABLE_COLORS[conn.cable.cableType] || '#6b7280';

    result.push({
      sourceX: sourcePos.x + sourcePos.width / 2,
      sourceY: sourcePos.y + sourcePos.height / 2,
      targetX: targetPos.x + targetPos.width / 2,
      targetY: targetPos.y + targetPos.height / 2,
      cableType: conn.cable.cableType,
      label: conn.cable.label,
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
  const localRacks = useEditorStore((s) => s.localRacks);

  const isConnectionMode = viewMode.startsWith('connection-');

  const { data: connections } = useRoomConnections(roomId, isConnectionMode);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Build rack positions map
  const rackPositions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  for (const rack of localRacks) {
    rackPositions.set(rack.id, {
      x: rack.positionX,
      y: rack.positionY,
      width: rack.width,
      height: rack.height,
    });
  }

  useEffect(() => {
    if (!isConnectionMode || !connections || !overlayRef.current) return;

    const canvas = overlayRef.current;
    const parentCanvas = canvasRef.current;
    if (!parentCanvas) return;

    // Match overlay canvas size to main canvas
    canvas.width = parentCanvas.width;
    canvas.height = parentCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderableConnections = mapConnectionsToRenderable(
      connections,
      rackPositions
    );

    const context: ConnectionRenderContext = {
      ctx,
      zoom,
      panX,
      panY,
      viewMode: viewMode as ConnectionRenderContext['viewMode'],
    };

    renderConnections(context, renderableConnections);
  }, [isConnectionMode, connections, zoom, panX, panY, viewMode, localRacks, canvasRef]);

  if (!isConnectionMode) return null;

  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />
      <ConnectionLegend viewMode={viewMode as ViewMode} />
    </>
  );
}
