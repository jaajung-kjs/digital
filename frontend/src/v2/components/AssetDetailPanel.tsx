import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import type { BadgeStatus } from '../../components/ui/Badge';
import { Badge, Button, DetailCard, DetailCardHeader, DetailRow, Input, Select } from '../../components/ui';
import { useV2Catalog, useTypesById } from '../hooks';
import { freeSlots } from '../newAsset';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import type { V2Asset, V2ContainerSpec } from '../types';
import { deriveDetailSections } from './detailSections';
import { AddAssetModal } from './AddAssetModal';
import { RecordsTab } from './RecordsTab';

// ── 상태 배지 tone → BadgeStatus ─────────────────────────────────────────────
function toneToStatus(tone: string): BadgeStatus {
  if (tone === 'success') return 'success';
  if (tone === 'danger') return 'danger';
  return 'neutral';
}

function assetStatusBadge(value: string): BadgeStatus {
  const entry = ASSET_STATUSES.find((s) => s.value === value);
  return entry ? toneToStatus(entry.tone) : 'neutral';
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

function SlotGrid({ spec, children, selectedChildId, onSelectChild }: SlotGridProps) {
  const slotCount = spec.slotCount!;
  // 슬롯 인덱스(0-based) → 자식 자산 매핑
  const bySlot = new Map<number, V2Asset>();
  for (const child of children) {
    if (child.slotIndex != null) bySlot.set(child.slotIndex, child);
  }

  const cells: React.ReactNode[] = [];
  let idx = 0;
  while (idx < slotCount) {
    const child = bySlot.get(idx);
    const span = child?.slotSpan ?? 1;
    const isSelected = child != null && child.id === selectedChildId;
    cells.push(
      <div
        key={idx}
        style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}
        className={`min-w-0 truncate rounded border px-1 py-0.5 text-xs ${
          isSelected
            ? 'cursor-pointer border-primary bg-primary/10 text-content'
            : child
              ? 'cursor-pointer border-line bg-surface-2 text-content hover:bg-surface'
              : 'border-line text-content-faint'
        }`}
        title={child?.name}
        onClick={() => child && onSelectChild(child.id)}
      >
        <span className="text-content-faint">{idx + 1}</span>
        {child && <span className="ml-0.5 truncate">{child.name}</span>}
        {!child && <span className="ml-0.5">—</span>}
      </div>,
    );
    idx += span;
  }

  return (
    <div className="mt-1 grid grid-cols-6 gap-1">
      {cells}
    </div>
  );
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
            className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-content hover:bg-surface-2"
            onClick={() => onSelectChild(child.id)}
          >
            {child.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── 탭 타입 ──────────────────────────────────────────────────────────────────
type Tab = 'info' | 'inspections' | 'logs';

interface AddModalContext {
  parentAssetId: string;
  spec: V2ContainerSpec;
  siblings: { slotIndex: number | null; slotSpan: number | null }[];
}

// ── 메인 패널 ─────────────────────────────────────────────────────────────────
interface AssetDetailPanelProps {
  assetId: string;
  onSelectAsset: (id: string) => void;
}

export function AssetDetailPanel({ assetId, onSelectAsset }: AssetDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [addModalCtx, setAddModalCtx] = useState<AddModalContext | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // 자산 전환 시 로컬 상태 리셋 (stale 자식 선택/모달 컨텍스트 방지)
  useEffect(() => {
    setSelectedChildId(null);
    setAddModalCtx(null);
  }, [assetId]);

  // ── 반응형 슬라이스 구독 (effectiveAssets() 함수 ref 구독 금지)
  const substationId = useV2WorkingCopy((s) => s.substationId) ?? '';
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

  const floorNameById = useMemo(() => new Map(saved.floors.map((f) => [f.id, f.name])), [saved.floors]);
  const assetNameById = useMemo(() => new Map(effectiveAssets.map((a) => [a.id, a.name])), [effectiveAssets]);

  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);
  const type = asset ? typesById.get(asset.typeId) : undefined;
  const sections = useMemo(() => (type ? deriveDetailSections(type) : null), [type]);

  // 자식 자산 목록 (수용 섹션용)
  const childrenBySpecKey = useMemo(() => {
    const map = new Map<string, V2Asset[]>();
    for (const a of effectiveAssets) {
      if (a.parentAssetId === assetId && a.containerKey) {
        const list = map.get(a.containerKey) ?? [];
        list.push(a);
        map.set(a.containerKey, list);
      }
    }
    // 슬롯 인덱스 순 정렬
    for (const [, list] of map) {
      list.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    }
    return map;
  }, [effectiveAssets, assetId]);

  if (!asset) return null;

  const location = locationText(asset, floorNameById, assetNameById);

  // 하위 자산 총 수 (cascade 삭제 confirm용)
  function countDescendants(rootId: string): number {
    const directChildren = effectiveAssets.filter((a) => a.parentAssetId === rootId);
    return directChildren.reduce((acc, child) => acc + 1 + countDescendants(child.id), 0);
  }
  const descendantCount = countDescendants(assetId);

  // ── 삭제 핸들러 ────────────────────────────────────────────────────────────
  function handleDelete() {
    const msg =
      descendantCount > 0
        ? `${descendantCount}개 하위 자산이 함께 삭제됩니다. 계속하시겠습니까?`
        : '이 자산을 삭제하시겠습니까?';
    if (!window.confirm(msg)) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(assetId);
  }

  // ── 인라인 편집 핸들러 ─────────────────────────────────────────────────────
  function handleNameCommit(value: string) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== asset!.name) {
      useV2WorkingCopy.getState().stageAssetUpdate(assetId, { name: trimmed });
    }
  }

  function handleStatusChange(value: string) {
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { status: value });
  }

  function handleFieldCommit(key: string, value: string) {
    // 커밋 시점 스토어에서 현재 fieldValues 를 읽는다 (렌더 클로저 stale 방지; 이벤트 핸들러라 반응성 무관)
    const current = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId)?.fieldValues ?? {};
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { fieldValues: { ...current, [key]: value } });
  }

  // ── 탭 바 ──────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: '정보' },
    { key: 'inspections', label: '점검' },
    { key: 'logs', label: '고장이력' },
  ];

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface">
      {/* 탭 바 */}
      <div className="flex shrink-0 border-b border-line z-sticky">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary font-medium text-primary'
                : 'text-content-muted hover:text-content'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'info' && (
          <>
            {/* 기본 정보 카드 */}
            <DetailCard>
              <DetailCardHeader title={type?.name ?? '—'} onDelete={handleDelete} />

              {/* 이름 */}
              <DetailRow label="이름">
                <Input
                  defaultValue={asset.name}
                  className="py-0.5 text-sm"
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
                <div className="flex items-center gap-2">
                  <Select
                    value={asset.status}
                    className="py-0.5 text-sm"
                    onChange={(e) => handleStatusChange(e.currentTarget.value)}
                  >
                    {ASSET_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </Select>
                  <Badge status={assetStatusBadge(asset.status)}>
                    {assetStatusLabel(asset.status)}
                  </Badge>
                </div>
              </DetailRow>

              {/* 위치 */}
              <DetailRow label="위치">
                <span className="text-sm text-content">{location}</span>
              </DetailRow>
            </DetailCard>

            {/* 커스텀 필드 카드 */}
            {sections && sections.fieldDefs.length > 0 && (
              <DetailCard>
                <p className="text-xs font-semibold text-content-muted">속성</p>
                {sections.fieldDefs.map((fd) => {
                  const rawVal = asset.fieldValues[fd.key];
                  const strVal = rawVal != null ? String(rawVal) : '';
                  return (
                    <DetailRow key={fd.key} label={fd.label}>
                      {fd.type === 'select' ? (
                        <Select
                          defaultValue={strVal}
                          className="py-0.5 text-sm"
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
                          className="py-0.5 text-sm"
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
                <p className="text-xs font-semibold text-content-muted">포트</p>
                {type.portTemplates.map((pt) => (
                  <div key={pt.id} className="space-y-0.5">
                    <p className="text-xs text-content-muted">{pt.group}</p>
                    {Array.from({ length: pt.count }, (_, i) => {
                      const portName = pt.namePattern.replace('{n}', String(i + 1));
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs text-content">
                          <span>{portName}</span>
                          <span className="text-content-faint">·</span>
                          <span className="text-content-faint">{pt.direction}</span>
                          <span className="text-content-faint">·</span>
                          <span className="text-content-faint">{pt.medium}</span>
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
                <p className="text-xs font-semibold text-content-muted">수용</p>
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
                          variant="ghost"
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
                              className="py-0.5 text-xs"
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
          </>
        )}

        {tab === 'inspections' && (
          <RecordsTab
            assetId={assetId}
            kind="inspections"
            dateField="inspectedAt"
            extraField="result"
            dateLabel="점검일"
            extraLabel="결과"
            emptyMessage="점검 기록이 없습니다"
          />
        )}

        {tab === 'logs' && (
          <RecordsTab
            assetId={assetId}
            kind="maintenance"
            dateField="occurredAt"
            extraField="action"
            dateLabel="발생일"
            extraLabel="조치"
            emptyMessage="고장이력이 없습니다"
          />
        )}
      </div>

      {/* 자산 추가 모달 (수용 섹션 + 버튼에서 열림) */}
      {addModalCtx && (
        <AddAssetModal
          open={true}
          onClose={() => setAddModalCtx(null)}
          substationId={substationId}
          containerContext={addModalCtx}
        />
      )}
    </div>
  );
}
