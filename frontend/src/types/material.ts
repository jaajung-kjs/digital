import type { EquipmentCategory, CableType } from './enums';

// ── API 응답 타입 ──

export interface SpecParam {
  key: string;
  label: string;
  inputType: 'select' | 'number' | 'text';
  options?: (string | number)[];
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

export interface SpecTemplate {
  params: SpecParam[];
  format: string;
}

export type MaterialCategoryType = 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';

export interface MaterialCategory {
  id: string;
  code: string;
  name: string;
  categoryType: MaterialCategoryType;
  parentId: string | null;
  displayColor: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
  children?: MaterialCategory[];
}

export interface Material {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  specification: string;
  unit: string;
  properties: Record<string, unknown> | null;
  isActive: boolean;
  created?: boolean; // resolve 응답에서만
}

// ── enum 매핑 ──

export const MATERIAL_TO_EQUIPMENT_CATEGORY: Record<string, EquipmentCategory> = {
  'EQP-RTU': 'SERVER',
  'EQP-RACK': 'OTHER',
  'EQP-OFD': 'OFD',
  'EQP-UPS': 'UPS',
  'EQP-NET': 'NETWORK',
  'EQP-SEC': 'SECURITY',
  'EQP-PITR': 'SERVER',
  'EQP-SEIS': 'OTHER',
  'EQP-SURGE': 'OTHER',
  'EQP-BRK': 'DISTRIBUTION_BOARD',
  'EQP-SYNC': 'SERVER',
  'EQP-COOL': 'OTHER',
  'EQP-PDAS': 'OTHER',
};

export const MATERIAL_TO_CABLE_TYPE: Record<string, CableType> = {
  'CBL-FCV': 'AC', 'CBL-FR': 'AC', 'CBL-VCT': 'AC', 'CBL-HIV': 'AC',
  'CBL-UTP': 'LAN',
  'CBL-OPT': 'FIBER', 'CBL-OPJ': 'FIBER', 'CBL-OPT-B': 'FIBER',
  'CBL-IV': 'GROUND', 'CBL-BARE': 'GROUND',
  'CBL-CVV': 'DC', 'CBL-CPEV': 'LAN', 'CBL-PCM': 'LAN',
  'CBL-COAX': 'LAN', 'CBL-CHAMP': 'LAN', 'CBL-SIG': 'DC',
};

export function getEquipmentCategoryFromMaterial(code: string): EquipmentCategory {
  return MATERIAL_TO_EQUIPMENT_CATEGORY[code] || 'OTHER';
}

export function getCableTypeFromMaterial(code: string): CableType {
  return MATERIAL_TO_CABLE_TYPE[code] || 'LAN';
}

/**
 * Build specification string from specTemplate format and params.
 * e.g. format="{shield} CAT.{cat} {pairs}P", params={shield:"UTP",cat:"6",pairs:4}
 * → "UTP CAT.6 4P"
 */
export function buildSpecificationString(
  format: string,
  params: Record<string, unknown>,
): string {
  return format.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val != null ? String(val) : '';
  }).trim();
}
