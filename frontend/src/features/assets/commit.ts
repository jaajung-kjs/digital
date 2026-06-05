import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { assetApi } from '../../services/assetApi';
import { buildDelta } from '../workingCopy/delta';
import { useRegisterStore } from './registerStore';
import type { Asset } from '../../types/asset';

const ASSET_KEY = (subId: string) => ['assets', subId];

/** 레지스터 워킹카피 커밋. 409 면 conflicts 반환(overlay 보존). */
export async function commitRegister(
  substationId: string,
  queryClient: QueryClient,
): Promise<{ ok: boolean; conflicts?: { id: string; name?: string }[] }> {
  const st = useRegisterStore.getState();
  const delta = buildDelta(st.overlay);
  const creates = delta.creates.map((a) => ({
    tempId: a.id, assetTypeId: a.assetTypeId, name: a.name, parentAssetId: a.parentAssetId ?? null,
    roomText: a.roomText ?? null, attributes: a.attributes ?? null,
    installDate: a.installDate ?? null, manager: a.manager ?? null, status: a.status ?? null,
    warrantyUntil: a.warrantyUntil ?? null, replaceDue: a.replaceDue ?? null,
  }));
  try {
    const { idMap } = await assetApi.commit(substationId, { creates, updates: delta.updates, deletes: delta.deletes });
    for (const p of st.photoQueue) {
      const assetId = idMap[p.assetId] ?? p.assetId;
      const form = new FormData(); form.append('file', p.file); form.append('side', p.side);
      await api.post(`/equipment/${assetId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    for (const l of st.logQueue) {
      const assetId = idMap[l.assetId] ?? l.assetId;
      await api.post(`/equipment/${assetId}/maintenance-logs`, { logType: l.logType, title: l.title });
    }
    useRegisterStore.getState().clear();
    await queryClient.invalidateQueries({ queryKey: ASSET_KEY(substationId) });
    const fresh = queryClient.getQueryData<Asset[]>(ASSET_KEY(substationId)) ?? [];
    useRegisterStore.getState().load(substationId, fresh);
    return { ok: true };
  } catch (e) {
    const resp = (e as { response?: { status?: number; data?: { details?: { id: string; name?: string }[] } } }).response;
    if (resp?.status === 409) return { ok: false, conflicts: resp.data?.details ?? [] };
    throw e;
  }
}
