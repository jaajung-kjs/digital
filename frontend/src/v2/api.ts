import { isAxiosError } from 'axios';
import { httpClient as api } from './httpClient';
import type { BackgroundDrawing } from '@twin/core';
import type { OrgTree, OverheadStandard, Standard } from './model/types';

export async function fetchOrgTree(): Promise<OrgTree> {
  return (await api.get('/v2/org-tree')).data;
}
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

/* 층은 여기 없다 — **워킹카피의 것**이라 저장할 때 커밋으로 간다(`model/store/workingCopy.ts`). */
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
export async function fetchStandards(): Promise<Standard[]> {
  return (await api.get('/v2/standards')).data;
}
export async function activateStandard(id: string): Promise<void> {
  await api.post(`/v2/standards/${id}/activate`);
}

/** 제비율 미리보기 — 등록 전에 적용시기와 펼쳐진 표를 보여 준다. */
export type OverheadPreview = Omit<OverheadStandard, 'id'> & { sourceName: string };

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
