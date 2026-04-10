import { PrismaClient, MaterialCategoryType } from '@prisma/client';

interface SpecParam {
  key: string;
  label: string;
  inputType: 'select' | 'number' | 'text';
  options?: (string | number)[];
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

interface SpecTemplate {
  params: SpecParam[];
  format: string;
}

interface CategorySeedData {
  code: string;
  name: string;
  categoryType: MaterialCategoryType;
  parentCode?: string; // parent를 code로 참조 (후처리)
  description?: string;
  displayColor?: string;
  iconName?: string;
  unit?: string;
  specTemplate?: SpecTemplate;
  sortOrder: number;
}

// ==================== 케이블 16종 ====================

const cableCategories: CategorySeedData[] = [
  {
    code: 'CBL-FCV',
    name: 'F-CV 전력케이블',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    iconName: 'cable-power',
    unit: 'm',
    sortOrder: 1,
    description: '가교PE절연 비닐시스 전력케이블 (KS C IEC 60502-1)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['F-CV', 'F-CVV'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [2.5, 4, 6, 16, 25, 35] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [1, 2, 3, 4] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-FR',
    name: '난연/내화케이블',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    iconName: 'cable-fire',
    unit: 'm',
    sortOrder: 2,
    description: '난연 차폐 제어케이블 FR-CVVS, 내화케이블 FFR-8',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['FR-CVVS', 'FFR-8'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 16, 25, 35] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 6] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-VCT',
    name: '캡타이어 VCT',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    iconName: 'cable-vct',
    unit: 'm',
    sortOrder: 3,
    description: '비닐캡타이어 케이블 (이동용 전원)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4] },
      ],
      format: 'VCT {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-HIV',
    name: '비닐절연전선 HIV',
    categoryType: 'CABLE',
    displayColor: '#ef4444',
    iconName: 'cable-hiv',
    unit: 'm',
    sortOrder: 4,
    description: '비닐절연전선 HIV (단심)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 10, 16, 25, 35] },
      ],
      format: 'HIV {sq}SQ',
    },
  },
  {
    code: 'CBL-UTP',
    name: 'UTP/S-FTP케이블',
    categoryType: 'CABLE',
    displayColor: '#3b82f6',
    iconName: 'cable-utp',
    unit: 'm',
    sortOrder: 5,
    description: 'UTP/S-FTP 데이터케이블 (KS C 3342, TIA/EIA-568)',
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
    iconName: 'cable-fiber',
    unit: 'm',
    sortOrder: 6,
    description: '광케이블 SM/MM (KS C 6710, ITU-T G.652)',
    specTemplate: {
      params: [
        { key: 'mode', label: '모드', inputType: 'select', options: ['SM', 'MM'] },
        { key: 'cores', label: '코어수(C)', inputType: 'select', options: [4, 6, 8, 12, 24, 48] },
      ],
      format: '{mode} {cores}C',
    },
  },
  {
    code: 'CBL-OPJ',
    name: '광점퍼코드',
    categoryType: 'CABLE',
    displayColor: '#22c55e',
    iconName: 'cable-jumper',
    unit: '본',
    sortOrder: 7,
    description: '광점퍼코드 (ITU-T G.652, IEC 61754)',
    specTemplate: {
      params: [
        { key: 'connA', label: '커넥터A', inputType: 'select', options: ['SC', 'LC', 'ST', 'MU'] },
        { key: 'connB', label: '커넥터B', inputType: 'select', options: ['SC', 'LC', 'ST', 'MU'] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [1, 2, 6] },
      ],
      format: '{connA}-{connB} {cores}C',
    },
  },
  {
    code: 'CBL-OPT-B',
    name: '브레이크아웃케이블',
    categoryType: 'CABLE',
    displayColor: '#22c55e',
    iconName: 'cable-breakout',
    unit: 'm',
    sortOrder: 8,
    description: '브레이크아웃케이블 — 다심 광케이블 개별 커넥터 분기',
    specTemplate: {
      params: [
        { key: 'mode', label: '모드', inputType: 'select', options: ['SM', 'MM'] },
        { key: 'cores', label: '코어수(C)', inputType: 'select', options: [4, 6] },
        { key: 'connector', label: '커넥터', inputType: 'select', options: ['ST', 'SC', 'LC', 'SC-LC'] },
      ],
      format: '{mode} {cores}C {connector}',
    },
  },
  {
    code: 'CBL-IV',
    name: '접지전선 IV/F-GV',
    categoryType: 'CABLE',
    displayColor: '#eab308',
    iconName: 'cable-ground',
    unit: 'm',
    sortOrder: 9,
    description: '접지전선 IV/F-GV (KS C IEC 60502-1)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [4, 6, 10, 16, 25, 35] },
      ],
      format: 'F-GV {sq}SQ',
    },
  },
  {
    code: 'CBL-BARE',
    name: '나동연선',
    categoryType: 'CABLE',
    displayColor: '#eab308',
    iconName: 'cable-bare',
    unit: 'm',
    sortOrder: 10,
    description: '나동연선 — 매설용 접지선',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [16, 25, 35, 50, 70, 95] },
      ],
      format: '나동연선 {sq}SQ',
    },
  },
  {
    code: 'CBL-CVV',
    name: '제어케이블 CVV-S',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    iconName: 'cable-control',
    unit: 'm',
    sortOrder: 11,
    description: '제어케이블 CVV-S (KS C IEC 60502-1)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 6] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 4, 6, 8] },
      ],
      format: 'CVV-S {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-CPEV',
    name: '통신케이블 CPEV-S',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    iconName: 'cable-comm',
    unit: 'm',
    sortOrder: 12,
    description: '통신케이블 CPEV-S (KS C 3603)',
    specTemplate: {
      params: [
        { key: 'dia', label: '심선경(mm)', inputType: 'select', options: [0.65, 0.9] },
        { key: 'pairs', label: '쌍수(P)', inputType: 'select', options: [10, 20] },
      ],
      format: 'CPEV {dia}mm {pairs}P',
    },
  },
  {
    code: 'CBL-PCM',
    name: 'PCM케이블',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    iconName: 'cable-pcm',
    unit: 'm',
    sortOrder: 13,
    description: 'PCM케이블 — 전력통신 디지털 회선',
    specTemplate: {
      params: [
        { key: 'pairs', label: '쌍수(P)', inputType: 'select', options: [1, 2, 4] },
      ],
      format: 'PCM 0.65mm {pairs}P',
    },
  },
  {
    code: 'CBL-COAX',
    name: '동축케이블',
    categoryType: 'CABLE',
    displayColor: '#6b7280',
    iconName: 'cable-coax',
    unit: 'm',
    sortOrder: 14,
    description: '동축케이블 (KS C 3610, KS C 3617)',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['5C-2V', '7C-2V', '7C-HFBT'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'CBL-CHAMP',
    name: '챔프케이블',
    categoryType: 'CABLE',
    displayColor: '#a855f7',
    iconName: 'cable-champ',
    unit: 'm',
    sortOrder: 15,
    description: '챔프케이블 — MDF↔교환기 접속 (RJ21 Amphenol 50-pin)',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['CH-SM-15', 'CH-SM-20', '25P'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'CBL-SIG',
    name: '데이터/신호케이블',
    categoryType: 'CABLE',
    displayColor: '#6b7280',
    iconName: 'cable-signal',
    unit: 'm',
    sortOrder: 16,
    description: '데이터/신호케이블 — RS-232C/485, I/O접속',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['RS-232C', 'AWG20 4C 실드', 'AWG20 6C 실드', 'AWG24 4C 실드', 'AWG24 6C 실드', 'RS-Cable 25P'] },
      ],
      format: '{type}',
    },
  },
];

