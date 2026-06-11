import { useEffect, useRef, useState } from 'react';
import { Grid3x3, Magnet, Ruler, Contrast, Minus, Plus } from 'lucide-react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { zoomToCenter } from '../utils/zoom';

interface EditorStatusBarProps {
  floorPlan: FloorPlanDetail | undefined;
  /** Canvas container — used by the shared zoomToCenter to keep center stable. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Floor-plan VIEW status bar (Excel/PowerPoint pattern, business tone).
 *
 * Single home for the floor-plan view controls:
 *   left  → grid (toggle + size readout/editor) · snap · cm 줄자 · 배경 투명도
 *   right → zoom (−, %, +, presets)
 *
 * The cable-group filter intentionally lives elsewhere (corner legend).
 * Floating top-right pills and the Toolbar opacity popover were removed; the
 * grid/snap/줄자/투명도/줌 view controls all live here as the single home.
 */
export function EditorStatusBar({ floorPlan, containerRef }: EditorStatusBarProps) {
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const gridSnap = useEditorStore((s) => s.gridSnap);
  const setGridSnap = useEditorStore((s) => s.setGridSnap);
  const showLengths = useEditorStore((s) => s.showLengths);
  const setShowLengths = useEditorStore((s) => s.setShowLengths);
  const gridSize = useEditorStore((s) => s.gridSize);
  const majorGridSize = useEditorStore((s) => s.majorGridSize);
  const setGridSize = useEditorStore((s) => s.setGridSize);
  const setMajorGridSize = useEditorStore((s) => s.setMajorGridSize);
  const zoom = useEditorStore((s) => s.zoom);

  // Background opacity — staged ?? server ?? 0.3, gated on has-background.
  const stagedBackgroundDrawing = useEditorStore((s) => s.stagedBackgroundDrawing);
  const stagedBackgroundOpacity = useEditorStore((s) => s.stagedBackgroundOpacity);
  const stageBackgroundOpacity = useEditorStore((s) => s.stageBackgroundOpacity);
  const effectiveBackgroundDrawing =
    stagedBackgroundDrawing !== undefined
      ? stagedBackgroundDrawing
      : floorPlan?.backgroundDrawing ?? null;
  const hasBackground = !!effectiveBackgroundDrawing;
  const opacity = stagedBackgroundOpacity ?? floorPlan?.backgroundOpacity ?? 0.3;

  return (
    <div className="shrink-0 h-[30px] bg-surface border-t border-line flex items-center justify-between px-2 text-xs text-content-muted select-none">
      {/* ── Left group: grid · snap · 줄자 · 투명도 ── */}
      <div className="flex items-center gap-0.5">
        <GridControl
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          gridSize={gridSize}
          majorGridSize={majorGridSize}
          setGridSize={setGridSize}
          setMajorGridSize={setMajorGridSize}
        />

        <Divider />

        <ToggleButton
          active={gridSnap}
          onClick={() => setGridSnap(!gridSnap)}
          title="스냅 (S)"
          aria-label="스냅"
        >
          <Magnet size={14} />
          <span>스냅</span>
        </ToggleButton>

        <ToggleButton
          active={showLengths}
          onClick={() => setShowLengths(!showLengths)}
          title="설비 크기(cm) 표시"
          aria-label="cm 줄자"
        >
          <Ruler size={14} />
          <span>cm 줄자</span>
        </ToggleButton>

        {hasBackground && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5 px-1.5" title="배경 도면 투명도">
              <Contrast size={14} className="text-content-faint" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => stageBackgroundOpacity(parseFloat(e.target.value))}
                aria-label="배경 투명도"
                className="w-24 h-1 accent-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              />
              <span className="font-mono tabular-nums w-9 text-right">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Right end: zoom ── */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => zoomToCenter(zoom - 10, containerRef.current)}
          title="축소"
          aria-label="축소"
          className="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:bg-surface-2 hover:text-content transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => zoomToCenter(100, containerRef.current)}
          title="100%로 리셋"
          aria-label="줌 100%로 리셋"
          className="w-12 h-6 flex items-center justify-center rounded font-mono tabular-nums text-content hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {zoom}%
        </button>
        <button
          type="button"
          onClick={() => zoomToCenter(zoom + 10, containerRef.current)}
          title="확대"
          aria-label="확대"
          className="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:bg-surface-2 hover:text-content transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Plus size={14} />
        </button>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) zoomToCenter(parseInt(e.target.value), containerRef.current);
          }}
          title="줌 프리셋"
          aria-label="줌 프리셋"
          className="h-6 px-1 bg-transparent rounded text-content-muted hover:bg-surface-2 hover:text-content cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="" className="bg-surface">▾</option>
          <option value="10" className="bg-surface">10%</option>
          <option value="25" className="bg-surface">25%</option>
          <option value="50" className="bg-surface">50%</option>
          <option value="100" className="bg-surface">100%</option>
          <option value="200" className="bg-surface">200%</option>
          <option value="400" className="bg-surface">400%</option>
        </select>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-line mx-1" aria-hidden />;
}

