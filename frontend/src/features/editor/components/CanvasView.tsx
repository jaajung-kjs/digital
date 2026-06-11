import React, { useState } from 'react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasEvents } from '../hooks/useCanvasEvents';
import { useEditorStore } from '../stores/editorStore';
import { CanvasContextMenu, type CanvasContextMenuState } from './CanvasContextMenu';
import { EmptyStateGuide } from './EmptyStateGuide';
import { EditorHelpButton } from './EditorHelpButton';

interface CanvasViewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  floorPlan: FloorPlanDetail | undefined;
  floorId: string | undefined;
  /** P9: invoked when the user clicks the canvas with a rack preset armed. */
  onPlacePreset?: () => void;
  /** EmptyStateGuide step 1 의 직접 import 버튼 핸들러. */
  onImportClick?: () => void;
  children?: React.ReactNode;
}

export function CanvasView({ canvasRef, containerRef, floorPlan, floorId, onPlacePreset, onImportClick, children }: CanvasViewProps) {
  useCanvas(canvasRef, containerRef, floorPlan, floorId);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);

  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleCanvasContextMenu,
  } = useCanvasEvents(canvasRef, floorPlan, floorId, onPlacePreset, setContextMenu);

  const tool = useEditorStore((s) => s.tool);
  const isPanning = useEditorStore((s) => s.isPanning);
  const isSpacePressed = useEditorStore((s) => s.isSpacePressed);

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="flex-1 relative overflow-hidden bg-surface-2">
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onContextMenu={handleCanvasContextMenu}
        className={`${
          isPanning ? 'cursor-grabbing' :
          isSpacePressed ? 'cursor-grab' :
          tool === 'select' ? 'cursor-default' :
          'cursor-crosshair'
        }`}
      />

      <EmptyStateGuide floorPlan={floorPlan} floorId={floorId} onImportClick={onImportClick} />

      {/* 도움말 — 캔버스 우하단 단독 버튼 (뷰 컨트롤은 하단 상태바로 일원화됨).
          상태바(~30px) 위에 떠 있도록 bottom-10. */}
      <div className="absolute bottom-10 right-3 bg-surface/95 backdrop-blur shadow-sm border border-line rounded-lg flex items-center h-8 px-1">
        <EditorHelpButton />
      </div>

      {children}

      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
