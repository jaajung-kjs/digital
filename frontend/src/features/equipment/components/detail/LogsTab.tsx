import { useState, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { generateTempId, isTempId } from '../../../../utils/idHelpers';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { useMaintenanceLogs } from '../../hooks/useMaintenanceLogs';
import {
  LOG_TYPE_LABELS,
  LOG_TYPE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  FAILURE_LOG_TYPE_OPTIONS,
} from '../../types/equipment';
import {
  SectionHeader,
  SectionAction,
  SectionEmpty,
  SectionItem,
  SectionForm,
  PrimaryButton,
  IconAction,
  fieldClass,
} from '../../../assets/components/detail/SectionShell';

/* ================================================================
   고장이력(failure/repair) — 점검(MAINTENANCE)은 제외, 기본 FAILURE.
   점검은 별도 점검 섹션에서 기록. 공유 셸(SectionShell)로 톤 통일.
   ================================================================ */

export function LogsTab({ equipmentId, readOnly }: { equipmentId: string; readOnly?: boolean }) {
  const isTemp = isTempId(equipmentId);
  const { data: backendLogs, isLoading } = useMaintenanceLogs(equipmentId);
  const pendingLogs = useEditorStore((s) => s.pendingLogs);
  const addPendingLog = useEditorStore((s) => s.addPendingLog);
  const updatePendingLog = useEditorStore((s) => s.updatePendingLog);
  const removePendingLog = useEditorStore((s) => s.removePendingLog);

  const [showForm, setShowForm] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    logType: 'FAILURE',
    title: '',
    logDate: new Date().toISOString().slice(0, 10),
    severity: 'LOW',
    description: '',
  });

  const allLogs = useMemo(() => {
    const savedLogs = (backendLogs ?? []);

    const pending = pendingLogs
      .filter((l) => l.equipmentId === equipmentId)
      .map((l) => ({
        id: l.id,
        equipmentId: l.equipmentId,
        logType: l.logType as 'MAINTENANCE' | 'FAILURE' | 'REPAIR',
        title: l.title,
        description: l.description,
        logDate: l.logDate,
        severity: l.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
        status: (l.status ?? 'OPEN') as 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByName: null as string | null,
        updatedByName: null as string | null,
      }));

    return [...pending, ...savedLogs].sort((a, b) => {
      const dateA = a.logDate || a.createdAt;
      const dateB = b.logDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [backendLogs, pendingLogs, equipmentId]);

  const resetForm = () => {
    setFormData({ logType: 'FAILURE', title: '', logDate: new Date().toISOString().slice(0, 10), severity: 'LOW', description: '' });
    setEditingLogId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) return;

    const common = {
      logType: formData.logType,
      title: formData.title,
      logDate: formData.logDate || undefined,
      severity: formData.severity,
      description: formData.description || undefined,
    };

    if (editingLogId) {
      // Check if it's a pending log (editable)
      const isPending = pendingLogs.some((l) => l.id === editingLogId);
      if (isPending) {
        updatePendingLog(editingLogId, common);
      }
      // Backend logs cannot be edited in local-only mode
    } else {
      addPendingLog({ id: generateTempId(), equipmentId, ...common });
    }
    resetForm();
  };

  const handleEditLog = (log: typeof allLogs[0]) => {
    // Now we CAN edit pending logs too
    setFormData({
      logType: log.logType,
      title: log.title,
      logDate: log.logDate ? new Date(log.logDate).toISOString().slice(0, 10) : '',
      severity: log.severity ?? 'LOW',
      description: log.description ?? '',
    });
    setEditingLogId(log.id);
    setShowForm(true);
  };

  const handleDeleteLog = (logId: string) => {
    if (!confirm('이 이력을 삭제하시겠습니까?')) return;
    const isPending = pendingLogs.some((l) => l.id === logId);
    if (isPending) {
      removePendingLog(logId);
    }
    // Backend logs cannot be deleted in local-only mode
  };

  if (!isTemp && isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        action={
          !readOnly ? (
            <SectionAction
              onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
              tone={showForm ? 'muted' : 'primary'}
            >
              {showForm ? '취소' : '+ 이력 추가'}
            </SectionAction>
          ) : undefined
        }
      />

      {showForm && !readOnly && (
        <SectionForm>
          <div className="flex gap-2">
            {/* 점검(MAINTENANCE) 제외 — 고장/수리만. */}
            <select
              aria-label="유형"
              value={formData.logType}
              onChange={(e) => setFormData((p) => ({ ...p, logType: e.target.value }))}
              className={fieldClass}
            >
              {FAILURE_LOG_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              aria-label="심각도"
              value={formData.severity}
              onChange={(e) => setFormData((p) => ({ ...p, severity: e.target.value }))}
              className={fieldClass}
            >
              {Object.entries(SEVERITY_COLORS).map(([key]) => (
                <option key={key} value={key}>{SEVERITY_LABELS[key] ?? key}</option>
              ))}
            </select>
          </div>
          <input
            type="text" placeholder="제목" aria-label="제목"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            className={fieldClass}
          />
          <input
            type="date" aria-label="발생일"
            value={formData.logDate}
            onChange={(e) => setFormData((p) => ({ ...p, logDate: e.target.value }))}
            className={fieldClass}
          />
          <textarea
            placeholder="설명 (선택)" aria-label="설명"
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            className={`${fieldClass} resize-none`} rows={2}
          />
          <div className="flex justify-end pt-0.5">
            <PrimaryButton onClick={handleSubmit} disabled={!formData.title.trim()}>
              {editingLogId ? '수정 적용' : '등록'}
            </PrimaryButton>
          </div>
        </SectionForm>
      )}

      {allLogs.length === 0 ? (
        <SectionEmpty>고장 이력이 없습니다.</SectionEmpty>
      ) : (
        <div className="space-y-2">
          {allLogs.map((log) => (
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
                {!readOnly && pendingLogs.some((l) => l.id === log.id) && (
                  <div className="flex items-center gap-0.5">
                    <IconAction onClick={() => handleEditLog(log)} title="수정">
                      <Pencil size={14} />
                    </IconAction>
                    <IconAction onClick={() => handleDeleteLog(log.id)} title="삭제" danger>
                      <Trash2 size={14} />
                    </IconAction>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-content">{log.title}</p>
              {log.description && <p className="text-sm text-content-muted mt-1">{log.description}</p>}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-content-faint">
                  {log.logDate
                    ? new Date(log.logDate).toLocaleDateString('ko-KR')
                    : new Date(log.createdAt).toLocaleDateString('ko-KR')}
                </p>
                {log.createdByName && (
                  <p className="text-xs text-content-faint">
                    작성: {log.createdByName}
                  </p>
                )}
              </div>
            </SectionItem>
          ))}
        </div>
      )}
    </div>
  );
}
