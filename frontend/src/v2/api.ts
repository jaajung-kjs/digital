import { api } from '../utils/api';
import type { V2Catalog, V2CommitPayload, V2NodeAssetRow, V2OrgTree, V2Port, V2Workingcopy } from './types';

export interface AssetSearchResult { id: string; name: string; substationId: string; substationName: string; typeName: string }

export async function searchAssets(q: string): Promise<AssetSearchResult[]> {
  return (await api.get('/v2/search/assets', { params: { q } })).data;
}
export async function fetchAssetPorts(assetId: string): Promise<V2Port[]> {
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

export type OrgKind = 'headquarters' | 'branches' | 'substations' | 'floors';
export async function createOrgNode(kind: OrgKind, body: Record<string, string>) {
  return (await api.post(`/v2/org/${kind}`, body)).data;
}
export async function patchOrgNode(kind: OrgKind, id: string, body: { name?: string; sortOrder?: number }) {
  return (await api.patch(`/v2/org/${kind}/${id}`, body)).data;
}
export async function deleteOrgNode(kind: OrgKind, id: string) {
  return (await api.delete(`/v2/org/${kind}/${id}`)).data;
}
