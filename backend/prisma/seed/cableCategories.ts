import { PrismaClient } from '@prisma/client';

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

interface CableCategorySeed {
  code: string;
  name: string;
  description?: string;
  displayColor?: string;
  displayGroup?: '전원' | '접지' | '네트워크' | '광' | '제어';
  iconName?: string;
  unit?: string;
  specTemplate?: SpecTemplate;
  sortOrder: number;
}

// 16종 (구 MaterialCategory.CABLE 그대로 이전)
const cableCategories: CableCategorySeed[] = [
  {
    code: 'CBL-FCV',
    name: 'F-CV 전력케이블',
    displayColor: '#ef4444',
    iconName: 'cable-power',
    unit: 'm',
    sortOrder: 1,
    displayGroup: '전원',
    description: '가교PE절연 비닐시스 전력케이블 (KS C IEC 60502-1)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['F-CV', 'F-CVV'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [2.5, 4, 6, 16, 25, 35] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [1, 2, 3, 4] },
        { key: 'cbNumber', label: '번호', inputType: 'number' },
        { key: 'capacity', label: '용량', inputType: 'select', options: ['15A', '20A', '30A', '40A', '50A', '75A', '100A'] },
        { key: 'switchState', label: 'SW상태', inputType: 'select', options: ['ON', 'OFF'] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-FR',
    name: '난연/내화케이블',
    displayColor: '#ef4444',
    iconName: 'cable-fire',
    unit: 'm',
    sortOrder: 2,
    displayGroup: '전원',
    description: '난연 차폐 제어케이블 FR-CVVS, 내화케이블 FFR-8',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['FR-CVVS', 'FFR-8'] },
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 16, 25, 35] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 6] },
        { key: 'cbNumber', label: '번호', inputType: 'number' },
        { key: 'capacity', label: '용량', inputType: 'select', options: ['15A', '20A', '30A', '40A', '50A', '75A', '100A'] },
        { key: 'switchState', label: 'SW상태', inputType: 'select', options: ['ON', 'OFF'] },
      ],
      format: '{type} {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-VCT',
    name: '캡타이어 VCT',
    displayColor: '#ef4444',
    iconName: 'cable-vct',
    unit: 'm',
    sortOrder: 3,
    displayGroup: '전원',
    description: '비닐캡타이어 케이블 (이동용 전원)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 3, 4] },
        { key: 'cbNumber', label: '번호', inputType: 'number' },
        { key: 'capacity', label: '용량', inputType: 'select', options: ['15A', '20A', '30A', '40A', '50A', '75A', '100A'] },
        { key: 'switchState', label: 'SW상태', inputType: 'select', options: ['ON', 'OFF'] },
      ],
      format: 'VCT {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-HIV',
    name: '비닐절연전선 HIV',
    displayColor: '#ef4444',
    iconName: 'cable-hiv',
    unit: 'm',
    sortOrder: 4,
    displayGroup: '전원',
    description: '비닐절연전선 HIV (단심)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 4, 6, 10, 16, 25, 35] },
        { key: 'cbNumber', label: '번호', inputType: 'number' },
        { key: 'capacity', label: '용량', inputType: 'select', options: ['15A', '20A', '30A', '40A', '50A', '75A', '100A'] },
        { key: 'switchState', label: 'SW상태', inputType: 'select', options: ['ON', 'OFF'] },
      ],
      format: 'HIV {sq}SQ',
    },
  },
  {
    code: 'CBL-UTP',
    name: 'UTP/S-FTP케이블',
    displayColor: '#3b82f6',
    iconName: 'cable-utp',
    unit: 'm',
    sortOrder: 5,
    displayGroup: '네트워크',
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
    displayColor: '#22c55e',
    iconName: 'cable-fiber',
    unit: 'm',
    sortOrder: 6,
    displayGroup: '광',
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
    displayColor: '#22c55e',
    iconName: 'cable-jumper',
    unit: '본',
    sortOrder: 7,
    displayGroup: '광',
    description: '광점퍼코드 (ITU-T G.652, IEC 61754)',
    specTemplate: {
      params: [
        { key: 'connA', label: '커넥터A', inputType: 'select', options: ['SC', 'LC', 'ST', 'MU'] },
        { key: 'connB', label: '커넥터B', inputType: 'select', options: ['SC', 'LC', 'ST', 'MU'] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [1, 2, 6] },
        // 선번장 코어 측정/점검 필드 (직할 OFD 선번장 parity). 값 없으면 빈 칸(수동 입력 대기).
        { key: 'loss1310', label: '손실1310(dB)', inputType: 'number' },
        { key: 'dist1310', label: '거리1310(km)', inputType: 'number' },
        { key: 'loss1550', label: '손실1550(dB)', inputType: 'number' },
        { key: 'dist1550', label: '거리1550(km)', inputType: 'number' },
        { key: 'inspectDate', label: '마지막점검일', inputType: 'text' },
      ],
      format: '{connA}-{connB} {cores}C',
    },
  },
  {
    code: 'CBL-OPT-B',
    name: '브레이크아웃케이블',
    displayColor: '#22c55e',
    iconName: 'cable-breakout',
    unit: 'm',
    sortOrder: 8,
    displayGroup: '광',
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
    code: 'CBL-OPGW',
    name: 'OPGW(광복합가공지선)',
    displayColor: '#22c55e',
    iconName: 'cable-fiber',
    unit: 'm',
    sortOrder: 8.5,
    displayGroup: '광',
    description: 'OPGW 광복합가공지선 — 변전소간 광케이블 (KS C 6710, ITU-T G.652)',
    specTemplate: {
      params: [
        { key: 'mode', label: '모드', inputType: 'select', options: ['SM', 'MM'] },
        { key: 'cores', label: '코어수(C)', inputType: 'select', options: [4, 6, 8, 12, 24, 48] },
      ],
      format: '{mode} {cores}C',
    },
  },
  {
    code: 'CBL-IV',
    name: '접지전선 IV/F-GV',
    displayColor: '#eab308',
    iconName: 'cable-ground',
    unit: 'm',
    sortOrder: 9,
    displayGroup: '접지',
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
    displayColor: '#eab308',
    iconName: 'cable-bare',
    unit: 'm',
    sortOrder: 10,
    displayGroup: '접지',
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
    displayColor: '#64748b',
    iconName: 'cable-control',
    unit: 'm',
    sortOrder: 11,
    displayGroup: '전원',
    description: '제어케이블 CVV-S (KS C IEC 60502-1)',
    specTemplate: {
      params: [
        { key: 'sq', label: '선경(SQ)', inputType: 'select', options: [1.5, 2.5, 6] },
        { key: 'cores', label: '심수(C)', inputType: 'select', options: [2, 4, 6, 8] },
        { key: 'cbNumber', label: '번호', inputType: 'number' },
        { key: 'capacity', label: '용량', inputType: 'select', options: ['15A', '20A', '30A', '40A', '50A', '75A', '100A'] },
        { key: 'switchState', label: 'SW상태', inputType: 'select', options: ['ON', 'OFF'] },
      ],
      format: 'CVV-S {sq}SQ {cores}C',
    },
  },
  {
    code: 'CBL-CPEV',
    name: '통신케이블 CPEV-S',
    displayColor: '#64748b',
    iconName: 'cable-comm',
    unit: 'm',
    sortOrder: 12,
    displayGroup: '네트워크',
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
    displayColor: '#64748b',
    iconName: 'cable-pcm',
    unit: 'm',
    sortOrder: 13,
    displayGroup: '제어',
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
    displayColor: '#6b7280',
    iconName: 'cable-coax',
    unit: 'm',
    sortOrder: 14,
    displayGroup: '제어',
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
    displayColor: '#64748b',
    iconName: 'cable-champ',
    unit: 'm',
    sortOrder: 15,
    displayGroup: '네트워크',
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
    displayColor: '#6b7280',
    iconName: 'cable-signal',
    unit: 'm',
    sortOrder: 16,
    displayGroup: '제어',
    description: '데이터/신호케이블 — RS-232C/485, I/O접속',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['RS-232C', 'AWG20 4C 실드', 'AWG20 6C 실드', 'AWG24 4C 실드', 'AWG24 6C 실드', 'RS-Cable 25P'] },
      ],
      format: '{type}',
    },
  },
];

