import { useState, useEffect } from 'react';
import {
  useCreateMaintenanceLog,
  useUpdateMaintenanceLog,
} from '../hooks/useMaintenanceLogs';
import type { MaintenanceLog } from '../../../types/maintenance';
import type { MaintenanceFormData } from '../types/equipment';

interface MaintenanceFormProps {
  equipmentId: string;
  log?: MaintenanceLog | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const LOG_TYPES = [
  { value: 'MAINTENANCE', label: '점검' },
  { value: 'FAILURE', label: '고장' },
  { value: 'REPAIR', label: '수리' },
  { value: 'INSPECTION', label: '검사' },
];

const SEVERITIES = [
  { value: 'LOW', label: 'LOW' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'HIGH', label: 'HIGH' },
  { value: 'CRITICAL', label: 'CRITICAL' },
];

const STATUSES = [
  { value: 'OPEN', label: '열림' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'RESOLVED', label: '해결' },
  { value: 'CLOSED', label: '종료' },
];

export function MaintenanceForm({
  equipmentId,
  log,
  onSuccess,
  onCancel,
}: MaintenanceFormProps) {
  const createLog = useCreateMaintenanceLog(equipmentId);
  const updateLog = useUpdateMaintenanceLog();
  const isEdit = !!log;

  const [formData, setFormData] = useState<MaintenanceFormData>({
    logType: 'MAINTENANCE',
    title: '',
    description: '',
    severity: 'MEDIUM',
    status: 'OPEN',
  });
  const [resolvedAt, setResolvedAt] = useState('');

  useEffect(() => {
    if (log) {
      setFormData({
        logType: log.logType,
        title: log.title,
        description: log.description || '',
        severity: log.severity || 'MEDIUM',
        status: log.status,
      });
      setResolvedAt(
        log.resolvedAt
          ? new Date(log.resolvedAt).toISOString().split('T')[0]
          : ''
      );
    }
  }, [log]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const payload = {
      ...formData,
      ...(resolvedAt ? { resolvedAt } : {}),
    };

    if (isEdit && log) {
      await updateLog.mutateAsync({ id: log.id, ...payload });
    } else {
      await createLog.mutateAsync(payload);
    }
    onSuccess();
  };

  const isPending = createLog.isPending || updateLog.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded border border-gray-200 bg-white p-3"
    >
      {/* Log Type */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          유형
        </label>
        <select
          value={formData.logType}
          onChange={(e) =>
            setFormData({ ...formData, logType: e.target.value })
          }
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        >
          {LOG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          제목
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) =>
            setFormData({ ...formData, title: e.target.value })
          }
          placeholder="제목을 입력하세요"
          required
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          설명
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="상세 내용 (선택)"
          rows={3}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Severity */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          심각도
        </label>
        <select
          value={formData.severity}
          onChange={(e) =>
            setFormData({ ...formData, severity: e.target.value })
          }
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          상태
        </label>
        <select
          value={formData.status}
          onChange={(e) =>
            setFormData({ ...formData, status: e.target.value })
          }
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Resolved Date */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          해결일
        </label>
        <input
          type="date"
          value={resolvedAt}
          onChange={(e) => setResolvedAt(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !formData.title.trim()}
          className="flex-1 rounded bg-blue-500 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isPending ? '저장 중...' : isEdit ? '수정' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
