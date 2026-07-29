/**
 * FieldDefsEditor — 필드 정의 편집 (key/label/type/unit/options)
 *
 * Props:
 *   draft    — TypeDraft
 *   onChange — (patch: Partial<TypeDraft>) => void (배열 전체 교체)
 *   locked   — boolean (구조 잠금 — 필드는 잠금 대상 아님, 항상 false 전달되지만 인터페이스 통일)
 *   issues   — TypeSpecIssue[]
 */
import { Plus, Trash2 } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import type { FieldDef } from '@twin/core';
import { DetailCard, DetailCardHeader, Input, Select, IconButton } from '../../../components/ui';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface FieldDefsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  locked: boolean;
  issues: TypeSpecIssue[];
}

const FIELD_TYPES: { value: FieldDef['type']; label: string }[] = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'date', label: '날짜' },
  { value: 'select', label: '선택' },
];

function defaultField(): FieldDef {
  return { key: '', label: '', type: 'text' };
}

export function FieldDefsEditor({ draft, onChange, issues }: FieldDefsEditorProps) {
  const fields = draft.fieldDefs;

  function update(index: number, patch: Partial<FieldDef>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ fieldDefs: next });
  }

  function remove(index: number) {
    onChange({ fieldDefs: fields.filter((_, i) => i !== index) });
  }

  function add() {
    onChange({ fieldDefs: [...fields, defaultField()] });
  }

  return (
    <DetailCard>
      <DetailCardHeader title="필드 정의" />

      {fields.length === 0 && (
        <p className="text-xs text-content-faint">필드가 없습니다. + 추가로 등록하세요.</p>
      )}

      {fields.map((f, i) => {
        const keyIssue = issueFor(issues, `fields[${i}].key`);
        const labelIssue = issueFor(issues, `fields[${i}].label`);
        const typeIssue = issueFor(issues, `fields[${i}].type`);
        const optionsIssue = issueFor(issues, `fields[${i}].options`);

        return (
          <div key={i} className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
            {/* 행 헤더 */}
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs text-content-muted">필드 {i + 1}</span>
              <IconButton
                aria-label={`필드 ${i + 1} 삭제`}
                onClick={() => remove(i)}
                title="삭제"
              >
                <Trash2 size={13} />
              </IconButton>
            </div>

            {/* key */}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-content-muted">키</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`필드 ${i + 1} 키`}
                  value={f.key}
                  placeholder="예: model"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { key: val });
                  }}
                />
                {keyIssue && <span className="text-xs text-danger">{keyIssue}</span>}
              </div>
            </div>

            {/* label */}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-content-muted">라벨</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`필드 ${i + 1} 라벨`}
                  value={f.label}
                  placeholder="예: 모델명"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { label: val });
                  }}
                />
                {labelIssue && <span className="text-xs text-danger">{labelIssue}</span>}
              </div>
            </div>

            {/* type */}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-content-muted">유형</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`필드 ${i + 1} 유형`}
                  value={f.type}
                  onChange={(e) => {
                    const val = e.currentTarget.value as FieldDef['type'];
                    update(i, { type: val, options: val === 'select' ? (f.options ?? []) : undefined });
                  }}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                {typeIssue && <span className="text-xs text-danger">{typeIssue}</span>}
              </div>
            </div>

            {/* unit — text/number에서만 의미 있지만 편의상 항상 표시 */}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-content-muted">단위</span>
              <Input
                aria-label={`필드 ${i + 1} 단위`}
                value={f.unit ?? ''}
                placeholder="예: m"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  update(i, { unit: val === '' ? undefined : val });
                }}
              />
            </div>

            {/* options — type=select일 때만 */}
            {f.type === 'select' && (
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-content-muted">옵션</span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <Input
                    aria-label={`필드 ${i + 1} 옵션`}
                    value={(f.options ?? []).join(',')}
                    placeholder="예: 수동,자동,반자동 (콤마 구분)"
                    onChange={(e) => {
                      const raw = e.currentTarget.value;
                      const opts = raw === '' ? [] : raw.split(',').map((s) => s.trim()).filter(Boolean);
                      update(i, { options: opts });
                    }}
                  />
                  {optionsIssue && <span className="text-xs text-danger">{optionsIssue}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        <Plus size={13} />
        추가
      </button>
    </DetailCard>
  );
}
