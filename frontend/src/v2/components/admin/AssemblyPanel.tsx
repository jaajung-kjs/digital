/**
 * AssemblyPanel — 설비 형판 편집
 *
 * 부품을 조립해 **한 설비**를 만든다. 도면에 놓이는 것 하나(뿌리)를 고르고, 그 안의 자리에
 * 부품을 넣는다. 자리는 상세 패널과 **같은 격자**(`SlotGrid`)를 쓴다 — 형판에서 짠 모습이
 * 놓고 나면 달라 보이면 짜는 뜻이 없다.
 */
import { useMemo, useState } from 'react';
import { slotNumber, validateSlotPlacement } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, DetailRow, EmptyState, Input, Modal, Select,
} from '../../../components/ui';
import { SlotGrid } from '../SlotGrid';
import type { GridPlacement } from '../../gridDrag';
import {
  childrenOf, newItemId, removeItem, rootItem,
  type AssemblyDraft, type AssemblyDraftItem, type AssemblyIssue,
} from '../../assemblyDraft';
import type { V2AssetType, V2Catalog, V2ContainerSpec } from '../../types';

interface AssemblyPanelProps {
  draft: AssemblyDraft;
  onChange: (next: AssemblyDraft) => void;
  catalog: V2Catalog;
  issues: AssemblyIssue[];
}

/** 어느 자리에 무엇을 넣을지 고르는 중 — 부모 부품·컨테이너·칸이 이미 정해져 있다. */
interface AddContext {
  parentItemId: string;
  spec: V2ContainerSpec;
  cell: { col: number; row: number };
}

const issueOf = (issues: AssemblyIssue[], path: AssemblyIssue['path']) =>
  issues.find((i) => i.path === path)?.message;

