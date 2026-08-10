/**
 * AssemblyPanel — 설비 종류 편집
 *
 * 부품을 조립해 **한 설비**를 만든다. 격자 크기를 정하고 그 위 아무 자리에나 부품을 놓는다.
 *
 * 예전에는 「도면에 놓이는 것(랙)」을 먼저 고르고 그 타입이 선언한 자리에 넣어야 했다.
 * 그래서 담기 위한 랙이라는 자산이 필요했고, 자리는 그 타입이 정한 대로만 쓸 수 있었다.
 * 이제 자리는 설비 종류 자신의 것이라 랙이라는 층이 통째로 사라졌다 — 랙은 이 설비 종류의 겉모습이다.
 *
 * 자리는 상세 패널과 **같은 격자**(`AssemblyGrid`)를 쓴다 — 설비 종류에서 짠 모습이 놓고 나면
 * 달라 보이면 짜는 뜻이 없다.
 */
import { useMemo, useState } from 'react';
import { freeCells, slotNumber, validateGridPlacement } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, DetailRow, EmptyState, Input, Modal, Select,
} from '../../../components/ui';
import { AssemblyGrid } from '../AssemblyGrid';
import type { GridPlacement } from '../../gridDrag';
import { newItemId, type AssemblyDraft, type AssemblyDraftItem, type AssemblyIssue } from '../../assemblyDraft';
import type { V2Catalog } from '../../types';

interface AssemblyPanelProps {
  draft: AssemblyDraft;
  onChange: (next: AssemblyDraft) => void;
  catalog: V2Catalog;
  issues: AssemblyIssue[];
}

const issueOf = (issues: AssemblyIssue[], path: AssemblyIssue['path']) =>
  issues.find((i) => i.path === path)?.message;

/** 1식 공량의 작업 종류 — 자산 종류의 공량 카드와 같은 순서다. */
const LABOR_HOURS = [
  { key: 'installHours', label: '신설(h)' },
  { key: 'removeHours', label: '철거(h)' },
  { key: 'relocateHours', label: '이설(h)' },
] as const;

