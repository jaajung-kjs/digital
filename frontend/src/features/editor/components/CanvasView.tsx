import React from 'react';
import type { FloorPlanDetail, FloorPlanElement, TextProperties } from '../../../types/floorPlan';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasEvents } from '../hooks/useCanvasEvents';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorHistory } from '../hooks/useEditorHistory';

interface CanvasViewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  floorPlan: FloorPlanDetail | undefined;
  roomId: string | undefined;
}

export function CanvasView({ canvasRef, containerRef, floorPlan, roomId }: CanvasViewProps) {
  useCanvas(canvasRef, containerRef, floorPlan);
  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasClick,
    handleCanvasDoubleClick,
  } = useCanvasEvents(canvasRef, floorPlan, roomId);

  const { pushHistory } = useEditorHistory();

  const tool = useEditorStore(s => s.tool);
  const zoom = useEditorStore(s => s.zoom);
  const panX = useEditorStore(s => s.panX);
  const panY = useEditorStore(s => s.panY);
  const showGrid = useEditorStore(s => s.showGrid);
  const gridSnap = useEditorStore(s => s.gridSnap);
  const majorGridSize = useEditorStore(s => s.majorGridSize);
  const setViewport = useEditorStore(s => s.setViewport);
  const setShowGrid = useEditorStore(s => s.setShowGrid);
  const setGridSnap = useEditorStore(s => s.setGridSnap);
  const setMajorGridSize = useEditorStore(s => s.setMajorGridSize);
  const setHasChanges = useEditorStore(s => s.setHasChanges);
  const setLocalElements = useEditorStore(s => s.setLocalElements);
  const localElements = useEditorStore(s => s.localElements);
  const localRacks = useEditorStore(s => s.localRacks);

  const isPanning = useCanvasStore(s => s.isPanning);
  const isSpacePressed = useCanvasStore(s => s.isSpacePressed);
  const isEditingText = useCanvasStore(s => s.isEditingText);
  const textInputPosition = useCanvasStore(s => s.textInputPosition);
  const textInputValue = useCanvasStore(s => s.textInputValue);
  const setIsEditingText = useCanvasStore(s => s.setIsEditingText);
  const setTextInputPosition = useCanvasStore(s => s.setTextInputPosition);
  const setTextInputValue = useCanvasStore(s => s.setTextInputValue);
  const setTool = useEditorStore(s => s.setTool);

  const createTextElement = (text: string) => {
    if (!textInputPosition || !text.trim()) return;
    const newText: FloorPlanElement = {
      id: `temp-${Date.now()}`,
      elementType: 'text',
      properties: {
        x: textInputPosition.x,
        y: textInputPosition.y,
        text,
        fontSize: 14,
        fontWeight: 'normal',
        color: '#1a1a1a',
        rotation: 0,
        textAlign: 'left',
      } as TextProperties,
      zIndex: localElements.length,
      isVisible: true,
      isLocked: false,
    };
    const newElements = [...localElements, newText];
    setLocalElements(newElements);
    pushHistory(newElements, localRacks);
    setHasChanges(true);
    setTool('select');
  };

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="flex-1 relative overflow-hidden bg-gray-200">
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        className={`${
          isPanning ? 'cursor-grabbing' :
          isSpacePressed ? 'cursor-grab' :
          tool === 'select' ? 'cursor-default' :
          tool === 'delete' ? 'cursor-not-allowed' :
          'cursor-crosshair'
        }`}
      />

      {/* Zoom controls (top-right) */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-1 gap-0.5">
          <button
            onClick={() => setViewport(Math.max(10, zoom - 10), panX, panY)}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            title="축소"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M20 12H4" /></svg>
          </button>
          <div
            className="w-14 h-6 flex items-center justify-center text-xs font-mono text-gray-700 cursor-pointer hover:bg-gray-100 rounded"
            onClick={() => setViewport(100, panX, panY)}
            title="100%로 리셋 (클릭)"
          >
            {zoom}%
          </div>
          <button
            onClick={() => setViewport(Math.min(1000, zoom + 10), panX, panY)}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            title="확대"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 4v16m8-8H4" /></svg>
          </button>
          <div className="w-px h-4 bg-gray-300 mx-0.5" />
          <select
            value=""
            onChange={(e) => { if (e.target.value) setViewport(parseInt(e.target.value), panX, panY); }}
            className="w-6 h-6 bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded cursor-pointer appearance-none text-center text-xs"
            title="줌 프리셋"
          >
            <option value="" className="bg-white">&#9662;</option>
            <option value="10" className="bg-white">10%</option>
            <option value="25" className="bg-white">25%</option>
            <option value="50" className="bg-white">50%</option>
            <option value="100" className="bg-white">100%</option>
            <option value="200" className="bg-white">200%</option>
            <option value="400" className="bg-white">400%</option>
          </select>
        </div>

        {/* Grid/Snap toggles */}
        <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-0.5">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              showGrid ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={`그리드 ${showGrid ? 'ON' : 'OFF'} (G)`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
            </svg>
          </button>
          <button
            onClick={() => setGridSnap(!gridSnap)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              gridSnap ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={`스냅 ${gridSnap ? 'ON' : 'OFF'} (S)`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M4 12h4m8 0h4M12 4v4m0 8v4" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>

        {/* Grid size */}
        <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-2 gap-1">
          <span className="text-xs text-gray-500">Grid</span>
          <input
            type="number"
            value={majorGridSize}
            onChange={(e) => {
              const value = Math.max(10, Math.min(200, Number(e.target.value) || 60));
              setMajorGridSize(value);
              setHasChanges(true);
            }}
            className="w-12 h-6 px-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:border-blue-400"
            min={10} max={200} step={10}
            title={`그리드 크기 (Major: ${majorGridSize}px, Minor: 10px)`}
          />
          <span className="text-xs text-gray-400">px</span>
        </div>
      </div>

      {/* Text input overlay */}
      {isEditingText && textInputPosition && (
        <div
          className="absolute"
          style={{
            left: textInputPosition.x * (zoom / 100) + panX,
            top: textInputPosition.y * (zoom / 100) + panY,
          }}
        >
          <input
            type="text"
            autoFocus
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textInputValue.trim()) {
                createTextElement(textInputValue);
                setIsEditingText(false);
                setTextInputPosition(null);
                setTextInputValue('');
              } else if (e.key === 'Escape') {
                setIsEditingText(false);
                setTextInputPosition(null);
                setTextInputValue('');
              }
            }}
            onBlur={() => {
              if (textInputValue.trim()) {
                createTextElement(textInputValue);
              }
              setIsEditingText(false);
              setTextInputPosition(null);
              setTextInputValue('');
            }}
            className="px-2 py-1 border border-blue-500 rounded text-sm outline-none bg-white shadow-lg min-w-[120px]"
            placeholder="텍스트 입력..."
          />
        </div>
      )}
    </div>
  );
}