export function AssemblyPanel({ draft, onChange, catalog, issues }: AssemblyPanelProps) {
  const [addCtx, setAddCtx] = useState<AddContext | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const typeById = useMemo(() => new Map(catalog.types.map((t) => [t.id, t])), [catalog.types]);
  const categoryKeyById = useMemo(() => new Map(catalog.categories.map((c) => [c.id, c.key])), [catalog.categories]);
  const root = rootItem(draft);

  /* 도면에 놓이는 것은 **배치 가능한 타입**이어야 한다 — 랙·함체처럼 자리를 차지하는 것. */
  const placeableTypes = catalog.types.filter((t) => t.placeable && t.isActive);

  function setRootType(typeId: string) {
    const type = typeById.get(typeId);
    if (!type) return;
    // 뿌리를 바꾸면 그 안에 넣어 둔 것들은 갈 곳이 없다 — 함께 비운다.
    onChange({
      ...draft,
      items: [{
        id: root?.id ?? newItemId(), parentItemId: null, typeId, name: type.name,
        containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
      }],
    });
    setSelectedItemId(null);
  }

  function addPart(typeId: string) {
    if (!addCtx) return;
    const type = typeById.get(typeId);
    if (!type) return;
    onChange({
      ...draft,
      items: [...draft.items, {
        id: newItemId(), parentItemId: addCtx.parentItemId, typeId, name: type.name,
        containerKey: addCtx.spec.key,
        col: addCtx.cell.col, row: addCtx.cell.row, colSpan: 1, rowSpan: 1,
      }],
    });
    setAddCtx(null);
  }

  function updateItem(itemId: string, patch: Partial<AssemblyDraftItem>) {
    onChange({ ...draft, items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  }

  /**
   * 이 자리에 놓을 수 있는가 — 판정은 core 가 한다(겹침·범위·span 허용·수용 규칙).
   *
   * 화면이 규칙을 다시 쓰면 형판에서는 놓이는데 실제로 배치할 때 튕기는 조립을 만들 수 있다.
   */
  function canPlace(parent: AssemblyDraftItem, spec: V2ContainerSpec, movingId: string, at: GridPlacement) {
    const parentType = typeById.get(parent.typeId);
    const moving = draft.items.find((i) => i.id === movingId);
    const movingType = moving ? typeById.get(moving.typeId) : undefined;
    if (!parentType || !movingType) return false;
    return validateSlotPlacement({
      // 판정에 쓰이는 것은 컨테이너 명세뿐이다 — 타입 전체를 지어내지 않는다.
      parentType: { containers: parentType.containerSpecs } as never,
      containerKey: spec.key,
      child: { typeKey: movingType.key, categoryKey: categoryKeyById.get(movingType.categoryId) ?? '' },
      ...at,
      occupants: childrenOf(draft, parent.id, spec.key)
        .filter((i) => i.id !== movingId && i.col != null && i.row != null)
        .map((i) => ({ assetId: i.id, col: i.col!, row: i.row!, colSpan: i.colSpan ?? 1, rowSpan: i.rowSpan ?? 1 })),
    }) === null;
  }

  /** 이 부품이 담을 수 있는 것들 — 자기 컨테이너마다 격자를 하나씩 그린다. */
  function renderContainers(item: AssemblyDraftItem, depth: number) {
    const type = typeById.get(item.typeId);
    if (!type || type.containerSpecs.length === 0) return null;
    return (
      <div className="space-y-2" style={{ marginLeft: depth * 12 }}>
        {type.containerSpecs.map((spec) => {
          const parts = childrenOf(draft, item.id, spec.key);
          return (
            <div key={spec.key} className="space-y-1">
              <p className="text-xs text-content-muted">
                {item.name} · {spec.name}
                {spec.rows != null && (
                  <span className="ml-1 text-content-faint">
                    ({spec.cols > 1 ? `${spec.cols}열 × ${spec.rows}행` : `${spec.rows}자리`})
                  </span>
                )}
              </p>
              {spec.rows != null ? (
                <SlotGrid
                  spec={spec}
                  items={parts}
                  selectedId={selectedItemId}
                  onSelect={(part) => setSelectedItemId(part.id)}
                  trailing={(part) => (
                    <span className="shrink-0 text-xs text-content-faint">
                      {typeById.get(part.typeId)?.name ?? '—'}
                    </span>
                  )}
                  onAddAtCell={(cell) => setAddCtx({ parentItemId: item.id, spec, cell })}
                  canPlace={(id, at) => canPlace(item, spec, id, at)}
                  onMove={(id, at) => updateItem(id, at)}
                />
              ) : (
                /* 자유형 — 자리가 없으므로 순서만 있는 목록이다. */
                <FreePartList
                  parts={parts}
                  typeById={typeById}
                  selectedId={selectedItemId}
                  onSelect={setSelectedItemId}
                  onAdd={() => setAddCtx({ parentItemId: item.id, spec, cell: { col: 0, row: parts.length } })}
                />
              )}
              {/* 그 안에 또 담는 부품이 있으면 이어서 그린다(OFD → 경로슬롯). */}
              {parts.map((part) => (
                <div key={part.id}>{renderContainers(part, depth + 1)}</div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const selected = draft.items.find((i) => i.id === selectedItemId) ?? null;
  const acceptedForAdd = addCtx
    ? catalog.types.filter(
        (t) =>
          t.isActive &&
          isAcceptedByRule(addCtx.spec.accepts, t, categoryKeyById.get(t.categoryId) ?? ''),
      )
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4">
      <DetailCard>
        <DetailCardHeader title="형판" />
        <DetailRow label="키" issue={issueOf(issues, 'key')}>
          <Input
            aria-label="형판 키"
            value={draft.key}
            placeholder="예: OPT-SET"
            onChange={(e) => onChange({ ...draft, key: e.currentTarget.value })}
          />
        </DetailRow>
        <DetailRow label="이름" issue={issueOf(issues, 'name')}>
          <Input
            aria-label="형판 이름"
            value={draft.name}
            placeholder="예: 송변전광단말장치 1식"
            onChange={(e) => onChange({ ...draft, name: e.currentTarget.value })}
          />
        </DetailRow>
        <DetailRow label="분류">
          <Select
            aria-label="형판 분류"
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
        <DetailCardHeader title="조립" />
        {/* 도면에 놓이는 것은 하나다 — 그것이 정해져야 안쪽 자리가 생긴다. */}
        <DetailRow label="도면에 놓이는 것" issue={issueOf(issues, 'items')}>
          <Select
            aria-label="뿌리 타입"
            value={root?.typeId ?? ''}
            onChange={(e) => e.currentTarget.value && setRootType(e.currentTarget.value)}
          >
            <option value="">— 고르세요 —</option>
            {placeableTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </DetailRow>

        {root ? (
          <div className="mt-2 space-y-2">{renderContainers(root, 0)}</div>
        ) : (
          <p className="text-xs text-content-faint">
            먼저 도면에 놓일 것을 고르면 그 안의 자리가 나타납니다.
          </p>
        )}
      </DetailCard>

      {/* 고른 부품의 이름 — 놓았을 때 자산 이름이 된다(뿌리는 놓는 사람이 다시 정한다). */}
      {selected && selected.parentItemId !== null && (
        <DetailCard>
          <DetailCardHeader
            title={typeById.get(selected.typeId)?.name ?? '부품'}
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(removeItem(draft, selected.id));
                  setSelectedItemId(null);
                }}
              >
                빼기
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
      )}

      {/* 자리에 넣을 부품 고르기 — 그 컨테이너가 수용하는 것만 보여 준다. */}
      {addCtx && (
        <Modal
          open
          onClose={() => setAddCtx(null)}
          title={`${addCtx.spec.name} ${slotNumber(addCtx.spec.cols, addCtx.cell.col, addCtx.cell.row)} 에 넣기`}
        >
          {acceptedForAdd.length === 0 ? (
            <EmptyState title="넣을 수 있는 타입이 없습니다" description="이 자리가 수용하는 타입이 없습니다." />
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {acceptedForAdd.map((t) => (
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

/** 자유형 컨테이너의 부품 목록 — 자리가 없으므로 순번만 있다. */
function FreePartList({
  parts, typeById, selectedId, onSelect, onAdd,
}: {
  parts: AssemblyDraftItem[];
  typeById: Map<string, V2AssetType>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mt-1 rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      <ul className="space-y-0.5">
        {parts.map((part, i) => (
          <li key={part.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded border border-line bg-surface px-2 py-1 text-left text-sm ${
                selectedId === part.id ? 'ring-2 ring-inset ring-primary' : ''
              }`}
              onClick={() => onSelect(part.id)}
            >
              <span className="w-8 shrink-0 text-right text-xs text-content-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{part.name}</span>
              <span className="shrink-0 text-xs text-content-faint">{typeById.get(part.typeId)?.name ?? '—'}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-content-faint hover:bg-surface"
            onClick={onAdd}
          >
            <span className="w-8 shrink-0 text-right text-xs">{parts.length + 1}</span>
            <span className="flex-1">비어 있음</span>
            <span className="shrink-0 text-xs text-primary">+ 추가</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

/** 이 컨테이너가 이 타입을 받는가 — core 의 `isAccepted` 와 같은 규칙(OR). */
function isAcceptedByRule(
  accepts: { categoryKeys?: string[]; typeKeys?: string[] },
  type: V2AssetType,
  categoryKey: string,
): boolean {
  const { categoryKeys, typeKeys } = accepts;
  if (!categoryKeys?.length && !typeKeys?.length) return true;
  return (categoryKeys?.includes(categoryKey) ?? false) || (typeKeys?.includes(type.key) ?? false);
}
