/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { ASSET_STATUSES } from '@twin/core';
import {
  DetailCard,
  DetailCardHeader,
  DetailRow,
  Input,
  Select,
  useConfirm,
  cn,
  SELECTABLE,
  SELECTED_TILE,
} from '../../components/ui';
import { freeSlots } from '../newAsset';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset, V2AssetType, V2ContainerSpec } from '../types';
import { PhotoCard } from './PhotoCard';

export interface AddModalContext {
  parentAssetId: string;
  spec: V2ContainerSpec;
  siblings: { slotIndex: number | null; slotSpan: number | null }[];
  /** 빈 슬롯을 눌러 열었으면 그 자리 — 모달에서 다시 고르게 하지 않는다. */
  slotIndex?: number;
}

// ── 위치 텍스트 (statusRows.ts 와 동일 로직) ────────────────────────────────
function locationText(
  asset: V2Asset,
  floorNameById: Map<string, string>,
  assetNameById: Map<string, string>,
): string {
  if (asset.floorId != null) return floorNameById.get(asset.floorId) ?? '—';
  if (asset.parentAssetId != null) {
    const parentName = assetNameById.get(asset.parentAssetId) ?? '—';
    return asset.slotIndex != null ? `${parentName} · 슬롯 ${asset.slotIndex + 1}` : parentName;
  }
  return '미배치';
}

// ── 고정 슬롯 그리드 ──────────────────────────────────────────────────────────
interface SlotGridProps {
  spec: V2ContainerSpec;
  children: V2Asset[];
  selectedChildId: string | null;
  onSelectChild: (id: string) => void;
  /** 빈 슬롯을 눌렀을 때 — 그 자리에 바로 추가한다. */
  onAddAtSlot: (slotIndex: number) => void;
}

/** 슬롯 한 칸의 높이(px) — 여러 슬롯을 차지하는 장비는 이 배수만큼 높아진다. */
const SLOT_ROW_HEIGHT = 26;

function SlotGrid({ spec, children, selectedChildId, onSelectChild, onAddAtSlot }: SlotGridProps) {
  const slotCount = spec.slotCount!;
  // 슬롯 인덱스(0-based) → 자식 자산 매핑
  const bySlot = new Map<number, V2Asset>();
  for (const child of children) {
    if (child.slotIndex != null) bySlot.set(child.slotIndex, child);
  }

  const rows: React.ReactNode[] = [];
  let idx = 0;
  while (idx < slotCount) {
    const child = bySlot.get(idx);
    const span = child?.slotSpan ?? 1;
    const isSelected = child != null && child.id === selectedChildId;
    // 여러 슬롯을 차지하면 "3–5" 처럼 범위로 적는다.
    const label = span > 1 ? `${idx + 1}–${idx + span}` : String(idx + 1);
    const slotIndex = idx;
    rows.push(
      <li key={idx} style={{ minHeight: span * SLOT_ROW_HEIGHT }}>
        {/* 빈 슬롯도 누를 수 있다 — 예전에는 아무 반응이 없어서, 추가하려면 위 버튼을 눌러
            모달에서 슬롯 번호를 다시 골라야 했다. 눈앞의 빈칸을 누르는 것이 자연스럽다. */}
        <button
          type="button"
          className={cn(
            'flex h-full w-full items-center gap-2 rounded border px-2 text-left text-sm',
            isSelected
              ? SELECTED_TILE
              : child
                ? cn('border-line bg-surface-2 text-content', SELECTABLE)
                : cn('border-dashed border-line text-content-faint', SELECTABLE),
          )}
          title={child?.name}
          onClick={() => (child ? onSelectChild(child.id) : onAddAtSlot(slotIndex))}
        >
          <span className="w-8 shrink-0 text-right text-xs text-content-faint">{label}</span>
          <span className="min-w-0 flex-1 truncate">{child ? child.name : '비어 있음'}</span>
          {!child && <span className="shrink-0 text-xs text-primary">+ 추가</span>}
        </button>
      </li>,
    );
    idx += span;
  }

  /*
   * 세로로 쌓는 이유: 랙·함체는 세로로 슬롯이 배열된 물리 장비다. 예전에는 `grid-cols-6`
   * 이라 384px 상세 패널에서 칸이 56px 밖에 안 됐고, 장비 이름이 "SCA…", "통합…" 으로
   * 잘려 무엇이 꽂혀 있는지 알 수 없었다. 세로로 두면 이름 전체가 들어간다.
   */
  return <ul className="mt-1 space-y-1">{rows}</ul>;
}

// ── 자유형 자식 리스트 ─────────────────────────────────────────────────────────
interface FreeChildListProps {
  children: V2Asset[];
  onSelectChild: (id: string) => void;
  onAdd: () => void;
}

/*
 * 자유형 컨테이너(슬롯 수 제한 없음)도 고정 슬롯과 **같은 모양**으로 그린다.
 * 예전에는 자유형만 밋밋한 텍스트 목록이라, 같은 "수용" 인데 함체 종류에 따라 화면이
 * 딴판이었다. 다른 것은 번호가 슬롯 위치가 아니라 순번이라는 점뿐이다.
 */
