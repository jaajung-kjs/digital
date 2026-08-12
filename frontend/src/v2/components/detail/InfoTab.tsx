/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_STATUSES, assetFieldDefs, assetStatusTone, freeCells, validateGridPlacement } from '@twin/core';
import {
  DetailCard,
  DetailCardHeader,
  DetailRow,
  Input,
  Select,
  useConfirm,
  cn,
  SELECTABLE,
} from '../../../components/ui';
import type { GridPlacement } from '../../gridDrag';
import { AssemblyGrid } from '../AssemblyGrid';
import { cableCountByPortId } from '../../cableSelectors';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { V2Asset, V2AssetType, V2Assembly } from '../../types';

export interface AddModalContext {
  parentAssetId: string;
  /** 그 설비의 격자 — 설비 종류가 정한 자리다. */
  grid: { cols: number; rows: number };
  siblings: { col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }[];
  /** 빈 자리를 눌러 열었으면 그 칸 — 모달에서 다시 고르게 하지 않는다. */
  cell?: { col: number; row: number };
}

/**
 * 그 자산의 포트 점유 요약 — `2/2` 처럼.
 *
 * 수용 목록은 이름만 보여줘서, "이 장비 포트가 다 물렸나" 를 보려면 포트 탭으로 옮겨가야 했다.
 * 같은 자식에 대한 정보가 두 탭에 갈려 있던 것을 한 줄로 잇는다. 포트가 없으면 아무것도
 * 적지 않는다(적을 것이 없다).
 */
function PortSummary({ asset, occupiedPortIds }: { asset: V2Asset; occupiedPortIds: ReadonlyMap<string, number> }) {
  if (asset.ports.length === 0) return null;
  const used = asset.ports.filter((p) => occupiedPortIds.has(p.id)).length;
  return (
    <span
      className={cn('shrink-0 text-xs tabular-nums', used > 0 ? 'text-success' : 'text-content-faint')}
      title="연결된 포트 / 전체 포트"
    >
      {used}/{asset.ports.length}
    </span>
  );
}

/**
 * 고른 부품 — **설비에서 갈라지는 것만** 적는다.
 *
 * 부품마다 다를 수 있는 것은 상태·설치일·담당자다(L3 스위치만 나중에 갈아 끼우면 설치일이
 * 다르다). 사진·점검·고장이력은 **설비의 것**이고, 포트는 설비의 포트 탭이 이미 부품별로
 * 묶어 보여준다 — 그래서 여기 다시 두지 않는다.
 */
