import { Link } from 'react-router-dom';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { useWorkingCopyDirty } from '../../workingCopy/hooks';

interface ToolbarProps {
  floor: FloorDetail | undefined;
  floorPlan: FloorPlanDetail | undefined;
  isAdmin: boolean;
  handleSave: () => void;
  isSaving: boolean;
  onToggleHistory?: () => void;
  onToggleSettings?: () => void;
  onToggleLayers?: () => void;
}

export function Toolbar({ floor, floorPlan, isAdmin, handleSave, isSaving, onToggleHistory, onToggleSettings, onToggleLayers }: ToolbarProps) {
  const hasChanges = useEditorStore((s) => s.hasChanges);
  const showLengths = useEditorStore((s) => s.showLengths);
  const setShowLengths = useEditorStore((s) => s.setShowLengths);
  const pendingUploads = useEditorStore((s) => s.pendingUploads);
  const pendingLogs = useEditorStore((s) => s.pendingLogs);
  const stagedBackgroundDrawing = useEditorStore((s) => s.stagedBackgroundDrawing);
  const snapshotActive = useSnapshotStore((s) => s.active);
  // Effective background — staged value (if user is editing) ?? server.
  const effectiveBackgroundDrawing =
    stagedBackgroundDrawing !== undefined ? stagedBackgroundDrawing : floorPlan?.backgroundDrawing ?? null;
  const { undo, redo, canUndo, canRedo } = useEditorHistory();

  // SSOT-2d3a Task 5 — 변경 건수는 통합 스토어 overlay dirty 합계(assets/cables/
  // distCircuits/fiberPaths) + editorStore 에만 남은 pending side-data(업로드/로그).
  // 파이버패스는 통합 스토어 fiberPaths overlay 로 이관됐으므로 useWorkingCopyDirty 가
  // 이미 포함한다 — 여기서 따로 더하지 않는다.
  const workingCopyDirty = useWorkingCopyDirty();
  const changeCount =
    workingCopyDirty +
    pendingUploads.length +
    pendingLogs.length;

  return (
    <div className="shrink-0 bg-white border-b px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0" title="목록으로">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{floor?.name} 평면도</h1>
          {floorPlan && <p className="text-xs text-gray-500">버전 {floorPlan.version}</p>}
        </div>
      </div>

      {floorPlan && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && !snapshotActive && (
            <>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="실행 취소 (Ctrl+Z)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="다시 실행 (Ctrl+Y)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                </svg>
              </button>
              <div className="border-l h-6 mx-2" />
            </>
          )}

          <button
            onClick={() => setShowLengths(!showLengths)}
            className={`p-2 rounded-lg flex items-center gap-1 text-xs ${
              showLengths ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
            }`}
            title="설비 크기 표시"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>cm</span>
          </button>

          <div className="border-l h-6 mx-2" />

          {onToggleLayers && effectiveBackgroundDrawing && (
            <button onClick={onToggleLayers} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600" title="배경 레이어">
              {/* Stacked layers icon — ✱ matches the panel header */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6l8-4 8 4-8 4-8-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12l8 4 8-4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18l8 4 8-4" />
              </svg>
            </button>
          )}

          {onToggleSettings && !snapshotActive && (
            <button onClick={onToggleSettings} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600" title="도면 설정">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {onToggleHistory && (
            <button onClick={onToggleHistory} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600" title="변경 이력">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {isAdmin && !snapshotActive && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                hasChanges ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSaving
                ? '저장 중...'
                : hasChanges && changeCount > 0
                  ? `저장 (${changeCount}건 변경)`
                  : '저장'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
