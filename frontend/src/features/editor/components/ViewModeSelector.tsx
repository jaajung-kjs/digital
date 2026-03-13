import type { ViewMode } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'edit-2d', label: '2D편집' },
  { value: 'view-3d', label: '3D뷰' },
  { value: 'connection', label: '연결' },
];

export function ViewModeSelector() {
  const viewMode = useEditorStore(s => s.viewMode);
  const setViewMode = useEditorStore(s => s.setViewMode);

  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      {VIEW_MODES.map(mode => (
        <button
          key={mode.value}
          onClick={() => setViewMode(mode.value)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            viewMode === mode.value
              ? 'bg-white text-blue-600 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
