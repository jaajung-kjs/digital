import { useState } from 'react';
import { INSPECTIONS, LOGS } from './recordTypes';
import { Pencil, Trash2 } from 'lucide-react';
import { generateTempId, isTempId } from '../../utils/idHelpers';
import { toDateInputValue, formatDate } from '../../utils/date';
import { useSubstationWorkingCopy } from './substationStore';
import { useAssetRecords } from './hooks';
import type { RecordTypeDef, RecordFieldDef } from './recordTypes';
import {
  SectionItem,
  PrimaryButton,
  GhostButton,
  IconAction,
  FormRow,
  fieldClass,
} from '../assets/components/detail/SectionShell';

/**
 * P5c — 데이터-주도 form-list 렌더러.
 *
 * InspectionSection + LogsTab 의 git-like 스테이징 UI 를 ASSET_RECORD_TYPES 레지스트리
 * 한 정의(def)로 재현한다. 저장·스테이징 모두 워킹카피 단일 소스(saved+overlay effective)로
 * 조회한다 — 자산별 RQ 이중머지를 폐지(데이터는 워킹카피 한 곳).
 *  - 보류(temp id = staged create)·저장됨(real id) 모두 수정/삭제. 저장된 행 수정은
 *    patch→overlay update→commit(OCC 버전체크)로 반영(백엔드 update + audit 지원).
 *  - 표시 목록 = 보류(위) + 저장됨. 삭제 staged 는 effective 가 이미 제외.
 *  - 폼/행은 def.fields(type 별) + def.formList(헤더/빈상태/버튼/행변형)로 구동.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);

type FormState = Record<string, string>;

/** def.fields 로부터 신규 폼 초기값 빌드(date+defaultToday=오늘, 그 외 defaultValue|''). */
function initialForm(fields: RecordFieldDef[]): FormState {
  const out: FormState = {};
  for (const f of fields) {
    if (f.type === 'date' && f.defaultToday) out[f.name] = todayStr();
    else out[f.name] = f.defaultValue ?? '';
  }
  return out;
}

