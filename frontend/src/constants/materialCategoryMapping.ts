import type { CableType } from '../types/enums';
import type { EquipmentCategory } from '../types/enums';

/**
 * Maps MaterialCategory.code -> old CableType enum.
 * Used during transition: new categories resolve to old enum for DB writes.
 */
export const MATERIAL_TO_CABLE_TYPE: Record<string, CableType> = {
  'CBL-CV': 'AC', 'CBL-HIV': 'AC', 'CBL-VCT': 'AC', 'CBL-FR-CVV': 'AC',
  'CBL-TFR-CV': 'AC', 'CBL-EV': 'DC',
  'CBL-UTP': 'LAN', 'CBL-STP': 'LAN',
  'CBL-FIBER-SM': 'FIBER', 'CBL-FIBER-MM': 'FIBER', 'CBL-FIBER-DROP': 'FIBER',
  'CBL-FIBER-JUMPER': 'FIBER', 'CBL-FIBER-RIBBON': 'FIBER',
  'CBL-GND-IV': 'GROUND', 'CBL-GND-BARE': 'GROUND', 'CBL-GND-WIRE': 'GROUND',
};

/** Reverse: old CableType -> MaterialCategory codes (for initial selection) */
export const CABLE_TYPE_TO_MATERIALS: Record<CableType, string[]> = {
  AC: ['CBL-CV', 'CBL-HIV', 'CBL-VCT', 'CBL-FR-CVV', 'CBL-TFR-CV'],
  DC: ['CBL-EV'],
  LAN: ['CBL-UTP', 'CBL-STP'],
  FIBER: ['CBL-FIBER-SM', 'CBL-FIBER-MM', 'CBL-FIBER-DROP', 'CBL-FIBER-JUMPER', 'CBL-FIBER-RIBBON'],
  GROUND: ['CBL-GND-IV', 'CBL-GND-BARE', 'CBL-GND-WIRE'],
};

export const MATERIAL_TO_EQUIPMENT_CATEGORY: Record<string, EquipmentCategory> = {
  'EQP-RTU': 'SERVER', 'EQP-RACK': 'STORAGE', 'EQP-OFD': 'OFD',
  'EQP-UPS': 'UPS', 'EQP-NET': 'NETWORK', 'EQP-SEC': 'SECURITY',
  'EQP-PITR': 'SERVER', 'EQP-SEIS': 'OTHER', 'EQP-SURGE': 'OTHER',
  'EQP-BRK': 'DISTRIBUTION_BOARD', 'EQP-SYNC': 'NETWORK',
  'EQP-COOL': 'OTHER', 'EQP-PDAS': 'OTHER',
};

export const EQUIPMENT_CATEGORY_TO_MATERIALS: Record<EquipmentCategory, string[]> = {
  SERVER: ['EQP-RTU', 'EQP-PITR'],
  NETWORK: ['EQP-NET', 'EQP-SYNC'],
  STORAGE: ['EQP-RACK'],
  CHARGER: [],
  UPS: ['EQP-UPS'],
  SECURITY: ['EQP-SEC'],
  OTHER: ['EQP-SEIS', 'EQP-SURGE', 'EQP-COOL', 'EQP-PDAS'],
  DISTRIBUTION_BOARD: ['EQP-BRK'],
  OFD: ['EQP-OFD'],
};
