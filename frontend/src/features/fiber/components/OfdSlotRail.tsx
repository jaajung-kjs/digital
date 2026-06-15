import { useMemo, useState } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useTraceGraph, type SlimAssetDTO } from '../../trace/traceGraph';
import { useAssetTypeIdByCode } from '../../assets/useAssetTypeIdByCode';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { useSlimAssets } from '../../assets/hooks/useSlimAssets';
import { generateTempId } from '../../../utils/idHelpers';
import { buildRouteCreate, routeDeleteIds } from '../fiberWrite';
import { fiberSlotLabel } from '../fiberSlotLabel';
import { SlotTile } from '../../../components/SlotTile';
import { SlotRailGrid } from '../../../components/SlotRailGrid';
import { OfdRoutePopover } from './OfdRoutePopover';
import type { Asset } from '../../../types/asset';

/** 12슬롯 고정 — 랙과 동일. 비어 있는 슬롯은 빈 셀로 표시. */
const OFD_SLOT_COUNT = 12;

interface CableWithRoles {
  id: string; sourceAssetId?: string | null; targetAssetId?: string | null;
  sourceRole?: string | null; targetRole?: string | null; cableType?: string | null;
  specParams?: Record<string, unknown> | null;
}

interface PopoverState {
  anchor: DOMRect;
  rowIndex: number;
}

/**
 * OFD 경로 GUI — SlotRailGrid(랙·OFD 공유 컴포넌트)를 사용해
 * 랙과 완전히 동일한 frame + 좌측 번호 레일 + 1열 슬롯 그리드를 렌더.
 * 프레임 마크업 복제 없음(SlotRailGrid 가 유일한 출처).
 *
 * 점유 슬롯: SlotTile h-full(faceplate, 클릭→선택, hover→삭제).
 * 빈 슬롯: 랙 EmptySlot 동일 룩(bg-surface-2/50, hover bg-info-bg, "+ 추가").
 * 빈 슬롯 클릭 → OfdRoutePopover(코어 수 + 대국 OFD 선택).
 * TODO(P3): 빈 슬롯 클릭 UI 를 포트 수 + 대국 변전소 선택 피커로 교체 예정.
 */
