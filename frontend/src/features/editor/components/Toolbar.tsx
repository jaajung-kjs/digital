import { Link } from 'react-router-dom';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { RoomDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import {
  createPropertyUpdater as updateElementProperty,
  createRotateUpdater,
  createFlipHUpdater,
  createFlipVUpdater,
  createIncreaseStrokeWidthUpdater,
  createDecreaseStrokeWidthUpdater,
  createIncreaseFontSizeUpdater,
  createDecreaseFontSizeUpdater,
  createToggleFontWeightUpdater,
  hasProperty,
  getPropertyValue,
  STROKE_WIDTH_PRESETS,
  FONT_SIZE_PRESETS,
} from '../../../utils/floorplan/elementSystem';

interface ToolbarProps {
  room: RoomDetail | undefined;
  floorPlan: FloorPlanDetail | undefined;
  isAdmin: boolean;
  handleSave: () => void;
  isSaving: boolean;
}

export function Toolbar({ room, floorPlan, isAdmin, handleSave, isSaving }: ToolbarProps) {
  const {
    selectedElement, localElements, hasChanges, showLengths,
    setLocalElements, setHasChanges, setShowLengths,
  } = useEditorStore();
  const { undo, redo, canUndo, canRedo } = useEditorHistory();

  return (
    <div className="shrink-0 bg-white border-b px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{room?.name} 평면도</h1>
          {floorPlan && <p className="text-xs text-gray-500">버전 {floorPlan.version}</p>}
        </div>
      </div>

      {floorPlan && isAdmin && (
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <button onClick={undo} disabled={!canUndo} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" title="실행 취소 (Ctrl+Z)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" title="다시 실행 (Ctrl+Y)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>

          <div className="border-l h-6 mx-2" />

          <div className="flex items-center gap-1">
            {/* Rotate */}
            <button
              onClick={() => {
                if (!selectedElement) return;
                const updater = createRotateUpdater(selectedElement);
                if (updater) { setLocalElements(updater); setHasChanges(true); }
              }}
              disabled={!hasProperty(selectedElement, 'rotation')}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="회전 90° (Q)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Flip H */}
            <button
              onClick={() => {
                if (!selectedElement) return;
                const updater = createFlipHUpdater(selectedElement);
                if (updater) { setLocalElements(updater); setHasChanges(true); }
              }}
              disabled={!hasProperty(selectedElement, 'flipH')}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="수평 반전 (H)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 5h8m-8 5h8M12 3v18" />
              </svg>
            </button>

            {/* Flip V */}
            <button
              onClick={() => {
                if (!selectedElement) return;
                const updater = createFlipVUpdater(selectedElement);
                if (updater) { setLocalElements(updater); setHasChanges(true); }
              }}
              disabled={!hasProperty(selectedElement, 'flipV')}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="수직 반전 (F)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V8m5-5v18m5-13v8" />
              </svg>
            </button>

            <div className="border-l h-5 mx-1" />

            {/* Stroke Width */}
            <div className="flex items-center border rounded h-7 overflow-hidden">
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createDecreaseStrokeWidthUpdater(selectedElement);
                  if (updater) { setLocalElements(updater); setHasChanges(true); }
                }}
                disabled={!hasProperty(selectedElement, 'strokeWidth')}
                className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="굵기 감소"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M20 12H4" /></svg>
              </button>
              <select
                value={getPropertyValue(selectedElement, 'strokeWidth', 2)}
                onChange={(e) => {
                  if (!selectedElement) return;
                  setLocalElements(updateElementProperty(selectedElement.id, 'strokeWidth', parseInt(e.target.value)));
                  setHasChanges(true);
                }}
                disabled={!hasProperty(selectedElement, 'strokeWidth')}
                className="h-full text-xs px-1 border-0 bg-transparent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
                title="선 굵기"
              >
                {STROKE_WIDTH_PRESETS.map(w => <option key={w} value={w}>{w}px</option>)}
              </select>
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createIncreaseStrokeWidthUpdater(selectedElement);
                  if (updater) { setLocalElements(updater); setHasChanges(true); }
                }}
                disabled={!hasProperty(selectedElement, 'strokeWidth')}
                className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="굵기 증가"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>

            {/* Stroke Color */}
            <input
              type="color"
              value={getPropertyValue(selectedElement, 'strokeColor', '#1a1a1a')}
              onChange={(e) => {
                if (!selectedElement) return;
                setLocalElements(updateElementProperty(selectedElement.id, 'strokeColor', e.target.value));
                setHasChanges(true);
              }}
              disabled={!hasProperty(selectedElement, 'strokeColor')}
              className="w-7 h-7 border rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="선 색상"
            />

            {/* Fill Color */}
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={(() => {
                  const fill = getPropertyValue<string>(selectedElement, 'fillColor', '');
                  return (!fill || fill === 'transparent') ? '#ffffff' : fill;
                })()}
                onChange={(e) => {
                  if (!selectedElement) return;
                  setLocalElements(updateElementProperty(selectedElement.id, 'fillColor', e.target.value));
                  setHasChanges(true);
                }}
                disabled={!hasProperty(selectedElement, 'fillColor') || getPropertyValue<string>(selectedElement, 'fillColor', '') === 'transparent'}
                className="w-7 h-7 border rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="채움 색상"
              />
              <label className="flex items-center gap-0.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={getPropertyValue<string>(selectedElement, 'fillColor', '') === 'transparent'}
                  onChange={(e) => {
                    if (!selectedElement) return;
                    setLocalElements(updateElementProperty(selectedElement.id, 'fillColor', e.target.checked ? 'transparent' : '#ffffff'));
                    setHasChanges(true);
                  }}
                  disabled={!hasProperty(selectedElement, 'fillColor')}
                  className="w-3 h-3"
                />
                투명
              </label>
            </div>

            <div className="border-l h-5 mx-1" />

            {/* Font Size */}
            <div className="flex items-center border rounded h-7 overflow-hidden">
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createDecreaseFontSizeUpdater(selectedElement);
                  if (updater) { setLocalElements(updater); setHasChanges(true); }
                }}
                disabled={selectedElement?.elementType !== 'text'}
                className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="크기 감소"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M20 12H4" /></svg>
              </button>
              <select
                value={selectedElement?.elementType === 'text' ? getPropertyValue(selectedElement, 'fontSize', 14) : 14}
                onChange={(e) => {
                  if (!selectedElement) return;
                  setLocalElements(updateElementProperty(selectedElement.id, 'fontSize', parseInt(e.target.value)));
                  setHasChanges(true);
                }}
                disabled={selectedElement?.elementType !== 'text'}
                className="h-full text-xs px-1 border-0 bg-transparent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
                title="텍스트 크기"
              >
                {FONT_SIZE_PRESETS.map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const updater = createIncreaseFontSizeUpdater(selectedElement);
                  if (updater) { setLocalElements(updater); setHasChanges(true); }
                }}
                disabled={selectedElement?.elementType !== 'text'}
                className="w-6 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="크기 증가"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>

            {/* Font Weight */}
            <button
              onClick={() => {
                if (!selectedElement) return;
                const updater = createToggleFontWeightUpdater(selectedElement);
                if (updater) { setLocalElements(updater); setHasChanges(true); }
              }}
              disabled={selectedElement?.elementType !== 'text'}
              className={`p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed ${
                selectedElement?.elementType === 'text' && getPropertyValue<string>(selectedElement, 'fontWeight', '') === 'bold'
                  ? 'bg-gray-200'
                  : 'hover:bg-gray-100'
              }`}
              title="텍스트 굵게"
            >
              <span className="font-bold text-sm">B</span>
            </button>

            {/* Stroke Style */}
            <select
              value={getPropertyValue(selectedElement, 'strokeStyle', 'solid')}
              onChange={(e) => {
                if (!selectedElement) return;
                setLocalElements(updateElementProperty(selectedElement.id, 'strokeStyle', e.target.value));
                setHasChanges(true);
              }}
              disabled={!hasProperty(selectedElement, 'strokeStyle')}
              className="h-7 text-xs border rounded px-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="선 스타일"
            >
              <option value="solid">실선</option>
              <option value="dashed">점선</option>
              <option value="dotted">점</option>
            </select>

            <div className="border-l h-5 mx-1" />

            {/* Layer ordering */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const maxZ = Math.max(...localElements.map(e => e.zIndex));
                  setLocalElements(prev => prev.map(el =>
                    el.id === selectedElement.id ? { ...el, zIndex: maxZ + 1 } : el
                  ));
                  setHasChanges(true);
                }}
                disabled={!selectedElement}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="맨 앞으로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const currentZ = selectedElement.zIndex;
                  const higherElements = localElements.filter(e => e.zIndex > currentZ);
                  if (higherElements.length === 0) return;
                  const nextZ = Math.min(...higherElements.map(e => e.zIndex));
                  setLocalElements(prev => prev.map(el => {
                    if (el.id === selectedElement.id) return { ...el, zIndex: nextZ + 1 };
                    if (el.zIndex === nextZ) return { ...el, zIndex: currentZ };
                    return el;
                  }));
                  setHasChanges(true);
                }}
                disabled={!selectedElement}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="앞으로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const currentZ = selectedElement.zIndex;
                  const lowerElements = localElements.filter(e => e.zIndex < currentZ);
                  if (lowerElements.length === 0) return;
                  const prevZ = Math.max(...lowerElements.map(e => e.zIndex));
                  setLocalElements(prev => prev.map(el => {
                    if (el.id === selectedElement.id) return { ...el, zIndex: prevZ - 1 };
                    if (el.zIndex === prevZ) return { ...el, zIndex: currentZ };
                    return el;
                  }));
                  setHasChanges(true);
                }}
                disabled={!selectedElement}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="뒤로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (!selectedElement) return;
                  const minZ = Math.min(...localElements.map(e => e.zIndex));
                  setLocalElements(prev => prev.map(el =>
                    el.id === selectedElement.id ? { ...el, zIndex: minZ - 1 } : el
                  ));
                  setHasChanges(true);
                }}
                disabled={!selectedElement}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="맨 뒤로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-l h-6 mx-2" />

          {/* Length toggle */}
          <button
            onClick={() => setShowLengths(!showLengths)}
            className={`p-2 rounded-lg flex items-center gap-1 text-xs ${
              showLengths ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
            }`}
            title="픽셀 길이 표시 (선/원/사각형/랙)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>px</span>
          </button>

          <div className="border-l h-6 mx-2" />

          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  );
}