// 그룹 색 — 마이그레이션 백필과 동일 값(단일 소스).
const GROUP_COLORS: Record<string, string> = {
  '전원': '#ef4444', '접지': '#eab308', '네트워크': '#3b82f6', '광': '#22c55e', '제어': '#6b7280',
};

export async function seedCableCategories(prisma: PrismaClient) {
  console.log('🌱 Seeding cable categories...');
  // 1) displayGroup → CableGroup 멱등 upsert (이름→id 맵)
  const groupNames = [...new Set(cableCategories.map((c) => c.displayGroup).filter((g): g is string => !!g))];
  const groupIdByName = new Map<string, string>();
  let order = 1;
  for (const name of groupNames) {
    const g = await prisma.cableGroup.upsert({
      where: { name },
      update: {},
      create: { name, color: GROUP_COLORS[name] ?? null, sortOrder: order++ },
    });
    groupIdByName.set(name, g.id);
  }

  // 2) 카테고리 upsert (groupId 연결 포함)
  for (const cat of cableCategories) {
    const groupId = cat.displayGroup ? groupIdByName.get(cat.displayGroup) ?? null : null;
    const common = {
      name: cat.name,
      description: cat.description,
      displayColor: cat.displayColor,
      displayGroup: cat.displayGroup,
      groupId,
      iconName: cat.iconName,
      unit: cat.unit,
      specTemplate: (cat.specTemplate as any) ?? undefined,
      sortOrder: cat.sortOrder,
    };
    await prisma.cableCategory.upsert({
      where: { code: cat.code },
      create: { code: cat.code, ...common },
      update: common,
    });
  }
  console.log(`  ✅ ${cableCategories.length}개 케이블 카테고리 + ${groupNames.length}개 그룹`);
}
