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
  SectionHeader,
  SectionAction,
  SectionEmpty,
  SectionItem,
  SectionForm,
  PrimaryButton,
  IconAction,
  fieldClass,
} from './SectionShell';

/**
 * 점검(inspection) 섹션 — 날짜·점검자·내용 목록(최근순) + 추가/편집 폼.
 * 관리자만 작성/수정/삭제. 가장 최근 점검일을 "최근 점검일"로 강조.
 * 작성 시 nodeAssets 무효화로 현황 "마지막 점검일" 자동 갱신(훅이 처리).
 */
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ko-KR');
}

export function InspectionSection({ assetId }: { assetId: string }) {
  const isAdmin = useIsAdmin();
  const isTemp = isTempId(assetId);
  const { data, isLoading } = useInspectionLogs(assetId);
  const logs = Array.isArray(data) ? data : [];
  const createLog = useCreateInspectionLog(assetId);
  const updateLog = useUpdateInspectionLog();
  const deleteLog = useDeleteInspectionLog();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    inspectionDate: todayStr(),
    inspector: '',
    content: '',
  });

  const latest = logs[0] ?? null;

  const reset = () => {
    setForm({ inspectionDate: todayStr(), inspector: '', content: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!form.inspectionDate || !form.inspector.trim()) return;
    const payload = {
      inspectionDate: form.inspectionDate,
      inspector: form.inspector.trim(),
      content: form.content.trim() || null,
    };
    if (editingId) {
      updateLog.mutate({ id: editingId, ...payload }, { onSuccess: reset });
    } else {
      createLog.mutate(payload, { onSuccess: reset });
    }
  };

  const handleEdit = (log: (typeof logs)[number]) => {
    setForm({
      inspectionDate: toDateInputValue(log.inspectionDate),
      inspector: log.inspector,
      content: log.content ?? '',
    });
    setEditingId(log.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('이 점검 이력을 삭제하시겠습니까?')) return;
    deleteLog.mutate(id);
  };

  if (isTemp) {
    return <SectionEmpty>저장 후 점검 이력을 기록할 수 있습니다.</SectionEmpty>;
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  const pending = createLog.isPending || updateLog.isPending;

  return (
    <div>
      <SectionHeader
        title={
          latest ? `최근 점검일 · ${fmtDate(latest.inspectionDate)}` : '점검 이력 없음'
        }
        action={
          isAdmin ? (
            <SectionAction
              onClick={() => (showForm ? reset() : setShowForm(true))}
              tone={showForm ? 'muted' : 'primary'}
            >
              {showForm ? '취소' : '+ 점검 추가'}
            </SectionAction>
          ) : undefined
        }
      />

      {showForm && isAdmin && (
        <SectionForm>
          <input
            type="date"
            aria-label="점검일"
            value={form.inspectionDate}
            onChange={(e) => setForm((p) => ({ ...p, inspectionDate: e.target.value }))}
            className={fieldClass}
          />
          <input
            type="text"
            placeholder="점검자"
            aria-label="점검자"
            value={form.inspector}
            onChange={(e) => setForm((p) => ({ ...p, inspector: e.target.value }))}
            className={fieldClass}
          />
          <textarea
            placeholder="점검 내용 (선택)"
            aria-label="점검 내용"
            rows={2}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            className={`${fieldClass} resize-none`}
          />
          <PrimaryButton
            onClick={handleSubmit}
            disabled={pending || !form.inspectionDate || !form.inspector.trim()}
          >
            {editingId ? '수정 적용' : '점검 등록'}
          </PrimaryButton>
        </SectionForm>
      )}

      {logs.length === 0 ? (
        <SectionEmpty>점검 이력이 없습니다.</SectionEmpty>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <SectionItem key={log.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-content">{fmtDate(log.inspectionDate)}</span>
                  <span className="text-content-muted">{log.inspector}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-0.5">
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
  );
}
