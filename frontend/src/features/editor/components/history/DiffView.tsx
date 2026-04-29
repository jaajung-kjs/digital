import { useMemo } from 'react';
import {
  actionBadgeColor,
  actionIcon,
} from '../../../../utils/constructionCalc';
import type { ConstructionReport } from '../../../../utils/constructionCalc';
import type { AuditLog } from '../../../../types/maintenance';

const FIELD_LABELS: Record<string, string> = {
  elements: '배치 요소',
  equipment: '설비',
  cables: '케이블',
  fiberPaths: '광경로',
  gridSize: '그리드',
  scaleRatio: '축척',
  positions: '위치',
  connections: '연결',
};

// ============================================================
// DiffView — show change details for a log entry
// ============================================================

export function DiffView({ log }: { log: AuditLog; allLogs?: AuditLog[] | undefined }) {
  // Read pre-computed report from context (stored at save time)
  const report = useMemo(() => {
    const ctx = log.context as Record<string, unknown> | null | undefined;
    return (ctx?.constructionReport as ConstructionReport | undefined) ?? null;
  }, [log]);

  return (
    <div className="p-4 space-y-3">
      <div className="mb-2">
        <h4 className="text-sm font-bold text-gray-900">{log.actionDetail}</h4>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(log.createdAt).toLocaleString('ko-KR')}
          {log.userName && ` · ${log.userName}`}
        </p>
      </div>

      {log.changedFields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">변경 항목</p>
          <div className="flex flex-wrap gap-1">
            {log.changedFields.map((f) => (
              <span key={f} className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                {FIELD_LABELS[f] ?? f}
              </span>
            ))}
          </div>
        </div>
      )}

      {report && report.diff.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">변경 상세</p>
          <div className="space-y-1">
            {report.diff.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded font-mono ${actionBadgeColor(d.action)}`}>
                  {actionIcon(d.action)}
                </span>
                <span className="text-gray-700 truncate">
                  {d.name}{d.specification ? ` ${d.specification}` : ''}
                </span>
                {d.length != null && (
                  <span className="text-gray-400 shrink-0">{d.length}m</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!report || report.diff.length === 0) && log.changedFields.length === 0 && (
        <p className="text-xs text-gray-400">상세 변경 내역이 없습니다.</p>
      )}
    </div>
  );
}
