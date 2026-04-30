import type { AuditLog } from '../../../../types/maintenance';

const FIELD_LABELS: Record<string, string> = {
  elements: '배치 요소',
  equipment: '설비',
  cables: '케이블',
  fiberPaths: '광경로',
  gridSize: '그리드',
  // CM-B: scaleRatio 항목 폐기.
  positions: '위치',
  connections: '연결',
};

interface VersionListProps {
  logs: AuditLog[];
  snapshotActive: boolean;
  snapshotId: string | null;
  isFetching: boolean;
  isAdmin: boolean;
  deletingId: string | null;
  onSelect: (log: AuditLog) => void;
  onDelete: (logId: string) => void;
}

export function VersionList({
  logs, snapshotActive, snapshotId, isFetching,
  isAdmin, deletingId, onSelect, onDelete,
}: VersionListProps) {
  return (
    <div className="p-3 space-y-2">
      {logs.map((log) => {
        const isActive = snapshotActive && snapshotId === log.id;
        const canPreview = log.hasSnapshot;
        return (
          <div
            key={log.id}
            onClick={() => onSelect(log)}
            className={`p-3 rounded-lg border group transition-colors cursor-pointer ${
              isActive
                ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                : canPreview
                  ? isFetching
                    ? 'border-blue-300 bg-blue-50 cursor-wait'
                    : 'border-gray-100 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                  : 'border-gray-100 bg-gray-50/60 hover:border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {isActive && (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {log.actionDetail}
                </span>
                {canPreview && (
                  <span className="text-xs text-gray-400" title="설계서 보기 가능">
                    📋
                  </span>
                )}
                {isFetching && isActive && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(log.id); }}
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
            </div>

            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(log.createdAt).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {log.userName && ` · ${log.userName}`}
            </p>

            {log.changedFields.length > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                {log.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
