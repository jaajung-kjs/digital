import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { SidePanel } from './SidePanel';
import { useEditorStore } from '../stores/editorStore';
import type { BackgroundDrawing, FloorPlanDetail } from '../../../types/floorPlan';

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
  /** 도면 크기 readout 및 파일명 표시용. */
  floorPlan?: FloorPlanDetail;
  /** 배경 도면 제거 가능 여부. */
  canEdit?: boolean;
}

export function BackgroundLayersPanel({ bg, onClose, floorPlan, canEdit = false }: Props) {
  const hiddenBgLayers = useEditorStore((s) => s.hiddenBgLayers);
  const toggleBgLayerVisibility = useEditorStore((s) => s.toggleBgLayerVisibility);
  const showAllBgLayers = useEditorStore((s) => s.showAllBgLayers);
  const hideAllBgLayers = useEditorStore((s) => s.hideAllBgLayers);
  const stageBackgroundClear = useEditorStore((s) => s.stageBackgroundClear);
  const [search, setSearch] = useState('');

  const handleClearBackground = () => {
    if (!confirm('배경 도면을 제거하시겠습니까? (저장 전까지는 되돌릴 수 있습니다.)')) return;
    stageBackgroundClear();
    onClose?.();
  };

  // 도면 크기 표시용 (자동 확장된 캔버스 — 사용자 입력 X).
  const canvasWidthM = floorPlan ? (floorPlan.canvasWidth / 100).toFixed(1) : '—';
  const canvasHeightM = floorPlan ? (floorPlan.canvasHeight / 100).toFixed(1) : '—';

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
    <SidePanel side="right" width={300} title="배경 레이어" onClose={() => onClose?.()}>
      {/* 배경 도면 메타 — 파일명·제거·도면 크기. (투명도는 상태바, 불러오기/교체는 툴바.) */}
      <div className="px-3 py-2.5 border-b border-line shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-content-muted">배경 도면</span>
          <span
            className="text-[10px] text-content-faint truncate max-w-[160px]"
            title={bg.source.fileName}
          >
            {bg.source.fileName}
          </span>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClearBackground}
              className="px-3 py-1.5 text-xs text-danger border border-danger/30 rounded hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              배경 제거
            </button>
          </div>
        )}

        <div className="bg-surface-2 rounded px-2.5 py-1.5 text-[11px] text-content-muted">
          도면 크기: {canvasWidthM} m × {canvasHeightM} m
        </div>
      </div>

      {/* Layer toolbar */}
      <div className="px-3 py-2 border-b border-line flex items-center gap-2 shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색"
          className="flex-1 px-2 py-1 text-xs border border-line rounded bg-surface text-content focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          type="button"
          onClick={() => showAllBgLayers()}
          className="text-xs text-primary hover:text-primary-hover whitespace-nowrap"
          title="전체 표시"
        >
          전체
        </button>
        <button
          type="button"
          onClick={() => hideAllBgLayers(allLayerNames)}
          className="text-xs text-content-muted hover:text-content whitespace-nowrap"
          title="전체 숨김"
        >
          숨김
        </button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sorted.length === 0 && (
          <div className="p-4 text-center text-xs text-content-faint">
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
              type="button"
              key={layer.name}
              onClick={() => toggleBgLayerVisibility(layer.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2 border-b border-line ${
                hidden ? 'opacity-40' : ''
              }`}
              title={`${layer.name} (${count}개) — ${hidden ? '숨김' : '표시'}`}
            >
              {/* Eye icon */}
              <span className="w-4 h-4 flex-shrink-0 text-content-muted">
                {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </span>
              {/* Color swatch */}
              <span
                className="w-3 h-3 flex-shrink-0 rounded-sm border border-line"
                style={{ backgroundColor: layer.color }}
              />
              {/* Name */}
              <span className="flex-1 text-left text-content truncate">
                {layer.name}
              </span>
              {/* Entity count */}
              <span className="flex-shrink-0 text-[10px] text-content-faint">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </SidePanel>
  );
}

