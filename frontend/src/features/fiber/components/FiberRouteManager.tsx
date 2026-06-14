import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useTraceGraph, remoteSlotSubstation, type SlimAssetDTO } from '../../trace/traceGraph';
import { useAssetTypeIdByCode } from '../../assets/useAssetTypeIdByCode';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { generateTempId } from '../../../utils/idHelpers';
import { buildRouteCreate, routeDeleteIds } from '../fiberWrite';
import { api } from '../../../utils/api';
import type { Asset } from '../../../types/asset';

export function FiberRouteManager({ ofdId }: { ofdId: string }) {
  // Local working-copy assets — used only for slot discovery (this OFD's children).
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables();
  const { graph } = useTraceGraph();
  const slotTypeId = useAssetTypeIdByCode('OFD-SLOT');
  const { data: categories = [] } = useCableCategories();
  const opgwCat = categories.find((c) => c.code === 'CBL-OPGW');
  const [adding, setAdding] = useState(false);
  const [cores, setCores] = useState(24);

  // Global slim asset feed — deduped with useTraceGraph (same queryKey).
  const { data: slim = [] } = useQuery({
    queryKey: ['assets-slim'],
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });

  // Peer OFDs from ALL substations (slim feed covers cross-substation).
  const peerOfds = useMemo(() => slim.filter((a) => a.code === 'OFD' && a.id !== ofdId), [slim, ofdId]);
  const localOfd = useMemo(() => slim.find((a) => a.id === ofdId) ?? null, [slim, ofdId]);

  // This OFD's conduit slots (working-copy — includes staged creates).
  const slots = useMemo(
    () => assets.filter((a) => a.parentAssetId === ofdId && a.assetType?.connectionKind === 'conduit'),
    [assets, ofdId],
  );

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
    const wc = useSubstationWorkingCopy.getState();
    type CableWithRoles = {
      id: string;
      sourceAssetId?: string | null;
      targetAssetId?: string | null;
      sourceRole?: string | null;
      targetRole?: string | null;
      cableType?: string | null;
    };
    const cableList = cables as unknown as CableWithRoles[];
    // C1 fix: require cableType === 'FIBER' to avoid mistaking a non-FIBER IN-IN cable for the OPGW.
    const opgw = cableList.find(
      (c) =>
        c.cableType === 'FIBER' &&
        c.sourceRole === 'IN' &&
        c.targetRole === 'IN' &&
        (c.sourceAssetId === slot.id || c.targetAssetId === slot.id),
    );
    const twinId = opgw
      ? opgw.sourceAssetId === slot.id
        ? opgw.targetAssetId
        : opgw.sourceAssetId
      : undefined;
    if (!twinId) return;
    const { assetIds, cableIds } = routeDeleteIds(slot.id, twinId, cableList);
    if (!confirm(`이 경로와 코어 연결 ${Math.max(0, cableIds.length - 1)}개를 삭제합니다.`)) return;
    for (const id of cableIds) wc.remove('cables', id);
    for (const id of assetIds) wc.remove('assets', id);
  };

  const configMissing = !slotTypeId || !opgwCat;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-semibold text-content">광 경로</h4>
        <div className="flex items-center gap-1">
          {configMissing && (
            <span className="text-[11px] text-content-faint">설정 로딩/누락</span>
          )}
          <button
            className="text-xs text-primary"
            onClick={() => setAdding((v) => !v)}
            disabled={configMissing}
          >
            + 경로 추가
          </button>
        </div>
      </div>
      {adding && (
        <div className="rounded border border-line p-2 space-y-2">
          <label className="text-[11px] text-content-muted flex items-center gap-1">
            코어 수
            <input
              type="number"
              min={1}
              value={cores}
              onChange={(e) => setCores(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 border border-line rounded px-1 text-xs"
            />
          </label>
          <div className="max-h-40 overflow-auto space-y-0.5">
            {peerOfds.map((o) => (
              <button
                key={o.id}
                onClick={() => addRoute(o)}
                className="block w-full text-left text-xs px-1.5 py-1 rounded hover:bg-surface-2"
              >
                {o.substationName ?? o.name} 대국
              </button>
            ))}
          </div>
        </div>
      )}
      <table className="w-full border-collapse">
        <tbody>
          {slots.map((slot) => {
            const remote = graph ? remoteSlotSubstation(slot.id, graph) : null;
            return (
              <tr key={slot.id} className="border-b border-line text-[13px]">
                <td className="px-2 py-1.5 text-content">{remote ?? slot.name}</td>
                <td className="px-2 py-1.5 text-right">
                  <button className="text-xs text-danger" onClick={() => deleteRoute(slot)}>
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
          {slots.length === 0 && (
            <tr>
              <td className="px-2 py-2 text-xs text-content-faint">
                경로 없음 — "경로 추가"로 대국 트렁크 생성
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
