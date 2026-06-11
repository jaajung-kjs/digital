import { Link } from 'react-router-dom';
import { ChevronLeft, Undo2, Redo2, ImagePlus, Layers, FileText, History } from 'lucide-react';
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
  onToggleLayers?: () => void;
  /** 현재 열린 우측 패널 enum — 토글 버튼 active 강조용 (rightPanel === kind). */
  activeRightPanel?: 'detail' | 'report' | 'history' | 'background' | null;
  /** DWG/DXF 배경 도면 가져오기 모달 열기 (부모가 DwgImportModal 렌더). */
  onImportClick?: () => void;
}

export function Toolbar({ floor, floorPlan, isAdmin, onToggleWorkOrders, onToggleReport, onToggleLayers, activeRightPanel, onImportClick }: ToolbarProps) {
  const stagedBackgroundDrawing = useEditorStore((s) => s.stagedBackgroundDrawing);
  const snapshotActive = useSnapshotStore((s) => s.active);
  // Effective background — staged value (if user is editing) ?? server.
  const effectiveBackgroundDrawing =
    stagedBackgroundDrawing !== undefined ? stagedBackgroundDrawing : floorPlan?.backgroundDrawing ?? null;

  const { undo, redo, canUndo, canRedo } = useEditorHistory();

  return (
    <div className="shrink-0 bg-surface border-b border-line px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="p-2 hover:bg-surface-2 rounded text-content-muted flex-shrink-0" title="목록으로">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-content truncate">{floor?.name} 평면도</h1>
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

          {onToggleLayers && effectiveBackgroundDrawing && (
            <IconButton aria-label="배경" title="배경 (레이어·교체·제거)" onClick={onToggleLayers} active={activeRightPanel === 'background'}>
              <Layers size={18} />
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