function FreeChildList({ children, onSelectChild, onAdd }: FreeChildListProps) {
  return (
    <ul className="mt-1 space-y-1">
      {children.map((child, i) => (
        <li key={child.id} style={{ minHeight: SLOT_ROW_HEIGHT }}>
          <button
            type="button"
            className={cn(
              'flex h-full w-full items-center gap-2 rounded border border-line bg-surface-2 px-2 text-left text-sm text-content',
              SELECTABLE,
            )}
            onClick={() => onSelectChild(child.id)}
            title={child.name}
          >
            <span className="w-8 shrink-0 text-right text-xs text-content-faint">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{child.name}</span>
          </button>
        </li>
      ))}
      <li style={{ minHeight: SLOT_ROW_HEIGHT }}>
        <button
          type="button"
          className={cn(
            'flex h-full w-full items-center gap-2 rounded border border-dashed border-line px-2 text-left text-sm text-content-faint',
            SELECTABLE,
          )}
          onClick={onAdd}
        >
          <span className="w-8 shrink-0 text-right text-xs text-content-faint">{children.length + 1}</span>
          <span className="min-w-0 flex-1">비어 있음</span>
          <span className="shrink-0 text-xs text-primary">+ 추가</span>
        </button>
      </li>
    </ul>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  childrenBySpecKey: Map<string, V2Asset[]>;
  effectiveAssets: V2Asset[];
  floorNameById: Map<string, string>;
  assetNameById: Map<string, string>;
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null | ((prev: string | null) => string | null)) => void;
  setAddModalCtx: (ctx: AddModalContext | null) => void;
  onSelectAsset: (id: string) => void;
}

export function InfoTab({
  assetId,
  asset,
  type,
  childrenBySpecKey,
  effectiveAssets,
  floorNameById,
  assetNameById,
  selectedChildId,
  setSelectedChildId,
  setAddModalCtx,
  onSelectAsset,
}: InfoTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  const location = locationText(asset, floorNameById, assetNameById);

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
        <DetailRow label="위치">
          <span className="text-sm text-content">{location}</span>
        </DetailRow>
      </DetailCard>

      {/* 커스텀 필드 카드 */}
      {type && type.fieldDefs.length > 0 && (
        <DetailCard>
          <DetailCardHeader title="속성" />
          {type.fieldDefs.map((fd) => {
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
            const selectedChild = selectedChildId != null
              ? specChildren.find((c) => c.id === selectedChildId) ?? null
              : null;
            const freeSlotsForSpec = spec.slotCount != null ? freeSlots(spec, specChildren) : [];

            function handleChildSelect(childId: string) {
              setSelectedChildId((prev) => (prev === childId ? null : childId));
            }

            function handleSlotMove(targetSlot: string) {
              if (!selectedChildId || targetSlot === '') return;
              useV2WorkingCopy.getState().stageAssetUpdate(selectedChildId, {
                slotIndex: parseInt(targetSlot, 10),
              });
              setSelectedChildId(null);
            }

            return (
              <div key={spec.key} className="space-y-1">
                {/* 추가 버튼은 목록 안 '비어 있음' 행이 겸한다 — 머리줄에 또 두면
                    같은 동작이 두 곳이 되고, 어느 슬롯에 들어가는지도 알 수 없다. */}
                <p className="text-xs text-content-muted">
                  {spec.name}
                  {spec.slotCount != null && (
                    <span className="ml-1 text-content-faint">({spec.slotCount}슬롯)</span>
                  )}
                </p>
                {spec.slotCount != null ? (
                  <SlotGrid
                    spec={spec}
                    children={specChildren}
                    selectedChildId={selectedChildId}
                    onSelectChild={handleChildSelect}
                    onAddAtSlot={(slotIndex) =>
                      setAddModalCtx({ parentAssetId: assetId, spec, siblings: specChildren, slotIndex })
                    }
                  />
                ) : (
                  <FreeChildList
                    children={specChildren}
                    onSelectChild={onSelectAsset}
                    onAdd={() => setAddModalCtx({ parentAssetId: assetId, spec, siblings: specChildren })}
                  />
                )}
                {/* 슬롯 이동 패널 (고정 슬롯 + 자식 선택 상태) */}
                {spec.slotCount != null && selectedChild != null && (
                  <div className="mt-1 space-y-1 rounded border border-line bg-surface-2 p-2">
                    <p className="text-xs text-content-muted">
                      <span className="font-medium text-content">{selectedChild.name}</span> 이동
                    </p>
                    {freeSlotsForSpec.length === 0 ? (
                      <p className="text-xs text-content-faint">빈 슬롯 없음</p>
                    ) : (
                      <Select
                        value=""
                        size="sm"
                        onChange={(e) => handleSlotMove(e.currentTarget.value)}
                      >
                        <option value="">— 빈 슬롯으로 이동 —</option>
                        {freeSlotsForSpec.map((idx) => (
                          <option key={idx} value={String(idx)}>
                            슬롯 {idx + 1}
                          </option>
                        ))}
                      </Select>
                    )}
                    <p className="text-xs text-content-faint">
                      슬롯 맞교환은 한 번에 한 자산씩, 중간 저장이 필요합니다.
                    </p>
                  </div>
                )}
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
