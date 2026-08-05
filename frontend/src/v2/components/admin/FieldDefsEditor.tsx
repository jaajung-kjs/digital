/**
 * FieldDefsEditor — 필드 정의 편집 (key/label/type/unit/options)
 *
 * Props:
 *   draft    — TypeDraft
 *   onChange — (patch: Partial<TypeDraft>) => void (배열 전체 교체)
 *   issues   — TypeSpecIssue[]
 *
 * 구조 잠금(locked) 대상 아님 — 필드 정의는 항상 편집 가능(호출부 주석 참조).
 */
import { Plus } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import type { FieldDef } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, DetailRow, Input, Select, ItemCard } from '../../../components/ui';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface FieldDefsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
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

      {fields.length === 0 && <p className="text-xs text-content-faint">필드가 없습니다. + 추가로 등록하세요.</p>}

      {fields.map((f, i) => {
        const keyIssue = issueFor(issues, `fields[${i}].key`);
        const labelIssue = issueFor(issues, `fields[${i}].label`);
        const typeIssue = issueFor(issues, `fields[${i}].type`);
        const optionsIssue = issueFor(issues, `fields[${i}].options`);

        return (
          <ItemCard key={i} title={`필드 ${i + 1}`} onDelete={() => remove(i)}>

            {/* key */}
            <DetailRow label="키" issue={keyIssue}>
              <Input
                aria-label={`필드 ${i + 1} 키`}
                value={f.key}
                placeholder="예: model"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  update(i, { key: val });
                }}
              />
            </DetailRow>

            {/* label */}
            <DetailRow label="라벨" issue={labelIssue}>
              <Input
                aria-label={`필드 ${i + 1} 라벨`}
                value={f.label}
                placeholder="예: 모델명"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  update(i, { label: val });
                }}
              />
            </DetailRow>

            {/* type */}
            <DetailRow label="유형" issue={typeIssue}>
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
            </DetailRow>

            {/* unit — text/number에서만 의미 있지만 편의상 항상 표시 */}
            <DetailRow label="단위">
              <Input
                aria-label={`필드 ${i + 1} 단위`}
                value={f.unit ?? ''}
                placeholder="예: m"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  update(i, { unit: val === '' ? undefined : val });
                }}
              />
            </DetailRow>

            {/* options — type=select일 때만 */}
            {f.type === 'select' && (
              <DetailRow label="옵션" issue={optionsIssue}>
                <Input
                  aria-label={`필드 ${i + 1} 옵션`}
                  value={(f.options ?? []).join(',')}
                  placeholder="예: 수동,자동,반자동 (콤마 구분)"
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    const opts =
                      raw === ''
                        ? []
                        : raw
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                    update(i, { options: opts });
                  }}
                />
              </DetailRow>
            )}
          </ItemCard>
        );
      })}

      <Button variant="secondary" size="sm" leftIcon={<Plus size={13} />} onClick={add}>
        추가
      </Button>
    </DetailCard>
  );
}
