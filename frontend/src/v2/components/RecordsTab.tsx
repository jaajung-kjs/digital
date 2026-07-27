import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button, DetailCard, DetailCardHeader, DetailRow, IconButton, Input } from '../../components/ui';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { mergeEffective } from '../store/overlay';
import type { V2MaintenanceLog, V2InspectionLog } from '../types';

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
  /** empty state message */
  emptyMessage: string;
}

type AnyRecord = V2MaintenanceLog | V2InspectionLog;

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

export function RecordsTab({ assetId, kind, dateField, extraField, dateLabel, extraLabel, emptyMessage }: RecordsTabProps) {
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const records = useMemo<AnyRecord[]>(() => {
    if (kind === 'maintenance') {
      return mergeEffective(saved.maintenanceLogs, overlays.maintenance).filter((r) => r.assetId === assetId);
    }
    return mergeEffective(saved.inspectionLogs, overlays.inspections).filter((r) => r.assetId === assetId);
  }, [kind, saved, overlays, assetId]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => (b as any)[dateField].localeCompare((a as any)[dateField])),
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
    const id = crypto.randomUUID();
    const log: AnyRecord = {
      id,
      assetId,
      [dateField]: addState.date,
      content: addState.content.trim(),
      [extraField]: addState.extra.trim() || null,
      updatedAt: '',
    } as unknown as AnyRecord;
    stageCreate(log);
    setAddState(makeEmpty());
    setShowAdd(false);
  }

  function handleEditStart(record: AnyRecord) {
    setEditState({
      id: record.id,
      date: (record as any)[dateField] as string,
      content: record.content,
      extra: ((record as any)[extraField] as string | null) ?? '',
    });
  }

  function handleEditCommit() {
    if (!editState) return;
    const patch: Partial<AnyRecord> = {
      [dateField]: editState.date,
      content: editState.content.trim(),
      [extraField]: editState.extra.trim() || null,
    } as unknown as Partial<AnyRecord>;
    stageUpdate(editState.id, patch);
    setEditState(null);
  }

  function handleEditCancel() {
    setEditState(null);
  }

  function handleDelete(id: string) {
    if (!window.confirm('이 기록을 삭제하시겠습니까?')) return;
    stageDelete(id);
    if (editState?.id === id) setEditState(null);
  }

  return (
    <div className="space-y-2">
      {/* 추가 버튼 */}
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setShowAdd((v) => !v); setAddState(makeEmpty()); }}
        >
          {showAdd ? '취소' : '+ 추가'}
        </Button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <DetailCard>
          <p className="text-xs font-semibold text-content-muted mb-2">새 기록</p>
          <DetailRow label={dateLabel}>
            <Input
              type="datetime-local"
              value={addState.date}
              className="py-0.5 text-sm"
              onChange={(e) => setAddState((s) => ({ ...s, date: e.currentTarget.value }))}
            />
          </DetailRow>
          <DetailRow label="내용">
            <Input
              value={addState.content}
              className="py-0.5 text-sm"
              placeholder="내용 입력"
              onChange={(e) => setAddState((s) => ({ ...s, content: e.currentTarget.value }))}
              onKeyDown={(e) => { if (e.code === 'Enter') handleAdd(); }}
            />
          </DetailRow>
          <DetailRow label={extraLabel}>
            <Input
              value={addState.extra}
              className="py-0.5 text-sm"
              placeholder="(선택)"
              onChange={(e) => setAddState((s) => ({ ...s, extra: e.currentTarget.value }))}
              onKeyDown={(e) => { if (e.code === 'Enter') handleAdd(); }}
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
      {sorted.length === 0 && !showAdd && (
        <p className="text-sm text-content-faint">{emptyMessage}</p>
      )}

      {sorted.map((record) => {
        const isEditing = editState?.id === record.id;
        const dateVal = (record as any)[dateField] as string;
        const extraVal = ((record as any)[extraField] as string | null) ?? '';

        if (isEditing) {
          return (
            <DetailCard key={record.id}>
              <DetailRow label={dateLabel}>
                <Input
                  type="datetime-local"
                  value={editState.date}
                  className="py-0.5 text-sm"
                  onChange={(e) => setEditState((s) => s && ({ ...s, date: e.currentTarget.value }))}
                />
              </DetailRow>
              <DetailRow label="내용">
                <Input
                  value={editState.content}
                  className="py-0.5 text-sm"
                  onChange={(e) => setEditState((s) => s && ({ ...s, content: e.currentTarget.value }))}
                  onKeyDown={(e) => { if (e.code === 'Enter') handleEditCommit(); }}
                />
              </DetailRow>
              <DetailRow label={extraLabel}>
                <Input
                  value={editState.extra}
                  className="py-0.5 text-sm"
                  onChange={(e) => setEditState((s) => s && ({ ...s, extra: e.currentTarget.value }))}
                  onKeyDown={(e) => { if (e.code === 'Enter') handleEditCommit(); }}
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
              onDelete={() => handleDelete(record.id)}
            />
            <p className="text-sm text-content">{record.content}</p>
          </DetailCard>
        );
      })}
    </div>
  );
}