export function AssemblyPanel({ draft, onChange, catalog, issues }: AssemblyPanelProps) {
  /** 어느 칸에 무엇을 넣을지 고르는 중. */
  const [addCell, setAddCell] = useState<{ col: number; row: number } | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const typeById = useMemo(() => new Map(catalog.types.map((t) => [t.id, t])), [catalog.types]);
  const grid = { cols: draft.gridCols, rows: draft.gridRows };

  function addPart(typeId: string) {
    if (!addCell) return;
    const type = typeById.get(typeId);
    if (!type) return;
    onChange({
      ...draft,
      items: [...draft.items, {
        id: newItemId(), typeId, name: type.name,
        col: addCell.col, row: addCell.row, colSpan: 1, rowSpan: 1,
      }],
    });
    setAddCell(null);
  }

  function updateItem(itemId: string, patch: Partial<AssemblyDraftItem>) {
    onChange({ ...draft, items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  }

  function removePart(itemId: string) {
    onChange({ ...draft, items: draft.items.filter((i) => i.id !== itemId) });
    setSelectedItemId(null);
  }

  /**
   * 이 자리에 놓을 수 있는가 — 판정은 core 가 한다(격자 안·겹침).
   *
   * 화면이 규칙을 다시 쓰면 설비 종류에서는 놓이는데 실제 배치에서 튕기는 조립을 만들 수 있다.
   */
  function canPlace(movingId: string, at: GridPlacement): boolean {
    return validateGridPlacement({
      grid,
      ...at,
      occupants: draft.items
        .filter((i) => i.id !== movingId && i.col != null && i.row != null)
        .map((i) => ({ assetId: i.id, col: i.col!, row: i.row!, colSpan: i.colSpan ?? 1, rowSpan: i.rowSpan ?? 1 })),
    }) === null;
  }

  const selected = draft.items.find((i) => i.id === selectedItemId) ?? null;
  /* 무엇을 놓을지는 설비 종류를 짜는 사람이 정한다 — 수용 규칙(컨테이너의 것이었다)은 없다. */
  const addable = catalog.types.filter((t) => t.isActive);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4">
      <DetailCard>
        <DetailCardHeader title="설비 종류" />
        {/* 키는 묻지 않는다 — 시드·마이그레이션이 가리키는 참조용 식별자이지 현장에서 부르는
            이름이 아니다. 새로 만들 때는 서버가 붙인다. */}
        <DetailRow label="이름" issue={issueOf(issues, 'name')}>
          <Input
            aria-label="설비 종류 이름"
            value={draft.name}
            placeholder="예: 송변전광단말장치"
            onChange={(e) => onChange({ ...draft, name: e.currentTarget.value })}
          />
        </DetailRow>
        <DetailRow label="분류">
          <Select
            aria-label="설비 종류 분류"
            value={draft.categoryId ?? ''}
            onChange={(e) => onChange({ ...draft, categoryId: e.currentTarget.value || null })}
          >
            <option value="">—</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </DetailRow>
      </DetailCard>

      <DetailCard>
        <DetailCardHeader title="자리" />
        {/* 격자는 이 설비의 안쪽 모양이다 — 전폭 모듈은 여러 열을 걸치고, 세로로 긴 모듈은
            여러 행을 걸친다. 부품은 격자 안 아무 자리에나 놓고 모서리로 두 축 다 늘린다. */}
        <DetailRow label="행 수" issue={issueOf(issues, 'grid')}>
          <Input
            aria-label="격자 행 수"
            type="number"
            value={String(draft.gridRows)}
            onChange={(e) => onChange({ ...draft, gridRows: Math.max(Number(e.currentTarget.value) || 1, 1) })}
          />
        </DetailRow>
        <DetailRow label="열 수" hint="자리 번호는 행 우선 — 4열이면 1·2·3·4가 첫 행이 된다">
          <Input
            aria-label="격자 열 수"
            type="number"
            value={String(draft.gridCols)}
            onChange={(e) => onChange({ ...draft, gridCols: Math.max(Number(e.currentTarget.value) || 1, 1) })}
          />
        </DetailRow>
      </DetailCard>

      {/* ── 1식 공량 ─────────────────────────────────────────────────────
          설비를 **통째로** 놓거나 걷을 때의 품이다. 완성된 1식에서 부품 하나만 걷어내면
          그때는 그 자산 종류의 공량을 쓴다 — 어느 쪽인지는 설계서가 변경 집합에서 안다.
          비워 두면 안에 든 자산의 공량을 합쳐 센다(0 은 「품이 안 든다」는 뜻이라 다르다). */}
      <DetailCard>
        <DetailCardHeader title="1식 공량" />
        <DetailRow label="노무유형">
          <Input
            aria-label="1식 노무유형"
            value={draft.laborType ?? ''}
            placeholder="예: 통신내선공"
            onChange={(e) => onChange({ ...draft, laborType: e.currentTarget.value.trim() || null })}
          />
        </DetailRow>
        {LABOR_HOURS.map(({ key, label }) => (
          <DetailRow key={key} label={label} hint={draft[key] == null ? '비우면 부품 공량의 합' : undefined}>
            <Input
              aria-label={`1식 ${label}`}
              type="number"
              value={draft[key] == null ? '' : String(draft[key])}
              placeholder="부품 합"
              onChange={(e) => {
                const raw = e.currentTarget.value;
                onChange({ ...draft, [key]: raw === '' ? null : Math.max(Number(raw) || 0, 0) });
              }}
            />
          </DetailRow>
        ))}
      </DetailCard>

      <DetailCard>
        {/* 「몇 칸 중 몇 칸」 — DCIM 이 랙을 12U 중 5U 사용으로 세는 것과 같다. */}
        <DetailCardHeader
          title="구성"
          badge={`${grid.cols * grid.rows - freeCells(grid, draft.items).length}/${grid.cols * grid.rows}칸`}
          badgeStatus="neutral"
        />
        {issueOf(issues, 'items') && <p className="text-xs text-danger">{issueOf(issues, 'items')}</p>}
        <AssemblyGrid
          grid={grid}
          items={draft.items}
          selectedId={selectedItemId}
          onSelect={(part) => setSelectedItemId(part.id)}
          trailing={(part) => (
            <span className="shrink-0 text-xs text-content-faint">{typeById.get(part.typeId)?.name ?? '—'}</span>
          )}
          onAddAtCell={setAddCell}
          canPlace={canPlace}
          onMove={updateItem}
        />
      </DetailCard>

      {/* 고른 부품의 이름 — 놓았을 때 자산 이름이 된다. */}
      {selected && (
        <DetailCard>
          <DetailCardHeader
            title={typeById.get(selected.typeId)?.name ?? '부품'}
            actions={<Button variant="ghost" size="sm" onClick={() => removePart(selected.id)}>빼기</Button>}
          />
          <DetailRow label="이름">
            <Input
              aria-label="부품 이름"
              value={selected.name}
              onChange={(e) => updateItem(selected.id, { name: e.currentTarget.value })}
            />
          </DetailRow>
        </DetailCard>
      )}

      {addCell && (
        <Modal
          open
          onClose={() => setAddCell(null)}
          title={`자리 ${slotNumber(draft.gridCols, addCell.col, addCell.row)} 에 넣기`}
        >
          {addable.length === 0 ? (
            <EmptyState title="넣을 수 있는 자산 종류가 없습니다" description="「자산 종류」 탭에서 먼저 만드세요." />
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {addable.map((t) => (
                <li key={t.id}>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => addPart(t.id)}>
                    {t.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
