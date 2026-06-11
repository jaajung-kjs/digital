import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { generateTempId } from '../../utils/idHelpers';
import { toDateInputValue } from '../../utils/date';
import { useSubstationWorkingCopy } from './substationStore';
import { useEffectiveRecords } from './hooks';
import type { RecordTypeDef, RecordFieldDef } from './recordTypes';
import { useInspectionLogs } from '../assets/hooks/useInspectionLogs';
import { useMaintenanceLogs } from '../equipment/hooks/useMaintenanceLogs';
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
 * 한 정의(def)로 재현한다. 저장된 데이터는 자산별 RQ 로, 스테이징은 워킹카피 overlay 로.
 *  - 보류(저장 대기) 항목: 인라인 수정/삭제. 저장된 항목: 커밋 이력 → 읽기전용(삭제만).
 *  - 표시 목록 = 보류(staged create) 위 + 저장됨(RQ, 삭제 staged 제외).
 *  - 폼/행은 def.fields(type 별) + def.formList(헤더/빈상태/버튼/행변형)로 구동.
 *
 * 종전 두 컴포넌트와 마크업 byte-identical 을 목표로 한다(행 변형만 명시 분기).
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ko-KR');

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

/** 저장된 RQ 행을 컬렉션별로 로드 — 키마다 다른 읽기 전용 쿼리 훅을 분기(둘 다 항상 호출, hooks 규칙 준수). */
function useSavedRecords(def: RecordTypeDef, parentId: string): { rows: Record<string, unknown>[]; isLoading: boolean } {
  const inspection = useInspectionLogs(def.key === 'inspections' ? parentId : '');
  const maintenance = useMaintenanceLogs(def.key === 'logs' ? parentId : '');
  const active = def.key === 'inspections' ? inspection : maintenance;
  return { rows: Array.isArray(active.data) ? (active.data as unknown as Record<string, unknown>[]) : [], isLoading: active.isLoading };
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
  const { rows: savedRows, isLoading } = useSavedRecords(def, parentId);

  const staged = useEffectiveRecords<Record<string, unknown> & { id: string }>(def.key);
  const deletes = useSubstationWorkingCopy((s) => s.overlays[def.key].deletes);
  const put = useSubstationWorkingCopy((s) => s.put);
  const patch = useSubstationWorkingCopy((s) => s.patch);
  const remove = useSubstationWorkingCopy((s) => s.remove);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(def.fields));

  const canWrite = !readOnly;

  // 표시 목록: 보류(저장 대기, staged create) 위 + 저장됨(RQ, 삭제 staged 제외).
  const items = buildItems(def, parentId, staged, savedRows, deletes);

  const reset = () => {
    setForm(initialForm(def.fields));
    setEditingId(null);
  };

  const requiredFields = def.fields.filter((f) => f.required);
  const canSubmit = requiredFields.every((f) => !!(form[f.name] ?? '').trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = buildPayload(def, form);
    if (editingId) patch(def.key, editingId, payload);
    else put(def.key, { id: generateTempId(), [def.parentKey]: parentId, ...payload });
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
    remove(def.key, id);
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
      // 점검 content: '' → null; 고장 description: '' → undefined. media 외엔 createBody 가 최종 정규화하지만
      // overlay(staged) 표현을 종전과 맞추기 위해 컬렉션별 빈값 규약을 따른다.
      out[f.name] = def.key === 'inspections' ? (v.trim() || null) : (v.trim() || undefined);
    } else if (f.type === 'date') {
      out[f.name] = def.key === 'logs' ? (v || undefined) : v;
    } else if (f.required) {
      out[f.name] = v.trim();
    } else {
      out[f.name] = v;
    }
  }
  return out;
}

/** 보류(staged) + 저장됨(RQ, 삭제 staged 제외) 을 표시 행으로 — 보류가 위. */
function buildItems(
  def: RecordTypeDef,
  parentId: string,
  staged: (Record<string, unknown> & { id: string })[],
  saved: Record<string, unknown>[],
  deletes: string[],
): RowItem[] {
  const pending = staged
    .filter((r) => r[def.parentKey] === parentId)
    .map((r) => ({ id: r.id, isPending: true as const, values: r, createdByName: null }));

  const persisted = saved
    .filter((r) => !deletes.includes(r.id as string))
    .map((r) => {
      const values: Record<string, unknown> = {};
      for (const f of def.fields) {
        // 고장이력: logDate 없으면 createdAt 폴백, severity 없으면 ''(종전 LogsTab 동작).
        if (def.key === 'logs' && f.name === 'logDate') values[f.name] = (r.logDate ?? r.createdAt) ?? '';
        else if (def.key === 'logs' && f.name === 'severity') values[f.name] = r.severity ?? '';
        else values[f.name] = r[f.name] ?? null;
      }
      return { id: r.id as string, isPending: false as const, values, createdByName: (r.createdByName as string) ?? null };
    });

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
          <span className="font-medium text-content shrink-0">{fmtDate(inspectionDate)}</span>
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
        <p className="text-xs text-content-faint">{logDate ? fmtDate(logDate) : ''}</p>
        {it.createdByName && <p className="text-xs text-content-faint">작성: {it.createdByName}</p>}
      </div>
    </SectionItem>
  );
}

/** 보류=수정/삭제, 저장=삭제만(종전 두 컴포넌트 공통). */
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
      {it.isPending ? (
        <>
          <IconAction onClick={() => onEdit(it)} title="수정">
            <Pencil size={14} />
          </IconAction>
          <IconAction onClick={() => onRemove(it.id)} title="삭제" danger>
            <Trash2 size={14} />
          </IconAction>
        </>
      ) : (
        <IconAction onClick={() => onRemove(it.id)} title="삭제" danger>
          <Trash2 size={14} />
        </IconAction>
      )}
    </div>
  );
}
