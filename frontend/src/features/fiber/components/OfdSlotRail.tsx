import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useTraceGraph, remoteSlotSubstation, type SlimAssetDTO } from '../../trace/traceGraph';
import { useAssetTypeIdByCode } from '../../assets/useAssetTypeIdByCode';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { generateTempId } from '../../../utils/idHelpers';
import { buildRouteCreate, routeDeleteIds } from '../fiberWrite';
import { api } from '../../../utils/api';
import { SlotTile } from '../../../components/SlotTile';
import { OfdRoutePopover } from './OfdRoutePopover';
import type { Asset } from '../../../types/asset';

interface CableWithRoles {
  id: string; sourceAssetId?: string | null; targetAssetId?: string | null;
  sourceRole?: string | null; targetRole?: string | null; cableType?: string | null;
  specParams?: Record<string, unknown> | null;
}

interface PopoverState {
  anchor: DOMRect;
}

/**
 * OFD 경로 GUI — RackSlotGrid 프레임 구조를 그대로 복제:
 *   바깥 테두리(frame) + 좌측 번호 레일 + 1열 슬롯 그리드.
 * 점유 슬롯: SlotTile(faceplate), 빈 슬롯: EmptySlot 룩 인라인.
 * 빈 슬롯 클릭 → anchorRect 기반 OfdRoutePopover(대국+코어 선택).
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

  const { data: slim = [] } = useQuery({
    queryKey: ['assets-slim'],
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });

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

  const coresOf = (slotId: string) =>
    Number((opgwOf(slotId)?.specParams as Record<string, unknown> | undefined)?.cores ?? 0);

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

  // N = 경로 수 + 3 빈 슬롯 (최소 4).
  const N = Math.max(4, slots.length + 3);

  // 빈 슬롯 클릭 핸들러 — ref 콜백 방식(각 빈 슬롯마다 별도 ref 불가이므로 인라인 div 클릭 이벤트에서 getBoundingClientRect 사용).
  const handleEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (configMissing) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setPopover({ anchor: rect });
  };

  // 슬롯 높이: N * 40px (최소 160px) — 랙 슬롯과 동일한 느낌.
  const railHeight = Math.max(N * 40, 160);

  return (
    <div className="relative px-2 pb-2" style={{ height: railHeight }}>
      {/* 랙 프레임 — RackSlotGrid 의 outer frame 과 동일 클래스/구조 */}
      <div className="h-full flex border border-line-strong rounded-md overflow-hidden bg-surface-2 shadow-sm">
        {/* 슬롯 번호 레일 — 랙과 동일 gridTemplateRows + gap */}
        <div
          aria-hidden
          className="shrink-0 w-6 grid gap-1 border-r border-line-strong bg-surface-2"
          style={{ gridTemplateRows: `repeat(${N}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: N }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-[9px] font-mono tabular-nums text-content-faint leading-none"
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* 1열 슬롯 그리드 — RackSlotGrid 와 동일 gridTemplateColumns/Rows/AutoColumns */}
        <div
          className="flex-1 bg-surface grid gap-1"
          style={{
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: `repeat(${N}, minmax(0, 1fr))`,
            gridAutoColumns: '0',
          }}
        >
          {/* 점유 슬롯 (경로) */}
          {slots.map((slot, i) => {
            const local = graph?.subNameById.get(ofdId) ?? localOfd?.substationName ?? null;
            const remote = graph ? remoteSlotSubstation(slot.id, graph) : null;
            const title = [local, remote].filter(Boolean).join(' - ') || slot.name;
            const n = coresOf(slot.id);
            return (
              <div
                key={slot.id}
                style={{
                  gridRowStart: i + 1,
                  gridRowEnd: i + 2,
                  gridColumnStart: 1,
                  gridColumnEnd: 2,
                }}
              >
                <SlotTile
                  title={title}
                  subtitle={n ? `${n}코어` : undefined}
                  selected={selectedAssetId === slot.id}
                  onClick={() => useSelectionStore.getState().setSelectedAssetId(slot.id)}
                  onDelete={() => deleteRoute(slot)}
                />
              </div>
            );
          })}

          {/* 빈 슬롯 (항상 3개, slots.length 이후 위치) */}
          {Array.from({ length: N - slots.length }, (_, j) => {
            const rowIndex = slots.length + j;
            return (
              <EmptySlotCell
                key={`empty-${rowIndex}`}
                rowIndex={rowIndex}
                isActive={popover !== null}
                onClick={handleEmptyClick}
                configMissing={configMissing}
              />
            );
          })}
        </div>
      </div>

      {/* 설정 누락 경고 */}
      {configMissing && (
        <p className="mt-1 px-1 text-[11px] text-content-faint">설정 로딩/누락</p>
      )}

      {/* 경로 추가 팝오버 */}
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

// ── 빈 슬롯 인라인 컴포넌트 — EmptySlot 룩 복제 (editorStore 의존 없음) ────────

interface EmptySlotCellProps {
  rowIndex: number;
  isActive: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  configMissing: boolean;
}

function EmptySlotCell({ rowIndex, isActive, onClick, configMissing }: EmptySlotCellProps) {
  const activeClasses = 'bg-info-bg text-primary ring-1 ring-inset ring-primary';
  const hoverClasses = 'hover:bg-info-bg hover:text-primary';

  return (
    <div
      role="button"
      tabIndex={configMissing ? -1 : 0}
      onClick={configMissing ? undefined : onClick}
      onKeyDown={(e) => {
        if (!configMissing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      style={{
        gridRowStart: rowIndex + 1,
        gridRowEnd: rowIndex + 2,
        gridColumnStart: 1,
        gridColumnEnd: 2,
      }}
      className={`group/slot flex items-center justify-center min-h-0 overflow-hidden text-[11px] text-content-faint bg-surface-2/50 rounded-[3px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        configMissing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      } ${isActive ? activeClasses : hoverClasses}`}
      aria-label={`빈 슬롯 ${rowIndex + 1} — 경로 추가`}
    >
      <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity">+ 추가</span>
    </div>
  );
}
