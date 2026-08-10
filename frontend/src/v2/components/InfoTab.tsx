/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { useMemo } from 'react';
import { ASSET_STATUSES, assetFieldDefs, slotNumber, validateGridPlacement } from '@twin/core';
import {
  DetailCard,
  DetailCardHeader,
  DetailRow,
  Input,
  Select,
  useConfirm,
  cn,
  SELECTABLE,
} from '../../components/ui';
import { freeCells } from '../newAsset';
import { assetLocationPath } from '../assetLocation';
import type { GridPlacement } from '../gridDrag';
import { AssemblyGrid } from './AssemblyGrid';
import { cableCountByPortId } from '../cableSelectors';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset, V2AssetType, V2Assembly } from '../types';
import { PhotoCard } from './PhotoCard';

export interface AddModalContext {
  parentAssetId: string;
  /** 그 설비의 격자 — 형판이 정한 자리다. */
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

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  /** 설비의 분류이자 자리 명세 — 격자가 여기서 나온다. */
  assembliesById: Map<string, V2Assembly>;
  /** 이 설비 안에 놓인 부품들 — 자리 순. */
  parts: V2Asset[];
  effectiveAssets: V2Asset[];
  floorNameById: Map<string, string>;
  setAddModalCtx: (ctx: AddModalContext | null) => void;
  onSelectAsset: (id: string) => void;
}

export function InfoTab({
  assetId,
  asset,
  type,
  assembliesById,
  parts,
  effectiveAssets,
  floorNameById,
  setAddModalCtx,
  onSelectAsset,
}: InfoTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /* 케이블이 물린 포트 집합 — 자식 목록의 포트 요약이 읽는다. */
  const savedCables = useV2WorkingCopy((st) => st.saved.cables);
  const cableOverlays = useV2WorkingCopy((st) => st.overlays.cables);
  /* 여기서는 "한 가닥이라도 물렸나" 만 쓴다(포트 요약 n/m). Map 이라 `has()` 가 그대로 된다. */
  const occupiedPortIds = useMemo(
    () => cableCountByPortId(mergeEffective(savedCables, cableOverlays)),
    [savedCables, cableOverlays],
  );

  const assetById = useMemo(() => new Map(effectiveAssets.map((a) => [a.id, a])), [effectiveAssets]);
  const location = assetLocationPath(asset, assetById, floorNameById, assembliesById);

  /* 이 설비의 자리 — 형판이 격자를 갖는다. 형판으로 놓은 것만 안에 무언가를 담는다. */
  const assembly = asset.assemblyId ? assembliesById.get(asset.assemblyId) : undefined;
  const grid = assembly ? { cols: assembly.gridCols, rows: assembly.gridRows } : null;

  /* 상위 설비와 그 격자 — 위치 행이 "어느 자리에 놓여 있는지" 를 다루려면 둘 다 필요하다. */
  const parentAsset = asset.parentAssetId ? effectiveAssets.find((a) => a.id === asset.parentAssetId) : undefined;
  const parentAssembly = parentAsset?.assemblyId ? assembliesById.get(parentAsset.assemblyId) : undefined;
  const parentGrid = parentAssembly
    ? { cols: parentAssembly.gridCols, rows: parentAssembly.gridRows }
    : null;
  const siblingsInParent = parentAsset
    ? effectiveAssets.filter((a) => a.parentAssetId === parentAsset.id)
    : [];
  const freeCellsInParent = parentGrid ? freeCells(parentGrid, siblingsInParent) : [];

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

  /** 고른 값은 격자 칸(`열,행`)이다 — 번호는 저장하지 않는다. */
  function handleSlotChange(value: string) {
    if (value === '') return;
    const [col, row] = value.split(',').map(Number);
    if (col === asset.col && row === asset.row) return;
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { col, row });
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
        {/* 종류 — 부품은 타입이, 형판으로 놓은 설비는 **형판**이 그 분류다. */}
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

        {/* 위치 */}
        {/* 위치는 읽기 전용 문장이 아니라 **이동 수단**이다.
            상위 자산을 누르면 그리로 올라가고(수용 자산에서 되돌아올 유일한 길이었다),
            고정 슬롯이면 여기서 슬롯을 바꾼다 — 자기 위치는 자기 화면에서 고친다. */}
        <DetailRow label="위치">
          {parentAsset ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={cn('min-w-0 truncate rounded px-1 text-left text-sm text-primary', SELECTABLE)}
                title={`${parentAsset.name} 으로 이동`}
                onClick={() => onSelectAsset(parentAsset.id)}
              >
                {parentAsset.name}
              </button>
              {parentGrid ? (
                <div className="w-28">
                  <Select
                    size="sm"
                    aria-label="자리"
                    value={asset.col == null || asset.row == null ? '' : `${asset.col},${asset.row}`}
                    onChange={(e) => handleSlotChange(e.currentTarget.value)}
                  >
                    {asset.col != null && asset.row != null && (
                      <option value={`${asset.col},${asset.row}`}>
                        자리 {slotNumber(parentGrid.cols, asset.col, asset.row)}
                      </option>
                    )}
                    {freeCellsInParent.map((cell) => (
                      <option key={`${cell.col},${cell.row}`} value={`${cell.col},${cell.row}`}>
                        자리 {slotNumber(parentGrid.cols, cell.col, cell.row)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-content">{location}</span>
          )}
        </DetailRow>
      </DetailCard>

      {/* 속성 — 자산이 갖는 것은 종류를 가리지 않고 같다(설치일·담당자). 타입이 있든(부품)
          없든(형판으로 놓은 설비) 자산은 자산이다. 예전에는 `type` 이 있을 때만 그려서 설비에는
          설치일·담당자를 적을 길이 아예 없었다 — 현황표에는 그 열이 있는데도.
          타입마다 필드를 따로 선언하던 길은 걷었다: 실제로 쓰인 것은 피더의 개폐 상태뿐이었고,
          그건 자산이 아니라 회로의 상태라 전원 출력 포트로 옮겼다. */}
      <DetailCard>
        <DetailCardHeader title="속성" />
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

      {/* 구성 — 형판으로 놓은 설비만 안에 부품을 담는다.
          자리는 그 형판의 격자다: 랙이라는 자산을 따로 두고 그 타입이 자리를 선언하던 층은 걷었다. */}
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
            items={parts}
            onSelect={(child) => onSelectAsset(child.id)}
            trailing={(child) => <PortSummary asset={child} occupiedPortIds={occupiedPortIds} />}
            onAddAtCell={(cell) => setAddModalCtx({ parentAssetId: assetId, grid, siblings: parts, cell })}
            canPlace={canPlaceInGrid}
            onMove={(id, at) => useV2WorkingCopy.getState().stageAssetUpdate(id, at)}
          />
        </DetailCard>
      )}

      {/* 사진 카드 */}
      <PhotoCard assetId={assetId} />
      {confirmDialog}
    </>
  );
}
