import { useState } from 'react';
import { useIsAdmin } from '../../../stores/authStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useRoomAuditLogs, useDeleteAuditLog, usePreviewSnapshot, useLoadSnapshot } from '../hooks/useRoomAuditLogs';

interface ChangeHistoryPanelProps {
  roomId: string;
  onClose: () => void;
}

export function ChangeHistoryPanel({ roomId, onClose }: ChangeHistoryPanelProps) {
  const { data: logs, isLoading } = useRoomAuditLogs(roomId);
  const deleteMutation = useDeleteAuditLog(roomId);
  const preview = usePreviewSnapshot(roomId);
  const loadSnapshot = useLoadSnapshot(roomId);
  const isAdmin = useIsAdmin();

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotId = useSnapshotStore((s) => s.snapshotId);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isFetching = preview.isPending;

  const handleDelete = async (logId: string) => {
    if (!confirm('이 변경 이력을 삭제하시겠습니까?')) return;
    setDeletingId(logId);
    try {
      await deleteMutation.mutateAsync(logId);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = async (logId: string, actionDetail?: string) => {
    if (isFetching) return;
    await preview.enter(logId, actionDetail || '이전 버전');
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

  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-[320px] bg-white border-r border-gray-200 shadow-[4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col"
      style={{ animation: 'slideInLeft 0.25s ease-out' }}
    >
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>

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

      {!snapshotActive && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <p className="text-xs text-gray-500">클릭하면 해당 시점의 도면을 미리 볼 수 있습니다.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400 py-12">
            변경 이력이 없습니다.
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {logs.map((log) => {
              const isActive = snapshotActive && snapshotId === log.id;
              return (
                <div
                  key={log.id}
                  onClick={() => !isFetching && handlePreview(log.id, log.actionDetail)}
                  className={`p-3 rounded-lg border group transition-colors ${
                    isActive
                      ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                      : isFetching
                        ? 'border-blue-300 bg-blue-50 cursor-wait'
                        : 'border-gray-100 bg-gray-50 cursor-pointer hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      )}
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        {log.actionDetail || log.action}
                      </span>
                      {isFetching && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                        disabled={deletingId === log.id}
                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="이력 삭제"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {log.changedFields.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      변경: {log.changedFields.join(', ')}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {log.userName && (
                      <p className="text-xs text-gray-400">
                        {log.userName}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
