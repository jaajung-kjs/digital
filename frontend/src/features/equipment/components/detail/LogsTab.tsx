import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { generateTempId } from '../../../../utils/idHelpers';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { useEffectiveLogs } from '../../../workingCopy/hooks';
import { useMaintenanceLogs } from '../../hooks/useMaintenanceLogs';
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
   고장이력(failure/repair) — git-like 스테이징. 점검(MAINTENANCE) 제외, 기본 FAILURE.
   작성/수정/삭제는 즉시 백엔드로 가지 않고 editorStore.pendingLogs 에 쌓였다가 단일
   SAVE(commit) 시 반영(자산/케이블 편집과 동일한 단일 저장 경로).
    - 보류(저장 대기) 항목: 인라인 수정/삭제 가능. 저장된 항목: 커밋 이력 → 읽기전용.
   ================================================================ */

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

export function LogsTab({ equipmentId, readOnly }: { equipmentId: string; readOnly?: boolean }) {
  const { data, isLoading } = useMaintenanceLogs(equipmentId);
  const savedLogs = Array.isArray(data) ? data : [];

  // C2: 고장이력 staging 은 워킹카피(substationStore logs 컬렉션)로 — 단일 SAVE/revert.
  const pendingLogs = useEffectiveLogs();
  const logDeletes = useSubstationWorkingCopy((s) => s.overlays.logs.deletes);
  const put = useSubstationWorkingCopy((s) => s.put);
  const patch = useSubstationWorkingCopy((s) => s.patch);
  const remove = useSubstationWorkingCopy((s) => s.remove);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    logType: 'FAILURE',
    severity: 'LOW',
    title: '',
    logDate: todayStr(),
    description: '',
  });

  // 표시 목록: 보류(저장 대기) + 저장됨(백엔드). 보류가 위(최근 작성).
  const items = [
    ...pendingLogs
      .filter((l) => l.equipmentId === equipmentId)
      .map((l) => ({
        id: l.id, logType: l.logType, title: l.title, description: l.description ?? '',
        logDate: l.logDate ?? '', severity: l.severity ?? 'LOW', createdByName: null as string | null, isPending: true as const,
      })),
    ...savedLogs
      .filter((l) => !logDeletes.includes(l.id)) // 삭제 스테이징된 행은 숨김(SAVE 시 DELETE).
      .map((l) => ({
        id: l.id, logType: l.logType as string, title: l.title, description: l.description ?? '',
        logDate: (l.logDate ?? l.createdAt) as string, severity: (l.severity ?? '') as string, createdByName: l.createdByName ?? null, isPending: false as const,
      })),
  ];

  const reset = () => {
    setForm({ logType: 'FAILURE', severity: 'LOW', title: '', logDate: todayStr(), description: '' });
    setEditingId(null);
  };
  const canSubmit = !!form.title.trim();
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
    if (editingId) patch('logs', editingId, payload);
    else put('logs', { id: generateTempId(), equipmentId, ...payload });
    reset();
  };

  const handleEdit = (it: { id: string; logType: string; title: string; description: string; logDate: string; severity: string }) => {
    setForm({
      logType: it.logType,
      severity: it.severity || 'LOW',
      title: it.title,
      logDate: it.logDate ? it.logDate.slice(0, 10) : '',
      description: it.description,
    });
    setEditingId(it.id);
  };
  // 보류(temp)·저장(real) 모두 remove 하나로 — isTempId 가 분기(temp=create 제거 / real=delete staging).
  const handleRemove = (id: string) => {
    if (editingId === id) reset();
    remove('logs', id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 작성 폼 — 항상 노출. 등록하면 아래 이력에 '저장 대기'로 쌓이고 SAVE 시 반영. */}
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
              {editingId ? '수정 적용' : '고장 추가'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* 이력 — 보류(저장 대기) + 저장됨. 빈 상태는 한 곳에서만. */}
      <div className={canWrite ? 'border-t border-line pt-3' : ''}>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-sm font-semibold text-content-muted">고장 이력</span>
          {items.length > 0 && <span className="text-xs text-content-faint">{items.length}건</span>}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-content-faint py-1">기록된 고장 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <SectionItem key={it.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LOG_TYPE_COLORS[it.logType] ?? 'bg-line text-content-muted'}`}>
                      {LOG_TYPE_LABELS[it.logType] ?? it.logType}
                    </span>
                    {it.severity && (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[it.severity] ?? 'bg-surface-2 text-content-muted'}`}>
                        {SEVERITY_LABELS[it.severity] ?? it.severity}
                      </span>
                    )}
                    {it.isPending && <span className="text-xs text-warning">저장 대기</span>}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {it.isPending ? (
                        <>
                          <IconAction onClick={() => handleEdit(it)} title="수정">
                            <Pencil size={14} />
                          </IconAction>
                          <IconAction onClick={() => handleRemove(it.id)} title="삭제" danger>
                            <Trash2 size={14} />
                          </IconAction>
                        </>
                      ) : (
                        <IconAction onClick={() => handleRemove(it.id)} title="삭제" danger>
                          <Trash2 size={14} />
                        </IconAction>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-content">{it.title}</p>
                {it.description && <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{it.description}</p>}
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-content-faint">{it.logDate ? fmtDate(it.logDate) : ''}</p>
                  {it.createdByName && <p className="text-xs text-content-faint">작성: {it.createdByName}</p>}
                </div>
              </SectionItem>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
