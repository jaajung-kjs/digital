import { useState, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';

interface RoomSettingsPanelProps {
  onClose: () => void;
}

/**
 * Panel for configuring room scale ratio.
 * User inputs "grid 1칸 = ?m" and we derive scaleRatio (mm/px).
 * Formula: scaleRatio = (metersPerGrid * 1000) / gridSize
 */
export function FloorSettingsPanel({ onClose }: RoomSettingsPanelProps) {
  const gridSize = useEditorStore((s) => s.gridSize);
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  const setScaleRatio = useEditorStore((s) => s.setScaleRatio);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

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
      </div>
    </div>
  );
}
