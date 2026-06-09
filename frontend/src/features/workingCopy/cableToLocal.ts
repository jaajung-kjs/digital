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
  source: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null; name?: string; floorId?: string | null };
  target: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null; name?: string; floorId?: string | null };
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
  // sourceEquipmentId 자리는 polymorphic fallback (planCablesToLocalCables 와 동일):
  //   equipment id 우선, 없으면 module id, 없으면 circuit id, 없으면 빈 문자열.
  return {
    id: c.id,
    sourceEquipmentId: c.source.equipmentId ?? c.source.moduleId ?? c.source.circuitId ?? '',
    targetEquipmentId: c.target.equipmentId ?? c.target.moduleId ?? c.target.circuitId ?? '',
    sourceModuleId: c.source.moduleId ?? null,
    targetModuleId: c.target.moduleId ?? null,
    sourceCircuitId: c.source.circuitId ?? null,
    targetCircuitId: c.target.circuitId ?? null,
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
