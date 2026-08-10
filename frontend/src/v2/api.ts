import { httpClient as api } from './httpClient';
import type { AssemblyUpsertBody, TypeUpsertBody, V2Catalog, V2CommitPayload, V2Floor, V2NodeAssetRow, V2OrgTree, V2Port, V2Workingcopy } from './types';

export interface AssetSearchResult { id: string; name: string; substationId: string; substationName: string; typeName: string }

export async function searchAssets(q: string): Promise<AssetSearchResult[]> {
  return (await api.get('/v2/search/assets', { params: { q } })).data;
}
export async function fetchAssetPorts(assetId: string): Promise<(V2Port & { occupied: boolean })[]> {
  return (await api.get(`/v2/assets/${assetId}/ports`)).data;
}

export async function fetchCatalog(): Promise<V2Catalog> {
  return (await api.get('/v2/catalog')).data;
}
export async function fetchOrgTree(): Promise<V2OrgTree> {
  return (await api.get('/v2/org-tree')).data;
}
export async function fetchWorkingcopy(substationId: string): Promise<V2Workingcopy> {
  return (await api.get(`/v2/substations/${substationId}/workingcopy`)).data;
}
export async function fetchNodeAssets(nodeId: string): Promise<V2NodeAssetRow[]> {
  return (await api.get(`/v2/nodes/${nodeId}/assets`)).data;
}
export async function putCommit(substationId: string, payload: V2CommitPayload): Promise<{ committedAt: string }> {
  return (await api.put(`/v2/substations/${substationId}/commit`, payload)).data;
}

export async function uploadPhoto(file: File): Promise<{ filePath: string }> {
  const formData = new FormData();
  formData.append('file', file);
  // Content-Type을 명시하지 않는다 — 브라우저가 multipart boundary를 채워야 하는데,
  // httpClient 인스턴스 기본 헤더가 application/json이라 여기서 undefined로 덮어써
  // axios가 FormData를 JSON으로 오인(stringify)하지 않도록 한다.
  return (await api.post('/v2/photos', formData, { headers: { 'Content-Type': undefined } })).data;
}

/** 층 배경 도면 임포트 — DWG/DXF 를 서버가 파싱해 층에 저장하고 갱신된 층을 돌려준다 */
export async function uploadBackground(floorId: string, file: File): Promise<V2Floor> {
  const formData = new FormData();
  formData.append('file', file);
  // Content-Type을 명시하지 않는다 — 브라우저가 multipart boundary를 채워야 하는데,
  // httpClient 인스턴스 기본 헤더가 application/json이라 여기서 undefined로 덮어써
  // axios가 FormData를 JSON으로 오인(stringify)하지 않도록 한다.
  return (await api.post(`/v2/floors/${floorId}/background`, formData, {
    headers: { 'Content-Type': undefined },
  })).data;
}

/** 층 배경 도면 제거 — backgroundDrawing 이 null 인 갱신된 층을 돌려준다 */
export async function deleteBackground(floorId: string): Promise<V2Floor> {
  return (await api.delete(`/v2/floors/${floorId}/background`)).data;
}

export function photoUrl(filePath: string): string {
  const name = filePath.split('/').pop();
  return `/api/v2/photos/${name}`;
}

export type OrgKind = 'headquarters' | 'branches' | 'substations' | 'floors';
export async function createOrgNode(kind: OrgKind, body: Record<string, string>) {
  return (await api.post(`/v2/org/${kind}`, body)).data;
}
export async function patchOrgNode(kind: OrgKind, id: string, body: { name?: string; sortOrder?: number }) {
  return (await api.patch(`/v2/org/${kind}/${id}`, body)).data;
}
export async function deleteOrgNode(kind: OrgKind, id: string): Promise<void> {
  await api.delete(`/v2/org/${kind}/${id}`);
}

// ── 카탈로그 어드민 API ────────────────────────────────────────────────────────

// 타입
export async function createType(body: TypeUpsertBody): Promise<{ id: string }> {
  return (await api.post('/v2/catalog/types', body)).data;
}
export async function updateType(id: string, body: TypeUpsertBody): Promise<void> {
  await api.put(`/v2/catalog/types/${id}`, body);
}
export async function deleteType(id: string): Promise<void> {
  await api.delete(`/v2/catalog/types/${id}`);
}

// 분류(category)
export async function createCategory(body: { key: string; name: string; sortOrder: number }): Promise<{ id: string }> {
  return (await api.post('/v2/catalog/categories', body)).data;
}
export async function patchCategory(id: string, body: { name?: string; sortOrder?: number }): Promise<void> {
  await api.patch(`/v2/catalog/categories/${id}`, body);
}
export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/v2/catalog/categories/${id}`);
}

// 케이블 그룹
export async function patchCableGroup(
  id: string,
  body: { name?: string; color?: string; laborType?: string | null; installHoursPerM?: number; removeHoursPerM?: number },
): Promise<void> {
  await api.patch(`/v2/catalog/cable-groups/${id}`, body);
}

// 케이블 분류(cable-category)
export async function createCableCategory(body: { groupId: string; name: string; sortOrder: number }): Promise<{ id: string }> {
  return (await api.post('/v2/catalog/cable-categories', body)).data;
}
export async function patchCableCategory(id: string, body: { name?: string; sortOrder?: number }): Promise<void> {
  await api.patch(`/v2/catalog/cable-categories/${id}`, body);
}
export async function deleteCableCategory(id: string): Promise<void> {
  await api.delete(`/v2/catalog/cable-categories/${id}`);
}

// ── 설비 종류 ────────────────────────────────────────────────────────────────

export async function createAssembly(body: AssemblyUpsertBody): Promise<{ id: string }> {
  return (await api.post('/v2/catalog/assemblies', body)).data;
}
export async function updateAssembly(id: string, body: AssemblyUpsertBody): Promise<void> {
  await api.put(`/v2/catalog/assemblies/${id}`, body);
}
export async function deleteAssembly(id: string): Promise<void> {
  await api.delete(`/v2/catalog/assemblies/${id}`);
}
