import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Button, DateInput, DetailCard, DetailCardHeader, DetailRow, IconButton, Input, ListItemRow, Modal, TIME_PATTERN, TimeInput,
  formatDate, formatDateTime, today, useConfirm,
} from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { deleteLeafRow } from '../../model/store/deleteActions';
import type { InspectionLog, MaintenanceLog } from '../../model/types';
import { newId } from '../../newId';
import { EditOnly } from '../../useCanEdit';
import { deleteConfirm } from '../deleteConfirm';
import { RECORD_FIELD_LABELS } from '../equipment/fieldLabels';

// ── 날짜 + 시각 ↔ ISO ───────────────────────────────────────────────────────
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 「YYYY-MM-DD」 + 「HH:mm」(비면 00:00, 로컬 시각) → ISO. 날짜가 아니면 null. */
function toIso(date: string, time: string): string | null {
  const m = DATE.exec(date.trim());
  if (!m) return null;
  const t = time.trim();
  if (t !== '' && !TIME_PATTERN.test(t)) return null;
  const [h, mi] = t === '' ? [0, 0] : t.split(':').map(Number);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d.toISOString();
}

/** ISO → 「YYYY-MM-DD」 · 「HH:mm」(로컬). 자정이면 시각은 비운다(시각 없이 적은 기록). */
function fromIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const text = formatDateTime(iso);
  const [date = '', time = ''] = text.split(' ');
  return { date, time: time === '00:00' ? '' : time };
}

/** 표시 — 시각이 있으면 「YYYY-MM-DD HH:mm」, 없으면 날짜만. */
function whenText(iso: string | null): string {
  const { date, time } = fromIso(iso);
  return time ? `${date} ${time}` : date || formatDate(iso);
}

// ── props ─────────────────────────────────────────────────────────────────────
interface RecordsTabProps {
  equipmentId: string;
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
  /** 섹션 제목 — 패널 안에서 이 목록이 무엇인지 밝힌다. 단추·창 이름은 「<제목> 추가」다. */
  sectionTitle: string;
  /** empty state message */
  emptyMessage: string;
}

type AnyRecord = MaintenanceLog | InspectionLog;

/** 좁힌 필드 접근자 — dateField/extraField 로 파라미터화된 단일 컴포넌트에서 as any 남용 방지 */
function fieldOf(r: AnyRecord, k: 'occurredAt' | 'inspectedAt' | 'action' | 'result'): string | null {
  return (r as unknown as Record<string, unknown>)[k] as string | null;
}

/** 창에 펴는 값 — 만들기면 `id` 가 없다. */
interface Draft { id: string | null; date: string; time: string; content: string; extra: string }

/**
 * 점검 기록·고장 이력 한 절 — **한 절 = 한 카드**, 항목은 카드가 아니라 목록 줄(`ListItemRow`: 내용 + 날짜·결과)이다(§3.2).
 * 만들기와 고치기는 **같은 창**이다(§1.7-m) — 「<제목> 추가」·「<제목> 수정」. 날짜는 `DateInput` + 선택 시각(`TimeInput`).
 */
