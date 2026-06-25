import { type LocalCable } from '../editor/stores/editorStore';

/**
 * 통합 워킹카피의 effective Cable row(backend CableDetail — nested source/target)를
 * 도면/다이어그램 렌더러가 먹는 flat LocalCable 로 변환.
 *
 * DTO 케이블은 `{ source: { assetId }, target: { assetId }, sourceAssetId, targetAssetId }`
 * 형태이고, 캔버스 렌더러(ConnectionOverlay/ConnectionDiagram)·드래그 동기화(cableSync)·
 * cableTracer 는 flat `sourceAssetId`/`targetAssetId` 를 읽는다. 이 매퍼 없이
 * `as LocalCable` 로만 캐스팅하면 flat 필드가 전부 undefined 가 되어 케이블이
 * 도면에 안 보인다(끝점 lookup 실패).
 */
export interface CableDetailDTO {
  id: string;
  /**
   * 단계4b — endpoint 는 단일 Asset(설비/랙모듈/분전 분기). 백엔드가 정밀 endpoint
   * asset id 를 직접 내려준다. 정밀 endpoint id 의 유일한 source of truth.
   * source/target 은 그 endpoint asset 의 표시 정보(이름/kind/anchor floor) — 더 이상
   * equipmentId/moduleId/circuitId nested id 를 들지 않는다.
   */
  sourceAssetId: string;
  targetAssetId: string;
  source: { assetId: string | null; name?: string; role?: string | null; floorId?: string | null };
  target: { assetId: string | null; name?: string; role?: string | null; floorId?: string | null };
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  number?: number | null;
  categoryId?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  groupColor?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
}

/** effective Cable row → 렌더러/트레이서가 먹는 LocalCable. */
export function cableDtoToLocal(c: CableDetailDTO): LocalCable {
  // endpoint = 단일 assetId. flat 자리(sourceAssetId/targetAssetId)에 그대로 옮기고,
  //   렌더(ConnectionOverlay)·트레이서(cableTracer)·ConnectionDiagram 은 이 flat id 를
  //   floorAnchor / effective assets 로 해소한다.
  const sourceId = c.sourceAssetId;
  const targetId = c.targetAssetId;
  return {
    id: c.id,
    sourceAssetId: sourceId,
    targetAssetId: targetId,
    sourceModuleId: null,
    targetModuleId: null,
    sourceCircuitId: null,
    targetCircuitId: null,
    sourceRole: c.sourceRole ?? null,
    targetRole: c.targetRole ?? null,
    number: c.number ?? null,
    categoryId: c.categoryId ?? null,
    categoryName: c.categoryName ?? null,
    groupId: c.groupId ?? null,
    groupColor: c.groupColor ?? null,
    pathPoints: c.pathPoints ?? null,
    pathLength: c.pathLength ?? null,
    bufferLength: c.bufferLength,
    totalLength: c.totalLength ?? null,
  };
}
