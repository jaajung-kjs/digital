/**
 * EquipmentKind — Prisma enum mirror.
 *
 * Replaces the pre-P6 `MaterialCategory.code` based grouping (e.g. 'EQP-RACK',
 * 'EQP-OFD'). Equipment is now structurally typed via `kind` on the row itself.
 *
 * IMPORTANT: keep in sync with backend/prisma/schema.prisma `enum EquipmentKind`.
 */

export type EquipmentKind = 'RACK' | 'OFD' | 'DISTRIBUTION' | 'GROUNDING' | 'HVAC';

export type EquipmentDetailPanelKind =
  | 'rack'
  | 'ofd'
  | 'distribution'
  | 'grounding'
  | 'hvac';

export type DetailPanelKind = EquipmentDetailPanelKind;

export interface EquipmentKindMeta {
  label: string;
  detailPanelKind: EquipmentDetailPanelKind;
  /** Default canvas footprint in plan-px. P9 may tune these per project. */
  defaultWidth: number;
  defaultHeight: number;
}

export const EQUIPMENT_KIND_INFO: Record<EquipmentKind, EquipmentKindMeta> = {
  RACK:         { label: '랙',       detailPanelKind: 'rack',         defaultWidth:  80, defaultHeight: 200 },
  OFD:          { label: 'OFD',      detailPanelKind: 'ofd',          defaultWidth: 100, defaultHeight:  60 },
  DISTRIBUTION: { label: '분전반',   detailPanelKind: 'distribution', defaultWidth:  80, defaultHeight: 120 },
  GROUNDING:    { label: '접지함체', detailPanelKind: 'grounding',    defaultWidth:  70, defaultHeight:  80 },
  HVAC:         { label: '공조설비', detailPanelKind: 'hvac',         defaultWidth: 100, defaultHeight: 100 },
};

/** Ordered list — useful for sidebar/legend rendering. */
export const EQUIPMENT_KINDS: EquipmentKind[] = [
  'RACK',
  'OFD',
  'DISTRIBUTION',
  'GROUNDING',
  'HVAC',
];

/**
 * 케이블 그리기에서 설비 직결이 아닌 하위 endpoint 선택(picker)을 거쳐야 하는
 * kind. RACK→모듈, OFD→포트, DISTRIBUTION→회로. 새 kind 추가 시 여기 한 줄.
 */
const PICKER_REQUIRED_KINDS = new Set<EquipmentKind>(['RACK', 'OFD', 'DISTRIBUTION']);

export function needsEndpointPicker(kind: EquipmentKind): boolean {
  return PICKER_REQUIRED_KINDS.has(kind);
}
