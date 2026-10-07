/**
 * CatalogTable — 마스터 한 종류(분야·설비 품목·랙 품목·케이블 품목)의 편집 표.
 *
 * 네 종류가 같은 표를 쓴다: 읽는 줄이 기본이고 칸을 누르면 그 자리에서 고친다(§1.7-i).
 * 키는 화면에 없다 — 새 행을 만들 때 자동으로 찍는다. 순서는 끌어 바꾸지 않고 「순서」 숫자 칸으로
 * 고친다. 지우기가 막히면(쓰이는 품목) 서버 문구가 그 행 아래에 뜬다.
 *
 * **「순서」 칸은 몇 번째인가(1..n)를 보인다** — 저장된 `sortOrder` 는 시드·삭제가 남긴 틈이 있어
 * (20 다음 31, 분야가 2 부터) 그대로 보이면 무슨 뜻인지 읽을 수 없다. 칸에 k 를 적으면 그 줄을 k 번째로
 * 옮기고 목록 전체를 한 번에 다시 매긴다(`PATCH /v2/order` — 트리가 끌어 옮길 때와 같은 문).
 */
import { useMemo, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Button, EMPTY, HOVER_REVEAL, IconButton, Input, Select, TABLE_ROW, TableCard, Td, Th, ErrorStrip, isCommitKey, useConfirm } from '../../../components/ui';
import { isAxiosError } from 'axios';
import { apiErrorMessage } from '../../apiError';
import { useReorder, useWageCatalog } from '../../hooks';
import { newCatalogKey } from './catalogKey';
import { useCatalogMutations } from '../../model/hooks';
import type { CatalogKind } from '../../model/types';
import { InlineEditCell, readCellClass } from '../InlineEditCell';
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

const KO = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });
/** 읽는 줄의 수 — 천 단위 구분(편집 칸은 원래 수). */
const showNumber = (v: string) => (v === '' || Number.isNaN(Number(v)) ? v : KO.format(Number(v)));
const isKeyTaken = (e: unknown) => isAxiosError(e) && (e.response?.data as { error?: string } | undefined)?.error === 'KEY_TAKEN';
const str = (v: unknown) => (v == null ? '' : String(v));

/** 값 → 서버 본문 값. 빈 수는 null, 빈 글은 undefined(보내지 않는다). */
function parse(col: Column, raw: unknown): unknown {
  if (col.kind === 'number') return raw === '' || raw == null ? null : Number(raw);
  if (col.kind === 'labor') return raw === '' ? null : (raw ?? null);
  const s = str(raw).trim();
  return s === '' ? undefined : s;
}

const ORDER_KEY = 'sortOrder';