// ==================== 설비 13종 ====================

const equipmentCategories: CategorySeedData[] = [
  {
    code: 'EQP-RTU',
    name: 'SCADA/RTU',
    categoryType: 'EQUIPMENT',
    displayColor: '#ef4444',
    iconName: 'equip-rtu',
    unit: '대',
    sortOrder: 1,
    description: '변전소 원격감시제어 (SCADA/RTU 시스템)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PTPU', 'MCU', 'ECU', '광전송유니트', '회선유니트', '다기능 RTU', 'M-RTU'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-RACK',
    name: '랙/함체',
    categoryType: 'EQUIPMENT',
    displayColor: '#6b7280',
    iconName: 'equip-rack',
    unit: '대',
    sortOrder: 2,
    description: '19" 표준랙/함체 (EIA-310-D, IEC 60297)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['19" 표준랙', '19" 내진랙', '전용랙(PITR/RTU)', '서브랙(Box형 6U)'] },
        { key: 'height', label: '높이(U)', inputType: 'select', options: [4, 6, 9, 12, 15, 18, 22, 24, 27, 32, 37, 42, 45, 47, 48] },
        { key: 'depth', label: '깊이(mm)', inputType: 'select', options: [600, 800, 900, 1000, 1070] },
      ],
      format: '{type} {height}U D{depth}',
    },
  },
  {
    code: 'EQP-OFD',
    name: 'OFD/IDF/MDF',
    categoryType: 'EQUIPMENT',
    displayColor: '#22c55e',
    iconName: 'equip-ofd',
    unit: '대',
    sortOrder: 3,
    description: '광/동 케이블 종단, 배선 분배',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['OFD', 'FDF', 'MDF', 'IDF', 'QDF', 'VDF', '중간배선반 단자함'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'EQP-UPS',
    name: 'UPS/전원설비',
    categoryType: 'EQUIPMENT',
    displayColor: '#f97316',
    iconName: 'equip-ups',
    unit: '대',
    sortOrder: 4,
    description: '무정전 전원공급, 배터리 백업 (KS C IEC 62040)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['UPS', '축전지', '정류기', 'SMPS'] },
        { key: 'capacity', label: '용량', inputType: 'text' },
      ],
      format: '{type} {capacity}',
    },
  },
  {
    code: 'EQP-NET',
    name: '네트워크장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#3b82f6',
    iconName: 'equip-network',
    unit: '대',
    sortOrder: 5,
    description: 'LAN 스위칭, 광변환, 원격 접속',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['L2 스위칭허브', 'POE 허브', '광컨버터', 'KVM 스위치', '멀티탭'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'EQP-SEC',
    name: '보안장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#ef4444',
    iconName: 'equip-security',
    unit: '대',
    sortOrder: 6,
    description: '무인변전소 보안감시',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['IP카메라 (옥내)', 'IP카메라 PTZ (옥외)', '열선/셔터 감지기', '카메라 함체', '카메라 지지대/브라켓'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-PITR',
    name: 'PITR/PIU',
    categoryType: 'EQUIPMENT',
    displayColor: '#a855f7',
    iconName: 'equip-pitr',
    unit: '대',
    sortOrder: 7,
    description: '송변전 광단말장치 (전류차동보호, 광통신)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PITR-2000 (SP2)', 'PITR-5000', 'PIU', 'SPS PITR'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-SEIS',
    name: '내진가대',
    categoryType: 'EQUIPMENT',
    displayColor: '#78716c',
    iconName: 'equip-seismic',
    unit: '대',
    sortOrder: 8,
    description: '랙/함체 지진 대비 고정 (KEPCO 내진설계기준, KDS 41 17 00)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['19" 내진가대 (표준)', '내진가대 (대형)', '내진가대 (초대형)'] },
        { key: 'width', label: '폭(mm)', inputType: 'number', min: 400, max: 1200 },
        { key: 'depth', label: '깊이(mm)', inputType: 'number', min: 400, max: 1200 },
        { key: 'height', label: '높이(mm)', inputType: 'number', min: 200, max: 500 },
      ],
      format: '{type} {width}×{depth}×{height}',
    },
  },
  {
    code: 'EQP-SURGE',
    name: '서지보호장치',
    categoryType: 'EQUIPMENT',
    displayColor: '#eab308',
    iconName: 'equip-surge',
    unit: '개',
    sortOrder: 9,
    description: '낙뢰/서지 보호 (KS C IEC 61643)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['AC 220V 전원용', 'DC 125V 전원용', '통신/데이터용'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-BRK',
    name: '차단기/개폐기',
    categoryType: 'EQUIPMENT',
    displayColor: '#f97316',
    iconName: 'equip-breaker',
    unit: '개',
    sortOrder: 10,
    description: 'ICT 장비 전원 차단/보호 (KS C IEC 60947)',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['MCCB 30AF 2P', 'MCCB 10A 2P', 'MCCB 20A 2P', 'MCCB 10A 2P 보조접점형'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-SYNC',
    name: '시각동기장치',
    categoryType: 'EQUIPMENT',
    displayColor: '#06b6d4',
    iconName: 'equip-sync',
    unit: '대',
    sortOrder: 11,
    description: 'GPS 기반 시각 동기 (SCADA 타임스탬프)',
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
    displayColor: '#06b6d4',
    iconName: 'equip-cooling',
    unit: '대',
    sortOrder: 12,
    description: 'ICT실 온도/습도 관리',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['에어컨 (공냉식 패키지형)', '항온항습기', '환기팬'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'EQP-PDAS',
    name: 'PDAS장비',
    categoryType: 'EQUIPMENT',
    displayColor: '#8b5cf6',
    iconName: 'equip-pdas',
    unit: '대',
    sortOrder: 13,
    description: '부분방전 감시',
    specTemplate: {
      params: [],
      format: 'PDAS 본체',
    },
  },
];

// ==================== 부속자재 Parent 9종 ====================

const accessoryParentCategories: CategorySeedData[] = [
  {
    code: 'ACC-PIPE',
    name: '전선관',
    categoryType: 'ACCESSORY',
    displayColor: '#78716c',
    iconName: 'acc-pipe',
    unit: 'm',
    sortOrder: 1,
    description: '케이블 보호/수납, 배선 경로 형성',
  },
  {
    code: 'ACC-CONN',
    name: '커넥터/단자',
    categoryType: 'ACCESSORY',
    displayColor: '#0ea5e9',
    iconName: 'acc-connector',
    unit: '개',
    sortOrder: 2,
    description: '케이블 종단, 장비 접속',
  },
  {
    code: 'ACC-TRAY',
    name: '케이블트레이',
    categoryType: 'ACCESSORY',
    displayColor: '#78716c',
    iconName: 'acc-tray',
    unit: 'm',
    sortOrder: 3,
    description: '다량 케이블 수납/경로 형성',
  },
  {
    code: 'ACC-BOX',
    name: '풀박스/박스',
    categoryType: 'ACCESSORY',
    displayColor: '#78716c',
    iconName: 'acc-box',
    unit: '개',
    sortOrder: 4,
    description: '케이블 분기/접속점, 배관 연결 (KEC)',
    specTemplate: {
      params: [
        { key: 'material', label: '재질', inputType: 'select', options: ['스틸(분체도장)', 'SUS', '하이박스'] },
        { key: 'w', label: '폭(mm)', inputType: 'number', min: 100, max: 1000 },
        { key: 'h', label: '높이(mm)', inputType: 'number', min: 100, max: 1000 },
        { key: 'd', label: '깊이(mm)', inputType: 'number', min: 50, max: 500 },
      ],
      format: '{material} {w}×{h}×{d}',
    },
  },
  {
    code: 'ACC-PIPE-FIT',
    name: '배관부속',
    categoryType: 'ACCESSORY',
    displayColor: '#78716c',
    iconName: 'acc-fitting',
    unit: '개',
    sortOrder: 5,
    description: '전선관/트레이 설치용 지지/고정/부속',
  },
  {
    code: 'ACC-SPLICE',
    name: '접속자재',
    categoryType: 'ACCESSORY',
    displayColor: '#f97316',
    iconName: 'acc-splice',
    unit: '개',
    sortOrder: 6,
    description: '케이블 중간접속/종단처리',
  },
  {
    code: 'ACC-BUILD',
    name: '건축자재',
    categoryType: 'ACCESSORY',
    displayColor: '#a3a3a3',
    iconName: 'acc-building',
    unit: '㎡',
    sortOrder: 7,
    description: 'ICT실 바닥/환경',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['액세스플로어(우드)', '액세스플로어(금속)'] },
        { key: 'size', label: '규격', inputType: 'text' },
      ],
      format: '{type} {size}',
    },
  },
  {
    code: 'ACC-MISC',
    name: '잡자재',
    categoryType: 'ACCESSORY',
    displayColor: '#a3a3a3',
    iconName: 'acc-misc',
    unit: '개',
    sortOrder: 8,
    description: '기타 소모성 자재',
  },
  {
    code: 'ACC-GND',
    name: '접지부속',
    categoryType: 'ACCESSORY',
    displayColor: '#eab308',
    iconName: 'acc-ground',
    unit: '개',
    sortOrder: 9,
    description: '접지 시스템 구성 (KS C IEC 62305, KEC)',
  },
];

