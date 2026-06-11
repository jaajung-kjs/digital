import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Undo2, Redo2, Ruler, ImagePlus, Contrast, Layers, Settings, FileText, History } from 'lucide-react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { IconButton } from '../../../components/ui';

// USP Task 2 — 툴바 "저장" 버튼 제거. 저장 UI 는 WorkingCopyCommitBar 단일창구로
// 통합됐다(Ctrl+S 도 그 커밋 경로). 따라서 handleSave/isSaving + changeCount 계산이
// 더 이상 필요 없다.
interface ToolbarProps {
  floor: FloorDetail | undefined;
  floorPlan: FloorPlanDetail | undefined;
  isAdmin: boolean;
  onToggleWorkOrders?: () => void;
  onToggleReport?: () => void;
  onToggleSettings?: () => void;
  onToggleLayers?: () => void;
  /** 현재 열린 우측 패널 enum — 토글 버튼 active 강조용 (rightPanel === kind). */
  activeRightPanel?: 'detail' | 'report' | 'history' | 'background' | null;
  /** DWG/DXF 배경 도면 가져오기 모달 열기 (부모가 DwgImportModal 렌더). */
  onImportClick?: () => void;
}

export function Toolbar({ floor, floorPlan, isAdmin, onToggleWorkOrders, onToggleReport, onToggleSettings, onToggleLayers, activeRightPanel, onImportClick }: ToolbarProps) {
  const showLengths = useEditorStore((s) => s.showLengths);
  const setShowLengths = useEditorStore((s) => s.setShowLengths);
  const stagedBackgroundDrawing = useEditorStore((s) => s.stagedBackgroundDrawing);
  const stagedBackgroundOpacity = useEditorStore((s) => s.stagedBackgroundOpacity);
  const stageBackgroundOpacity = useEditorStore((s) => s.stageBackgroundOpacity);
  const snapshotActive = useSnapshotStore((s) => s.active);
  // Effective background — staged value (if user is editing) ?? server.
  const effectiveBackgroundDrawing =
    stagedBackgroundDrawing !== undefined ? stagedBackgroundDrawing : floorPlan?.backgroundDrawing ?? null;
  const hasBackground = !!effectiveBackgroundDrawing;
  // Effective opacity — mirrors FloorSettingsPanel binding (staged ?? server ?? 0.3).
  const opacity = stagedBackgroundOpacity ?? floorPlan?.backgroundOpacity ?? 0.3;

  const { undo, redo, canUndo, canRedo } = useEditorHistory();

  // Compact opacity popover (closes on outside click).
  const [opacityOpen, setOpacityOpen] = useState(false);
  const opacityRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opacityOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (opacityRef.current && !opacityRef.current.contains(e.target as Node)) {
        setOpacityOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [opacityOpen]);

  return (
    <div className="shrink-0 bg-surface border-b border-line px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="p-2 hover:bg-surface-2 rounded text-content-muted flex-shrink-0" title="목록으로">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-content truncate">{floor?.name} 평면도</h1>
          {floorPlan && <p className="text-xs text-content-muted">버전 {floorPlan.version}</p>}
        </div>
      </div>

      {floorPlan && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAdmin && !snapshotActive && (
            <>
              <IconButton aria-label="실행 취소 (Ctrl+Z)" title="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
                <Undo2 size={18} />
              </IconButton>
              <IconButton aria-label="다시 실행 (Ctrl+Y)" title="다시 실행 (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
                <Redo2 size={18} />
              </IconButton>
              <div className="border-l border-line h-6 mx-1" />
            </>
          )}

          <IconButton
            aria-label="설비 크기 표시"
            title="설비 크기 표시"
            active={showLengths}
            onClick={() => setShowLengths(!showLengths)}
            className="flex items-center gap-1"
          >
            <Ruler size={18} />
            <span className="text-xs">cm</span>
          </IconButton>

          <div className="border-l border-line h-6 mx-1" />

          {onImportClick && !snapshotActive && (
            <IconButton
              aria-label="배경 도면 불러오기 (DWG/DXF)"
              title="배경 도면 불러오기 (DWG/DXF)"
              onClick={onImportClick}
              className="flex items-center gap-1"
            >
              <ImagePlus size={18} />
              <span className="text-xs">도면 불러오기</span>
            </IconButton>
          )}

          {hasBackground && (
            <div className="relative" ref={opacityRef}>
              <IconButton
                aria-label="배경 투명도"
                title="배경 투명도"
                active={opacityOpen}
                onClick={() => setOpacityOpen((p) => !p)}
                className="flex items-center gap-1"
              >
                <Contrast size={18} />
                <span className="text-xs">{Math.round(opacity * 100)}%</span>
              </IconButton>
              {opacityOpen && (
                <div className="absolute right-0 top-full mt-1 z-40 bg-surface rounded shadow-lg border border-line p-3 w-56">
                  <label className="block text-xs text-content-muted mb-2">배경 투명도 ({Math.round(opacity * 100)}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => stageBackgroundOpacity(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}

          {onToggleLayers && effectiveBackgroundDrawing && (
            <IconButton aria-label="배경 레이어" title="배경 레이어" onClick={onToggleLayers} active={activeRightPanel === 'background'}>
              <Layers size={18} />
            </IconButton>
          )}

          {onToggleSettings && !snapshotActive && (
            <IconButton aria-label="도면 설정" title="도면 설정" onClick={onToggleSettings}>
              <Settings size={18} />
            </IconButton>
          )}

          {onToggleReport && (
            <IconButton
              aria-label="설계서 미리보기"
              title="설계서 미리보기"
              onClick={onToggleReport}
              active={activeRightPanel === 'report'}
              className="flex items-center gap-1"
            >
              <FileText size={18} />
              <span className="text-xs">설계서</span>
            </IconButton>
          )}

          {onToggleWorkOrders && (
            <IconButton
              aria-label="작업지시서 이력"
              title="작업지시서 이력"
              onClick={onToggleWorkOrders}
              active={activeRightPanel === 'history'}
              className="flex items-center gap-1"
            >
              <History size={18} />
              <span className="text-xs">이력</span>
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
