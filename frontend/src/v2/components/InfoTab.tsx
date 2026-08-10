/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { useMemo } from 'react';
import { ASSET_STATUSES, assetFieldDefs, slotNumber } from '@twin/core';
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
import { freeSlots } from '../newAsset';
import { assetLocationPath } from '../assetLocation';
import { cableCountByPortId } from '../cableSelectors';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset, V2AssetType, V2ContainerSpec } from '../types';
import { PhotoCard } from './PhotoCard';

export interface AddModalContext {
  parentAssetId: string;
  spec: V2ContainerSpec;
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

// ── 자리 격자 ────────────────────────────────────────────────────────────────
interface SlotGridProps {
  spec: V2ContainerSpec;
  children: V2Asset[];
  onSelectChild: (id: string) => void;
  /** 빈 자리를 눌렀을 때 — 그 칸에 바로 추가한다. */
  onAddAtCell: (cell: { col: number; row: number }) => void;
  /** 케이블이 물린 포트 — 자식별 포트 요약에 쓴다. */
  occupiedPortIds: ReadonlyMap<string, number>;
}

/** 자리 한 칸의 높이(px) — 여러 칸을 차지하는 장비는 이 배수만큼 높아진다. */
const SLOT_ROW_HEIGHT = 26;

/**
 * 함체 안의 자리 — **격자**로 그린다.
 *
 * 세로로 쌓는 이유: 랙·함체는 세로로 자리가 배열된 물리 장비다. 예전에는 `grid-cols-6`
 * 이라 384px 상세 패널에서 칸이 56px 밖에 안 됐고, 장비 이름이 "SCA…", "통합…" 으로
 * 잘려 무엇이 꽂혀 있는지 알 수 없었다.
 *
 * 그래서 **열은 명세가 선언한 만큼만** 나눈다 — 랙은 1열이라 예전과 똑같이 한 줄씩 쌓이고,
 * 분전반 조서처럼 2열이면 좌우로 갈린다(1·2가 첫 행). 번호는 저장하지 않고 격자에서
 * 유도하므로 자리와 번호가 어긋날 수 없다.
 *
 * 바깥 테두리 하나가 함체이고 그 안에 자리가 있다 — 포트 판의 백플레인과 같은 어법이다.
 * 예전에는 **자리마다** 점선 상자를 둘러 12칸짜리 랙이 점선 12개 + 파란 `+ 추가` 12개가 되어,
 * 정작 무엇이 꽂혀 있는지보다 빈칸이 더 눈에 띄었다.
 */
function SlotGrid({ spec, children, onSelectChild, onAddAtCell, occupiedPortIds }: SlotGridProps) {
  const rows = spec.rows!;
  const cols = Math.max(spec.cols, 1);

  /** `열,행` → 그 칸에서 시작하는 자식. */
  const byCell = new Map<string, V2Asset>();
  /** 이미 어떤 자산이 덮고 있는 칸 — span 이 지나가는 자리다. */
  const covered = new Set<string>();
  for (const child of children) {
    if (child.col == null || child.row == null) continue;
    byCell.set(`${child.col},${child.row}`, child);
    for (let r = 0; r < (child.rowSpan ?? 1); r++) {
      for (let c = 0; c < (child.colSpan ?? 1); c++) {
        covered.add(`${child.col + c},${child.row + r}`);
      }
    }
  }

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${col},${row}`;
      const child = byCell.get(key);
      // 시작 칸이 아니면서 누가 덮고 있으면 그 칸은 그리지 않는다(span 이 대신 차지한다).
      if (!child && covered.has(key)) continue;

      const rowSpan = child?.rowSpan ?? 1;
      const colSpan = child?.colSpan ?? 1;
      const first = slotNumber(cols, col, row);
      // 여러 칸을 차지하면 "3–5" 처럼 범위로 적는다.
      const last = slotNumber(cols, col + colSpan - 1, row + rowSpan - 1);
      const label = last > first ? `${first}–${last}` : String(first);

      cells.push(
        <li
          key={key}
          style={{
            minHeight: rowSpan * SLOT_ROW_HEIGHT,
            gridColumn: `${col + 1} / span ${colSpan}`,
            gridRow: `${row + 1} / span ${rowSpan}`,
          }}
        >
          {/* 빈 자리도 누를 수 있다 — 예전에는 아무 반응이 없어서, 추가하려면 위 버튼을 눌러
              모달에서 자리를 다시 골라야 했다. 눈앞의 빈칸을 누르는 것이 자연스럽다. */}
          <button
            type="button"
            className={cn(
              'group flex h-full w-full items-center gap-2 rounded px-2 text-left text-sm',
              // 꽂혀 있는 것만 칸으로 보인다 — 빈 자리는 배경 그대로 둔다.
              child ? cn('border border-line bg-surface text-content', SELECTABLE) : cn('text-content-faint', SELECTABLE),
            )}
            title={child?.name}
            onClick={() => (child ? onSelectChild(child.id) : onAddAtCell({ col, row }))}
          >
            <span className="w-8 shrink-0 text-right text-xs text-content-faint">{label}</span>
            <span className="min-w-0 flex-1 truncate">{child ? child.name : '비어 있음'}</span>
            {child && <PortSummary asset={child} occupiedPortIds={occupiedPortIds} />}
            {!child && (
              <span className="shrink-0 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                + 추가
              </span>
            )}
          </button>
        </li>,
      );
    }
  }

  return (
    <div className="mt-1 rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      <ul
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells}
      </ul>
    </div>
  );
}

// ── 자유형 자식 리스트 ─────────────────────────────────────────────────────────
interface FreeChildListProps {
  children: V2Asset[];
  onSelectChild: (id: string) => void;
  onAdd: () => void;
  occupiedPortIds: ReadonlyMap<string, number>;
}

/*
 * 자유형 컨테이너(슬롯 수 제한 없음)도 고정 슬롯과 **같은 모양**으로 그린다.
 * 예전에는 자유형만 밋밋한 텍스트 목록이라, 같은 "수용" 인데 함체 종류에 따라 화면이
 * 딴판이었다. 다른 것은 번호가 슬롯 위치가 아니라 순번이라는 점뿐이다.
 */
function FreeChildList({ children, onSelectChild, onAdd, occupiedPortIds }: FreeChildListProps) {
  return (
    <div className="mt-1 rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      <ul className="space-y-0.5">
        {children.map((child, i) => (
          <li key={child.id} style={{ minHeight: SLOT_ROW_HEIGHT }}>
            <button
              type="button"
              className={cn(
                'flex h-full w-full items-center gap-2 rounded border border-line bg-surface px-2 text-left text-sm text-content',
                SELECTABLE,
              )}
              onClick={() => onSelectChild(child.id)}
              title={child.name}
            >
              <span className="w-8 shrink-0 text-right text-xs text-content-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              <PortSummary asset={child} occupiedPortIds={occupiedPortIds} />
            </button>
          </li>
        ))}
        <li style={{ minHeight: SLOT_ROW_HEIGHT }}>
          <button
            type="button"
            className={cn(
              'group flex h-full w-full items-center gap-2 rounded px-2 text-left text-sm text-content-faint',
              SELECTABLE,
            )}
            onClick={onAdd}
          >
            <span className="w-8 shrink-0 text-right text-xs text-content-faint">{children.length + 1}</span>
            <span className="min-w-0 flex-1">비어 있음</span>
            <span className="shrink-0 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              + 추가
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  /** 상위 자산의 컨테이너 명세를 읽기 위한 타입 맵 */
  typesById: Map<string, V2AssetType>;
  childrenBySpecKey: Map<string, V2Asset[]>;
  effectiveAssets: V2Asset[];
  floorNameById: Map<string, string>;
  setAddModalCtx: (ctx: AddModalContext | null) => void;
  onSelectAsset: (id: string) => void;
}

export function InfoTab({
  assetId,
  asset,
  type,
  typesById,
  childrenBySpecKey,
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
  const location = assetLocationPath(asset, assetById, floorNameById, typesById);

  /* 상위 자산과 그 컨테이너 명세 — 위치 행이 "어디에 담겨 있는지" 를 다루려면 둘 다 필요하다. */
  const parentAsset = asset.parentAssetId ? effectiveAssets.find((a) => a.id === asset.parentAssetId) : undefined;
  const parentType = parentAsset ? typesById.get(parentAsset.typeId) : undefined;
  const parentSlotSpec = parentType?.containerSpecs.find((c) => c.key === asset.containerKey);
  const siblingsInParent = parentAsset
    ? effectiveAssets.filter((a) => a.parentAssetId === parentAsset.id && a.containerKey === asset.containerKey)
    : [];
  const freeSlotsInParent = parentSlotSpec?.rows != null ? freeSlots(parentSlotSpec, siblingsInParent) : [];

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
        <DetailCardHeader title={type?.name ?? '—'} onDelete={handleDelete} />

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
              {parentSlotSpec?.rows != null ? (
                <div className="w-28">
                  <Select
                    size="sm"
                    aria-label={parentSlotSpec.name}
                    value={asset.col == null || asset.row == null ? '' : `${asset.col},${asset.row}`}
                    onChange={(e) => handleSlotChange(e.currentTarget.value)}
                  >
                    {asset.col != null && asset.row != null && (
                      <option value={`${asset.col},${asset.row}`}>
                        {parentSlotSpec.name} {slotNumber(parentSlotSpec.cols, asset.col, asset.row)}
                      </option>
                    )}
                    {freeSlotsInParent.map((cell) => (
                      <option key={`${cell.col},${cell.row}`} value={`${cell.col},${cell.row}`}>
                        {parentSlotSpec.name} {slotNumber(parentSlotSpec.cols, cell.col, cell.row)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <span className="shrink-0 text-sm text-content-muted">· {parentSlotSpec?.name ?? ''}</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-content">{location}</span>
          )}
        </DetailRow>
      </DetailCard>

      {/* 속성 — 자산이 갖는 것은 종류를 가리지 않고 같다(설치일·담당자).
          타입마다 필드를 따로 선언하던 길은 걷었다: 실제로 쓰인 것은 피더의 개폐 상태뿐이었고,
          그건 자산이 아니라 회로의 상태라 전원 출력 포트로 옮겼다. */}
      {type && (
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
      )}

      {/* 포트는 '연결' 탭이 담당한다 — 여기 있던 섹션은 타입의 **포트 템플릿**을 다시 그린
          것이라 실제 포트도 아니고 연결 상태도 몰랐다. 같은 "포트" 가 두 탭에 반쪽씩
          나뉘어 있어, 어느 쪽을 봐야 하는지 알 수 없었다. */}

      {/* 수용 섹션 */}
      {type && type.containerSpecs.length > 0 && (
        <DetailCard>
          <DetailCardHeader title="수용" />
          {type.containerSpecs.map((spec) => {
            const specChildren = childrenBySpecKey.get(spec.key) ?? [];
            return (
              <div key={spec.key} className="space-y-1">
                {/* 추가 버튼은 목록 안 '비어 있음' 행이 겸한다 — 머리줄에 또 두면
                    같은 동작이 두 곳이 되고, 어느 슬롯에 들어가는지도 알 수 없다. */}
                <p className="text-xs text-content-muted">
                  {spec.name}
                  {spec.rows != null && (
                    <span className="ml-1 text-content-faint">
                      ({spec.cols > 1 ? `${spec.cols}열 × ${spec.rows}행` : `${spec.rows}자리`})
                    </span>
                  )}
                </p>
                {spec.rows != null ? (
                  <SlotGrid
                    spec={spec}
                    children={specChildren}
                    onSelectChild={onSelectAsset}
                    occupiedPortIds={occupiedPortIds}
                    onAddAtCell={(cell) =>
                      setAddModalCtx({ parentAssetId: assetId, spec, siblings: specChildren, cell })
                    }
                  />
                ) : (
                  <FreeChildList
                    children={specChildren}
                    onSelectChild={onSelectAsset}
                    occupiedPortIds={occupiedPortIds}
                    onAdd={() => setAddModalCtx({ parentAssetId: assetId, spec, siblings: specChildren })}
                  />
                )}
                {/* 슬롯 이동은 그 자산의 '위치' 행이 담당한다 — 부모 쪽에 두면
                    "자식을 누른다" 가 진입인지 이동 선택인지 모호해진다. */}
              </div>
            );
          })}
        </DetailCard>
      )}

      {/* 사진 카드 */}
      <PhotoCard assetId={assetId} />
      {confirmDialog}
    </>
  );
}