// ==================== 부속자재 Leaf 25종 ====================

const accessoryLeafCategories: CategorySeedData[] = [
  // --- 전선관 하위 5종 ---
  {
    code: 'ACC-PIPE-PVC',
    name: 'PVC전선관',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE',
    displayColor: '#78716c',
    iconName: 'acc-pipe-pvc',
    unit: 'm',
    sortOrder: 1,
    description: '경질비닐전선관 (KS C 8431)',
    specTemplate: {
      params: [
        { key: 'size', label: '호칭(mm)', inputType: 'select', options: [16, 22, 28, 36, 42, 54, 70, 82, 104] },
      ],
      format: 'PVC {size}mm',
    },
  },
  {
    code: 'ACC-PIPE-FLEX',
    name: '가요전선관',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE',
    displayColor: '#78716c',
    iconName: 'acc-pipe-flex',
    unit: 'm',
    sortOrder: 2,
    description: '합성수지 가요전선관 (KS C 8455)',
    specTemplate: {
      params: [
        { key: 'size', label: '호칭', inputType: 'select', options: ['PF 16', 'PF 22', 'PF 28', 'PF 36'] },
      ],
      format: '{size}',
    },
  },
  {
    code: 'ACC-PIPE-CD',
    name: 'CD관',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE',
    displayColor: '#f97316',
    iconName: 'acc-pipe-cd',
    unit: 'm',
    sortOrder: 3,
    description: 'CD관 — 콘크리트 매입 전용',
    specTemplate: {
      params: [
        { key: 'size', label: '호칭', inputType: 'select', options: ['CD 16', 'CD 22', 'CD 28', 'CD 36'] },
      ],
      format: '{size}',
    },
  },
  {
    code: 'ACC-PIPE-METAL',
    name: '금속전선관',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE',
    displayColor: '#78716c',
    iconName: 'acc-pipe-metal',
    unit: 'm',
    sortOrder: 4,
    description: '후강전선관 (KS C 8401)',
    specTemplate: {
      params: [
        { key: 'size', label: '호칭', inputType: 'select', options: ['C19', 'C25', 'C31', 'C39', 'C51', 'C63', 'C75'] },
      ],
      format: '{size}',
    },
  },
  {
    code: 'ACC-PIPE-PE',
    name: 'PE전선관',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE',
    displayColor: '#78716c',
    iconName: 'acc-pipe-pe',
    unit: 'm',
    sortOrder: 5,
    description: 'PE전선관 — 옥외 지중 배관',
    specTemplate: {
      params: [
        { key: 'size', label: '호칭(mm)', inputType: 'select', options: [22, 28, 36, 54, 70] },
      ],
      format: 'PE {size}mm',
    },
  },
  // --- 커넥터/단자 하위 4종 ---
  {
    code: 'ACC-CONN-RJ45',
    name: 'RJ-45 커넥터',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-CONN',
    displayColor: '#0ea5e9',
    iconName: 'acc-rj45',
    unit: '개',
    sortOrder: 1,
    description: 'RJ-45 커넥터 (TIA/EIA-568)',
    specTemplate: {
      params: [
        { key: 'cat', label: '카테고리', inputType: 'select', options: ['Cat.5e', 'Cat.6', 'Cat.6A'] },
      ],
      format: '{cat} 8P',
    },
  },
  {
    code: 'ACC-CONN-CRIMP',
    name: '압착단자',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-CONN',
    displayColor: '#0ea5e9',
    iconName: 'acc-crimp',
    unit: '개',
    sortOrder: 2,
    description: '압착단자 (R형, Y형, 핀단자, 동관단자)',
    specTemplate: {
      params: [
        { key: 'type', label: '타입', inputType: 'select', options: ['R형', 'Y형', '핀단자', '동관단자'] },
        { key: 'sq', label: '전선규격(㎟)', inputType: 'number', min: 1.25, max: 60 },
        { key: 'bolt', label: '볼트규격(mm)', inputType: 'number', min: 3, max: 12 },
      ],
      format: '{type} {sq}-{bolt}',
    },
  },
  {
    code: 'ACC-CONN-OPT',
    name: '광어댑터',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-CONN',
    displayColor: '#22c55e',
    iconName: 'acc-opt-adapter',
    unit: '개',
    sortOrder: 3,
    description: '광커넥터 어댑터',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['SC/APC', 'SC/UPC', 'LC/UPC', 'LC/APC', 'ST/UPC', 'SC-LC 변환'] },
      ],
      format: '{type}',
    },
  },
  {
    code: 'ACC-CONN-TERM',
    name: '단자대/블록',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-CONN',
    displayColor: '#0ea5e9',
    iconName: 'acc-terminal',
    unit: '개',
    sortOrder: 4,
    description: '단자대/블록 (110블록, Krone, 터미널블록)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['110블록', 'Krone 블록', '터미널블록'] },
        { key: 'pairs', label: '쌍수/극수', inputType: 'number', min: 1, max: 100 },
      ],
      format: '{type} {pairs}P',
    },
  },
  // --- 케이블트레이 하위 4종 ---
  {
    code: 'ACC-TRAY-LADDER',
    name: '사다리형 트레이',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-TRAY',
    displayColor: '#78716c',
    iconName: 'acc-tray-ladder',
    unit: 'm',
    sortOrder: 1,
    description: '사다리형 케이블트레이 (KS C 8464)',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 60, 100, 150, 200] },
      ],
      format: '사다리형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-SOLID',
    name: '밀폐형 트레이',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-TRAY',
    displayColor: '#78716c',
    iconName: 'acc-tray-solid',
    unit: 'm',
    sortOrder: 2,
    description: '밀폐형 케이블트레이 — 방진/차폐 구간',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 60, 100, 150, 200] },
      ],
      format: '밀폐형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-MESH',
    name: '메쉬형 트레이',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-TRAY',
    displayColor: '#78716c',
    iconName: 'acc-tray-mesh',
    unit: 'm',
    sortOrder: 3,
    description: '메쉬형 케이블트레이 — 서버실/ICT실 내부',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [100, 200, 300, 400, 500] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 100] },
      ],
      format: '메쉬형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-DUCT',
    name: '알루미늄덕트',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-TRAY',
    displayColor: '#78716c',
    iconName: 'acc-tray-duct',
    unit: 'm',
    sortOrder: 4,
    description: '알루미늄덕트 (조립형)',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'number', min: 30, max: 300 },
        { key: 'h', label: '높이(mm)', inputType: 'number', min: 20, max: 200 },
      ],
      format: '알루미늄덕트 {w}×{h}',
    },
  },
  // --- 배관부속 하위 3종 ---
  {
    code: 'ACC-FIT-SADDLE',
    name: '새들/반새들',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE-FIT',
    displayColor: '#78716c',
    iconName: 'acc-saddle',
    unit: '개',
    sortOrder: 1,
    description: '전선관 고정용 새들/반새들',
    specTemplate: {
      params: [
        { key: 'size', label: '규격(mm)', inputType: 'select', options: [16, 22, 28, 36] },
        { key: 'material', label: '재질', inputType: 'select', options: ['스틸', 'SUS'] },
      ],
      format: '새들 {size}mm {material}',
    },
  },
  {
    code: 'ACC-FIT-ANCHOR',
    name: '앵커볼트/셋트앙카',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE-FIT',
    displayColor: '#78716c',
    iconName: 'acc-anchor',
    unit: '개',
    sortOrder: 2,
    description: '고정/앵커볼트',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['M10', 'M12', 'M16', 'Φ3/8', 'Φ1/2'] },
        { key: 'length', label: '길이(mm)', inputType: 'number', min: 50, max: 300 },
      ],
      format: '{type} {length}mm',
    },
  },
  {
    code: 'ACC-FIT-PARTS',
    name: '전선관부속',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-PIPE-FIT',
    displayColor: '#78716c',
    iconName: 'acc-pipe-parts',
    unit: '개',
    sortOrder: 3,
    description: '전선관부속 (커플링, 벤드, 엘보, 부싱, 로크너트, 인서트캡, 클램프)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['커플링', '노멀벤드', '엘보', '부싱', '로크너트', '인서트캡', '클램프'] },
        { key: 'size', label: '규격(mm)', inputType: 'select', options: [16, 22, 28, 36, 42, 54, 70] },
      ],
      format: '{type} {size}mm',
    },
  },
  // --- 접속자재 하위 2종 ---
  {
    code: 'ACC-SPLICE-OPT',
    name: '광접속자재',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-SPLICE',
    displayColor: '#22c55e',
    iconName: 'acc-splice-opt',
    unit: '개',
    sortOrder: 1,
    description: '광케이블 중간접속/종단',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['광접속함', '열수축 슬리브', '보호 슬리브'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'ACC-SPLICE-CU',
    name: '구리접속자재',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-SPLICE',
    displayColor: '#f97316',
    iconName: 'acc-splice-cu',
    unit: '개',
    sortOrder: 2,
    description: '구리케이블 접속자재 (슬리브, 열수축튜브)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['직선 슬리브', 'C형 슬리브', '열수축 튜브', '스파이럴 슬리브'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  // --- 잡자재 하위 4종 ---
  {
    code: 'ACC-MISC-TIE',
    name: '케이블타이',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-MISC',
    displayColor: '#a3a3a3',
    iconName: 'acc-tie',
    unit: '개',
    sortOrder: 1,
    description: '케이블 결속 (KS C IEC 62275)',
    specTemplate: {
      params: [
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [100, 150, 200, 300, 370, 450] },
        { key: 'width', label: '폭(mm)', inputType: 'select', options: [2.5, 3.6, 4.8, 7.6] },
      ],
      format: '케이블타이 {length}×{width}',
    },
  },
  {
    code: 'ACC-MISC-LABEL',
    name: '라벨/명판',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-MISC',
    displayColor: '#a3a3a3',
    iconName: 'acc-label',
    unit: '개',
    sortOrder: 2,
    description: '케이블 라벨, 명판, 케이블 태그',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC 케이블 라벨', '케이블 태그', '명판 (포맥스)', '열전사 라벨'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'ACC-MISC-TAPE',
    name: '절연테이프',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-MISC',
    displayColor: '#a3a3a3',
    iconName: 'acc-tape',
    unit: '개',
    sortOrder: 3,
    description: '절연테이프 (KS C IEC 60454)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC 절연테이프', '자기융착테이프', '면절연테이프'] },
        { key: 'width', label: '폭(mm)', inputType: 'select', options: [19, 25] },
      ],
      format: '{type} {width}mm',
    },
  },
  {
    code: 'ACC-MISC-ETC',
    name: '기타잡자재',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-MISC',
    displayColor: '#a3a3a3',
    iconName: 'acc-etc',
    unit: '식',
    sortOrder: 4,
    description: '와이어프로텍터, 스파이럴 튜브, PVC 덕트, 전산볼트, 잡자재 일괄',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['와이어프로텍터', '스파이럴 튜브', 'PVC 덕트', '전산볼트', 'HEX NUT', '잡자재 일괄'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  // --- 접지부속 하위 3종 ---
  {
    code: 'ACC-GND-ROD',
    name: '접지봉',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-GND',
    displayColor: '#eab308',
    iconName: 'acc-gnd-rod',
    unit: '개',
    sortOrder: 1,
    description: '접지봉 — 동피복강봉 (KS C IEC 62305)',
    specTemplate: {
      params: [
        { key: 'dia', label: '직경(Φmm)', inputType: 'select', options: [12, 14.2, 16, 17.8, 20, 25] },
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [500, 1000, 1500, 1800, 2400, 3000] },
      ],
      format: '접지봉 Φ{dia}×{length}',
    },
  },
  {
    code: 'ACC-GND-PLATE',
    name: '접지판',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-GND',
    displayColor: '#eab308',
    iconName: 'acc-gnd-plate',
    unit: '개',
    sortOrder: 2,
    description: '접지판 — 동판 (KEC)',
    specTemplate: {
      params: [
        { key: 'size', label: '규격', inputType: 'select', options: ['900×900×1.5t', '900×900×3.2t'] },
      ],
      format: '접지판 {size}',
    },
  },
  {
    code: 'ACC-GND-BAR',
    name: '접지바/부속',
    categoryType: 'ACCESSORY',
    parentCode: 'ACC-GND',
    displayColor: '#eab308',
    iconName: 'acc-gnd-bar',
    unit: '개',
    sortOrder: 3,
    description: '접지바, 접지클램프, 접지단자대, CAD Weld',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['접지바', '접지클램프', '접지단자대', '접지테이프', 'CAD Weld'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
];

// ==================== 시드 실행 함수 ====================

export async function seedMaterialCategories(prisma: PrismaClient) {
  console.log('🌱 Seeding material categories...');

  // 1단계: parent가 없는 카테고리 (케이블 + 설비 + 부속 parent)
  const allParents = [
    ...cableCategories,
    ...equipmentCategories,
    ...accessoryParentCategories,
  ];

  // parentId map 구축
  const codeToId: Record<string, string> = {};

  for (const cat of allParents) {
    const result = await prisma.materialCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        categoryType: cat.categoryType,
        description: cat.description,
        displayColor: cat.displayColor,
        iconName: cat.iconName,
        unit: cat.unit,
        specTemplate: cat.specTemplate as any ?? undefined,
        sortOrder: cat.sortOrder,
      },
      create: {
        code: cat.code,
        name: cat.name,
        categoryType: cat.categoryType,
        description: cat.description,
        displayColor: cat.displayColor,
        iconName: cat.iconName,
        unit: cat.unit,
        specTemplate: cat.specTemplate as any ?? undefined,
        sortOrder: cat.sortOrder,
      },
    });
    codeToId[cat.code] = result.id;
  }

  console.log(`  ✅ ${allParents.length}개 상위 카테고리 (케이블 ${cableCategories.length} + 설비 ${equipmentCategories.length} + 부속 parent ${accessoryParentCategories.length})`);

  // 2단계: 부속자재 leaf (parentId 참조)
  for (const cat of accessoryLeafCategories) {
    const parentId = cat.parentCode ? codeToId[cat.parentCode] : undefined;
    if (cat.parentCode && !parentId) {
      console.warn(`  ⚠️ parent code '${cat.parentCode}' not found for '${cat.code}'`);
      continue;
    }

    const result = await prisma.materialCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        categoryType: cat.categoryType,
        parentId: parentId ?? null,
        description: cat.description,
        displayColor: cat.displayColor,
        iconName: cat.iconName,
        unit: cat.unit,
        specTemplate: cat.specTemplate as any ?? undefined,
        sortOrder: cat.sortOrder,
      },
      create: {
        code: cat.code,
        name: cat.name,
        categoryType: cat.categoryType,
        parentId: parentId ?? null,
        description: cat.description,
        displayColor: cat.displayColor,
        iconName: cat.iconName,
        unit: cat.unit,
        specTemplate: cat.specTemplate as any ?? undefined,
        sortOrder: cat.sortOrder,
      },
    });
    codeToId[cat.code] = result.id;
  }

  console.log(`  ✅ ${accessoryLeafCategories.length}개 부속자재 leaf 카테고리`);

  const totalCount = allParents.length + accessoryLeafCategories.length;
  console.log(`🎉 총 ${totalCount}개 자재 카테고리 시드 완료`);
}
