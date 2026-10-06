/**
 * CatalogTable — 마스터 한 종류(분야·설비 품목·랙 품목·케이블 품목)의 편집 표.
 *
 * 네 종류가 같은 표를 쓴다: 읽는 줄이 기본이고 칸을 누르면 그 자리에서 고친다(§1.7-i).
 * 키는 새 행에서만 적고 그 뒤로는 읽기 전용이다. 순서는 끌어 바꾸지 않고 「순서」 숫자 칸으로
 * 고친다. 지우기가 막히면(쓰이는 품목) 서버 문구가 그 행 아래에 뜬다.
 */
import { useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Button, EMPTY, IconButton, Input, Select, TABLE_ROW, TableCard, Td, Th, ErrorStrip, isCommitKey, useConfirm } from '../../../components/ui';
import { apiErrorMessage } from '../../apiError';
import { useCatalogMutations } from '../../model/hooks';
import type { CatalogKind } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { LaborTypeSelect } from '../admin/LaborTypeSelect';

export interface Column {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'labor';
  options?: { value: string; label: string }[];
  required?: boolean;
  width?: string;
}

type Row = Record<string, unknown>;

interface Props {
  kind: CatalogKind;
  rows: readonly object[];
  columns: Column[];
  newRow(): Row;
  title: string;
}

const KEY_COL: Column = { key: 'key', label: '키', kind: 'text', required: true };
const str = (v: unknown) => (v == null ? '' : String(v));

/** 값 → 서버 본문 값. 빈 수는 null, 빈 글은 undefined(보내지 않는다). */
function parse(col: Column, raw: unknown): unknown {
  if (col.kind === 'number') return raw === '' || raw == null ? null : Number(raw);
  if (col.kind === 'labor') return raw === '' ? null : (raw ?? null);
  const s = str(raw).trim();
  return s === '' ? undefined : s;
}