export function RecordsTab({
  equipmentId, kind, dateField, extraField, dateLabel, extraLabel, sectionTitle, emptyMessage,
}: RecordsTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /* 저장본 ⊕ 변경안에서 이 설비의 것만 — 훅은 갈래를 골라 부를 수 없어 두 갈래를 다 구독한다. */
  const saved = useWorkingCopy((st) => st.saved);
  const overlays = useWorkingCopy((st) => st.overlays);
  const records: AnyRecord[] = useMemo(() => {
    const rows = kind === 'maintenance' ? effectiveRows({ saved, overlays }, 'maintenance') : effectiveRows({ saved, overlays }, 'inspections');
    return (rows as AnyRecord[]).filter((r) => r.equipmentId === equipmentId);
  }, [saved, overlays, kind, equipmentId]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => (fieldOf(b, dateField) ?? '').localeCompare(fieldOf(a, dateField) ?? '')),
    [records, dateField],
  );

  const [draft, setDraft] = useState<Draft | null>(null);

  async function remove(record: AnyRecord) {
    /* 어느 기록인지 이름으로 부른다 — 목록에 여러 줄이 있을 때 「이 기록」만으로는 못 짚는다. */
    const label = [formatDate(fieldOf(record, dateField)), record.content].filter(Boolean).join(' · ');
    if (!(await confirm(deleteConfirm('기록', label)))) return false;
    deleteLeafRow(kind, record.id);
    return true;
  }

  function submit(d: Draft) {
    const iso = toIso(d.date, d.time);
    if (!iso || !d.content.trim()) return;
    const fields = { [dateField]: iso, content: d.content.trim(), [extraField]: d.extra.trim() || null };
    if (d.id == null) {
      workingCopyStore.getState().create(kind, { id: newId(), equipmentId, ...fields, updatedAt: '' } as never);
    } else {
      workingCopyStore.getState().update(kind, d.id, fields as never);
    }
    setDraft(null);
  }

  const editing = draft?.id != null ? records.find((r) => r.id === draft.id) ?? null : null;

  return (
    <DetailCard>
      <DetailCardHeader
        title={sectionTitle}
        actions={(
          <EditOnly>
            <Button variant="secondary" size="sm" onClick={() => setDraft({ id: null, date: today(), time: '', content: '', extra: '' })}>
              {sectionTitle} 추가
            </Button>
          </EditOnly>
        )}
      />
      {/* 빈 상태는 **한 줄**이다 — 절이 여럿 쌓이는 탭에서 절마다 큰 빈 상자를 세우면 아무것도 없는 화면이 제일 길어진다. */}
      {sorted.length === 0 ? (
        <p className="px-1 py-1 text-sm text-content-faint">{emptyMessage}</p>
      ) : (
        <div>
          {sorted.map((record) => {
            const extra = fieldOf(record, extraField);
            const meta = [whenText(fieldOf(record, dateField)), extra ? `${extraLabel} ${extra}` : null].filter(Boolean).join(' · ');
            return (
              <ListItemRow
                key={record.id}
                meta={<span title={meta}>{meta}</span>}
                actions={(
                  <EditOnly>
                    <IconButton
                      size="sm" aria-label={`${sectionTitle} 수정`} title={`${sectionTitle} 수정`}
                      onClick={() => setDraft({ id: record.id, ...fromIso(fieldOf(record, dateField)), content: record.content, extra: extra ?? '' })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton size="sm" tone="danger" aria-label={`${sectionTitle} 삭제`} title={`${sectionTitle} 삭제`} onClick={() => void remove(record)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </EditOnly>
                )}
              >
                <span className="block truncate" title={record.content}>{record.content}</span>
              </ListItemRow>
            );
          })}
        </div>
      )}
      {draft && (
        <RecordDialog
          title={`${sectionTitle} ${draft.id == null ? '추가' : '수정'}`}
          verb={draft.id == null ? '추가' : '수정'}
          draft={draft} dateLabel={dateLabel} extraLabel={extraLabel}
          onSubmit={submit} onClose={() => setDraft(null)}
          onDelete={editing ? async () => { if (await remove(editing)) setDraft(null); } : undefined}
          deleteLabel={`${sectionTitle} 삭제`}
        />
      )}
      {confirmDialog}
    </DetailCard>
  );
}

/**
 * 기록 한 건의 창 — 날짜(`DateInput`) · 시각(선택, `TimeInput`) · 내용 · 결과/조치.
 * **「저장」이라고 적지 않는다** — 이 창이 하는 일은 목록에 한 줄을 싣는 것이고 서버로 보내는 일은 저장 바 하나가 한다.
 */
function RecordDialog({ title, verb, draft: initial, dateLabel, extraLabel, onSubmit, onClose, onDelete, deleteLabel }: {
  title: string; verb: string; draft: Draft; dateLabel: string; extraLabel: string;
  onSubmit: (d: Draft) => void; onClose: () => void; onDelete?: () => void; deleteLabel: string;
}) {
  const [d, setD] = useState(initial);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => { const v = e.currentTarget.value; setD((x) => ({ ...x, [k]: v })); };
  const dateBad = d.date.trim() !== '' && !DATE.test(d.date.trim()) ? '날짜는 2026-10-08 형식으로 입력하세요' : undefined;
  const timeBad = d.time.trim() !== '' && !TIME_PATTERN.test(d.time.trim()) ? '시각은 14:30 형식으로 입력하세요' : undefined;
  const ok = toIso(d.date, d.time) != null && d.content.trim() !== '';
  return (
    <Modal
      open onClose={onClose} title={title} size="sm"
      footer={(
        <>
          {onDelete && <Button variant="secondary" tone="danger" className="mr-auto" onClick={onDelete}>{deleteLabel}</Button>}
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button disabled={!ok} onClick={() => onSubmit(d)}>{verb}</Button>
        </>
      )}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(d); }}>
        <DetailCard>
          <DetailRow label={dateLabel} required issue={dateBad}>
            <DateInput size="sm" aria-label={dateLabel} autoFocus invalid={!!dateBad} value={d.date} onChange={set('date')} />
          </DetailRow>
          <DetailRow label="시각" issue={timeBad}>
            <TimeInput size="sm" aria-label="시각" invalid={!!timeBad} value={d.time} onChange={set('time')} />
          </DetailRow>
          <DetailRow label={RECORD_FIELD_LABELS.content} required>
            <Input size="sm" aria-label={RECORD_FIELD_LABELS.content} value={d.content} onChange={set('content')} />
          </DetailRow>
          <DetailRow label={extraLabel}>
            <Input size="sm" aria-label={extraLabel} value={d.extra} onChange={set('extra')} />
          </DetailRow>
        </DetailCard>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
