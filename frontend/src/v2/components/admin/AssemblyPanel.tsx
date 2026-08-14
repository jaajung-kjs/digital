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
import { useMemo, useRef, useState } from 'react';
import { freeCells, slotNumber, validateGridPlacement } from '@twin/core';
import { LaborSpecForm } from './LaborSpecForm';
import {
  Button, DetailCard, DetailCardHeader, DetailGrid, DetailRow, EmptyState, ErrorStrip, Input, Modal, Select,
  useDismissOnOutside,
  EMPTY,
} from '../../../components/ui';
import { AssemblyGrid } from '../AssemblyGrid';
import { PortsPreview } from './PortsPreview';
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

export function AssemblyPanel({ draft, onChange, catalog, issues }: AssemblyPanelProps) {
  /** 어느 칸에 무엇을 넣을지 고르는 중. */
  /** 어느 자리에 무엇을 넣을지 고르는 중 — 여러 칸을 끌었으면 그 크기까지 온다. */
  const [addCell, setAddCell] = useState<{ col: number; row: number; colSpan?: number; rowSpan?: number } | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [addQuery, setAddQuery] = useState('');
  /* 바깥을 누르면 풀린다 — 앱 공통 규칙(`useDismissOnOutside`). 「안」은 캔버스와 그 상세다:
     고른 부품의 이름을 고치다 선택이 풀리면 안 된다. */
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  useDismissOnOutside(selectedItemId != null, [canvasRef, asideRef], () => setSelectedItemId(null));

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
        col: addCell.col, row: addCell.row,
        colSpan: addCell.colSpan ?? 1, rowSpan: addCell.rowSpan ?? 1,
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
  const addable = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return q ? catalog.types.filter((t) => t.name.toLowerCase().includes(q)) : catalog.types;
  }, [catalog.types, addQuery]);

  return (
    /* **평면도의 어법**: 왼쪽은 캔버스, 오른쪽은 상세 패널.
       도면에서 자산을 클릭하면 오른쪽 패널이 **제자리에서** 바뀐다 — 카드가 아래로 붙지도,
       화면이 스크롤되지도 않는다. 구성 편집도 같은 일을 하므로 같은 판을 쓴다.
       예전에는 폼 넷을 왼쪽에 쌓고 격자 아래에 카드를 두 장 더 붙였다. 그래서 이름 한 줄을
       보려고 카드가 한 장 생기고, 그 카드는 클릭 지점에서 멀어 스크롤로 끌어와야 했다. */
    <div className="flex h-full min-h-0 w-full gap-3 p-4">
      {/* 캔버스 — 남는 자리를 다 쓴다. 격자 상자의 키는 못 박혀 있어(`GRID_BOX_H`)
          1×1 이든 10×20 이든 같은 자리를 차지한다. */}
      <div ref={canvasRef} className="flex min-w-0 flex-1 flex-col">
        <DetailCard className="flex min-h-0 flex-1 flex-col">
          {/* 「몇 칸 중 몇 칸」 — DCIM 이 랙을 12U 중 5U 사용으로 세는 것과 같다. */}
          <DetailCardHeader
            title="구성"
            badge={`${grid.cols * grid.rows - freeCells(grid, draft.items).length}/${grid.cols * grid.rows}칸`}
            badgeStatus="neutral"
          />
          <ErrorStrip message={issueOf(issues, 'items') ?? null} />
          <AssemblyGrid
            grid={grid}
            fill
            items={draft.items}
            selectedId={selectedItemId}
            /* 같은 것을 다시 누르면 풀린다 — 상세 패널·포트 탭과 같은 규칙. */
            onSelect={(part) => setSelectedItemId((cur) => (cur === part.id ? null : part.id))}
            onDeselect={() => setSelectedItemId(null)}
            /* 초안이라 저장 전이다 — 묻지 않는다(취소로 통째로 되돌릴 수 있다). */
            onRemove={(part) => removePart(part.id)}
            trailing={(part) => (
              <span className="shrink-0 text-xs text-content-faint">{typeById.get(part.typeId)?.name ?? EMPTY}</span>
            )}
            onAddAtCell={setAddCell}
            canPlace={canPlace}
            onMove={updateItem}
          />
        </DetailCard>
      </div>

      {/* 상세 — **한 자리에서 문맥만 바뀐다.** 아무것도 안 골랐으면 설비 자신, 부품을
          골랐으면 그 부품. 상세 패널과 같은 폭(384px)이라 두 화면이 같은 판으로 읽힌다. */}
      <aside ref={asideRef} className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
        {selected ? (
          <>
            <DetailCard>
              <DetailCardHeader
                title={selected.name || '부품'}
                badge={typeById.get(selected.typeId)?.name}
                badgeStatus="neutral"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => setSelectedItemId(null)}>
                    설비 정보
                  </Button>
                }
              />
              <DetailRow label="이름">
                <Input
                  aria-label="부품 이름"
                  value={selected.name}
                  onChange={(e) => updateItem(selected.id, { name: e.currentTarget.value })}
                />
              </DetailRow>
            </DetailCard>

            {/* 넣기 전에 「이걸 넣으면 포트가 뭐가 생기나」를 여기서 본다.
                카드는 남는 자리를 다 쓴다 — 포트가 둘이든 스물다섯이든 같은 크기여야 부품을
                옮겨 다닐 때 화면이 출렁이지 않는다. 넘치면 카드 안에서 스크롤한다. */}
            <PortsPreview
              fill
              ports={typeById.get(selected.typeId)?.portTemplates ?? []}
              title="포트"
              empty="이 자산 종류에는 포트가 선언돼 있지 않습니다."
            />
          </>
        ) : (
          <>
            <DetailCard>
              <DetailCardHeader title="기본정보" />
              {/* 키는 묻지 않는다 — 시드·마이그레이션이 가리키는 참조용 식별자이지 현장에서
                  부르는 이름이 아니다. 새로 만들 때는 서버가 붙인다. */}
              <DetailRow label="이름" required issue={issueOf(issues, 'name')}>
                <Input
                  aria-label="설비 종류 이름"
                  value={draft.name}
                  placeholder="예: 송변전광단말장치"
                  onChange={(e) => onChange({ ...draft, name: e.currentTarget.value })}
                />
              </DetailRow>
              <DetailRow label="분류" issue={issueOf(issues, 'category')}>
                {/* 자산 종류와 **같은 분류 체계**다 — 어느 탭에서 분류를 만들든 양쪽에 나타난다. */}
                <Select
                  aria-label="분류"
                  value={draft.categoryId}
                  onChange={(e) => onChange({ ...draft, categoryId: e.currentTarget.value })}
                >
                  <option value="">— 분류 선택 —</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </DetailRow>
              {/* 격자는 이 설비의 안쪽 모양이다 — 전폭 모듈은 여러 열을 걸치고, 세로로 긴
                  모듈은 여러 행을 걸친다. */}
              <DetailGrid>
                <DetailRow label="행 수" issue={issueOf(issues, 'grid')}>
                  <Input
                    aria-label="격자 행 수"
                    type="number"
                    value={String(draft.gridRows)}
                    onChange={(e) => onChange({ ...draft, gridRows: Math.max(Number(e.currentTarget.value) || 1, 1) })}
                  />
                </DetailRow>
                <DetailRow label="열 수">
                  <Input
                    aria-label="격자 열 수"
                    type="number"
                    value={String(draft.gridCols)}
                    onChange={(e) => onChange({ ...draft, gridCols: Math.max(Number(e.currentTarget.value) || 1, 1) })}
                  />
                </DetailRow>
              </DetailGrid>
            </DetailCard>

            {/* ── 1식 공량 ───────────────────────────────────────────────
                설비를 **통째로** 놓거나 걷을 때의 품이다. 완성된 1식에서 부품 하나만
                걷어내면 그때는 그 자산 종류의 공량을 쓴다 — 어느 쪽인지는 설계서가 변경
                집합에서 안다. */}
            <LaborSpecForm
              carrier="assembly"
              resetKey={draft.key || "new"}
              spec={draft}
              onChange={(patch) => onChange({ ...draft, ...patch })}
            />
          </>
        )}
      </aside>

      {addCell && (
        <Modal
          open
          onClose={() => { setAddCell(null); setAddQuery(''); }}
          title={
            addCell.colSpan && addCell.colSpan * (addCell.rowSpan ?? 1) > 1
              ? `자리 ${slotNumber(draft.gridCols, addCell.col, addCell.row)} 부터 ${addCell.colSpan}×${addCell.rowSpan} 에 넣기`
              : `자리 ${slotNumber(draft.gridCols, addCell.col, addCell.row)} 에 넣기`
          }
        >
          {addable.length === 0 ? (
            <EmptyState title="넣을 수 있는 자산 종류가 없습니다" description="상단의 「자산 종류」 에서 먼저 만드세요." />
          ) : (
            <>
              {/* 자산 종류는 스물 몇이라 전폭 버튼으로 늘어놓으면 눈으로 훑어야 한다 —
                  왼쪽 목록이 같은 이유로 이미 검색을 갖고 있다(CONVENTIONS §1.6). */}
              <Input
                aria-label="자산 종류 검색"
                size="sm"
                autoFocus
                placeholder="이름으로 검색"
                value={addQuery}
                onChange={(e) => setAddQuery(e.currentTarget.value)}
              />
              <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                {addable.length === 0 && (
                  <li className="px-2 py-3 text-xs text-content-faint">검색 결과가 없습니다</li>
                )}
                {addable.map((t) => (
                  <li key={t.id}>
                    <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => addPart(t.id)}>
                      {t.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