/** 한 필드를 type 별로 렌더(FormRow 래핑). */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: RecordFieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const common = { 'aria-label': field.label, value, className: fieldClass };
  let control;
  if (field.type === 'date') {
    control = <input type="date" {...common} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <select {...common} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  } else if (field.type === 'textarea') {
    control = (
      <textarea
        placeholder={field.placeholder}
        rows={2}
        {...common}
        className={`${fieldClass} resize-none`}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else {
    control = (
      <input type="text" placeholder={field.placeholder} {...common} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return <FormRow label={field.label}>{control}</FormRow>;
}

export function RecordFormList({
  def,
  parentId,
  readOnly,
}: {
  def: RecordTypeDef;
  parentId: string;
  readOnly?: boolean;
}) {
  const fl = def.formList!;

  // 단일 소스: 이 자산의 이 종류 레코드(saved+overlay effective). 삭제 staged 는 effective 가 제외.
  const records = useAssetRecords(parentId, def.key) as (Record<string, unknown> & { id: string })[];
  const put = useSubstationWorkingCopy((s) => s.put);
  const patch = useSubstationWorkingCopy((s) => s.patch);
  const remove = useSubstationWorkingCopy((s) => s.remove);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(def.fields));

  const canWrite = !readOnly;

  // 표시 목록: 보류(temp id) 위 + 저장됨(real id).
  const items = buildItems(def, parentId, records);

  const reset = () => {
    setForm(initialForm(def.fields));
    setEditingId(null);
  };

  const requiredFields = def.fields.filter((f) => f.required);
  const canSubmit = requiredFields.every((f) => !!(form[f.name] ?? '').trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = buildPayload(def, form);
    if (editingId) patch('records', editingId, payload);
    else put('records', { id: generateTempId(), assetId: parentId, recordType: def.key, ...payload });
    reset();
  };

  const handleEdit = (it: RowItem) => {
    const next: FormState = {};
    for (const f of def.fields) {
      const raw = it.values[f.name];
      if (f.type === 'date') next[f.name] = raw ? toDateInputValue(String(raw)) : '';
      // select 는 빈 값도 defaultValue 로 폴백(종전 LogsTab: severity || 'LOW').
      else if (f.type === 'select') next[f.name] = raw ? String(raw) : (f.defaultValue ?? '');
      else next[f.name] = raw == null ? (f.defaultValue ?? '') : String(raw);
    }
    setForm(next);
    setEditingId(it.id);
  };

  // 보류(temp)·저장(real) 모두 remove 하나로 — isTempId 가 분기(temp=create 제거 / real=delete staging).
  const handleRemove = (id: string) => {
    if (editingId === id) reset();
    remove('records', id);
  };

  return (
    <div className="space-y-4">
      {/* 작성 폼 — 등록하면 아래 이력에 '저장 대기'로 쌓이고 SAVE 시 반영. */}
      {canWrite && (
        <div className="space-y-2">
          {def.fields.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={form[f.name] ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))}
            />
          ))}
          <div className="flex justify-end gap-2">
            {editingId && <GhostButton onClick={reset}>취소</GhostButton>}
            <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
              {editingId ? '수정 적용' : fl.addLabel}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* 이력 — 보류(저장 대기) + 저장됨. 빈 상태는 한 곳에서만. */}
      <div className={canWrite ? 'border-t border-line pt-3' : ''}>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-sm font-semibold text-content-muted">{fl.historyLabel}</span>
          {items.length > 0 && <span className="text-xs text-content-faint">{items.length}건</span>}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-content-faint py-1">{fl.emptyText}</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) =>
              fl.rowVariant === 'inspection' ? (
                <InspectionRow key={it.id} it={it} canWrite={canWrite} onEdit={handleEdit} onRemove={handleRemove} />
              ) : (
                <LogRow key={it.id} def={def} it={it} canWrite={canWrite} onEdit={handleEdit} onRemove={handleRemove} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 행 모델 + 빌더 ───────────────────────────────────────────────────────────

interface RowItem {
  id: string;
  isPending: boolean;
  values: Record<string, unknown>;
  createdByName?: string | null;
}

/** create payload — 필드 type 별 정규화(점검/고장이력의 종전 동작과 동일). */
function buildPayload(def: RecordTypeDef, form: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = form[f.name] ?? '';
    if (f.type === 'textarea') {
      // 빈 textarea 규약: 점검 content '' → null, 고장 description '' → undefined(종전 표현 유지).
      out[f.name] = def.key === INSPECTIONS ? (v.trim() || null) : (v.trim() || undefined);
    } else if (f.type === 'date') {
      out[f.name] = def.key === LOGS ? (v || undefined) : v;
    } else if (f.required) {
      out[f.name] = v.trim();
    } else {
      out[f.name] = v;
    }
  }
  return out;
}

/** effective(saved+staged) 레코드를 표시 행으로 — 보류(temp id)가 위, 저장됨(real id)이 아래. */
function buildItems(
  def: RecordTypeDef,
  parentId: string,
  records: (Record<string, unknown> & { id: string })[],
): RowItem[] {
  const toRow = (r: Record<string, unknown> & { id: string }): RowItem => {
    const values: Record<string, unknown> = {};
    for (const f of def.fields) {
      // 고장이력: logDate 없으면 createdAt 폴백, severity 없으면 ''(종전 LogsTab 동작).
      if (def.key === LOGS && f.name === 'logDate') values[f.name] = (r.logDate ?? r.createdAt) ?? '';
      else if (def.key === LOGS && f.name === 'severity') values[f.name] = r.severity ?? '';
      else values[f.name] = r[f.name] ?? null;
    }
    return { id: r.id, isPending: isTempId(r.id), values, createdByName: (r.createdByName as string) ?? null };
  };
  const mine = records.filter((r) => r.assetId === parentId);
  const pending = mine.filter((r) => isTempId(r.id)).map(toRow);
  const persisted = mine.filter((r) => !isTempId(r.id)).map(toRow);
  return [...pending, ...persisted];
}

// ── 행 변형: 점검 ────────────────────────────────────────────────────────────
function InspectionRow({
  it,
  canWrite,
  onEdit,
  onRemove,
}: {
  it: RowItem;
  canWrite: boolean;
  onEdit: (it: RowItem) => void;
  onRemove: (id: string) => void;
}) {
  const inspectionDate = String(it.values.inspectionDate ?? '');
  const inspector = String(it.values.inspector ?? '');
  const content = it.values.content ? String(it.values.content) : '';
  return (
    <SectionItem>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2 text-sm min-w-0">
          <span className="font-medium text-content shrink-0">{formatDate(inspectionDate)}</span>
          <span className="text-content-muted truncate">{inspector}</span>
          {it.isPending && <span className="text-xs text-warning shrink-0">저장 대기</span>}
        </div>
        {canWrite && <RowActions it={it} onEdit={onEdit} onRemove={onRemove} />}
      </div>
      {content && <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{content}</p>}
    </SectionItem>
  );
}

// ── 행 변형: 고장이력 ─────────────────────────────────────────────────────────
function LogRow({
  def,
  it,
  canWrite,
  onEdit,
  onRemove,
}: {
  def: RecordTypeDef;
  it: RowItem;
  canWrite: boolean;
  onEdit: (it: RowItem) => void;
  onRemove: (id: string) => void;
}) {
  const logTypeBadge = def.fields.find((f) => f.name === 'logType')!.badge!;
  const severityBadge = def.fields.find((f) => f.name === 'severity')!.badge!;
  const logType = String(it.values.logType ?? '');
  const severity = it.values.severity ? String(it.values.severity) : '';
  const title = String(it.values.title ?? '');
  const description = it.values.description ? String(it.values.description) : '';
  const logDate = it.values.logDate ? String(it.values.logDate) : '';
  return (
    <SectionItem>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${logTypeBadge.colors[logType] ?? logTypeBadge.fallback}`}>
            {logTypeBadge.labels[logType] ?? logType}
          </span>
          {severity && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityBadge.colors[severity] ?? severityBadge.fallback}`}>
              {severityBadge.labels[severity] ?? severity}
            </span>
          )}
          {it.isPending && <span className="text-xs text-warning">저장 대기</span>}
        </div>
        {canWrite && <RowActions it={it} onEdit={onEdit} onRemove={onRemove} />}
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {description && <p className="text-sm text-content-muted mt-1 whitespace-pre-wrap">{description}</p>}
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-content-faint">{logDate ? formatDate(logDate) : ''}</p>
        {it.createdByName && <p className="text-xs text-content-faint">작성: {it.createdByName}</p>}
      </div>
    </SectionItem>
  );
}

/** 보류·저장 모두 수정/삭제. 저장된 레코드 수정은 patch→overlay update→commit(OCC 버전체크)로 반영. */
function RowActions({
  it,
  onEdit,
  onRemove,
}: {
  it: RowItem;
  onEdit: (it: RowItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <IconAction onClick={() => onEdit(it)} title="수정">
        <Pencil size={14} />
      </IconAction>
      <IconAction onClick={() => onRemove(it.id)} title="삭제" danger>
        <Trash2 size={14} />
      </IconAction>
    </div>
  );
}