function ToggleButton({
  active,
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-6 px-2 flex items-center gap-1 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        active
          ? 'bg-info-bg text-primary'
          : 'text-content-muted hover:bg-surface-2 hover:text-content'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

interface GridControlProps {
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  gridSize: number;
  majorGridSize: number;
  setGridSize: (v: number) => void;
  setMajorGridSize: (v: number) => void;
}

/**
 * Grid ON/OFF toggle + size readout `격자 60 / 10 cm` (60=major, 10=minor).
 * Clicking the readout opens a tiny inline popover with number inputs that
 * apply on blur/Enter — the single home for grid sizing.
 */
function GridControl({
  showGrid,
  setShowGrid,
  gridSize,
  majorGridSize,
  setGridSize,
  setMajorGridSize,
}: GridControlProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [majorInput, setMajorInput] = useState(String(majorGridSize));
  const [minorInput, setMinorInput] = useState(String(gridSize));

  useEffect(() => setMajorInput(String(majorGridSize)), [majorGridSize]);
  useEffect(() => setMinorInput(String(gridSize)), [gridSize]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const applyMajor = () => {
    const v = parseFloat(majorInput);
    if (!isNaN(v) && v > 0 && v !== majorGridSize) setMajorGridSize(v);
  };
  const applyMinor = () => {
    const v = parseFloat(minorInput);
    if (!isNaN(v) && v > 0 && v !== gridSize) setGridSize(v);
  };

  return (
    <div className="flex items-center" ref={wrapRef}>
      <ToggleButton
        active={showGrid}
        onClick={() => setShowGrid(!showGrid)}
        title="그리드 (G)"
        aria-label="그리드"
      >
        <Grid3x3 size={14} />
        <span>그리드</span>
      </ToggleButton>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          title="격자 크기 설정"
          aria-label="격자 크기 설정"
          className="h-6 px-1.5 flex items-center rounded font-mono tabular-nums text-content-faint hover:bg-surface-2 hover:text-content transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          격자 {majorGridSize} / {gridSize} cm
        </button>
        {open && (
          <div className="absolute bottom-full left-0 mb-1 z-40 bg-surface rounded shadow-lg border border-line p-3 w-48">
            <label className="block text-[11px] text-content-muted mb-1">주 격자 (cm)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={majorInput}
              onChange={(e) => setMajorInput(e.target.value)}
              onBlur={applyMajor}
              onKeyDown={(e) => { if (e.key === 'Enter') applyMajor(); }}
              aria-label="주 격자 크기"
              className="w-full px-2 py-1 mb-2 border border-line rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <label className="block text-[11px] text-content-muted mb-1">보조 격자 (cm)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={minorInput}
              onChange={(e) => setMinorInput(e.target.value)}
              onBlur={applyMinor}
              onKeyDown={(e) => { if (e.key === 'Enter') applyMinor(); }}
              aria-label="보조 격자 크기"
              className="w-full px-2 py-1 border border-line rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}
      </div>
    </div>
  );
}