export function CatalogTable({ kind, rows: rawRows, columns, newRow, title }: Props) {
  /* 보이는 차례 = 저장된 순서. 서버가 이미 그렇게 주지만, 「몇 번째」를 보이는 칸이 이 차례에 기대므로 여기서 못 박는다. */
  const rows = useMemo(
    () => [...(rawRows as readonly Row[])].sort((a, b) => Number(a[ORDER_KEY] ?? 0) - Number(b[ORDER_KEY] ?? 0)),
    [rawRows],
  );
  const { create, patch, remove } = useCatalogMutations();
  const reorder = useReorder();
  const [draft, setDraft] = useState<Row | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /** 만드는 중인가 — 한 번에 하나만 보낸다(Enter 연타·버튼 겹침). */
  const creating = useRef(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const cols = columns;
  const weight = (c: Column) => (c.kind === 'labor' ? 2 : c.key === 'name' ? 2 : 1);
  /* 폭을 정한 열(순서)은 그 폭만 쓰고, 나머지 열이 남은 자리를 무게대로 나눈다 — 끝 10% 는 줄 손잡이. */
  const fixed = cols.reduce((n, c) => n + (c.width ? Number(c.width) : 0), 0);
  const total = cols.reduce((n, c) => n + (c.width ? 0 : weight(c)), 0);
  const widths = [...cols.map((c) => (c.width ? Number(c.width) : (weight(c) / total) * (90 - fixed))), 10];

  const fail = (id: string, e: unknown, fallback: string) => setError({ id, message: apiErrorMessage(e, fallback) });

  function commitPatch(row: Row, col: Column, raw: unknown) {
    const next = parse(col, raw);
    if (next === undefined) return; // 빈 이름은 고치지 않는다
    if (next === null && col.key === 'sortOrder') return; // 순서는 비울 수 없다
    if (next === (row[col.key] ?? null) || (col.kind !== 'number' && next === str(row[col.key]))) return;
    setError(null);
    patch.mutateAsync({ kind, id: str(row.id), patch: { [col.key]: next } }).catch((e) => fail(str(row.id), e, '수정하지 못했습니다'));
  }

  /** 줄을 k 번째(1..n)로 옮긴다 — 목록 전체의 새 차례를 보낸다. 범위 밖은 끝으로 붙인다. */
  function moveTo(row: Row, raw: string) {
    const want = Math.round(Number(raw));
    if (raw.trim() === '' || Number.isNaN(want)) return;
    const from = rows.indexOf(row);
    const to = Math.min(Math.max(want, 1), rows.length) - 1;
    if (to === from) return;
    const ids = rows.filter((r) => r !== row).map((r) => str(r.id));
    ids.splice(to, 0, str(row.id));
    setError(null);
    reorder.mutateAsync({ kind, ids }).catch((e) => fail(str(row.id), e, '순서를 변경하지 못했습니다'));
  }

  /** 추가는 **분명한 손짓**(Enter·추가 단추)으로만 한다 — 선택 칸은 blur 만으로는 끝났는지 알 수 없다. */
  function submitDraft() {
    if (!draft || creating.current) return;
    const body: Row = {};
    for (const c of cols) {
      const v = parse(c, draft[c.key]);
      if (c.required && (v === undefined || v === null)) {
        setError({ id: 'new', message: `${c.label} 항목을 입력하세요` });
        return;
      }
      if (v !== undefined) body[c.key] = v;
    }
    setError(null);
    creating.current = true;
    if (body.key === undefined) body.key = newCatalogKey(kind);
    create.mutateAsync({ kind, body })
      /* 키가 겹치면(드물다) 새 키로 한 번만 다시 — 사람이 쓴 값이 아니라 우리가 찍은 값이다. */
      .catch((e) => (isKeyTaken(e) ? create.mutateAsync({ kind, body: { ...body, key: newCatalogKey(kind) } }) : Promise.reject(e)))
      .then(() => setDraft(null))
      .catch((e) => fail('new', e, '추가하지 못했습니다'))
      .finally(() => { creating.current = false; });
  }

  function cancelDraft() { setDraft(null); setError(null); }

  async function removeRow(row: Row) {
    const name = str(row.name);
    if (!(await confirm({ title: `${title} 삭제`, target: name, message: '삭제하면 복구할 수 없습니다.', confirmLabel: '삭제', danger: true }))) return;
    setError(null);
    remove.mutateAsync({ kind, id: str(row.id) }).catch((e) => fail(str(row.id), e, '삭제하지 못했습니다'));
  }

  function draftCell(c: Column) {
    /* 새 줄은 늘 맨 끝 — 몇 번째가 될지만 보인다(저장 값은 `newRow` 가 정한 끝 번호). */
    if (c.key === ORDER_KEY) return <span className={readCellClass(true)}>{rows.length + 1}</span>;
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

  function readCell(row: Row, c: Column, rank: number) {
    if (c.key === ORDER_KEY) {
      return (
        <InlineEditCell
          label={`${str(row.name)} ${c.label}`}
          type="number"
          value={String(rank)}
          onCommit={(raw) => moveTo(row, raw)}
        />
      );
    }
    if (c.kind === 'labor') {
      return <LaborCell value={(row[c.key] as string | null) ?? null} onChange={(code) => commitPatch(row, c, code ?? '')} ariaLabel={`${str(row.name)} ${c.label}`} />;
    }
    if (c.kind === 'select') {
      return (
        <InlineEditCell
          label={`${str(row.name)} ${c.label}`}
          value={str(row[c.key])}
          choices={c.options}
          onCommit={(raw) => commitPatch(row, c, raw)}
        />
      );
    }
    return (
      <InlineEditCell
        label={`${str(row.name)} ${c.label}`}
        type={c.kind === 'number' ? 'number' : 'text'}
        value={str(row[c.key])}
        format={c.kind === 'number' ? showNumber : undefined}
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
            {rows.map((row, i) => (
              <RowFragment key={str(row.id)}>
                <tr className={`group ${TABLE_ROW}`}>
                  {cols.map((c) => <Td key={c.key} align={alignOf(c)} className="truncate">{readCell(row, c, i + 1)}</Td>)}
                  <Td align="right">
                    <IconButton
                      size="sm"
                      aria-label={`${str(row.name)} 삭제`}
                      tone="danger"
                      className={HOVER_REVEAL}
                      onClick={() => removeRow(row)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </Td>
                </tr>
                {error?.id === str(row.id) && (
                  <tr><Td colSpan={cols.length + 1}><ErrorStrip message={error.message} onDismiss={() => setError(null)} /></Td></tr>
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
                  <tr><Td colSpan={cols.length + 1}><ErrorStrip message={error.message} onDismiss={() => setError(null)} /></Td></tr>
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

/** 노무유형 — 평소엔 직종 이름, 누르면 고르기가 열린다. */
function LaborCell({ value, onChange, ariaLabel }: { value: string | null; onChange: (code: string | null) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const wage = useWageCatalog();
  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${ariaLabel} 수정`}
        className={readCellClass(!!value)}
        title={(value && wage.nameOf(value)) || undefined}
        onClick={() => setEditing(true)}
      >
        {value ? wage.nameOf(value) : EMPTY}
      </button>
    );
  }
  return <LaborTypeSelect value={value} ariaLabel={ariaLabel} autoFocus onBlur={() => setEditing(false)} onChange={(c) => { onChange(c); setEditing(false); }} />;
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
