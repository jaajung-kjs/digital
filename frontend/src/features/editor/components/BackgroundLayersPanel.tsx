import { useMemo, useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import type { BackgroundDrawing } from '../../../types/floorPlan';

/**
 * DWG-C — CAD-style layer panel for the imported BackgroundDrawing.
 *
 * Lets the user hide/show individual layers on the canvas without
 * re-importing. Visibility is purely a client-side overlay over
 * `layer.isVisible` (which reflects the source DWG's frozen/off state at
 * import time) — toggling does not mutate the stored drawing data.
 */

interface Props {
  bg: BackgroundDrawing;
  onClose?: () => void;
}

export function BackgroundLayersPanel({ bg, onClose }: Props) {
  const hiddenBgLayers = useEditorStore((s) => s.hiddenBgLayers);
  const toggleBgLayerVisibility = useEditorStore((s) => s.toggleBgLayerVisibility);
  const showAllBgLayers = useEditorStore((s) => s.showAllBgLayers);
  const hideAllBgLayers = useEditorStore((s) => s.hideAllBgLayers);
  const [search, setSearch] = useState('');

  // Entity count per layer (paths + texts + filled). Pre-computed so the
  // sort/render pass stays cheap.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of bg.paths) m.set(p.layer, (m.get(p.layer) ?? 0) + 1);
    for (const t of bg.texts) m.set(t.layer, (m.get(t.layer) ?? 0) + 1);
    for (const f of bg.filled) m.set(f.layer, (m.get(f.layer) ?? 0) + 1);
    return m;
  }, [bg]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? bg.layers.filter((l) => l.name.toLowerCase().includes(q))
      : bg.layers;
  }, [bg.layers, search]);

  // Sort by entity count desc — busiest layers float to the top.
  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0),
    );
  }, [filtered, counts]);

  const allLayerNames = useMemo(
    () => bg.layers.map((l) => l.name),
    [bg.layers],
  );

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[300px] bg-white border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <h3 className="text-sm font-bold text-gray-900">배경 레이어</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 text-gray-500"
            title="닫기"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2 shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색"
          className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={() => showAllBgLayers()}
          className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
          title="전체 표시"
        >
          전체
        </button>
        <button
          onClick={() => hideAllBgLayers(allLayerNames)}
          className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
          title="전체 숨김"
        >
          숨김
        </button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sorted.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-400">
            레이어가 없습니다.
          </div>
        )}
        {sorted.map((layer) => {
          const count = counts.get(layer.name) ?? 0;
          // A layer is hidden if either the user toggled it off OR the source
          // DWG had it frozen/off at import time.
          const hidden = hiddenBgLayers.has(layer.name) || !layer.isVisible;
          return (
            <button
              key={layer.name}
              onClick={() => toggleBgLayerVisibility(layer.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 border-b border-gray-100 ${
                hidden ? 'opacity-40' : ''
              }`}
              title={`${layer.name} (${count}개) — ${hidden ? '숨김' : '표시'}`}
            >
              {/* Eye icon */}
              <span className="w-4 h-4 flex-shrink-0 text-gray-500">
                {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </span>
              {/* Color swatch */}
              <span
                className="w-3 h-3 flex-shrink-0 rounded-sm border border-gray-300"
                style={{ backgroundColor: layer.color }}
              />
              {/* Name */}
              <span className="flex-1 text-left text-gray-800 truncate">
                {layer.name}
              </span>
              {/* Entity count */}
              <span className="flex-shrink-0 text-[10px] text-gray-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

