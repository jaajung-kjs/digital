import { emptyOverlay, type Overlay } from '../../store/overlay';
import type {
  Circuit, Core, CoreMeasurement, EquipmentPhoto, Equipment, FiberLine, Floor, InspectionLog, Link,
  MaintenanceLog, Rack, RefEquipment, RefLine,
} from '../types';

/* 워킹카피의 꼴 — 저장본(`Saved`)과 오버레이(`Overlays`). 스토어(`workingCopy`)와 충돌 뒤 걷기(`rebaseDrop`)가 함께 쓴다. */

export interface RowOf {
  floors: Floor; racks: Rack; equipment: Equipment; fiberLines: FiberLine; coreMeasurements: CoreMeasurement;
  links: Link; maintenance: MaintenanceLog; inspections: InspectionLog; photos: EquipmentPhoto;
}
export type RowKind = keyof RowOf;
export const ROW_KINDS: readonly RowKind[] = ['floors', 'racks', 'equipment', 'fiberLines', 'coreMeasurements', 'links', 'maintenance', 'inspections', 'photos'];

export interface Saved {
  substations: Record<string, { id: string; name: string }>;
  floors: Floor[]; racks: Rack[]; equipment: Equipment[]; circuits: Circuit[];
  fiberLines: FiberLine[]; cores: Core[]; coreMeasurements: CoreMeasurement[];
  links: Link[]; farLinks: Link[]; refEquipment: RefEquipment[]; refLines: RefLine[];
  maintenance: MaintenanceLog[]; inspections: InspectionLog[]; photos: EquipmentPhoto[];
}
export type Overlays = { [K in RowKind]: Overlay<RowOf[K]> } & {
  /** 회로 값 고치기 — 키는 `circuitKey`. 회로 행은 회로 수로만 생기므로 만들기·지우기가 없다. */
  circuits: Record<string, Partial<Circuit>>;
  /** 코어 값 고치기 — 키는 `coreKey`. */
  cores: Record<string, Partial<Core>>;
  /**
   * 「차단기 추가」가 **저장된 옛 번호를 빈 값으로 덮은** 차단기 키(`addCircuit`). 이 키의 고치기는 저장값으로 접지 않는다 —
   * 접으면 덮어 둔 빈 값이 벗겨져 옛 값이 되살아난다. 그 밖의 키는 저장값으로 돌아오면 걷힌다.
   * 오버레이 안에 있어 되돌리기가 함께 물린다.
   */
  blankCircuits: Record<string, true>;
};

export function emptyOverlays(): Overlays {
  return {
    floors: emptyOverlay(), racks: emptyOverlay(), equipment: emptyOverlay(), fiberLines: emptyOverlay(),
    coreMeasurements: emptyOverlay(), links: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(),
    photos: emptyOverlay(), circuits: {}, cores: {}, blankCircuits: {},
  };
}
