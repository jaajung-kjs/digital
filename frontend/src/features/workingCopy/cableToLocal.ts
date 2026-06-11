import { type LocalCable } from '../editor/stores/editorStore';

/**
 * 통합 워킹카피의 effective Cable row(backend CableDetail — nested source/target)를
 * 도면/다이어그램 렌더러가 먹는 flat LocalCable 로 변환.
 *
 * effective 케이블은 `{ source: { equipmentId, moduleId, circuitId }, target: {...} }`
 * 형태이고, 캔버스 렌더러(ConnectionOverlay/ConnectionDiagram)·드래그 동기화(cableSync)·
 * cableTracer 는 flat `sourceEquipmentId`/`sourceModuleId`/… 을 읽는다. 이 매퍼 없이
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
  source: { assetId: string | null; name?: string; kind?: string | null; floorId?: string | null };
  target: { assetId: string | null; name?: string; kind?: string | null; floorId?: string | null };
  cableType: string;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  fiberPathDescription?: string | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  label?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
}

/** effective Cable row → 렌더러/트레이서가 먹는 LocalCable. */
export function cableDtoToLocal(c: CableDetailDTO): LocalCable {
  // 단계4b — endpoint = 단일 assetId. flat precise id 자리(sourceEquipmentId)는 assetId
  //   그대로. 렌더(ConnectionOverlay)·트레이서(cableTracer)·ConnectionDiagram 은 이 flat
  //   id 를 floorAnchor / effective assets 로 해소한다(nested module/circuit id 제거).
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
    cableType: c.cableType,
    categoryId: c.categoryId ?? null,
    categoryCode: c.categoryCode ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    label: c.label ?? null,
    pathPoints: c.pathPoints ?? null,
    pathLength: c.pathLength ?? null,
    bufferLength: c.bufferLength,
    totalLength: c.totalLength ?? null,
    fiberPathId: c.fiberPathId ?? null,
    fiberPortNumber: c.fiberPortNumber ?? null,
    fiberPathLabel: c.fiberPathDescription ?? null,
  };
}
