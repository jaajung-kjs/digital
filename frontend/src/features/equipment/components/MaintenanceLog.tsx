import { useState } from 'react';
import {
  useMaintenanceLogs,
  useDeleteMaintenanceLog,
} from '../hooks/useMaintenanceLogs';
import { MaintenanceForm } from './MaintenanceForm';
import { useIsAdmin } from '../../../stores/authStore';
import {
  LOG_TYPE_LABELS,
  SEVERITY_COLORS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../types/equipment';
import type { MaintenanceLog as MaintenanceLogType } from '../../../types/maintenance';
import { format } from 'date-fns';

interface MaintenanceLogProps {
  equipmentId: string;
}

export function MaintenanceLog({ equipmentId }: MaintenanceLogProps) {
  const { data: logs, isLoading } = useMaintenanceLogs(equipmentId);
  const deleteLog = useDeleteMaintenanceLog();
  const isAdmin = useIsAdmin();
  const [showForm, setShowForm] = useState(false);
  const [editingLog, setEditingLog] = useState<MaintenanceLogType | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('이 정비이력을 삭제하시겠습니까?')) return;
    await deleteLog.mutateAsync(id);
  };

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-gray-500">로딩 중...</div>;
  }

  return (
    <div className="p-3">
      {isAdmin && (
        <button
          onClick={() => {
            setEditingLog(null);
            setShowForm(!showForm);
          }}
          className="mb-3 w-full rounded border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          {showForm ? '취소' : '+ 정비이력 추가'}
        </button>
      )}

      {showForm && (
        <div className="mb-3">
          <MaintenanceForm
            equipmentId={equipmentId}
            log={editingLog}
            onSuccess={() => {
              setShowForm(false);
              setEditingLog(null);
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingLog(null);
            }}
          />
        </div>
      )}

      {!logs || logs.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          정비이력이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded border border-gray-200 bg-white"
            >
              <div
                className="cursor-pointer px-3 py-2"
                onClick={() =>
                  setExpandedId(expandedId === log.id ? null : log.id)
                }
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                      {LOG_TYPE_LABELS[log.logType] || log.logType}
                    </span>
                    {log.severity && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          SEVERITY_COLORS[log.severity] || ''
                        }`}
                      >
                        {log.severity}
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      STATUS_COLORS[log.status] || ''
                    }`}
                  >
                    {STATUS_LABELS[log.status] || log.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800">
                  {log.title}
                </p>
                <p className="text-xs text-gray-400">
                  {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>

              {expandedId === log.id && (
                <div className="border-t border-gray-100 px-3 py-2">
                  {log.description && (
                    <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600">
                      {log.description}
                    </p>
                  )}
                  {log.resolvedAt && (
                    <p className="text-xs text-gray-500">
                      해결일:{' '}
                      {format(new Date(log.resolvedAt), 'yyyy-MM-dd HH:mm')}
                    </p>
                  )}
                  {isAdmin && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setEditingLog(log);
                          setShowForm(true);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