export function OfdSlotRail({ ofdId }: { ofdId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables() as unknown as CableWithRoles[];
  const { graph } = useTraceGraph();
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const slotTypeId = useAssetTypeIdByCode('OFD-SLOT');
  const { data: categories = [] } = useCableCategories();
  const opgwCat = categories.find((c) => c.code === 'CBL-OPGW');

  const [popover, setPopover] = useState<PopoverState | null>(null);

  const { data: slim = [] } = useSlimAssets();

  const peerOfds = useMemo(() => slim.filter((a) => a.code === 'OFD' && a.id !== ofdId), [slim, ofdId]);
  const localOfd = useMemo(() => slim.find((a) => a.id === ofdId) ?? null, [slim, ofdId]);

  // 이 OFD 의 conduit 슬롯들 (working-copy 포함).
  const slots = useMemo(
    () => assets.filter((a) => a.parentAssetId === ofdId && a.assetType?.connectionKind === 'conduit'),
    [assets, ofdId],
  );

  const opgwOf = (slotId: string) =>
    cables.find(
      (c) =>
        c.cableType === 'FIBER' &&
        c.sourceRole === 'IN' &&
        c.targetRole === 'IN' &&
        (c.sourceAssetId === slotId || c.targetAssetId === slotId),
    );

  const addRoute = (remote: SlimAssetDTO, cores: number) => {
    if (!slotTypeId || !opgwCat || !localOfd) return;
    const { slots: newSlots, opgw } = buildRouteCreate({
      localOfd: { id: localOfd.id, substationId: localOfd.substationId, substationName: localOfd.substationName },
      remoteOfd: { id: remote.id, substationId: remote.substationId, substationName: remote.substationName },
      cores, slotTypeId, opgwCategory: opgwCat,
      ids: { slotA: generateTempId(), slotB: generateTempId(), opgw: generateTempId() },
    });
    const wc = useSubstationWorkingCopy.getState();
    for (const s of newSlots) wc.put('assets', s as unknown as { id: string; [k: string]: unknown });
    wc.put('cables', opgw as unknown as { id: string; [k: string]: unknown });
    setPopover(null);
  };

  const deleteRoute = (slot: Asset) => {
    const op = opgwOf(slot.id);
    const twinId = op
      ? op.sourceAssetId === slot.id
        ? op.targetAssetId
        : op.sourceAssetId
      : undefined;
    if (!twinId) return;
    const { assetIds, cableIds } = routeDeleteIds(slot.id, twinId, cables);
    if (!confirm(`이 경로와 코어 연결 ${Math.max(0, cableIds.length - 1)}개를 삭제합니다.`)) return;
    const wc = useSubstationWorkingCopy.getState();
    for (const id of cableIds) wc.remove('cables', id);
    for (const id of assetIds) wc.remove('assets', id);
  };

  const configMissing = !slotTypeId || !opgwCat;

  const handleEmptyClick = (rowIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (configMissing) return;
    setPopover({ anchor: (e.currentTarget as HTMLDivElement).getBoundingClientRect(), rowIndex });
  };

  return (
    // 12슬롯 × 40px = 480px — 랙과 동일한 슬롯당 높이.
    <div className="relative px-2 pb-2" style={{ height: OFD_SLOT_COUNT * 40 }}>
      {/* SlotRailGrid — 프레임·레일·그리드는 공용 컴포넌트가 단독 소유. */}
      <SlotRailGrid slotCount={OFD_SLOT_COUNT}>
        {/* 점유 슬롯 (경로 0..slots.length-1) */}
        {slots.map((slot, i) => {
          const title = fiberSlotLabel(slot.id, graph) || slot.name;
          return (
            // 랙 ModuleCell 과 동일한 SlotTile — 드래그/리사이즈만 없을 뿐 같은 비주얼.
            <SlotTile
              key={slot.id}
              title={title}
              selected={selectedAssetId === slot.id}
              onClick={() => useSelectionStore.getState().setSelectedAssetId(slot.id)}
              onDelete={() => deleteRoute(slot)}
              style={{
                gridRowStart: i + 1,
                gridRowEnd: i + 2,
                gridColumnStart: 1,
                gridColumnEnd: 2,
              }}
            />
          );
        })}

        {/* 빈 슬롯 (slots.length..OFD_SLOT_COUNT-1) — 랙 EmptySlot 룩 인라인. */}
        {Array.from({ length: OFD_SLOT_COUNT - slots.length }, (_, j) => {
          const rowIndex = slots.length + j;
          return (
            <OfdEmptySlot
              key={`empty-${rowIndex}`}
              rowIndex={rowIndex}
              isActive={popover?.rowIndex === rowIndex}
              configMissing={configMissing}
              onClick={handleEmptyClick}
            />
          );
        })}
      </SlotRailGrid>

      {configMissing && (
        <p className="mt-1 px-1 text-[11px] text-content-faint">설정 로딩/누락</p>
      )}

      {popover && (
        <OfdRoutePopover
          anchorRect={popover.anchor}
          peerOfds={peerOfds}
          onPick={(peer, cores) => addRoute(peer, cores)}
          onCancel={() => setPopover(null)}
        />
      )}
    </div>
  );
}

// ── 빈 슬롯 셀 — editorStore 의존 없는 EmptySlot 룩 ─────────────────────────

interface OfdEmptySlotProps {
  rowIndex: number;
  isActive: boolean;
  configMissing: boolean;
  onClick: (rowIndex: number, e: React.MouseEvent<HTMLDivElement>) => void;
}

function OfdEmptySlot({ rowIndex, isActive, configMissing, onClick }: OfdEmptySlotProps) {
  const activeClasses = 'border-primary bg-info-bg text-primary ring-1 ring-inset ring-primary';
  const hoverClasses = 'hover:border-primary hover:bg-info-bg hover:text-primary';

  return (
    <div
      role="button"
      tabIndex={configMissing ? -1 : 0}
      onClick={configMissing ? undefined : (e) => onClick(rowIndex, e)}
      onKeyDown={(e) => {
        if (!configMissing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(rowIndex, e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      style={{
        gridRowStart: rowIndex + 1,
        gridRowEnd: rowIndex + 2,
        gridColumnStart: 1,
        gridColumnEnd: 2,
      }}
      className={`group/slot flex items-center justify-center min-h-0 overflow-hidden text-[11px] text-content-faint bg-surface/40 border border-dashed border-line rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        configMissing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      } ${isActive ? activeClasses : hoverClasses}`}
      aria-label={`빈 슬롯 ${rowIndex + 1} — 경로 추가`}
    >
      <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity">+ 추가</span>
    </div>
  );
}
