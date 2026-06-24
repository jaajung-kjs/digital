
/**
 * 레거시 보라색 폴백 — 제어(control) 케이블이 DB 에 `displayColor='#a855f7'`(보라)로
 * 시드돼 있던 데이터가 재시드 전까지 남아 있다. 디자인 시스템에서 제어 케이블은
 * 슬레이트(#64748b)로 통일됐으므로, 저장된 보라 계열 값을 슬레이트로 매핑한다.
 * (재시드 없이 OLD 데이터가 슬레이트로 렌더되도록 하는 가드.)
 */
const LEGACY_PURPLE = new Set(['#a855f7', '#8b5cf6', '#7c3aed']);
const SLATE = '#64748b';

/** 저장된 케이블 색을 정규화: 레거시 보라 → 슬레이트. null/undefined 는 그대로. */
export function normalizeCableColor<T extends string | null | undefined>(color: T): T {
  if (typeof color === 'string' && LEGACY_PURPLE.has(color.toLowerCase())) {
    return SLATE as T;
  }
  return color;
}

export interface EndpointInfo {
  id: string;
  name: string;
  floorId: string | null;
}

/**
 * API 응답 구조 (flat) — legacy room/connection 응답.
 */
export interface RoomConnection {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  length?: number;
  pathPoints?: [number, number][];
  description?: string;
  /** @deprecated P8 — use `categoryId`. */
  materialCategoryId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  groupColor?: string | null;
  specParams?: Record<string, unknown> | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  pathLength?: number | null;
  totalLength?: number | null;
  sourceEndpoint: EndpointInfo;
  targetEndpoint: EndpointInfo;
}
