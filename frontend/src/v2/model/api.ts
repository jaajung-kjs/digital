import { httpClient as api } from '../httpClient';
import type { CommitPayload } from '@twin/core';
import type { Catalog, CatalogKind, NodeEquipmentRow, Workingcopy } from './types';

/** ISO datetime → `YYYY-MM-DD`. 이미 그 꼴이거나 비었으면 그대로. */
function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.length > 10 ? v.slice(0, 10) : v;
}

/**
 * 서버가 준 워킹카피의 날짜를 **한 번** 접는다 — 저장이 `YYYY-MM-DD` 만 받으므로,
 * 읽은 그대로 다시 보내도 맞게. 화면 어디서도 다시 자르지 않는다.
 *
 * 코어 측정은 **넣은 차례(오래된 것 먼저)**로 싣는다 — 서버는 최근 먼저 준다. 새로 넣은 측정은 워킹카피 끝에
 * 붙으므로 차례가 하나로 이어져, core `newestFirst` 의 「같은 날짜면 나중 것이 최근」이 저장 전후로 같다.
 */
export function normalizeWorkingcopy(raw: Workingcopy): Workingcopy {
  return {
    ...raw,
    equipment: raw.equipment.map((e) => ({ ...e, installDate: dateOnly(e.installDate) })),
    fiberLines: raw.fiberLines.map((l) => ({
      ...l,
      cores: l.cores.map((c) => ({ ...c, measurements: c.measurements.map((m) => ({ ...m, measuredOn: dateOnly(m.measuredOn) })).reverse() })),
    })),
  };
}

export async function fetchWorkingcopy(substationId: string): Promise<Workingcopy> {
  return normalizeWorkingcopy((await api.get(`/v2/substations/${substationId}/workingcopy`)).data);
}

/**
 * 저장 — 변경안 하나를 통째로. **국을 가리지 않는다**(공사 단위).
 * 사진 파일이 있으면 multipart: `payload` 칸에 JSON, 사진은 제 id 를 칸 이름으로.
 */
export async function putCommit(
  payload: CommitPayload,
  photoFiles: ReadonlyMap<string, File> = new Map(),
): Promise<{ committedAt: string; changeLogId: string }> {
  if (photoFiles.size === 0) return (await api.put('/v2/commit', payload)).data;
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const [photoId, file] of photoFiles) form.append(photoId, file);
  /* Content-Type 을 비워 브라우저가 multipart boundary 를 채우게 한다(인스턴스 기본이 JSON). */
  return (await api.put('/v2/commit', form, { headers: { 'Content-Type': undefined } })).data;
}

export async function fetchCatalog(): Promise<Catalog> {
  return (await api.get('/v2/catalog')).data;
}
export async function createCatalogRow(kind: CatalogKind, body: Record<string, unknown>) {
  return (await api.post(`/v2/catalog/${kind}`, body)).data;
}
export async function patchCatalogRow(kind: CatalogKind, id: string, patch: Record<string, unknown>) {
  return (await api.patch(`/v2/catalog/${kind}/${id}`, patch)).data;
}
export async function deleteCatalogRow(kind: CatalogKind, id: string): Promise<void> {
  await api.delete(`/v2/catalog/${kind}/${id}`);
}
export async function fetchNodeEquipment(nodeId: string): Promise<NodeEquipmentRow[]> {
  return (await api.get(`/v2/nodes/${nodeId}/equipment`)).data;
}
export type OrderKind = 'headquarters' | 'branches' | 'substations' | CatalogKind;
export async function putOrder(kind: OrderKind, ids: string[]): Promise<void> {
  await api.patch('/v2/order', { kind, ids });
}
