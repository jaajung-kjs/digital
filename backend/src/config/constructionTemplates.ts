/**
 * Construction report templates - static config mapping materialCategoryCode to work effort.
 * Reference: docs/케이블_DB.md, docs/설비_DB.md, docs/부속자재_DB.md
 */

export interface LaborRule {
  workName: string;
  laborType: string;
  hoursPerUnit?: number;
  hoursPerMeter?: number;
}

export interface AccessoryRule {
  materialCode: string;
  name: string;
  quantityPerUnit?: number;
  quantityPerMeter?: number;
}

export interface ConstructionTemplate {
  install: LaborRule;
  remove: LaborRule;
  relocate?: LaborRule;
  accessories?: AccessoryRule[];
}

// ============================================================
// Equipment templates (13 types from docs/설비_DB.md)
// ============================================================

const EQUIPMENT_TEMPLATES: Record<string, ConstructionTemplate> = {
  'EQP-RTU': {
    install: { workName: 'SCADA/RTU 설치', laborType: '통신내선공', hoursPerUnit: 4.0 },
    remove: { workName: 'SCADA/RTU 철거', laborType: '통신내선공', hoursPerUnit: 2.0 },
    relocate: { workName: 'SCADA/RTU 이설', laborType: '통신내선공', hoursPerUnit: 5.0 },
  },
  'EQP-RACK': {
    install: { workName: '랙 설치', laborType: '통신내선공', hoursPerUnit: 2.0 },
    remove: { workName: '랙 철거', laborType: '통신내선공', hoursPerUnit: 1.0 },
    relocate: { workName: '랙 이설', laborType: '통신내선공', hoursPerUnit: 3.0 },
    accessories: [
      { materialCode: 'ACC-MISC-LABEL', name: '랙 명판', quantityPerUnit: 1 },
    ],
  },
  'EQP-OFD': {
    install: { workName: 'OFD/IDF/MDF 설치', laborType: '통신내선공', hoursPerUnit: 1.5 },
    remove: { workName: 'OFD/IDF/MDF 철거', laborType: '통신내선공', hoursPerUnit: 0.8 },
    accessories: [
      { materialCode: 'ACC-MISC-LABEL', name: '명판', quantityPerUnit: 1 },
    ],
  },
  'EQP-UPS': {
    install: { workName: 'UPS 설치', laborType: '통신내선공', hoursPerUnit: 1.0 },
    remove: { workName: 'UPS 철거', laborType: '통신내선공', hoursPerUnit: 0.5 },
    relocate: { workName: 'UPS 이설', laborType: '통신내선공', hoursPerUnit: 1.5 },
  },
  'EQP-NET': {
    install: { workName: '네트워크장비 설치', laborType: '통신내선공', hoursPerUnit: 0.5 },
    remove: { workName: '네트워크장비 철거', laborType: '통신내선공', hoursPerUnit: 0.3 },
  },
  'EQP-SEC': {
    install: { workName: '보안장비 설치', laborType: '통신내선공', hoursPerUnit: 1.0 },
    remove: { workName: '보안장비 철거', laborType: '통신내선공', hoursPerUnit: 0.5 },
  },
  'EQP-PITR': {
    install: { workName: 'PITR/PIU 설치', laborType: '통신내선공', hoursPerUnit: 3.0 },
    remove: { workName: 'PITR/PIU 철거', laborType: '통신내선공', hoursPerUnit: 1.5 },
  },
  'EQP-SEIS': {
    install: { workName: '내진가대 설치', laborType: '통신외선공', hoursPerUnit: 2.0 },
    remove: { workName: '내진가대 철거', laborType: '통신외선공', hoursPerUnit: 1.0 },
    accessories: [
      { materialCode: 'ACC-FIT-ANCHOR', name: '앙카볼트', quantityPerUnit: 4 },
    ],
  },
  'EQP-SURGE': {
    install: { workName: '서지보호장치 설치', laborType: '통신내선공', hoursPerUnit: 0.3 },
    remove: { workName: '서지보호장치 철거', laborType: '통신내선공', hoursPerUnit: 0.15 },
  },
  'EQP-BRK': {
    install: { workName: '차단기 설치', laborType: '통신내선공', hoursPerUnit: 0.3 },
    remove: { workName: '차단기 철거', laborType: '통신내선공', hoursPerUnit: 0.15 },
  },
  'EQP-SYNC': {
    install: { workName: '시각동기장치 설치', laborType: '통신내선공', hoursPerUnit: 1.0 },
    remove: { workName: '시각동기장치 철거', laborType: '통신내선공', hoursPerUnit: 0.5 },
  },
  'EQP-COOL': {
    install: { workName: '냉각설비 설치', laborType: '통신내선공', hoursPerUnit: 2.0 },
    remove: { workName: '냉각설비 철거', laborType: '통신내선공', hoursPerUnit: 1.0 },
  },
  'EQP-PDAS': {
    install: { workName: 'PDAS장비 설치', laborType: '통신내선공', hoursPerUnit: 1.5 },
    remove: { workName: 'PDAS장비 철거', laborType: '통신내선공', hoursPerUnit: 0.8 },
  },
};