export function CatalogTable({ kind, rows: rawRows, columns, newRow, title }: Props) {
  const rows = rawRows as readonly Row[];
  const { create, patch, remove } = useCatalogMutations();
  const [draft, setDraft] = useState<Row | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /** 만드는 중인가 — 한 번에 하나만 보낸다(Enter 연타·버튼 겹침). */
  const creating = useRef(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  /* 키는 맨 앞 「순서」 칸 바로 뒤에 선다. */
  const cols = columns[0]?.key === 'sortOrder' ? [columns[0], KEY_COL, ...columns.slice(1)] : [KEY_COL, ...columns];
  const weight = (c: Column) => (c.kind === 'labor' ? 2 : c.key === 'name' ? 2 : 1);
  const total = cols.reduce((n, c) => n + weight(c), 0);
  const widths = [...cols.map((c) => (c.width ? Number(c.width) : (weight(c) / total) * 90)), 10];

  const fail = (id: string, e: unknown, fallback: string) => setError({ id, message: apiErrorMessage(e, fallback) });

  function commitPatch(row: Row, col: Column, raw: unknown) {
    const next = parse(col, raw);
    if (next === undefined) return; // 빈 이름은 고치지 않는다
    if (next === null && col.key === 'sortOrder') return; // 순서는 비울 수 없다
    if (next === (row[col.key] ?? null) || (col.kind !== 'number' && next === str(row[col.key]))) return;
    setError(null);
    patch.mutateAsync({ kind, id: str(row.id), patch: { [col.key]: next } }).catch((e) => fail(str(row.id), e, '고치지 못했습니다'));
  }

  /** 추가는 **분명한 손짓**(Enter·추가 단추)으로만 한다 — 선택 칸은 blur 만으로는 끝났는지 알 수 없다. */
  function submitDraft() {
    if (!draft || creating.current) return;
    const body: Row = {};
    for (const c of cols) {
      const v = parse(c, draft[c.key]);
      if (c.required && (v === undefined || v === null)) {
        setError({ id: 'new', message: `${c.label}을(를) 입력하세요` });
        return;
      }
      if (v !== undefined) body[c.key] = v;
    }
    setError(null);
    creating.current = true;
    create.mutateAsync({ kind, body })
      .then(() => setDraft(null))
      .catch((e) => fail('new', e, '추가하지 못했습니다'))
      .finally(() => { creating.current = false; });
  }

  function cancelDraft() { setDraft(null); setError(null); }

  async function removeRow(row: Row) {
    const name = str(row.name);
    if (!(await confirm({ title: `${title} 지우기`, target: name, message: '지우면 되돌릴 수 없습니다.', confirmLabel: '지우기', danger: true }))) return;
    setError(null);
    remove.mutateAsync({ kind, id: str(row.id) }).catch((e) => fail(str(row.id), e, '지우지 못했습니다'));
  }

  function draftCell(c: Column) {
    const set = (v: unknown) => setDraft((d) => ({ ...d, [c.key]: v }));
    if (c.kind === 'labor') return <LaborTypeSelect value={(draft?.[c.key] as string | null) ?? null} onChange={set} ariaLabel={c.label} />;
    if (c.kind === 'select') {
      return (
        <Select aria-label={c.label} size="cell" value={str(draft?.[c.key])} onChange={(e) => set(e.currentTarget.value)}>
          <option value="">{EMPTY}</option>
          {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
    return (
      <Input
        size="cell"
        aria-label={c.label}
        type={c.kind === 'number' ? 'number' : 'text'}
        numeric={c.kind === 'number'}
        className="min-w-0"
        value={str(draft?.[c.key])}
        onChange={(e) => set(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (isCommitKey(e)) submitDraft();
          if (e.key === 'Escape') { e.stopPropagation(); cancelDraft(); }
        }}
      />
    );
  }

  function readCell(row: Row, c: Column) {
    if (c.key === 'key') return <span className="text-content-muted">{str(row.key)}</span>;
    if (c.kind === 'labor') {
      return <LaborTypeSelect value={(row[c.key] as string | null) ?? null} onChange={(code) => commitPatch(row, c, code ?? '')} ariaLabel={`${str(row.name)} ${c.label}`} />;
    }
    if (c.kind === 'select') {
      return (
        <Select aria-label={`${str(row.name)} ${c.label}`} size="cell" value={str(row[c.key])} onChange={(e) => commitPatch(row, c, e.currentTarget.value)}>
          {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
    return (
      <InlineEditCell
        label={`${str(row.name)} ${c.label}`}
        type={c.kind === 'number' ? 'number' : 'text'}
        value={str(row[c.key])}
        onCommit={(raw) => commitPatch(row, c, raw)}
      />
    );
  }

  const alignOf = (c: Column) => (c.kind === 'number' ? 'right' : 'left');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => { setError(null); setDraft(newRow()); }} disabled={draft != null}>
          추가
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TableCard fill widths={widths}>
          <thead className="sticky top-0 z-sticky">
            <tr>
              {cols.map((c) => <Th key={c.key} align={alignOf(c)}>{c.label}</Th>)}
              <Th>{' '}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowFragment key={str(row.id)}>
                <tr className={`group ${TABLE_ROW}`}>
                  {cols.map((c) => <Td key={c.key} align={alignOf(c)} className="truncate">{readCell(row, c)}</Td>)}
                  <Td align="right">
                    <IconButton
                      size="sm"
                      aria-label={`${str(row.name)} 지우기`}
                      tone="danger"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => removeRow(row)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </Td>
                </tr>
                {error?.id === str(row.id) && (
                  <tr><td colSpan={cols.length + 1}><ErrorStrip message={error.message} onDismiss={() => setError(null)} className="px-2.5 py-1" /></td></tr>
                )}
              </RowFragment>
            ))}
            {draft && (
              <>
                <tr className={TABLE_ROW}>
                  {cols.map((c) => <Td key={c.key} align={alignOf(c)}>{draftCell(c)}</Td>)}
                  <Td align="right">
                    <span className="flex justify-end gap-0.5">
                      <IconButton size="sm" aria-label="추가 확정" onClick={submitDraft}><Check size={12} /></IconButton>
                      <IconButton size="sm" tone="danger" aria-label="추가 취소" onClick={cancelDraft}><X size={12} /></IconButton>
                    </span>
                  </Td>
                </tr>
                {error?.id === 'new' && (
                  <tr><td colSpan={cols.length + 1}><ErrorStrip message={error.message} onDismiss={() => setError(null)} className="px-2.5 py-1" /></td></tr>
                )}
              </>
            )}
          </tbody>
        </TableCard>
      </div>
      {confirmDialog}
    </div>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
