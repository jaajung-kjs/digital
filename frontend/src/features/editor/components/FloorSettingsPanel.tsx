import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditorStore } from '../stores/editorStore';
import { dwgImportApi } from '../../../services/dwgImportApi';
import { DwgImportModal } from './DwgImportModal';
import type { FloorPlanDetail } from '../../../types/floorPlan';

interface FloorSettingsPanelProps {
  floorId: string | undefined;
  onClose: () => void;
}

/**
 * Panel for configuring room scale ratio.
 * User inputs "grid 1칸 = ?m" and we derive scaleRatio (mm/px).
 * Formula: scaleRatio = (metersPerGrid * 1000) / gridSize
 */
export function FloorSettingsPanel({ floorId, onClose }: FloorSettingsPanelProps) {
  const gridSize = useEditorStore((s) => s.gridSize);
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  const setScaleRatio = useEditorStore((s) => s.setScaleRatio);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);
  const queryClient = useQueryClient();
  const [showImportModal, setShowImportModal] = useState(false);

  // Read backgroundDrawing state from React Query cache (already loaded by useFloorPlanData)
  const floorPlan = useQuery<FloorPlanDetail>({
    queryKey: ['floorPlan', floorId],
    enabled: false, // don't refetch — read cached
  }).data;
  const hasBackground = !!floorPlan?.backgroundDrawing;
  const opacity = floorPlan?.backgroundOpacity ?? 0.3;
  const [opacityInput, setOpacityInput] = useState(opacity);

  useEffect(() => {
    setOpacityInput(opacity);
  }, [opacity]);

  const applyOpacity = async (v: number) => {
    if (!floorId) return;
    setOpacityInput(v);
    try {
      await dwgImportApi.setOpacity(floorId, v);
      await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
    } catch {
      /* noop */
    }
  };

  const handleClearBackground = async () => {
    if (!floorId) return;
    if (!confirm('임포트된 배경 도면을 제거하시겠습니까?')) return;
    await dwgImportApi.clearBackground(floorId);
    await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
  };

  // Derive metersPerGrid from current scaleRatio
  const currentMetersPerGrid =
    scaleRatio != null && scaleRatio > 0
      ? (scaleRatio * gridSize) / 1000
      : '';

  const [inputValue, setInputValue] = useState(
    currentMetersPerGrid !== '' ? String(currentMetersPerGrid) : ''
  );

  useEffect(() => {
    if (scaleRatio != null && scaleRatio > 0) {
      const val = (scaleRatio * gridSize) / 1000;
      setInputValue(String(parseFloat(val.toFixed(4))));
    }
  }, [scaleRatio, gridSize]);

  const handleApply = () => {
    const meters = parseFloat(inputValue);
    if (!isNaN(meters) && meters > 0) {
      const newScaleRatio = (meters * 1000) / gridSize; // mm/px
      setScaleRatio(newScaleRatio);
      setHasChanges(true);
    }
  };

  const handleClear = () => {
    setScaleRatio(null);
    setInputValue('');
    setHasChanges(true);
  };

  const derivedScaleRatio =
    inputValue && !isNaN(parseFloat(inputValue)) && parseFloat(inputValue) > 0
      ? (parseFloat(inputValue) * 1000) / gridSize
      : null;

  return (
    <div className="absolute top-12 right-4 z-30 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">도면 설정</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            격자 1칸 = ? m
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApply();
              }}
              className="flex-1 px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.1"
            />
            <span className="text-sm text-gray-500">m</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            (격자 크기: {gridSize}px)
          </p>
        </div>

        {derivedScaleRatio != null && (
          <div className="bg-blue-50 rounded px-3 py-2 text-xs text-blue-700">
            scaleRatio = {parseFloat(derivedScaleRatio.toFixed(2))} (1px = {parseFloat(derivedScaleRatio.toFixed(2))}mm)
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleApply}
            disabled={!inputValue || isNaN(parseFloat(inputValue)) || parseFloat(inputValue) <= 0}
            className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            적용
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-gray-600 text-sm border rounded hover:bg-gray-50"
          >
            초기화
          </button>
        </div>

        {/* ── 배경 도면(DWG) 영역 ── */}
        <div className="border-t pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-700">배경 도면</h4>
            {hasBackground && (
              <span className="text-[10px] text-gray-500 truncate max-w-[140px]" title={floorPlan?.backgroundDrawing?.source.fileName ?? ''}>
                {floorPlan?.backgroundDrawing?.source.fileName}
              </span>
            )}
          </div>

          {hasBackground ? (
            <>
              <label className="block text-xs text-gray-600 mb-1">투명도 ({Math.round(opacityInput * 100)}%)</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacityInput}
                onChange={(e) => applyOpacity(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex-1 px-3 py-1.5 text-xs border rounded hover:bg-gray-50"
                >
                  교체
                </button>
                <button
                  onClick={handleClearBackground}
                  className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
                >
                  제거
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowImportModal(true)}
              disabled={!floorId}
              className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded border-2 border-dashed border-gray-300 disabled:opacity-50"
            >
              + DWG/DXF 도면 가져오기
            </button>
          )}
        </div>
      </div>

      {showImportModal && floorId && (
        <DwgImportModal
          floorId={floorId}
          onClose={() => setShowImportModal(false)}
          onImported={() => { /* invalidation handled inside modal */ }}
        />
      )}
    </div>
  );
}
