import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { isTempId } from '../../../../utils/idHelpers';
import { toDateInputValue } from '../../../../utils/date';
import {
  useMaintenanceLogs,
  useCreateMaintenanceLog,
  useUpdateMaintenanceLog,
  useDeleteMaintenanceLog,
} from '../../hooks/useMaintenanceLogs';
import {
  LOG_TYPE_LABELS,
  LOG_TYPE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  FAILURE_LOG_TYPE_OPTIONS,
} from '../../types/equipment';
import {
  SectionItem,
  PrimaryButton,
  GhostButton,
  IconAction,
  FormRow,
  fieldClass,
} from '../../../assets/components/detail/SectionShell';

/* ================================================================
   고장이력(failure/repair) — 점검(MAINTENANCE) 제외, 기본 FAILURE.
   점검은 별도 점검 탭에서 기록. 점검 섹션과 동일한 '항상 노출 폼 + 누적 이력'
   패턴 + 실시간 CRUD(useMaintenanceLogs)로 통일.
   ================================================================ */

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

export function LogsTab({ equipmentId, readOnly }: { equipmentId: string; readOnly?: boolean }) {
  const isTemp = isTempId(equipmentId);
  const { data, isLoading } = useMaintenanceLogs(equipmentId);
  const logs = Array.isArray(data) ? data : [];
  const createLog = useCreateMaintenanceLog(equipmentId);
  const updateLog = useUpdateMaintenanceLog();
  const deleteLog = useDeleteMaintenanceLog();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    logType: 'FAILURE',
    severity: 'LOW',
    title: '',
    logDate: todayStr(),
    description: '',
  });

  const reset = () => {
    setForm({ logType: 'FAILURE', severity: 'LOW', title: '', logDate: todayStr(), description: '' });
    setEditingId(null);
  };

  const pending = createLog.isPending || updateLog.isPending;
  const canSubmit = !!form.title.trim() && !pending;
  const canWrite = !readOnly;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      logType: form.logType,
      title: form.title.trim(),
      logDate: form.logDate || undefined,
      severity: form.severity,
      description: form.description.trim() || undefined,
    };
    if (editingId) updateLog.mutate({ id: editingId, ...payload }, { onSuccess: reset });
    else createLog.mutate(payload, { onSuccess: reset });
  };

  const handleEdit = (log: (typeof logs)[number]) => {
    setForm({
      logType: log.logType,
      severity: log.severity ?? 'LOW',
      title: log.title,
      logDate: log.logDate ? toDateInputValue(log.logDate) : '',
      description: log.description ?? '',
    });
    setEditingId(log.id);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('이 고장 이력을 삭제하시겠습니까?')) return;
    if (editingId === id) reset();
    deleteLog.mutate(id);
  };

  if (isTemp) {
    return <p className="text-xs text-content-faint py-2">자산을 저장한 뒤 고장 이력을 기록할 수 있습니다.</p>;
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 작성 폼 — 항상 노출. 점검 탭과 동일한 라벨-필드 구성. */}
      {canWrite && (
        <div className="space-y-2">
          <FormRow label="유형">
            <select
              aria-label="유형"
              value={form.logType}
              onChange={(e) => setForm((p) => ({ ...p, logType: e.target.value }))}
              className={fieldClass}
            >
              {FAILURE_LOG_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="심각도">
            <select
              aria-label="심각도"
              value={form.severity}
              onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))}
              className={fieldClass}
            >
              {Object.keys(SEVERITY_COLORS).map((key) => (
                <option key={key} value={key}>{SEVERITY_LABELS[key] ?? key}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="제목">
            <input
              type="text"
              placeholder="고장 제목"
              aria-label="제목"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className={fieldClass}
            />
          </FormRow>
          <FormRow label="발생일">
            <input
              type="date"
              aria-label="발생일"
              value={form.logDate}
              onChange={(e) => setForm((p) => ({ ...p, logDate: e.target.value }))}
              className={fieldClass}
            />
          </FormRow>
          <FormRow label="설명">
            <textarea
              placeholder="고장 내용 (선택)"
              aria-label="설명"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className={`${fieldClass} resize-none`}
            />
          </FormRow>
          <div className="flex justify-end gap-2">
            {editingId && <GhostButton onClick={reset}>취소</GhostButton>}
            <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
              {editingId ? '수정 적용' : '고장 등록'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* 이력 — 아래로 누적(최근순). 빈 상태는 한 곳에서만. */}
      <div className={canWrite ? 'border-t border-line pt-3' : ''}>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-xs font-semibold text-content-muted">고장 이력</span>
          {logs.length > 0 && <span className="text-[11px] text-content-faint">{logs.length}건</span>}
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-content-faint py-1">기록된 고장 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <SectionItem key={log.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LOG_TYPE_COLORS[log.logType] ?? 'bg-line text-content-muted'}`}>
                      {LOG_TYPE_LABELS[log.logType] ?? log.logType}
                    </span>
                    {log.severity && (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[log.severity] ?? 'bg-surface-2 text-content-muted'}`}>
                        {SEVERITY_LABELS[log.severity] ?? log.severity}
                      </span>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconAction onClick={() => handleEdit(log)} title="수정">
                        <Pencil size={14} />
                      </IconAction>
                      <IconAction onClick={() => handleDelete(log.id)} title="삭제" danger>
                        <Trash2 size={14} />
                      </IconAction>
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-content">{log.title}</p>
                {log.description && <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{log.description}</p>}
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-content-faint">
                    {fmtDate(log.logDate ?? log.createdAt)}
                  </p>
                  {log.createdByName && (
                    <p className="text-xs text-content-faint">작성: {log.createdByName}</p>
                  )}
                </div>
              </SectionItem>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
