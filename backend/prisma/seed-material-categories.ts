import { PrismaClient, MaterialCategoryType } from '@prisma/client';

const prisma = new PrismaClient();

interface CategorySeed {
  code: string;
  name: string;
  categoryType: MaterialCategoryType;
  parentCode?: string;
  displayColor?: string;
  iconName?: string;
  unit?: string;
  specTemplate?: object;
  sortOrder: number;
  description?: string;
}

// ═══════════════════════════════════════════════════
// 케이블 16종
// ═══════════════════════════════════════════════════

const cableCategories: CategorySeed[] = [
  {
    code: 'CBL-FCV',
    name: 'F-CV 전력케이블',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    unit: 'm',
    sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['F-CV', 'F-CVV'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [2.5, 4, 6, 10, 16, 25, 35, 50, 60, 70, 95, 100, 120, 150, 185, 200, 240, 300, 325, 400] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4, 5, 7, 10, 12, 15, 19] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-FR',
    name: '난연/내화케이블',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    unit: 'm',
    sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['FR-CVVS', 'FFR-8', 'FR-CNCO-W'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 10, 16, 25] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-VCT',
    name: '캡타이어 VCT',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    unit: 'm',
    sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [0.75, 1.25, 2, 2.5, 4, 6, 10, 16, 25, 35, 50] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4, 5, 7] },
      ],
      format: 'VCT {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-HIV',
    name: '비닐절연전선 HIV',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    unit: 'm',
    sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 60, 70, 95, 100, 120, 150, 185, 200, 240, 300, 325, 400] },
      ],
      format: 'HIV {sq}SQ',
    },
  },
  {
    code: 'CBL-UTP',
    name: 'UTP/S-FTP케이블',
    categoryType: 'CABLE',
    displayColor: '#3b82f6',
    unit: 'm',
    sortOrder: 5,
    specTemplate: {
      params: [
        { key: 'shield', label: '차폐', inputType: 'select', options: ['UTP', 'S-FTP'] },
        { key: 'cat', label: '카테고리', inputType: 'select', options: ['5E', '6', '6A'] },
        { key: 'pairs', label: '페어수(P)', inputType: 'select', options: [4, 25] },
      ],
      format: '{shield} CAT.{cat} {pairs}P',
    },
  },
  {
    code: 'CBL-OPT',
    name: '광케이블',
    categoryType: 'CABLE',
    displayColor: '#22c55e',
    unit: 'm',
    sortOrder: 6,
    specTemplate: {
      params: [
        { key: 'mode', label: '모드', inputType: 'select', options: ['SM', 'MM'] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [4, 6, 8, 12, 24, 48, 96] },
      ],
      format: '{mode} {cores}C',
    },
  },
  {
    code: 'CBL-OPJ',
    name: '광점퍼코드',
    categoryType: 'CABLE',
    displayColor: '#22c55e',
    unit: 'm',
    sortOrder: 7,
    specTemplate: {
      params: [
        { key: 'connA', label: '커넥터A', inputType: 'select', options: ['SC', 'LC', 'ST', 'FC', 'MU', 'MPO'] },
        { key: 'connB', label: '커넥터B', inputType: 'select', options: ['SC', 'LC', 'ST', 'FC', 'MU', 'MPO'] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [1, 2, 4, 8, 12] },
      ],
      format: '{connA}-{connB} {cores}C',
    },
  },
  {
    code: 'CBL-OPT-B',
    name: '브레이크아웃케이블',
    categoryType: 'CABLE',
    displayColor: '#22c55e',
    unit: 'm',
    sortOrder: 8,
    specTemplate: {
      params: [
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [4, 6, 8, 12, 24] },
      ],
      format: '브레이크아웃 {cores}C',
    },
  },
  {
    code: 'CBL-IV',
    name: '접지전선 IV/F-GV',
    categoryType: 'CABLE',
    displayColor: '#eab308',
    unit: 'm',
    sortOrder: 9,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['IV', 'F-GV'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [2.5, 4, 6, 10, 16, 25, 35, 50, 60, 70, 95, 100] },
      ],
      format: '{type} {sq}SQ',
    },
  },
  {
    code: 'CBL-BARE',
    name: '나동연선',
    categoryType: 'CABLE',
    displayColor: '#eab308',
    unit: 'm',
    sortOrder: 10,
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [4, 6, 10, 16, 25, 38, 50, 60, 70, 95, 100, 120, 150] },
      ],
      format: '나동연선 {sq}SQ',
    },
  },
  {
    code: 'CBL-CVV',
    name: '제어케이블 CVV-S',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    unit: 'm',
    sortOrder: 11,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['CVV-S', 'CVV-SB', 'CVVS'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [0.75, 1.25, 1.5, 2.5, 4, 6] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4, 5, 7, 10, 12, 15, 19, 20, 25, 30] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-CPEV',
    name: '통신케이블 CPEV-S',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    unit: 'm',
    sortOrder: 12,
    specTemplate: {
      params: [
        { key: 'pairs', label: '대수(P)', inputType: 'select', options: [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 50, 100, 200, 300] },
      ],
      format: 'CPEV-S {pairs}P',
    },
  },
  {
    code: 'CBL-PCM',
    name: 'PCM케이블',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    unit: 'm',
    sortOrder: 13,
    specTemplate: {
      params: [
        { key: 'pairs', label: '대수(P)', inputType: 'select', options: [1, 2, 5, 10, 25, 50, 100, 200, 300] },
        { key: 'dia', label: '선경(mm)', inputType: 'select', options: [0.4, 0.5, 0.65, 0.9] },
      ],
      format: 'PCM {pairs}P {dia}mm',
    },
  },
  {
    code: 'CBL-COAX',
    name: '동축케이블',
    categoryType: 'CABLE',
    displayColor: '#6b7280',
    unit: 'm',
    sortOrder: 14,
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['3C-2V', '5C-2V', '7C-2V', '10C-2V'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'CBL-CHAMP',
    name: '챔프케이블',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    unit: 'm',
    sortOrder: 15,
    specTemplate: {
      params: [
        { key: 'pairs', label: '대수(P)', inputType: 'select', options: [25, 50] },
      ],
      format: '챔프 {pairs}P',
    },
  },
  {
    code: 'CBL-SIG',
    name: '데이터/신호케이블',
    categoryType: 'CABLE',
    displayColor: '#6b7280',
    unit: 'm',
    sortOrder: 16,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'text' },
      ],
      format: '{type}',
    },
  },
];

