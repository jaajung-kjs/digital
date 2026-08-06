/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { Plus } from 'lucide-react';
import { ASSET_STATUSES, portDirectionLabel } from '@twin/core';
import {
  Button,
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
import { useMediumLabel } from '../hooks';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset, V2AssetType, V2ContainerSpec } from '../types';
import type { deriveDetailSections } from '../detailSections';
import { PhotoCard } from './PhotoCard';

export interface AddModalContext {
  parentAssetId: string;
  spec: V2ContainerSpec;
  siblings: { slotIndex: number | null; slotSpan: number | null }[];
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
}

/** 슬롯 한 칸의 높이(px) — 여러 슬롯을 차지하는 장비는 이 배수만큼 높아진다. */
const SLOT_ROW_HEIGHT = 26;

function SlotGrid({ spec, children, selectedChildId, onSelectChild }: SlotGridProps) {
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
    rows.push(
      <li
        key={idx}
        style={{ minHeight: span * SLOT_ROW_HEIGHT }}
        className={cn(
          'flex items-center gap-2 rounded border px-2 text-sm',
          isSelected
            ? SELECTED_TILE
            : child
              ? cn('border-line bg-surface-2 text-content', SELECTABLE)
              : 'border-line border-dashed text-content-faint',
        )}
        title={child?.name}
        onClick={() => child && onSelectChild(child.id)}
      >
        <span className="w-8 shrink-0 text-right text-xs text-content-faint">{label}</span>
        <span className="min-w-0 flex-1 truncate">{child ? child.name : '비어 있음'}</span>
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
}

function FreeChildList({ children, onSelectChild }: FreeChildListProps) {
  if (children.length === 0) {
    return <p className="text-xs text-content-faint">수용 자산 없음</p>;
  }
  return (
    <ul className="mt-1 space-y-0.5">
      {children.map((child) => (
        <li key={child.id}>
          <button
            type="button"
            className={cn('w-full truncate rounded px-1 py-0.5 text-left text-sm text-content', SELECTABLE)}
            onClick={() => onSelectChild(child.id)}
          >
            {child.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  sections: ReturnType<typeof deriveDetailSections> | null;
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
  sections,
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
  const mediumLabel = useMediumLabel();
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
      {sections && sections.fieldDefs.length > 0 && (
        <DetailCard>
          <DetailCardHeader title="속성" />
          {sections.fieldDefs.map((fd) => {
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

      {/* 포트 섹션 */}
      {sections?.showPorts && type && (
        <DetailCard>
          <DetailCardHeader title="포트" />
          {type.portTemplates.map((pt) => (
            <div key={pt.id} className="space-y-0.5">
              {/* 그룹 키는 타입 작성자가 붙인 내부 이름이다("P", "A"…). 그룹이 하나뿐이면
                  보여줄 정보가 없으므로 생략한다 — 예전에는 "P" 만 덩그러니 떠 있었다. */}
              {type.portTemplates.length > 1 && (
                <p className="text-xs font-medium text-content-muted">{pt.group} 그룹</p>
              )}
              {Array.from({ length: pt.count }, (_, i) => {
                const portName = pt.namePattern.replace('{n}', String(i + 1));
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-content">
                    <span className="min-w-0 flex-1 truncate">{portName}</span>
                    {/* 방향·매체는 이름을 보조하는 메타다 — 배지로 강조하면 정작 포트 이름보다
                        무거워 보인다. 내부 값(BI·network)이 아니라 사람이 읽는 이름으로 적는다. */}
                    <span className="shrink-0 text-xs text-content-muted">
                      {mediumLabel(pt.medium)} · {portDirectionLabel(pt.direction)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </DetailCard>
      )}

      {/* 수용 섹션 */}
      {sections && sections.containerSpecs.length > 0 && (
        <DetailCard>
          <DetailCardHeader title="수용" />
          {sections.containerSpecs.map((spec) => {
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
                <div className="flex items-center gap-1">
                  <p className="flex-1 text-xs text-content-muted">
                    {spec.name}
                    {spec.slotCount != null && (
                      <span className="ml-1 text-content-faint">({spec.slotCount}슬롯)</span>
                    )}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={12} />}
                    onClick={() => setAddModalCtx({ parentAssetId: assetId, spec, siblings: specChildren })}
                  >
                    추가
                  </Button>
                </div>
                {spec.slotCount != null ? (
                  <SlotGrid
                    spec={spec}
                    children={specChildren}
                    selectedChildId={selectedChildId}
                    onSelectChild={handleChildSelect}
                  />
                ) : (
                  <FreeChildList children={specChildren} onSelectChild={onSelectAsset} />
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
