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
import type { Asset } from '../../../types/asset';

interface CableWithRoles {
  id: string; sourceAssetId?: string | null; targetAssetId?: string | null;
  sourceRole?: string | null; targetRole?: string | null; cableType?: string | null;
  specParams?: Record<string, unknown> | null;
}

/** OFD 경로슬롯 타일 GUI — 슬롯 타일(출발-대국/N코어, 클릭 이동) + 슬롯 추가(대국+24/48) + 삭제. */
export function OfdSlotGrid({ ofdId }: { ofdId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables() as unknown as CableWithRoles[];
  const { graph } = useTraceGraph();
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const slotTypeId = useAssetTypeIdByCode('OFD-SLOT');
  const { data: categories = [] } = useCableCategories();
  const opgwCat = categories.find((c) => c.code === 'CBL-OPGW');
  const [adding, setAdding] = useState(false);
  const [cores, setCores] = useState(24);

  const { data: slim = [] } = useQuery({
    queryKey: ['assets-slim'],
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });

  const peerOfds = useMemo(() => slim.filter((a) => a.code === 'OFD' && a.id !== ofdId), [slim, ofdId]);
  const localOfd = useMemo(() => slim.find((a) => a.id === ofdId) ?? null, [slim, ofdId]);

  // This OFD's conduit slots (working-copy — includes staged creates).
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

  const addRoute = (remote: SlimAssetDTO) => {
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
    setAdding(false);
  };

  const deleteRoute = (slot: Asset) => {
    // C1 fix: require cableType === 'FIBER' to avoid mistaking a non-FIBER IN-IN cable for the OPGW.
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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {slots.map((slot) => {
          const local = graph?.subNameById.get(ofdId) ?? localOfd?.substationName ?? null;
          const remote = graph ? remoteSlotSubstation(slot.id, graph) : null;
          const title = [local, remote].filter(Boolean).join(' - ') || slot.name;
          const n = coresOf(slot.id);
          return (
            <SlotTile
              key={slot.id}
              title={title}
              subtitle={n ? `${n}코어` : undefined}
              selected={selectedAssetId === slot.id}
              onClick={() => useSelectionStore.getState().setSelectedAssetId(slot.id)}
              onDelete={() => deleteRoute(slot)}
            />
          );
        })}
        <SlotTile
          state="empty"
          title={adding ? '닫기' : '+ 슬롯 추가'}
          onClick={() => { if (!configMissing) setAdding((v) => !v); }}
        />
      </div>

      {adding && (
        <div className="rounded border border-line p-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-content-muted">
            <span>코어 수</span>
            {[24, 48].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCores(n)}
                className={`rounded border px-2 py-0.5 text-xs ${cores === n ? 'border-primary bg-info-bg text-primary' : 'border-line text-content-muted'}`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={cores}
              onChange={(e) => setCores(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-line px-1 text-xs"
            />
          </div>
          <div className="max-h-40 space-y-0.5 overflow-auto">
            {peerOfds.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => addRoute(o)}
                className="block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-surface-2"
              >
                {o.substationName ?? o.name} 대국
              </button>
            ))}
            {peerOfds.length === 0 && (
              <p className="px-1.5 py-1 text-xs text-content-faint">대국 OFD 없음</p>
            )}
          </div>
        </div>
      )}

      {configMissing && <p className="px-1 text-[11px] text-content-faint">설정 로딩/누락</p>}
    </div>
  );
}
