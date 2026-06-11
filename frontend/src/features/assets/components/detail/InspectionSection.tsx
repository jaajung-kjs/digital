import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { generateTempId } from '../../../../utils/idHelpers';
import { toDateInputValue } from '../../../../utils/date';
import { useIsAdmin } from '../../../../stores/authStore';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { useInspectionLogs } from '../../hooks/useInspectionLogs';
import {
  SectionItem,
  PrimaryButton,
  GhostButton,
  IconAction,
  FormRow,
  fieldClass,
} from './SectionShell';

/**
 * 점검(inspection) 섹션 — git-like 스테이징.
 *
 * 작성/수정/삭제는 즉시 백엔드로 가지 않고 editorStore.pendingInspections 에 쌓였다가
 * 단일 SAVE(commit) 시 한꺼번에 반영된다(다른 자산/케이블 편집과 동일한 단일 저장 경로).
 *  - 보류(저장 대기) 항목: 인라인 수정/삭제 가능(저장 전이므로).
 *  - 저장된 항목: 커밋된 이력 → 읽기전용.
 */
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

export function InspectionSection({ assetId }: { assetId: string }) {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useInspectionLogs(assetId);
  const savedLogs = Array.isArray(data) ? data : [];

  const pendingInspections = useEditorStore((s) => s.pendingInspections);
  const addPendingInspection = useEditorStore((s) => s.addPendingInspection);
  const updatePendingInspection = useEditorStore((s) => s.updatePendingInspection);
  const removePendingInspection = useEditorStore((s) => s.removePendingInspection);
  const pendingInspectionDeletes = useEditorStore((s) => s.pendingInspectionDeletes);
  const stagePendingInspectionDelete = useEditorStore((s) => s.stagePendingInspectionDelete);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ inspectionDate: todayStr(), inspector: '', content: '' });

  // 표시 목록: 보류(저장 대기) + 저장됨(백엔드). 보류는 가장 위(최근 작성).
  const items = [
    ...pendingInspections
      .filter((i) => i.assetId === assetId)
      .map((i) => ({ id: i.id, inspectionDate: i.inspectionDate, inspector: i.inspector, content: i.content ?? '', isPending: true as const })),
    ...savedLogs
      .filter((l) => !pendingInspectionDeletes.includes(l.id)) // 삭제 스테이징된 행은 숨김(SAVE 시 DELETE).
      .map((l) => ({ id: l.id, inspectionDate: l.inspectionDate, inspector: l.inspector, content: l.content ?? '', isPending: false as const })),
  ];

  const reset = () => {
    setForm({ inspectionDate: todayStr(), inspector: '', content: '' });
    setEditingId(null);
  };
  const canSubmit = !!form.inspectionDate && !!form.inspector.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = { inspectionDate: form.inspectionDate, inspector: form.inspector.trim(), content: form.content.trim() || null };
    if (editingId) updatePendingInspection(editingId, payload);
    else addPendingInspection({ id: generateTempId(), assetId, ...payload });
    reset();
  };

  const handleEdit = (it: { id: string; inspectionDate: string; inspector: string; content: string }) => {
    setForm({ inspectionDate: toDateInputValue(it.inspectionDate), inspector: it.inspector, content: it.content });
    setEditingId(it.id);
  };
  const handleRemove = (id: string) => {
    if (editingId === id) reset();
    removePendingInspection(id);
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
      {/* 작성 폼 — 항상 노출(관리자). 등록하면 아래 이력에 '저장 대기'로 쌓이고, SAVE 시 반영. */}
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
              {editingId ? '수정 적용' : '점검 추가'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* 이력 — 보류(저장 대기) + 저장됨. 빈 상태는 한 곳에서만. */}
      <div className={isAdmin ? 'border-t border-line pt-3' : ''}>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-sm font-semibold text-content-muted">점검 이력</span>
          {items.length > 0 && <span className="text-xs text-content-faint">{items.length}건</span>}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-content-faint py-1">아직 기록된 점검이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <SectionItem key={it.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2 text-sm min-w-0">
                    <span className="font-medium text-content shrink-0">{fmtDate(it.inspectionDate)}</span>
                    <span className="text-content-muted truncate">{it.inspector}</span>
                    {it.isPending && <span className="text-xs text-warning shrink-0">저장 대기</span>}
                  </div>
                  {isAdmin && (
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
                        <IconAction onClick={() => stagePendingInspectionDelete(it.id)} title="삭제" danger>
                          <Trash2 size={14} />
                        </IconAction>
                      )}
                    </div>
                  )}
                </div>
                {it.content && (
                  <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{it.content}</p>
                )}
              </SectionItem>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