function PartCard({
  part, typeName, portCount, onOpenPorts, onDelete,
}: {
  part: V2Asset;
  typeName: string;
  portCount: number;
  onOpenPorts: () => void;
  onDelete: () => void;
}) {
  const commit = (patch: Partial<V2Asset>) => useV2WorkingCopy.getState().stageAssetUpdate(part.id, patch);
  const field = (key: string, value: string) => {
    const current = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === part.id)?.fieldValues ?? {};
    if (String(current[key] ?? '') === value) return;
    commit({ fieldValues: { ...current, [key]: value } });
  };

  return (
    <DetailCard>
      <DetailCardHeader title={part.name} badge={typeName} badgeStatus="neutral" onDelete={onDelete} />
      <DetailRow label="이름">
        <Input
          key={part.id + part.name}
          aria-label="부품 이름"
          defaultValue={part.name}
          size="sm"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== part.name) commit({ name: v });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
      </DetailRow>
      <DetailRow label="상태">
        <Select value={part.status} size="sm" onChange={(e) => commit({ status: e.currentTarget.value })}>
          {ASSET_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </Select>
      </DetailRow>
      {assetFieldDefs().map((fd) => {
        const raw = part.fieldValues[fd.key];
        const str = raw != null ? String(raw) : '';
        return (
          <DetailRow key={fd.key} label={fd.label}>
            <Input
              key={part.id + fd.key + str}
              type={fd.type === 'date' ? 'date' : fd.type === 'number' ? 'number' : 'text'}
              defaultValue={str}
              size="sm"
              onBlur={(e) => field(fd.key, e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </DetailRow>
        );
      })}
      {portCount > 0 && (
        <DetailRow label="포트">
          {/* 포트는 설비의 포트 탭이 부품별로 묶어 보여준다 — 여기서는 그리로 보낸다. */}
          <button
            type="button"
            className={cn('rounded px-1 text-left text-sm text-primary', SELECTABLE)}
            onClick={onOpenPorts}
          >
            {portCount}개 보기
          </button>
        </DetailRow>
      )}
    </DetailCard>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  /** 설비의 분류이자 자리 명세 — 격자가 여기서 나온다. */
  assembliesById: Map<string, V2Assembly>;
  /** 이 설비 안에 놓인 부품들 — 자리 순. */
  parts: V2Asset[];
  /** 자산 종류 이름을 부품 카드에 적는다. */
  typesById: Map<string, V2AssetType>;
  /** 밖에서 부품을 지목해 온 경우(현황표에서 부품 행을 눌렀을 때). */
  focusPartId?: string | null;
  /** 그 부품의 포트를 보러 간다 — 포트 탭이 부품별로 묶어 보여준다. */
  onOpenPorts: (partId: string) => void;
  effectiveAssets: V2Asset[];
  setAddModalCtx: (ctx: AddModalContext | null) => void;
}

export function InfoTab({
  assetId,
  asset,
  type,
  assembliesById,
  parts,
  typesById,
  focusPartId,
  onOpenPorts,
  effectiveAssets,
  setAddModalCtx,
}: InfoTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /** 격자에서 고른 부품 — 패널을 바꾸지 않고 아래에 카드로 편다. */
  const [selectedPartId, setSelectedPartId] = useState<string | null>(focusPartId ?? null);
  const partCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedPartId) partCardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPartId]);
  // 다른 설비로 옮겨 가거나 밖에서 부품을 지목해 오면 그것을 고른다.
  useEffect(() => setSelectedPartId(focusPartId ?? null), [assetId, focusPartId]);
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;
  /* 케이블이 물린 포트 집합 — 자식 목록의 포트 요약이 읽는다. */
  const savedCables = useV2WorkingCopy((st) => st.saved.cables);
  const cableOverlays = useV2WorkingCopy((st) => st.overlays.cables);
  /* 여기서는 "한 가닥이라도 물렸나" 만 쓴다(포트 요약 n/m). Map 이라 `has()` 가 그대로 된다. */
  const occupiedPortIds = useMemo(
    () => cableCountByPortId(mergeEffective(savedCables, cableOverlays)),
    [savedCables, cableOverlays],
  );

  /* 이 설비의 자리 — 설비 종류가 격자를 갖는다. 설비 종류로 놓은 것만 안에 무언가를 담는다.
     **어디에 놓여 있는가는 여기서 다루지 않는다.** 위치는 사람이 적는 값이 아니라 놓은 결과로
     기록되는 값이다. 자리를 옮기는 일도 상위 설비의 구성 격자에서 끌어서 한다 — 눈에 보이는
     판이 곧 자리다. */
  const assembly = asset.assemblyId ? assembliesById.get(asset.assemblyId) : undefined;
  const grid = assembly ? { cols: assembly.gridCols, rows: assembly.gridRows } : null;

  /**
   * 이 자리에 놓을 수 있는가 — 판정은 core 가 한다(격자 안·겹침).
   *
   * 화면이 규칙을 다시 쓰면 저장 때 튕기는 자리를 드래그로는 놓을 수 있게 되어,
   * 눈에 보이는 것과 저장되는 것이 갈린다. 같은 함수를 부른다.
   */
  function canPlaceInGrid(movingId: string, at: GridPlacement): boolean {
    if (!grid) return false;
    return (
      validateGridPlacement({
        grid,
        ...at,
        occupants: parts
          .filter((a) => a.id !== movingId && a.col != null && a.row != null)
          .map((a) => ({
            assetId: a.id, col: a.col!, row: a.row!, colSpan: a.colSpan ?? 1, rowSpan: a.rowSpan ?? 1,
          })),
      }) === null
    );
  }

  // 하위 자산 총 수 (cascade 삭제 confirm용)
  function countDescendants(rootId: string): number {
    const directChildren = effectiveAssets.filter((a) => a.parentAssetId === rootId);
    return directChildren.reduce((acc, child) => acc + 1 + countDescendants(child.id), 0);
  }
  const descendantCount = countDescendants(assetId);

  // ── 삭제 핸들러 ────────────────────────────────────────────────────────────
  async function handleDelete() {
    const msg =
      descendantCount > 0
        ? `${descendantCount}개 하위 자산이 함께 삭제됩니다. 계속하시겠습니까?`
        : '이 자산을 삭제하시겠습니까?';
    if (!(await confirm({ title: '자산 삭제', message: msg, confirmLabel: '삭제', danger: true }))) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(assetId);
  }

  /** 부품 하나 걷어내기 — 설비는 그대로 둔다. */
  async function handleDeletePart(part: V2Asset) {
    const ok = await confirm({
      title: '부품 삭제', message: `'${part.name}' 을 이 설비에서 걷어냅니다.`,
      confirmLabel: '삭제', danger: true,
    });
    if (!ok) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(part.id);
    setSelectedPartId(null);
  }

  // ── 인라인 편집 핸들러 ─────────────────────────────────────────────────────
  function handleNameCommit(value: string) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== asset.name) {
      useV2WorkingCopy.getState().stageAssetUpdate(assetId, { name: trimmed });
    }
  }

  function handleStatusChange(value: string) {
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { status: value });
  }

  function handleFieldCommit(key: string, value: string) {
    // 커밋 시점 스토어에서 현재 fieldValues 를 읽는다 (렌더 클로저 stale 방지; 이벤트 핸들러라 반응성 무관)
    const current = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId)?.fieldValues ?? {};
    if (String(current[key] ?? '') === value) return;
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { fieldValues: { ...current, [key]: value } });
  }

  return (
    <>
      {/* 기본 정보 카드 */}
      <DetailCard>
        {/* 종류 — 부품은 타입이, 설비 종류으로 놓은 설비는 **설비 종류**이 그 분류다. */}
        <DetailCardHeader title={type?.name ?? assembly?.name ?? '—'} onDelete={handleDelete} />

        {/* 이름 */}
        <DetailRow label="이름">
          <Input
            defaultValue={asset.name}
            size="sm"
            onBlur={(e) => handleNameCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            key={asset.name}
          />
        </DetailRow>

        {/* 상태 */}
        <DetailRow label="상태">
          <Select value={asset.status} size="sm" onChange={(e) => handleStatusChange(e.currentTarget.value)}>
            {ASSET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </DetailRow>


        {/* 설치일·담당자도 **같은 카드**에 둔다 — 자산 하나를 두고 「이름·상태」와 「설치일·
            담당자」로 카드를 가를 이유가 없다. 넷 다 이 자산에 적는 값이고, 카드를 나누면
            스크롤만 늘고 어느 카드에 무엇이 있는지 기억해야 한다.
            타입마다 필드를 따로 선언하던 길은 걷었다: 실제로 쓰인 것은 피더의 개폐 상태뿐이었고,
            그건 자산이 아니라 회로의 상태라 전원 출력 포트로 옮겼다. */}
        {assetFieldDefs().map((fd) => {
          const rawVal = asset.fieldValues[fd.key];
          const strVal = rawVal != null ? String(rawVal) : '';
          return (
            <DetailRow key={fd.key} label={fd.label}>
              {fd.type === 'select' ? (
                <Select
                  defaultValue={strVal}
                  size="sm"
                  onBlur={(e) => handleFieldCommit(fd.key, e.currentTarget.value)}
                  key={strVal}
                >
                  <option value="">—</option>
                  {(fd.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  type={fd.type === 'date' ? 'date' : fd.type === 'number' ? 'number' : 'text'}
                  defaultValue={strVal}
                  size="sm"
                  onBlur={(e) => handleFieldCommit(fd.key, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  key={strVal}
                />
              )}
            </DetailRow>
          );
        })}
      </DetailCard>

      {/* 포트는 '연결' 탭이 담당한다 — 여기 있던 섹션은 타입의 **포트 템플릿**을 다시 그린
          것이라 실제 포트도 아니고 연결 상태도 몰랐다. 같은 "포트" 가 두 탭에 반쪽씩
          나뉘어 있어, 어느 쪽을 봐야 하는지 알 수 없었다. */}

      {/* 구성 — 설비 종류으로 놓은 설비만 안에 부품을 담는다.
          자리는 그 설비 종류의 격자다: 랙이라는 자산을 따로 두고 그 타입이 자리를 선언하던 층은 걷었다. */}
      {grid && assembly && (
        <DetailCard>
          {/* 「몇 칸 중 몇 칸」 — DCIM 이 랙을 12U 중 5U 사용으로 세는 것과 같다.
              부품 수만 적으면 이 판에 아직 자리가 남았는지를 알 수 없다. */}
          <DetailCardHeader
            title="구성"
            badge={`${grid.cols * grid.rows - freeCells(grid, parts).length}/${grid.cols * grid.rows}칸`}
            badgeStatus="neutral"
          />
          <AssemblyGrid
            grid={grid}
            /* 상세 패널에서도 상자를 못 박는다 — 어느 설비를 열어도 같은 자리를 차지하고,
               그 아래 부품 카드가 늘 같은 높이에 선다(스크롤로 찾아가지 않아도 되게). */
            boxHeight={240}
            items={parts}
            selectedId={selectedPartId}
            /* 부품을 골라도 **패널은 그대로** 둔다 — 아래에 그 부품 카드만 연다.
               예전에는 패널이 통째로 그 부품으로 바뀌었다. 부품마다 다른 것은 상태·설치일·
               담당자 네 줄뿐인데, 그것을 보려고 맥락(지금 어느 설비를 보고 있나)이 사라지고
               대부분 빈 탭 넷이 다시 떴다(사진·점검·고장이력은 설비의 것이고, 포트는 설비
               포트 탭이 이미 부품별로 묶어 보여준다). */
            onSelect={(child) => setSelectedPartId((cur: string | null) => (cur === child.id ? null : child.id))}
            onDeselect={() => setSelectedPartId(null)}
            /* 놓인 자산이라 묻는다 — 포트·연결까지 함께 사라진다. */
            onRemove={(part) => void handleDeletePart(part)}
            trailing={(child) => <PortSummary asset={child} occupiedPortIds={occupiedPortIds} />}
            onAddAtCell={(cell) => setAddModalCtx({ parentAssetId: assetId, grid, siblings: parts, cell })}
            canPlace={canPlaceInGrid}
            onMove={(id, at) => useV2WorkingCopy.getState().stageAssetUpdate(id, at)}
            /* 칸마다 운전 상태 불 — 색은 어휘가 정한다(정상 초록·예비 노랑·고장 빨강). */
            toneOf={(part) => assetStatusTone(part.status)}
          />
        </DetailCard>
      )}

      {/* 고른 부품 — 설비에서 갈라지는 것만 적는다.
          판의 키를 묶어도 좁은 패널(538px)에서는 아래가 잘릴 수 있어, 고르면 눈에 들어오게
          한다(`block: 'nearest'` — 이미 보이면 움직이지 않는다). */}
      {selectedPart && (
        <div ref={partCardRef}>
        <PartCard
          part={selectedPart}
          typeName={typesById.get(selectedPart.typeId ?? '')?.name ?? '—'}
          portCount={selectedPart.ports.length}
          onOpenPorts={() => onOpenPorts(selectedPart.id)}
          onDelete={() => void handleDeletePart(selectedPart)}
        />
        </div>
      )}

      {confirmDialog}
    </>
  );
}
