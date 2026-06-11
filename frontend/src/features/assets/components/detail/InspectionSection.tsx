import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { isTempId } from '../../../../utils/idHelpers';
import { toDateInputValue } from '../../../../utils/date';
import { useIsAdmin } from '../../../../stores/authStore';
import {
  useInspectionLogs,
  useCreateInspectionLog,
  useUpdateInspectionLog,
  useDeleteInspectionLog,
} from '../../hooks/useInspectionLogs';
import {
  SectionItem,
  PrimaryButton,
  GhostButton,
  IconAction,
  FormRow,
  fieldClass,
} from './SectionShell';

/**
 * 점검(inspection) 섹션 — '항상 노출된 작성 폼 + 아래로 누적되는 이력' 패턴.
 * (토글 버튼 없음 — 정보 탭처럼 폼이 바로 보이고, 등록하면 아래 이력에 쌓인다.)
 * 관리자만 작성/수정/삭제. 작성 시 nodeAssets 무효화로 현황 "마지막 점검일" 자동 갱신.
 */
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

export function InspectionSection({ assetId }: { assetId: string }) {
  const isAdmin = useIsAdmin();
  const isTemp = isTempId(assetId);
  const { data, isLoading } = useInspectionLogs(assetId);
  const logs = Array.isArray(data) ? data : [];
  const createLog = useCreateInspectionLog(assetId);
  const updateLog = useUpdateInspectionLog();
  const deleteLog = useDeleteInspectionLog();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ inspectionDate: todayStr(), inspector: '', content: '' });

  const reset = () => {
    setForm({ inspectionDate: todayStr(), inspector: '', content: '' });
    setEditingId(null);
  };

  const pending = createLog.isPending || updateLog.isPending;
  const canSubmit = !!form.inspectionDate && !!form.inspector.trim() && !pending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      inspectionDate: form.inspectionDate,
      inspector: form.inspector.trim(),
      content: form.content.trim() || null,
    };
    if (editingId) updateLog.mutate({ id: editingId, ...payload }, { onSuccess: reset });
    else createLog.mutate(payload, { onSuccess: reset });
  };

  const handleEdit = (log: (typeof logs)[number]) => {
    setForm({
      inspectionDate: toDateInputValue(log.inspectionDate),
      inspector: log.inspector,
      content: log.content ?? '',
    });
    setEditingId(log.id);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('이 점검 이력을 삭제하시겠습니까?')) return;
    if (editingId === id) reset();
    deleteLog.mutate(id);
  };

  if (isTemp) {
    return <p className="text-xs text-content-faint py-2">자산을 저장한 뒤 점검 이력을 기록할 수 있습니다.</p>;
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
      {/* 작성 폼 — 항상 노출(관리자). 정보 탭과 동일한 라벨-필드 구성. */}
      {isAdmin && (
        <div className="space-y-2">
          <FormRow label="점검일">
            <input
              type="date"
              aria-label="점검일"
              value={form.inspectionDate}
              onChange={(e) => setForm((p) => ({ ...p, inspectionDate: e.target.value }))}
              className={fieldClass}
            />
          </FormRow>
          <FormRow label="점검자">
            <input
              type="text"
              placeholder="점검자 이름"
              aria-label="점검자"
              value={form.inspector}
              onChange={(e) => setForm((p) => ({ ...p, inspector: e.target.value }))}
              className={fieldClass}
            />
          </FormRow>
          <FormRow label="내용">
            <textarea
              placeholder="점검 내용 (선택)"
              aria-label="점검 내용"
              rows={2}
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              className={`${fieldClass} resize-none`}
            />
          </FormRow>
          <div className="flex justify-end gap-2">
            {editingId && <GhostButton onClick={reset}>취소</GhostButton>}
            <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
              {editingId ? '수정 적용' : '점검 등록'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* 이력 — 아래로 누적(최근순). 빈 상태는 한 곳에서만. */}
      <div className={isAdmin ? 'border-t border-line pt-3' : ''}>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-xs font-semibold text-content-muted">점검 이력</span>
          {logs.length > 0 && <span className="text-[11px] text-content-faint">{logs.length}건</span>}
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-content-faint py-1">아직 기록된 점검이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <SectionItem key={log.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2 text-sm min-w-0">
                    <span className="font-medium text-content shrink-0">{fmtDate(log.inspectionDate)}</span>
                    <span className="text-content-muted truncate">{log.inspector}</span>
                  </div>
                  {isAdmin && (
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
                {log.content && (
                  <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{log.content}</p>
                )}
              </SectionItem>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
