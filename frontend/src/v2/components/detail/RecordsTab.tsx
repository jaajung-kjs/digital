import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button, DetailCard, DetailCardHeader, DetailRow, IconButton, Input, useConfirm, EmptyState, formatDate, isCommitKey } from '../../../components/ui';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { useEffectiveInspections, useEffectiveMaintenance } from '../../store/useWorkingCopy';
import type { V2MaintenanceLog, V2InspectionLog } from '../../types';

// ── ISO 변환 헬퍼 ─────────────────────────────────────────────────────────────
/** datetime-local 입력값(yyyy-MM-ddTHH:mm) → 로컬 시간 기준 ISO 8601 문자열 */
function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

/** ISO 문자열 → datetime-local 입력값(yyyy-MM-ddTHH:mm, 로컬 시간) */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── props ─────────────────────────────────────────────────────────────────────
interface RecordsTabProps {
  assetId: string;
  /** 'maintenance' = 고장이력, 'inspections' = 점검 */
  kind: 'maintenance' | 'inspections';
  /** kind='maintenance' → 'occurredAt'; kind='inspections' → 'inspectedAt' */
  dateField: 'occurredAt' | 'inspectedAt';
  /** kind='maintenance' → 'action'; kind='inspections' → 'result' */
  extraField: 'action' | 'result';
  /** date field label */
  dateLabel: string;
  /** extra field label */
  extraLabel: string;
  /** 섹션 제목 — 패널 안에서 이 목록이 무엇인지 밝힌다. */
  sectionTitle: string;
  /** empty state message */
  emptyMessage: string;
}

type AnyRecord = V2MaintenanceLog | V2InspectionLog;

/** 좁힌 필드 접근자 — dateField/extraField 로 파라미터화된 단일 컴포넌트에서 as any 남용 방지 */
function fieldOf(r: AnyRecord, k: 'occurredAt' | 'inspectedAt' | 'action' | 'result'): string | null {
  return (r as unknown as Record<string, unknown>)[k] as string | null;
}

// ── 행 편집 상태 ──────────────────────────────────────────────────────────────
interface EditState {
  id: string;
  date: string;
  content: string;
  extra: string;
}

// ── 새 레코드 입력 상태 ───────────────────────────────────────────────────────
interface AddState {
  date: string;
  content: string;
  extra: string;
}

function makeEmpty(): AddState {
  return { date: '', content: '', extra: '' };
}