// ============================================================
// Cable templates (16 types from docs/케이블_DB.md)
// ============================================================

const CABLE_TEMPLATES: Record<string, ConstructionTemplate> = {
  'CBL-FCV': {
    install: { workName: '전력케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.03 },
    remove: { workName: '전력케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.015 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-TIE', name: '케이블타이', quantityPerMeter: 0.5 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-FR': {
    install: { workName: '난연케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.03 },
    remove: { workName: '난연케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.015 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-TIE', name: '케이블타이', quantityPerMeter: 0.5 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-VCT': {
    install: { workName: '캡타이어 포설', laborType: '통신내선공', hoursPerMeter: 0.025 },
    remove: { workName: '캡타이어 철거', laborType: '통신내선공', hoursPerMeter: 0.012 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-TIE', name: '케이블타이', quantityPerMeter: 0.5 },
    ],
  },
  'CBL-HIV': {
    install: { workName: '비닐절연전선 포설', laborType: '통신내선공', hoursPerMeter: 0.02 },
    remove: { workName: '비닐절연전선 철거', laborType: '통신내선공', hoursPerMeter: 0.01 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
    ],
  },
  'CBL-UTP': {
    install: { workName: 'UTP 포설', laborType: '통신내선공', hoursPerMeter: 0.02 },
    remove: { workName: 'UTP 철거', laborType: '통신내선공', hoursPerMeter: 0.01 },
    accessories: [
      { materialCode: 'ACC-CONN-RJ45', name: 'RJ-45 커넥터', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-TIE', name: '케이블타이', quantityPerMeter: 0.5 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-OPT': {
    install: { workName: '광케이블 포설', laborType: '통신외선공', hoursPerMeter: 0.04 },
    remove: { workName: '광케이블 철거', laborType: '통신외선공', hoursPerMeter: 0.02 },
    accessories: [
      { materialCode: 'ACC-CONN-OPT', name: '광어댑터', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-OPJ': {
    install: { workName: '광점퍼코드 포설', laborType: '통신내선공', hoursPerUnit: 0.1 },
    remove: { workName: '광점퍼코드 철거', laborType: '통신내선공', hoursPerUnit: 0.05 },
  },
  'CBL-OPT-B': {
    install: { workName: '브레이크아웃케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.04 },
    remove: { workName: '브레이크아웃케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.02 },
    accessories: [
      { materialCode: 'ACC-CONN-OPT', name: '광어댑터', quantityPerUnit: 2 },
    ],
  },
  'CBL-IV': {
    install: { workName: '접지전선 포설', laborType: '통신내선공', hoursPerMeter: 0.02 },
    remove: { workName: '접지전선 철거', laborType: '통신내선공', hoursPerMeter: 0.01 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-BARE': {
    install: { workName: '나동연선 포설', laborType: '통신외선공', hoursPerMeter: 0.025 },
    remove: { workName: '나동연선 철거', laborType: '통신외선공', hoursPerMeter: 0.012 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
    ],
  },
  'CBL-CVV': {
    install: { workName: '제어케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.025 },
    remove: { workName: '제어케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.012 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: '압착단자', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-TIE', name: '케이블타이', quantityPerMeter: 0.5 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-CPEV': {
    install: { workName: '통신케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.025 },
    remove: { workName: '통신케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.012 },
    accessories: [
      { materialCode: 'ACC-CONN-TERM', name: '단자대', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-PCM': {
    install: { workName: 'PCM케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.03 },
    remove: { workName: 'PCM케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.015 },
    accessories: [
      { materialCode: 'ACC-CONN-TERM', name: '단자대', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-COAX': {
    install: { workName: '동축케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.025 },
    remove: { workName: '동축케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.012 },
    accessories: [
      { materialCode: 'ACC-CONN-CRIMP', name: 'BNC 커넥터', quantityPerUnit: 2 },
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-CHAMP': {
    install: { workName: '챔프케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.03 },
    remove: { workName: '챔프케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.015 },
    accessories: [
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
  'CBL-SIG': {
    install: { workName: '신호케이블 포설', laborType: '통신내선공', hoursPerMeter: 0.02 },
    remove: { workName: '신호케이블 철거', laborType: '통신내선공', hoursPerMeter: 0.01 },
    accessories: [
      { materialCode: 'ACC-MISC-LABEL', name: '케이블 라벨', quantityPerUnit: 2 },
    ],
  },
};

// ============================================================
// Merged templates
// ============================================================

export const CONSTRUCTION_TEMPLATES: Record<string, ConstructionTemplate> = {
  ...EQUIPMENT_TEMPLATES,
  ...CABLE_TEMPLATES,
};

/**
 * 설비 자재코드를 시공 템플릿 키로 해소한다.
 *
 * 프론트(overlayToChanges)는 설비 자재코드로 `assetType.code` 를 보내는데,
 * 이는 종종 접두사가 없다(예: 'RACK', 'OFD', 'RTU'). 템플릿 키는 'EQP-' 접두사
 * (예: 'EQP-RACK'). 따라서 엔진의 정확 매치가 빗나가 BOM/노무가 비어 버린다.
 *
 * 맹목적 접두사 부착이 아니라 **템플릿 존재 검사**로 결정한다:
 *   1) code 가 이미 템플릿 키 → 그대로 (예: 'EQP-RTU')
 *   2) 'EQP-'+code 가 템플릿 키 → 'EQP-'+code (예: 'RACK' → 'EQP-RACK')
 *   3) 둘 다 아니면 → 그대로(해소 불가; 매핑 없는 타입은 diff-only 유지, 예: 'DIST')
 */
export function resolveEquipmentConstructionCode(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  if (code in CONSTRUCTION_TEMPLATES) return code;
  const prefixed = `EQP-${code}`;
  if (prefixed in CONSTRUCTION_TEMPLATES) return prefixed;
  return code;
}

// ============================================================
// Surcharge rules
// ============================================================

export interface SurchargeRule {
  code: string;
  name: string;
  multiplier: number;
}

export const SURCHARGE_RULES: SurchargeRule[] = [
  { code: 'NIGHT', name: '야간작업', multiplier: 1.5 },
  { code: 'HIGH_ALTITUDE', name: '고소작업', multiplier: 1.3 },
  { code: 'NARROW_SPACE', name: '협소공간', multiplier: 1.2 },
  { code: 'HAZARDOUS', name: '위험지역', multiplier: 1.5 },
];
