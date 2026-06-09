import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';

// USP Task 2 — 툴바 "저장" 버튼 제거. 저장 UI 는 WorkingCopyCommitBar 단일창구로
// 통합됐다(Ctrl+S 도 그 커밋 경로). 따라서 handleSave/isSaving + changeCount 계산이
// 더 이상 필요 없다.
interface ToolbarProps {
  floor: FloorDetail | undefined;
  floorPlan: FloorPlanDetail | undefined;
  isAdmin: boolean;
  onToggleHistory?: () => void;
  onToggleWorkOrders?: () => void;
  onToggleReport?: () => void;
  onToggleSettings?: () => void;
  onToggleLayers?: () => void;
  /** DWG/DXF 배경 도면 가져오기 모달 열기 (부모가 DwgImportModal 렌더). */
  onImportClick?: () => void;
}

export function Toolbar({ floor, floorPlan, isAdmin, onToggleHistory, onToggleWorkOrders, onToggleReport, onToggleSettings, onToggleLayers, onImportClick }: ToolbarProps) {
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

          {onImportClick && !snapshotActive && (
            <button
              onClick={onImportClick}
              className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-1 text-xs text-gray-600"
              title="배경 도면 불러오기 (DWG/DXF)"
            >
              {/* Document / upload icon */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>도면 불러오기</span>
            </button>
          )}

          {hasBackground && (
            <div className="relative" ref={opacityRef}>
              <button
                onClick={() => setOpacityOpen((p) => !p)}
                className={`p-2 rounded-lg flex items-center gap-1 text-xs ${
                  opacityOpen ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="배경 투명도"
              >
                {/* Opacity / contrast icon */}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="9" strokeWidth={2} />
                  <path strokeWidth={2} d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" />
                </svg>
                <span>{Math.round(opacity * 100)}%</span>
              </button>
              {opacityOpen && (
                <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-56">
                  <label className="block text-xs text-gray-600 mb-2">배경 투명도 ({Math.round(opacity * 100)}%)</label>
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

          {onToggleReport && (
            <button onClick={onToggleReport} className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-1 text-xs text-gray-600" title="설계서 미리보기">
              {/* Document / clipboard icon */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>설계서</span>
            </button>
          )}

          {onToggleHistory && (
            <button onClick={onToggleHistory} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600" title="변경 이력">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {onToggleWorkOrders && (
            <button onClick={onToggleWorkOrders} className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-1 text-xs text-gray-600" title="작업지시서 이력">
              {/* Archive / document-stack icon */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" />
              </svg>
              <span>이력</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