export function RecordsTab({
  assetId,
  kind,
  dateField,
  extraField,
  dateLabel,
  extraLabel,
  sectionTitle,
  emptyMessage,
}: RecordsTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /* 두 갈래를 다 구독한다 — 훅은 갈래를 골라 부를 수 없다(그것이 훅의 규칙이다). */
  const maintenance = useEffectiveMaintenance(assetId);
  const inspections = useEffectiveInspections(assetId);
  const records: AnyRecord[] = kind === 'maintenance' ? maintenance : inspections;

  const sorted = useMemo(
    () => [...records].sort((a, b) => (fieldOf(b, dateField) ?? '').localeCompare(fieldOf(a, dateField) ?? '')),
    [records, dateField],
  );

  const [editState, setEditState] = useState<EditState | null>(null);
  const [addState, setAddState] = useState<AddState>(makeEmpty());
  const [showAdd, setShowAdd] = useState(false);

  // ── 스토어 액션 래퍼 ────────────────────────────────────────────────────────
  function stageCreate(log: AnyRecord) {
    if (kind === 'maintenance') {
      useV2WorkingCopy.getState().stageMaintenanceCreate(log as V2MaintenanceLog);
    } else {
      useV2WorkingCopy.getState().stageInspectionCreate(log as V2InspectionLog);
    }
  }

  function stageUpdate(id: string, patch: Partial<AnyRecord>) {
    if (kind === 'maintenance') {
      useV2WorkingCopy.getState().stageMaintenanceUpdate(id, patch as Partial<V2MaintenanceLog>);
    } else {
      useV2WorkingCopy.getState().stageInspectionUpdate(id, patch as Partial<V2InspectionLog>);
    }
  }

  function stageDelete(id: string) {
    if (kind === 'maintenance') {
      useV2WorkingCopy.getState().stageMaintenanceDelete(id);
    } else {
      useV2WorkingCopy.getState().stageInspectionDelete(id);
    }
  }

  // ── 핸들러 ──────────────────────────────────────────────────────────────────
  function handleAdd() {
    if (!addState.date || !addState.content.trim()) return;
    const isoDate = localInputToIso(addState.date);
    if (isNaN(new Date(isoDate).getTime())) return;
    const id = crypto.randomUUID();
    const log: AnyRecord = {
      id,
      assetId,
      [dateField]: isoDate,
      content: addState.content.trim(),
      [extraField]: addState.extra.trim() || null,
      updatedAt: '',
    } as unknown as AnyRecord;
    stageCreate(log);
    setAddState(makeEmpty());
    setShowAdd(false);
  }

  function handleEditStart(record: AnyRecord) {
    const rawDate = fieldOf(record, dateField) ?? '';
    setEditState({
      id: record.id,
      date: rawDate ? isoToLocalInput(rawDate) : '',
      content: record.content,
      extra: fieldOf(record, extraField) ?? '',
    });
  }

  function handleEditCommit() {
    if (!editState || !editState.date) return;
    const isoDate = localInputToIso(editState.date);
    if (isNaN(new Date(isoDate).getTime())) return;
    const patch: Partial<AnyRecord> = {
      [dateField]: isoDate,
      content: editState.content.trim(),
      [extraField]: editState.extra.trim() || null,
    } as unknown as Partial<AnyRecord>;
    stageUpdate(editState.id, patch);
    setEditState(null);
  }

  function handleEditCancel() {
    setEditState(null);
  }

  async function handleDelete(record: AnyRecord) {
    /* 어느 기록인지 이름으로 부른다 — 목록에 여러 줄이 있을 때 「이 기록」만으로는 못 짚는다. */
    const label = [formatDate(fieldOf(record, dateField)), record.content]
      .filter(Boolean)
      .join(' · ');
    if (!(await confirm({ title: '기록 삭제', target: label, message: '저장 전에는 되돌릴 수 있습니다.', confirmLabel: '삭제', danger: true }))) return;
    stageDelete(record.id);
    if (editState?.id === record.id) setEditState(null);
  }

  return (
    <div className="space-y-2">
      {/* 섹션 머리줄 — 예전에는 제목 없이 '+추가' 버튼만 떠 있어서
          무엇을 추가하는지 패널만 봐서는 알 수 없었다. */}
      <DetailCardHeader
        title={sectionTitle}
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={showAdd ? undefined : <Plus size={13} />}
            onClick={() => { setShowAdd((v) => !v); setAddState(makeEmpty()); }}
          >
            {showAdd ? '취소' : '추가'}
          </Button>
        }
      />

      {/* 추가 폼 */}
      {showAdd && (
        <DetailCard>
          <DetailCardHeader title="새 기록" />
          <DetailRow label={dateLabel}>
            <Input
              type="datetime-local"
              value={addState.date}
              size="sm"
              onChange={(e) => { const v = e.currentTarget.value; setAddState((s) => ({ ...s, date: v })); }}
            />
          </DetailRow>
          <DetailRow label="내용">
            <Input
              value={addState.content}
              size="sm"
              placeholder="내용 입력"
              onChange={(e) => { const v = e.currentTarget.value; setAddState((s) => ({ ...s, content: v })); }}
              onKeyDown={(e) => { if (isCommitKey(e)) handleAdd(); }}
            />
          </DetailRow>
          <DetailRow label={extraLabel}>
            <Input
              value={addState.extra}
              size="sm"
              placeholder="(선택)"
              onChange={(e) => { const v = e.currentTarget.value; setAddState((s) => ({ ...s, extra: v })); }}
              onKeyDown={(e) => { if (isCommitKey(e)) handleAdd(); }}
            />
          </DetailRow>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!addState.date || !addState.content.trim()}
              onClick={handleAdd}
            >
              저장
            </Button>
          </div>
        </DetailCard>
      )}

      {/* 목록 */}
      {sorted.length === 0 && !showAdd && <EmptyState title={emptyMessage} className="py-6" />}

      {sorted.map((record) => {
        const isEditing = editState?.id === record.id;
        const dateVal = fieldOf(record, dateField) ?? '';
        const extraVal = fieldOf(record, extraField) ?? '';

        if (isEditing) {
          return (
            <DetailCard key={record.id}>
              <DetailRow label={dateLabel}>
                <Input
                  type="datetime-local"
                  value={editState.date}
                  size="sm"
                  onChange={(e) => { const v = e.currentTarget.value; setEditState((s) => s && ({ ...s, date: v })); }}
                />
              </DetailRow>
              <DetailRow label="내용">
                <Input
                  value={editState.content}
                  size="sm"
                  onChange={(e) => { const v = e.currentTarget.value; setEditState((s) => s && ({ ...s, content: v })); }}
                  onKeyDown={(e) => { if (isCommitKey(e)) handleEditCommit(); }}
                />
              </DetailRow>
              <DetailRow label={extraLabel}>
                <Input
                  value={editState.extra}
                  size="sm"
                  onChange={(e) => { const v = e.currentTarget.value; setEditState((s) => s && ({ ...s, extra: v })); }}
                  onKeyDown={(e) => { if (isCommitKey(e)) handleEditCommit(); }}
                />
              </DetailRow>
              <div className="mt-2 flex justify-end gap-1">
                <IconButton aria-label="취소" onClick={handleEditCancel}>
                  <X size={14} />
                </IconButton>
                <IconButton aria-label="저장" onClick={handleEditCommit}>
                  <Check size={14} />
                </IconButton>
              </div>
            </DetailCard>
          );
        }

        return (
          <DetailCard key={record.id}>
            <DetailCardHeader
              title={dateVal.slice(0, 16).replace('T', ' ')}
              badge={extraVal || undefined}
              badgeStatus="neutral"
              onEdit={() => handleEditStart(record)}
              onDelete={() => handleDelete(record)}
            />
            <p className="text-sm text-content">{record.content}</p>
          </DetailCard>
        );
      })}
      {confirmDialog}
    </div>
  );
}
