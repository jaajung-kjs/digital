import { httpClient as api } from './httpClient';
import type { AssemblyUpsertBody, TypeUpsertBody, V2CableGroup, V2Catalog, V2OverheadStandard, V2Standard, V2CommitPayload, V2Floor, V2NodeAssetRow, V2OrgTree, V2Port, V2Workingcopy } from './types';

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

/**
 * 케이블 그룹 — **통째로** 보낸다(자산 종류가 포트를 함께 보내는 것과 같다): 제 이름·색과
 * 종류 목록 전체. 보내지 않은 종류는 지워지고, `id` 없는 줄은 새로 생긴다. 순서는 배열 순서다.
 *
 * 그룹을 새로 만들거나 지우는 길은 없다 — `key` 가 포트 종류의 어휘다.
 */
export async function putCableGroup(
  id: string,
  body: {
    name: string;
    color: string;
    /** 공량·단가는 자산·설비와 같은 다섯 칸이다(`LaborSpec`). */
    categories: {
      id?: string;
      name: string;
      laborCode: string | null;
      unitPrice: number | null;
      installManDays: number | null;
      removeManDays: number | null;
      relocateManDays: number | null;
    }[];
  },
): Promise<V2CableGroup> {
  return (await api.put(`/v2/catalog/cable-groups/${id}`, body)).data;
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

// ── 기준자료(노임단가·제비율) ────────────────────────────────────────────────

/** 미리보기 — 올리기 전에 무엇이 들어오고 지금 대장에 무엇이 걸리는지 보여 준다. */
export interface WagePreview {
  effective: string;
  sourceName: string;
  /** 이 파일이 담고 있는 회차들 — 최신 우선. */
  dates: string[];
  /** 값이 있는 칸 수(회차 × 직종). */
  cellCount: number;
  rows: { code: string; name: string; sector: string; marker: string; values: { date: string; wage: number }[] }[];
  /** 이름으로 들어 있던 값 중 코드로 올릴 수 있는 것 — 등록하면 함께 바뀐다. */
  promote: { from: string; toCode: string; toName: string; count: number }[];
  /** 새 표에 없는 값 — 그대로 두면 설계서에서 「단가 없음」이 된다. */
  orphans: { value: string; count: number }[];
}

const filePart = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
};
// Content-Type 을 비운다 — 브라우저가 multipart boundary 를 채워야 한다(사진·배경과 같은 이유).
const MULTIPART = { headers: { 'Content-Type': undefined } } as const;

export async function previewWageStandard(file: File): Promise<WagePreview> {
  return (await api.post('/v2/standards/wage/preview', filePart(file), MULTIPART)).data;
}
export async function uploadWageStandard(file: File): Promise<{ id: string; effective: string; promoted: number }> {
  return (await api.post('/v2/standards/wage', filePart(file), MULTIPART)).data;
}
export async function fetchStandards(): Promise<V2Standard[]> {
  return (await api.get('/v2/standards')).data;
}
export async function activateStandard(id: string): Promise<void> {
  await api.post(`/v2/standards/${id}/activate`);
}

/** 제비율 미리보기 — 등록 전에 적용시기와 펼쳐진 표를 보여 준다. */
export type OverheadPreview = Omit<V2OverheadStandard, 'id'> & { sourceName: string };

export async function previewOverheadStandard(file: File): Promise<OverheadPreview> {
  return (await api.post('/v2/standards/overhead/preview', filePart(file), MULTIPART)).data;
}
export async function uploadOverheadStandard(file: File): Promise<{ id: string; effective: string }> {
  return (await api.post('/v2/standards/overhead', filePart(file), MULTIPART)).data;
}

/** 임포트된 직종 노임 — 회차별로 펼친 표(기준자료 탭 전용). */
export interface WageRates {
  /** 실제로 들어온 회차들, 최신 우선. */
  dates: string[];
  rows: {
    code: string;
    name: string;
    sector: string;
    marker: string;
    markerNote: string | null;
    /** 기준일 → 원/일. 그 회차에 조사되지 않았으면 키가 없다. */
    wages: Record<string, number>;
  }[];
}

export async function fetchWageRates(): Promise<WageRates> {
  return (await api.get('/v2/standards/wages')).data;
}
