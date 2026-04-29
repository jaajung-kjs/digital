import { useState, useMemo } from 'react';
import { useIsAdmin } from '../../../stores/authStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import {
  useFloorAuditLogs,
  useDeleteAuditLog,
  usePreviewSnapshot,
  useLoadSnapshot,
  usePatchAuditLogContext,
} from '../hooks/useFloorAuditLogs';
import type { AuditLog } from '../../../types/maintenance';
import { VersionList } from './history/VersionList';
import { DiffView } from './history/DiffView';
import { ReportView } from './history/ReportView';

interface ChangeHistoryPanelProps {
  floorId: string;
  onClose: () => void;
}

type ReportTab = 'history' | 'report';

export function ChangeHistoryPanel({ floorId, onClose }: ChangeHistoryPanelProps) {
  const { data: logs, isLoading } = useFloorAuditLogs(floorId);
  const deleteMutation = useDeleteAuditLog(floorId);
  const preview = usePreviewSnapshot(floorId);
  const loadSnapshot = useLoadSnapshot(floorId);
  const patchContext = usePatchAuditLogContext(floorId);
  const isAdmin = useIsAdmin();

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotId = useSnapshotStore((s) => s.snapshotId);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('history');

  const isFetching = preview.isPending;

  const selectedLog = useMemo(
    () => logs?.find((l) => l.id === selectedLogId) ?? null,
    [logs, selectedLogId],
  );

  const handleDelete = async (logId: string) => {
    if (!confirm('이 변경 이력을 삭제하시겠습니까?')) return;
    setDeletingId(logId);
    try {
      await deleteMutation.mutateAsync(logId);
      if (selectedLogId === logId) {
        setSelectedLogId(null);
        setActiveTab('history');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = async (log: AuditLog) => {
    if (isFetching || !log.version) return;
    await preview.enter(log.id, log.actionDetail || '이전 버전', log.version);
  };

  const handleRestore = () => {
    if (!snapshotId) return;
    if (!confirm('이 상태를 편집기에 불러오시겠습니까?\n저장 버튼을 누르기 전까지 실제 반영되지 않습니다.')) return;
    loadSnapshot.restoreFromPreview();
    onClose();
  };

  const handleClose = () => {
    if (snapshotActive) preview.exit();
    onClose();
  };

  const handleSelectLog = (log: AuditLog) => {
    setSelectedLogId(log.id);
    setActiveTab('history');
    // Auto-preview: trigger canvas preview when a version is selected
    if (log.hasSnapshot && log.version) {
      handlePreview(log);
    }
  };

  const hasReport = (log: AuditLog) => log.hasSnapshot;

  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-[380px] bg-white border-r border-gray-200 shadow-[4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col animate-slide-in-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <h3 className="text-sm font-bold text-gray-900">도면 변경 이력</h3>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          title="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preview mode banner */}
      {snapshotActive && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <p className="text-xs font-medium text-amber-800 mb-2">과거 도면을 미리보는 중입니다</p>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleRestore}
                disabled={loadSnapshot.isPending}
                className="flex-1 px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                이 상태로 복원
              </button>
            )}
            <button
              onClick={preview.exit}
              className="flex-1 px-2 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              현재 도면으로 돌아가기
            </button>
          </div>
        </div>
      )}

      {/* Tabs when a log is selected */}
      {selectedLogId && (
        <div className="flex border-b border-gray-200 shrink-0">
          <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            변경 내역
          </TabButton>
          {selectedLog && hasReport(selectedLog) && (
            <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')}>
              설계서
            </TabButton>
          )}
          <button
            onClick={() => { setSelectedLogId(null); setActiveTab('history'); }}
            className="ml-auto px-2 text-xs text-gray-400 hover:text-gray-600"
            title="목록으로"
          >
            목록
          </button>
        </div>
      )}

      {!snapshotActive && !selectedLogId && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <p className="text-xs text-gray-500">도면 변경 항목을 클릭하면 해당 시점의 도면을 미리 볼 수 있습니다.</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400 py-12">
            변경 이력이 없습니다.
          </div>
        ) : selectedLogId && selectedLog ? (
          activeTab === 'history' ? (
            <DiffView log={selectedLog} allLogs={logs} />
          ) : (
            <ReportView
              log={selectedLog}
              allLogs={logs}
              floorId={floorId}
              onSaveOverrides={(overrides) => {
                const ctx = (selectedLog as AuditLog & { context?: Record<string, unknown> }).context ?? {};
                patchContext.mutate({
                  logId: selectedLog.id,
                  context: { ...ctx, reportOverrides: overrides },
                });
              }}
              isSaving={patchContext.isPending}
            />
          )
        ) : (
          <VersionList
            logs={logs}
            snapshotActive={snapshotActive}
            snapshotId={snapshotId}
            isFetching={isFetching}
            isAdmin={isAdmin}
            deletingId={deletingId}
            onSelect={handleSelectLog}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