// ═══════════════════════════════════════════════════
// 설비 13종
// ═══════════════════════════════════════════════════

const equipmentCategories: CategorySeed[] = [
  {
    code: 'EQP-RTU',
    name: 'SCADA/RTU 모듈',
    categoryType: 'EQUIPMENT',
    displayColor: '#0ea5e9',
    unit: '대',
    sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'model', label: '모듈', inputType: 'select', options: ['PTPU(주제어)', 'MCU(제어)', 'ECU(집선)', '광전송유니트', '회선유니트(FXO)', '회선유니트(FXS)', '회선유니트(4W E&M)', '다기능 RTU', 'M-RTU'] },
      ],
      format: '{model}',
    },
  },
  {
    code: 'EQP-RACK',
    name: '랙/함체',
    categoryType: 'EQUIPMENT',
    displayColor: '#64748b',
    unit: '대',
    sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['19" 표준랙', '19" 내진랙', '전용랙(PITR/RTU)', '서브랙(Box형 6U)'] },
        { key: 'u', label: '높이(U)', inputType: 'select', options: [4, 6, 9, 12, 15, 18, 22, 24, 27, 32, 37, 42, 45, 47, 48] },
        { key: 'depth', label: '깊이(mm)', inputType: 'select', options: [600, 800, 900, 1000, 1070] },
      ],
      format: '{type} {u}U D{depth}',
    },
  },
  {
    code: 'EQP-OFD',
    name: 'OFD/IDF/MDF',
    categoryType: 'EQUIPMENT',
    displayColor: '#8b5cf6',
    unit: '대',
    sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['OFD(광분배함)', 'FDF(광분배반)', 'MDF(주배선반)', 'IDF(중간배선반)', 'QDF(집중배선반)', 'VDF(영상배선반)', '단자함'] },
        { key: 'conn', label: '커넥터', inputType: 'select', options: ['SC', 'LC', 'ST'] },
        { key: 'cores', label: '코어/포트수', inputType: 'select', options: [4, 6, 8, 12, 24, 25, 48, 72, 96, 144, 288] },
      ],
      format: '{type} {conn} {cores}C',
    },
  },
  {
    code: 'EQP-UPS',
    name: 'UPS/전원설비',
    categoryType: 'EQUIPMENT',
    displayColor: '#f59e0b',
    unit: '대',
    sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['UPS', '축전지(VRLA)', '축전지(LiFePO4)', '정류기', 'SMPS'] },
        { key: 'capacity', label: '용량', inputType: 'number', min: 0.1 },
        { key: 'capacityUnit', label: '단위', inputType: 'select', options: ['kVA', 'Ah', 'A', 'W'] },
      ],
      format: '{type} {capacity}{capacityUnit}',
    },
  },
  {
    code: 'EQP-NET',
    name: '네트워크장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#06b6d4',
    unit: '대',
    sortOrder: 5,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['L2 스위치', 'L3 스위치', 'POE 허브', '광컨버터', 'KVM 스위치', '멀티탭'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'EQP-SEC',
    name: '보안장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#dc2626',
    unit: '대',
    sortOrder: 6,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['IP카메라(옥내)', 'IP카메라 PTZ(옥외)', '열선감지기', '셔터감지기', '카메라함체(STS)', '카메라브라켓', 'NVR'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-PITR',
    name: 'PITR/PIU',
    categoryType: 'EQUIPMENT',
    displayColor: '#0ea5e9',
    unit: '대',
    sortOrder: 7,
    specTemplate: {
      params: [
        { key: 'model', label: '모델', inputType: 'select', options: ['PITR-2000(SP2)', 'PITR-5000', 'PIU(광단말)', 'SPS PITR'] },
      ],
      format: '{model}',
    },
  },
  {
    code: 'EQP-SEIS',
    name: '내진가대',
    categoryType: 'EQUIPMENT',
    displayColor: '#78716c',
    unit: '식',
    sortOrder: 8,
    specTemplate: {
      params: [
        { key: 'w', label: '가로(mm)', inputType: 'number', min: 100, max: 2000 },
        { key: 'd', label: '세로(mm)', inputType: 'number', min: 100, max: 2000 },
        { key: 'h', label: '높이(mm)', inputType: 'number', min: 100, max: 1000 },
      ],
      format: '{w}×{d}×{h}mm',
    },
  },
  {
    code: 'EQP-SURGE',
    name: '서지보호장치',
    categoryType: 'EQUIPMENT',
    displayColor: '#eab308',
    unit: '개',
    sortOrder: 9,
    specTemplate: {
      params: [
        { key: 'type', label: 'Type', inputType: 'select', options: ['Type1', 'Type2', 'Type3'] },
        { key: 'voltage', label: '적용전압', inputType: 'select', options: ['AC 220V', 'AC 380V', 'DC 48V', 'DC 125V', '데이터(RJ45)', '동축'] },
      ],
      format: 'SPD {type} {voltage}',
    },
  },
  {
    code: 'EQP-BRK',
    name: '차단기/개폐기',
    categoryType: 'EQUIPMENT',
    displayColor: '#f97316',
    unit: '개',
    sortOrder: 10,
    specTemplate: {
      params: [
        { key: 'af', label: '프레임(AF)', inputType: 'select', options: [30, 50, 60, 100, 125, 160, 225, 400, 600, 800, 1000, 1600] },
        { key: 'at', label: '트립(AT)', inputType: 'number', min: 1 },
        { key: 'poles', label: '극수(P)', inputType: 'select', options: [2, 3, 4] },
      ],
      format: 'MCCB {af}AF/{at}AT {poles}P',
    },
  },
  {
    code: 'EQP-SYNC',
    name: '시각동기장치',
    categoryType: 'EQUIPMENT',
    displayColor: '#14b8a6',
    unit: '대',
    sortOrder: 11,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['GPS 시각동기 모듈', 'GPS 안테나'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-COOL',
    name: '냉각/환경설비',
    categoryType: 'EQUIPMENT',
    displayColor: '#2563eb',
    unit: '대',
    sortOrder: 12,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['에어컨(공냉식)', '항온항습기', '환기팬'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-PDAS',
    name: 'PDAS장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#6366f1',
    unit: '대',
    sortOrder: 13,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PDAS 본체'] },
      ],
      format: '{type}',
    },
  },
];

// ═══════════════════════════════════════════════════
// 부속자재 — 9 parent + 25 leaf = 34종
// ═══════════════════════════════════════════════════

const accessoryCategories: CategorySeed[] = [
  // ── 전선관 (parent + 5 children) ──
  { code: 'ACC-PIPE', name: '전선관', categoryType: 'ACCESSORY', sortOrder: 1, description: '전선관류 상위 카테고리' },
  {
    code: 'ACC-PIPE-PVC', name: 'PVC전선관', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE',
    unit: 'm', sortOrder: 1,
    specTemplate: {
      params: [{ key: 'size', label: '호칭경(mm)', inputType: 'select', options: [16, 22, 28, 36, 42, 54, 70, 82, 104] }],
      format: 'PVC {size}mm',
    },
  },
  {
    code: 'ACC-PIPE-FLEX', name: '가요전선관(PF)', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE',
    unit: 'm', sortOrder: 2,
    specTemplate: {
      params: [{ key: 'size', label: '호칭경(mm)', inputType: 'select', options: [16, 22, 28, 36] }],
      format: 'PF {size}mm',
    },
  },
  {
    code: 'ACC-PIPE-CD', name: 'CD관', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE',
    unit: 'm', sortOrder: 3,
    specTemplate: {
      params: [{ key: 'size', label: '호칭경(mm)', inputType: 'select', options: [16, 22, 28, 36] }],
      format: 'CD {size}mm',
    },
  },
  {
    code: 'ACC-PIPE-METAL', name: '금속전선관', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE',
    unit: 'm', sortOrder: 4,
    specTemplate: {
      params: [{ key: 'size', label: '호칭경', inputType: 'select', options: ['C19', 'C25', 'C31', 'C39', 'C51', 'C63', 'C75'] }],
      format: '금속전선관 {size}',
    },
  },
  {
    code: 'ACC-PIPE-PE', name: 'PE전선관', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE',
    unit: 'm', sortOrder: 5,
    specTemplate: {
      params: [{ key: 'size', label: '호칭경(mm)', inputType: 'select', options: [22, 28, 36, 54, 70] }],
      format: 'PE {size}mm',
    },
  },

  // ── 커넥터/단자 (parent + 4 children) ──
  { code: 'ACC-CONN', name: '커넥터/단자', categoryType: 'ACCESSORY', sortOrder: 2, description: '커넥터/단자류 상위 카테고리' },
  {
    code: 'ACC-CONN-RJ45', name: 'RJ-45 커넥터', categoryType: 'ACCESSORY', parentCode: 'ACC-CONN',
    unit: '개', sortOrder: 1,
    specTemplate: {
      params: [{ key: 'cat', label: '카테고리', inputType: 'select', options: ['5E', '6', '6A'] }],
      format: 'RJ-45 CAT.{cat}',
    },
  },
  {
    code: 'ACC-CONN-CRIMP', name: '압착단자', categoryType: 'ACCESSORY', parentCode: 'ACC-CONN',
    unit: '개', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['R형', 'Y형', '핀', '동관단자'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'number' },
        { key: 'bolt', label: '볼트경(mm)', inputType: 'number' },
      ],
      format: '{type} {sq}SQ M{bolt}',
    },
  },
  {
    code: 'ACC-CONN-OPT', name: '광어댑터', categoryType: 'ACCESSORY', parentCode: 'ACC-CONN',
    unit: '개', sortOrder: 3,
    specTemplate: {
      params: [{ key: 'type', label: '종류', inputType: 'select', options: ['SC/APC', 'SC/UPC', 'LC/UPC', 'LC/APC', 'ST/UPC', 'SC-LC'] }],
      format: '광어댑터 {type}',
    },
  },
  {
    code: 'ACC-CONN-TERM', name: '단자대/블록', categoryType: 'ACCESSORY', parentCode: 'ACC-CONN',
    unit: '개', sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['110블록', 'Krone', '터미널'] },
        { key: 'pairs', label: '페어수', inputType: 'number' },
      ],
      format: '{type} {pairs}P',
    },
  },

  // ── 케이블트레이 (parent + 4 children) ──
  { code: 'ACC-TRAY', name: '케이블트레이', categoryType: 'ACCESSORY', sortOrder: 3, description: '케이블트레이류 상위 카테고리' },
  {
    code: 'ACC-TRAY-LADDER', name: '사다리형', categoryType: 'ACCESSORY', parentCode: 'ACC-TRAY',
    unit: 'm', sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [60, 80, 100, 150] },
      ],
      format: '사다리형 {w}×{h}mm',
    },
  },
  {
    code: 'ACC-TRAY-SOLID', name: '밀폐형', categoryType: 'ACCESSORY', parentCode: 'ACC-TRAY',
    unit: 'm', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [60, 80, 100, 150] },
      ],
      format: '밀폐형 {w}×{h}mm',
    },
  },
  {
    code: 'ACC-TRAY-MESH', name: '메쉬형', categoryType: 'ACCESSORY', parentCode: 'ACC-TRAY',
    unit: 'm', sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [100, 200, 300, 400, 500] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 100] },
      ],
      format: '메쉬형 {w}×{h}mm',
    },
  },
  {
    code: 'ACC-TRAY-DUCT', name: '알루미늄덕트', categoryType: 'ACCESSORY', parentCode: 'ACC-TRAY',
    unit: 'm', sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'number', min: 50, max: 1000 },
        { key: 'h', label: '높이(mm)', inputType: 'number', min: 30, max: 300 },
      ],
      format: '알루미늄덕트 {w}×{h}mm',
    },
  },

  // ── 풀박스 (leaf — 하위 없음) ──
  {
    code: 'ACC-BOX', name: '풀박스', categoryType: 'ACCESSORY',
    unit: '개', sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'material', label: '재질', inputType: 'select', options: ['스틸', 'SUS', '하이박스'] },
        { key: 'w', label: '가로(mm)', inputType: 'number', min: 50, max: 2000 },
        { key: 'h', label: '세로(mm)', inputType: 'number', min: 50, max: 2000 },
        { key: 'd', label: '깊이(mm)', inputType: 'number', min: 50, max: 1000 },
      ],
      format: '{material} {w}×{h}×{d}mm',
    },
  },

  // ── 배관부속 (parent + 3 children) ──
  { code: 'ACC-PIPE-FIT', name: '배관부속', categoryType: 'ACCESSORY', sortOrder: 5, description: '배관부속류 상위 카테고리' },
  {
    code: 'ACC-FIT-SADDLE', name: '새들/반새들', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE-FIT',
    unit: '개', sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'size', label: '호칭경(mm)', inputType: 'select', options: [16, 22, 28, 36, 54, 70] },
        { key: 'material', label: '재질', inputType: 'select', options: ['스틸', 'SUS'] },
      ],
      format: '새들 {size}mm {material}',
    },
  },
  {
    code: 'ACC-FIT-ANCHOR', name: '앵커볼트/셋트앙카', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE-FIT',
    unit: '개', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['M10', 'M12', 'M16', 'Φ3/8', 'Φ1/2'] },
        { key: 'length', label: '길이(mm)', inputType: 'number' },
      ],
      format: '앵커 {type}×{length}mm',
    },
  },
  {
    code: 'ACC-FIT-PARTS', name: '전선관부속', categoryType: 'ACCESSORY', parentCode: 'ACC-PIPE-FIT',
    unit: '개', sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['커플링', '노멀벤드', '엘보', '부싱', '로크너트', '인서트캡', '클램프'] },
        { key: 'size', label: '호칭경(mm)', inputType: 'select', options: [16, 22, 28, 36] },
      ],
      format: '{type} {size}mm',
    },
  },

  // ── 접속자재 (parent + 2 children) ──
  { code: 'ACC-SPLICE', name: '접속자재', categoryType: 'ACCESSORY', sortOrder: 6, description: '접속자재류 상위 카테고리' },
  {
    code: 'ACC-SPLICE-OPT', name: '광접속자재', categoryType: 'ACCESSORY', parentCode: 'ACC-SPLICE',
    unit: '개', sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['광접속함', '열수축슬리브', '보호슬리브'] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [12, 24, 48, 96, 144] },
      ],
      format: '{type} {cores}C',
    },
  },
  {
    code: 'ACC-SPLICE-CU', name: '구리접속자재', categoryType: 'ACCESSORY', parentCode: 'ACC-SPLICE',
    unit: '개', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['직선슬리브', 'C형슬리브', '열수축튜브', '스파이럴슬리브'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'number' },
      ],
      format: '{type} {sq}SQ',
    },
  },

  // ── 건축자재 (leaf — 하위 없음) ──
  {
    code: 'ACC-BUILD', name: '건축자재', categoryType: 'ACCESSORY',
    unit: '개', sortOrder: 7,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['액세스플로어(우드)', '액세스플로어(금속)'] },
        { key: 'size', label: '규격', inputType: 'text' },
      ],
      format: '{type} {size}',
    },
  },

  // ── 잡자재 (parent + 4 children) ──
  { code: 'ACC-MISC', name: '잡자재', categoryType: 'ACCESSORY', sortOrder: 8, description: '잡자재류 상위 카테고리' },
  {
    code: 'ACC-MISC-TIE', name: '케이블타이', categoryType: 'ACCESSORY', parentCode: 'ACC-MISC',
    unit: '개', sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [100, 150, 200, 300, 370, 450] },
        { key: 'width', label: '폭(mm)', inputType: 'select', options: [2.5, 3.6, 4.8, 7.6] },
      ],
      format: '케이블타이 {length}×{width}mm',
    },
  },
  {
    code: 'ACC-MISC-LABEL', name: '라벨/명판', categoryType: 'ACCESSORY', parentCode: 'ACC-MISC',
    unit: '개', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC라벨', '케이블태그', '명판(포맥스)', '열전사', '랙명판'] },
        { key: 'size', label: '규격', inputType: 'text' },
      ],
      format: '{type} {size}',
    },
  },
  {
    code: 'ACC-MISC-TAPE', name: '절연테이프', categoryType: 'ACCESSORY', parentCode: 'ACC-MISC',
    unit: '개', sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC절연', '자기융착', '면절연'] },
      ],
      format: '절연테이프 {type}',
    },
  },
  {
    code: 'ACC-MISC-ETC', name: '기타잡자재', categoryType: 'ACCESSORY', parentCode: 'ACC-MISC',
    unit: '개', sortOrder: 4,
    specTemplate: {
      params: [
        { key: 'desc', label: '설명', inputType: 'text' },
      ],
      format: '{desc}',
    },
  },

  // ── 접지부속 (parent + 3 children) — v3 신규 ──
  { code: 'ACC-GND', name: '접지부속', categoryType: 'ACCESSORY', sortOrder: 9, description: '접지부속류 상위 카테고리 (v3 신규)' },
  {
    code: 'ACC-GND-ROD', name: '접지봉', categoryType: 'ACCESSORY', parentCode: 'ACC-GND',
    unit: '개', sortOrder: 1,
    specTemplate: {
      params: [
        { key: 'dia', label: '직경(mm)', inputType: 'select', options: [12, 14.2, 16, 17.8, 20, 25] },
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [500, 1000, 1500, 1800, 2400, 3000] },
      ],
      format: '접지봉 Φ{dia}×{length}mm',
    },
  },
  {
    code: 'ACC-GND-PLATE', name: '접지판', categoryType: 'ACCESSORY', parentCode: 'ACC-GND',
    unit: '개', sortOrder: 2,
    specTemplate: {
      params: [
        { key: 'size', label: '규격', inputType: 'select', options: ['900×900×1.5t', '900×900×3.2t'] },
      ],
      format: '접지판 {size}',
    },
  },
  {
    code: 'ACC-GND-BAR', name: '접지바/부속', categoryType: 'ACCESSORY', parentCode: 'ACC-GND',
    unit: '개', sortOrder: 3,
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['접지바', '접지클램프', '접지단자대', '접지테이프', 'CAD Weld'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
];

// ═══════════════════════════════════════════════════
// MaterialAlias 시드 데이터
// ═══════════════════════════════════════════════════

interface AliasSeed {
  categoryCode: string;
  aliases: { name: string; source: string }[];
}

const aliasSeeds: AliasSeed[] = [
  // 케이블 aliases (Excel 표기 → DB 코드)
  { categoryCode: 'CBL-FCV', aliases: [
    { name: 'F-CV', source: 'Excel' }, { name: 'F-CVV', source: 'Excel' }, { name: '전력케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-FR', aliases: [
    { name: 'FR-CVVS', source: 'Excel' }, { name: 'FFR-8', source: 'Excel' }, { name: 'FR-CNCO-W', source: 'Excel' },
    { name: '난연케이블', source: 'common' }, { name: '내화케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-VCT', aliases: [
    { name: 'VCT', source: 'Excel' }, { name: '캡타이어', source: 'common' }, { name: '캡타이어케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-HIV', aliases: [
    { name: 'HIV', source: 'Excel' }, { name: '비닐절연전선', source: 'common' },
  ]},
  { categoryCode: 'CBL-UTP', aliases: [
    { name: 'UTP', source: 'Excel' }, { name: 'STP', source: 'Excel' }, { name: 'S-FTP', source: 'Excel' },
    { name: 'LAN케이블', source: 'common' }, { name: '랜케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-OPT', aliases: [
    { name: '광케이블', source: 'common' }, { name: '광섬유케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-OPJ', aliases: [
    { name: '광점퍼코드', source: 'common' }, { name: '광패치코드', source: 'common' },
  ]},
  { categoryCode: 'CBL-OPT-B', aliases: [
    { name: '브레이크아웃', source: 'Excel' }, { name: 'breakout', source: 'common' },
  ]},
  { categoryCode: 'CBL-IV', aliases: [
    { name: 'IV', source: 'Excel' }, { name: 'F-GV', source: 'Excel' }, { name: '접지전선', source: 'common' },
  ]},
  { categoryCode: 'CBL-BARE', aliases: [
    { name: '나동연선', source: 'common' }, { name: '접지선', source: 'common' },
  ]},
  { categoryCode: 'CBL-CVV', aliases: [
    { name: 'CVV-S', source: 'Excel' }, { name: 'CVV-SB', source: 'Excel' }, { name: '제어케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-CPEV', aliases: [
    { name: 'CPEV-S', source: 'Excel' }, { name: '통신케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-PCM', aliases: [
    { name: 'PCM', source: 'Excel' }, { name: 'PCM케이블', source: 'common' },
  ]},
  { categoryCode: 'CBL-COAX', aliases: [
    { name: '동축케이블', source: 'common' }, { name: '동축', source: 'common' },
  ]},
  { categoryCode: 'CBL-CHAMP', aliases: [
    { name: '챔프케이블', source: 'common' }, { name: '챔프', source: 'common' },
  ]},
  { categoryCode: 'CBL-SIG', aliases: [
    { name: '신호케이블', source: 'common' }, { name: '데이터케이블', source: 'common' }, { name: 'IO케이블', source: 'Excel' },
  ]},
  // 설비 aliases
  { categoryCode: 'EQP-RTU', aliases: [
    { name: 'RTU', source: 'common' }, { name: 'SCADA', source: 'common' },
  ]},
  { categoryCode: 'EQP-RACK', aliases: [
    { name: '랙', source: 'common' }, { name: '함체', source: 'common' }, { name: '19인치랙', source: 'common' },
  ]},
  { categoryCode: 'EQP-OFD', aliases: [
    { name: 'OFD', source: 'common' }, { name: 'IDF', source: 'common' }, { name: 'MDF', source: 'common' },
    { name: '광분배함', source: 'common' }, { name: '배선반', source: 'common' },
  ]},
  { categoryCode: 'EQP-UPS', aliases: [
    { name: 'UPS', source: 'common' }, { name: '무정전전원', source: 'common' }, { name: '축전지', source: 'common' },
  ]},
  { categoryCode: 'EQP-NET', aliases: [
    { name: '스위칭허브', source: 'common' }, { name: '허브', source: 'common' }, { name: '광컨버터', source: 'common' },
  ]},
  { categoryCode: 'EQP-SEC', aliases: [
    { name: 'IP카메라', source: 'common' }, { name: 'CCTV', source: 'common' }, { name: '보안카메라', source: 'common' },
  ]},
  { categoryCode: 'EQP-PITR', aliases: [
    { name: 'PITR', source: 'common' }, { name: 'PIU', source: 'common' }, { name: '광단말장치', source: 'common' },
  ]},
  { categoryCode: 'EQP-SEIS', aliases: [
    { name: '내진가대', source: 'common' }, { name: '내진', source: 'common' },
  ]},
  { categoryCode: 'EQP-SURGE', aliases: [
    { name: 'SPD', source: 'common' }, { name: '서지보호', source: 'common' },
  ]},
  { categoryCode: 'EQP-BRK', aliases: [
    { name: 'MCCB', source: 'common' }, { name: '차단기', source: 'common' },
  ]},
  { categoryCode: 'EQP-SYNC', aliases: [
    { name: 'GPS시각동기', source: 'common' }, { name: 'PTP', source: 'common' },
  ]},
  { categoryCode: 'EQP-COOL', aliases: [
    { name: '에어컨', source: 'common' }, { name: '항온항습기', source: 'common' },
  ]},
  { categoryCode: 'EQP-PDAS', aliases: [
    { name: 'PDAS', source: 'common' }, { name: '부분방전', source: 'common' },
  ]},
];

// ═══════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════

export async function seedMaterialCategories() {
  console.log('🏗️  Seeding MaterialCategories (63)...');

  const allCategories = [...cableCategories, ...equipmentCategories, ...accessoryCategories];

  // 1단계: parentCode가 없는 것(parent + leaf) 먼저 upsert
  const noParent = allCategories.filter((c) => !c.parentCode);
  for (const cat of noParent) {
    await prisma.materialCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        displayColor: cat.displayColor ?? null,
        iconName: cat.iconName ?? null,
        unit: cat.unit ?? null,
        specTemplate: cat.specTemplate ?? undefined,
        sortOrder: cat.sortOrder,
        description: cat.description ?? null,
      },
      create: {
        code: cat.code,
        name: cat.name,
        categoryType: cat.categoryType,
        displayColor: cat.displayColor ?? null,
        iconName: cat.iconName ?? null,
        unit: cat.unit ?? null,
        specTemplate: cat.specTemplate ?? undefined,
        sortOrder: cat.sortOrder,
        description: cat.description ?? null,
      },
    });
  }

  // 2단계: parentCode가 있는 것(children) upsert
  const withParent = allCategories.filter((c) => c.parentCode);
  for (const cat of withParent) {
    const parent = await prisma.materialCategory.findUnique({ where: { code: cat.parentCode! } });
    if (!parent) throw new Error(`Parent not found: ${cat.parentCode}`);

    await prisma.materialCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        parentId: parent.id,
        displayColor: cat.displayColor ?? null,
        iconName: cat.iconName ?? null,
        unit: cat.unit ?? null,
        specTemplate: cat.specTemplate ?? undefined,
        sortOrder: cat.sortOrder,
        description: cat.description ?? null,
      },
      create: {
        code: cat.code,
        name: cat.name,
        categoryType: cat.categoryType,
        parentId: parent.id,
        displayColor: cat.displayColor ?? null,
        iconName: cat.iconName ?? null,
        unit: cat.unit ?? null,
        specTemplate: cat.specTemplate ?? undefined,
        sortOrder: cat.sortOrder,
        description: cat.description ?? null,
      },
    });
  }

  console.log(`  ✅ ${allCategories.length} categories upserted`);

  // 3단계: MaterialAlias upsert
  console.log('🏷️  Seeding MaterialAliases...');
  let aliasCount = 0;

  for (const seed of aliasSeeds) {
    const category = await prisma.materialCategory.findUnique({ where: { code: seed.categoryCode } });
    if (!category) {
      console.warn(`  ⚠️ Category not found for alias: ${seed.categoryCode}`);
      continue;
    }

    for (const alias of seed.aliases) {
      await prisma.materialAlias.upsert({
        where: { aliasName: alias.name },
        update: { categoryId: category.id, source: alias.source },
        create: { categoryId: category.id, aliasName: alias.name, source: alias.source },
      });
      aliasCount++;
    }
  }

  console.log(`  ✅ ${aliasCount} aliases upserted`);
}
