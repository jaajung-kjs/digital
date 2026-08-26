import { isAxiosError } from 'axios';
import { httpClient as api } from './httpClient';
import type { BackgroundDrawing } from '@twin/core';
import type { AssemblyUpsertBody, TypeUpsertBody, V2CableGroup, V2Catalog, V2OverheadStandard, V2Standard, V2CommitPayload, V2NodeAssetRow, V2OrgTree, V2Port, V2Workingcopy } from './types';

/**
 * 검색으로 찾은 자산 — **이 도면 밖의 끝점**을 고를 때 쓴다.
 *
 * 어디 있는 것인지(`substationName · floorName`)가 함께 와야 한다: 이름이 같은 1층 슬롯과
 * 2층 슬롯을 이름만으로는 가릴 수 없다. 도면에 놓인 조상이 없으면 층은 `null` 이다.
 */
export interface AssetSearchResult { id: string; name: string; substationId: string; substationName: string; floorName: string | null; typeName: string }

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
/**
 * 저장 — 워킹 카피를 통째로 보낸다. **사진 파일도 이 요청에 실린다.**
 *
 * 사진을 따로 올리는 길은 없앴다: 고르는 즉시 올리면 저장하지 않고 떠난 사람의 파일이
 * 서버에 남는다. 파일이 있으면 multipart 로 보내는데, 저장 내용은 `payload` 칸에 넣고
 * 사진은 **제 id 를 칸 이름으로** 붙인다 — 서버가 그 id 의 줄에 경로를 지어 준다.
 */
export async function putCommit(
  substationId: string,
  payload: V2CommitPayload,
  photoFiles: ReadonlyMap<string, File> = new Map(),
): Promise<{ committedAt: string }> {
  const url = `/v2/substations/${substationId}/commit`;
  if (photoFiles.size === 0) return (await api.put(url, payload)).data;

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const [photoId, file] of photoFiles) form.append(photoId, file);
  // Content-Type을 명시하지 않는다 — 브라우저가 multipart boundary를 채워야 하는데,
  // httpClient 인스턴스 기본 헤더가 application/json이라 여기서 undefined로 덮어써
  // axios가 FormData를 JSON으로 오인(stringify)하지 않도록 한다.
  return (await api.put(url, form, { headers: { 'Content-Type': undefined } })).data;
}

/** 층 배경 도면 임포트 — DWG/DXF 를 서버가 파싱해 층에 저장하고 갱신된 층을 돌려준다 */
/**
 * 도면 파일을 **읽기만** 한다 — 층에 붙이는 일은 화면이, 서버로 보내는 일은 저장이 한다.
 *
 * 사진과 같은 어법이다(파일과 레코드는 워킹카피가 들고 있다가 저장 때 함께 간다).
 */
export async function parseBackground(file: File): Promise<BackgroundDrawing> {
  const formData = new FormData();
  formData.append('file', file);
  // Content-Type을 명시하지 않는다 — 브라우저가 multipart boundary를 채워야 하는데,
  // httpClient 인스턴스 기본 헤더가 application/json이라 여기서 undefined로 덮어써
  // axios가 FormData를 JSON으로 오인(stringify)하지 않도록 한다.
  return (await api.post('/v2/background/parse', formData, {
    headers: { 'Content-Type': undefined },
  })).data;
}

export function photoUrl(filePath: string): string {
  const name = filePath.split('/').pop();
  return `/api/v2/photos/${name}`;
}

/* 층은 여기 없다 — **워킹카피의 것**이라 저장할 때 커밋으로 간다(`stageFloorCreate` 등). */
export type OrgKind = 'headquarters' | 'branches' | 'substations';
export async function createOrgNode(kind: OrgKind, body: Record<string, string>) {
  return (await api.post(`/v2/org/${kind}`, body)).data;
}
export async function patchOrgNode(kind: OrgKind, id: string, body: { name?: string; sortOrder?: number }) {
  return (await api.patch(`/v2/org/${kind}/${id}`, body)).data;
}
export async function deleteOrgNode(kind: OrgKind, id: string): Promise<void> {
  try {
    await api.delete(`/v2/org/${kind}/${id}`);
  } catch (err) {
    /* 지우려는 것이 **이미 없으면 지워진 것이다**(DELETE 는 멱등하다 — RFC 9110). 화면이 낡았을
       뿐인데 「해당 조직을 찾을 수 없습니다」라고 하면, 정작 그 낡은 줄은 화면에 그대로 남고
       사람은 같은 것을 또 누른다. 여럿이 함께 쓰는 서버에서는 옆자리가 먼저 지웠을 뿐이다. */
    if (!isAxiosError(err) || err.response?.status !== 404) throw err;
  }
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
 * 케이블 그룹 — **통째로** 보낸다(장비 품목이 포트를 함께 보내는 것과 같다): 제 이름·색과
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

// ── 설비 품목 ────────────────────────────────────────────────────────────────

export async function createAssembly(body: AssemblyUpsertBody): Promise<{ id: string }> {
  return (await api.post('/v2/catalog/assemblies', body)).data;
}
export async function updateAssembly(id: string, body: AssemblyUpsertBody): Promise<void> {
  await api.put(`/v2/catalog/assemblies/${id}`, body);
}
export async function deleteAssembly(id: string): Promise<void> {
  await api.delete(`/v2/catalog/assemblies/${id}`);
}

// ── 기준정보(노임단가·제비율) ────────────────────────────────────────────────

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
  /** 새 표에 없는 값 — 그대로 두면 산출 내역에서 「단가 없음」이 된다. */
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

/** 임포트된 직종 노임 — 회차별로 펼친 표(기준정보 탭 전용). */
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
