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

interface BomMaterialSeed {
  code: string;
  name: string;
  parentCode?: string;
  description?: string;
  iconName?: string;
  unit?: string;
  specTemplate?: SpecTemplate;
  displayColor?: string;
  sortOrder: number;
}

// Parent 9종 + Leaf 25종 = 34종 (구 ACCESSORY 트리 그대로 이전)
const parents: BomMaterialSeed[] = [
  { code: 'ACC-PIPE',     name: '전선관',         displayColor: '#78716c', iconName: 'acc-pipe',      unit: 'm',  sortOrder: 1, description: '케이블 보호/수납, 배선 경로 형성' },
  { code: 'ACC-CONN',     name: '커넥터/단자',     displayColor: '#0ea5e9', iconName: 'acc-connector', unit: '개', sortOrder: 2, description: '케이블 종단, 장비 접속' },
  { code: 'ACC-TRAY',     name: '케이블트레이',     displayColor: '#78716c', iconName: 'acc-tray',      unit: 'm',  sortOrder: 3, description: '다량 케이블 수납/경로 형성' },
  {
    code: 'ACC-BOX', name: '풀박스/박스', displayColor: '#78716c', iconName: 'acc-box', unit: '개', sortOrder: 4,
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
  { code: 'ACC-PIPE-FIT', name: '배관부속',       displayColor: '#78716c', iconName: 'acc-fitting',  unit: '개', sortOrder: 5, description: '전선관/트레이 설치용 지지/고정/부속' },
  { code: 'ACC-SPLICE',   name: '접속자재',       displayColor: '#f97316', iconName: 'acc-splice',   unit: '개', sortOrder: 6, description: '케이블 중간접속/종단처리' },
  {
    code: 'ACC-BUILD', name: '건축자재', displayColor: '#a3a3a3', iconName: 'acc-building', unit: '㎡', sortOrder: 7,
    description: 'ICT실 바닥/환경',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['액세스플로어(우드)', '액세스플로어(금속)'] },
        { key: 'size', label: '규격', inputType: 'text' },
      ],
      format: '{type} {size}',
    },
  },
  { code: 'ACC-MISC', name: '잡자재',     displayColor: '#a3a3a3', iconName: 'acc-misc',    unit: '개', sortOrder: 8, description: '기타 소모성 자재' },
  { code: 'ACC-GND',  name: '접지부속',    displayColor: '#eab308', iconName: 'acc-ground',  unit: '개', sortOrder: 9, description: '접지 시스템 구성 (KS C IEC 62305, KEC)' },
];

const leaves: BomMaterialSeed[] = [
  // --- 전선관 5종 ---
  {
    code: 'ACC-PIPE-PVC', name: 'PVC전선관', parentCode: 'ACC-PIPE', displayColor: '#78716c', iconName: 'acc-pipe-pvc',
    unit: 'm', sortOrder: 1, description: '경질비닐전선관 (KS C 8431)',
    specTemplate: { params: [{ key: 'size', label: '호칭(mm)', inputType: 'select', options: [16, 22, 28, 36, 42, 54, 70, 82, 104] }], format: 'PVC {size}mm' },
  },
  {
    code: 'ACC-PIPE-FLEX', name: '가요전선관', parentCode: 'ACC-PIPE', displayColor: '#78716c', iconName: 'acc-pipe-flex',
    unit: 'm', sortOrder: 2, description: '합성수지 가요전선관 (KS C 8455)',
    specTemplate: { params: [{ key: 'size', label: '호칭', inputType: 'select', options: ['PF 16', 'PF 22', 'PF 28', 'PF 36'] }], format: '{size}' },
  },
  {
    code: 'ACC-PIPE-CD', name: 'CD관', parentCode: 'ACC-PIPE', displayColor: '#f97316', iconName: 'acc-pipe-cd',
    unit: 'm', sortOrder: 3, description: 'CD관 — 콘크리트 매입 전용',
    specTemplate: { params: [{ key: 'size', label: '호칭', inputType: 'select', options: ['CD 16', 'CD 22', 'CD 28', 'CD 36'] }], format: '{size}' },
  },
  {
    code: 'ACC-PIPE-METAL', name: '금속전선관', parentCode: 'ACC-PIPE', displayColor: '#78716c', iconName: 'acc-pipe-metal',
    unit: 'm', sortOrder: 4, description: '후강전선관 (KS C 8401)',
    specTemplate: { params: [{ key: 'size', label: '호칭', inputType: 'select', options: ['C19', 'C25', 'C31', 'C39', 'C51', 'C63', 'C75'] }], format: '{size}' },
  },
  {
    code: 'ACC-PIPE-PE', name: 'PE전선관', parentCode: 'ACC-PIPE', displayColor: '#78716c', iconName: 'acc-pipe-pe',
    unit: 'm', sortOrder: 5, description: 'PE전선관 — 옥외 지중 배관',
    specTemplate: { params: [{ key: 'size', label: '호칭(mm)', inputType: 'select', options: [22, 28, 36, 54, 70] }], format: 'PE {size}mm' },
  },

  // --- 커넥터/단자 4종 ---
  {
    code: 'ACC-CONN-RJ45', name: 'RJ-45 커넥터', parentCode: 'ACC-CONN', displayColor: '#0ea5e9', iconName: 'acc-rj45',
    unit: '개', sortOrder: 1, description: 'RJ-45 커넥터 (TIA/EIA-568)',
    specTemplate: { params: [{ key: 'cat', label: '카테고리', inputType: 'select', options: ['Cat.5e', 'Cat.6', 'Cat.6A'] }], format: '{cat} 8P' },
  },
  {
    code: 'ACC-CONN-CRIMP', name: '압착단자', parentCode: 'ACC-CONN', displayColor: '#0ea5e9', iconName: 'acc-crimp',
    unit: '개', sortOrder: 2, description: '압착단자 (R형, Y형, 핀단자, 동관단자)',
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
    code: 'ACC-CONN-OPT', name: '광어댑터', parentCode: 'ACC-CONN', displayColor: '#22c55e', iconName: 'acc-opt-adapter',
    unit: '개', sortOrder: 3, description: '광커넥터 어댑터',
    specTemplate: { params: [{ key: 'type', label: '규격', inputType: 'select', options: ['SC/APC', 'SC/UPC', 'LC/UPC', 'LC/APC', 'ST/UPC', 'SC-LC 변환'] }], format: '{type}' },
  },
  {
    code: 'ACC-CONN-TERM', name: '단자대/블록', parentCode: 'ACC-CONN', displayColor: '#0ea5e9', iconName: 'acc-terminal',
    unit: '개', sortOrder: 4, description: '단자대/블록 (110블록, Krone, 터미널블록)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['110블록', 'Krone 블록', '터미널블록'] },
        { key: 'pairs', label: '쌍수/극수', inputType: 'number', min: 1, max: 100 },
      ],
      format: '{type} {pairs}P',
    },
  },

  // --- 케이블트레이 4종 ---
  {
    code: 'ACC-TRAY-LADDER', name: '사다리형 트레이', parentCode: 'ACC-TRAY', displayColor: '#78716c', iconName: 'acc-tray-ladder',
    unit: 'm', sortOrder: 1, description: '사다리형 케이블트레이 (KS C 8464)',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 60, 100, 150, 200] },
      ],
      format: '사다리형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-SOLID', name: '밀폐형 트레이', parentCode: 'ACC-TRAY', displayColor: '#78716c', iconName: 'acc-tray-solid',
    unit: 'm', sortOrder: 2, description: '밀폐형 케이블트레이 — 방진/차폐 구간',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [150, 200, 300, 400, 450, 500, 600, 750, 900] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 60, 100, 150, 200] },
      ],
      format: '밀폐형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-MESH', name: '메쉬형 트레이', parentCode: 'ACC-TRAY', displayColor: '#78716c', iconName: 'acc-tray-mesh',
    unit: 'm', sortOrder: 3, description: '메쉬형 케이블트레이 — 서버실/ICT실 내부',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'select', options: [100, 200, 300, 400, 500] },
        { key: 'h', label: '높이(mm)', inputType: 'select', options: [50, 100] },
      ],
      format: '메쉬형 {w}×{h}',
    },
  },
  {
    code: 'ACC-TRAY-DUCT', name: '알루미늄덕트', parentCode: 'ACC-TRAY', displayColor: '#78716c', iconName: 'acc-tray-duct',
    unit: 'm', sortOrder: 4, description: '알루미늄덕트 (조립형)',
    specTemplate: {
      params: [
        { key: 'w', label: '폭(mm)', inputType: 'number', min: 30, max: 300 },
        { key: 'h', label: '높이(mm)', inputType: 'number', min: 20, max: 200 },
      ],
      format: '알루미늄덕트 {w}×{h}',
    },
  },

  // --- 배관부속 3종 ---
  {
    code: 'ACC-FIT-SADDLE', name: '새들/반새들', parentCode: 'ACC-PIPE-FIT', displayColor: '#78716c', iconName: 'acc-saddle',
    unit: '개', sortOrder: 1, description: '전선관 고정용 새들/반새들',
    specTemplate: {
      params: [
        { key: 'size', label: '규격(mm)', inputType: 'select', options: [16, 22, 28, 36] },
        { key: 'material', label: '재질', inputType: 'select', options: ['스틸', 'SUS'] },
      ],
      format: '새들 {size}mm {material}',
    },
  },
  {
    code: 'ACC-FIT-ANCHOR', name: '앵커볼트/셋트앙카', parentCode: 'ACC-PIPE-FIT', displayColor: '#78716c', iconName: 'acc-anchor',
    unit: '개', sortOrder: 2, description: '고정/앵커볼트',
    specTemplate: {
      params: [
        { key: 'type', label: '규격', inputType: 'select', options: ['M10', 'M12', 'M16', 'Φ3/8', 'Φ1/2'] },
        { key: 'length', label: '길이(mm)', inputType: 'number', min: 50, max: 300 },
      ],
      format: '{type} {length}mm',
    },
  },
  {
    code: 'ACC-FIT-PARTS', name: '전선관부속', parentCode: 'ACC-PIPE-FIT', displayColor: '#78716c', iconName: 'acc-pipe-parts',
    unit: '개', sortOrder: 3, description: '전선관부속 (커플링, 벤드, 엘보, 부싱, 로크너트, 인서트캡, 클램프)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['커플링', '노멀벤드', '엘보', '부싱', '로크너트', '인서트캡', '클램프'] },
        { key: 'size', label: '규격(mm)', inputType: 'select', options: [16, 22, 28, 36, 42, 54, 70] },
      ],
      format: '{type} {size}mm',
    },
  },

  // --- 접속자재 2종 ---
  {
    code: 'ACC-SPLICE-OPT', name: '광접속자재', parentCode: 'ACC-SPLICE', displayColor: '#22c55e', iconName: 'acc-splice-opt',
    unit: '개', sortOrder: 1, description: '광케이블 중간접속/종단',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['광접속함', '열수축 슬리브', '보호 슬리브'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'ACC-SPLICE-CU', name: '구리접속자재', parentCode: 'ACC-SPLICE', displayColor: '#f97316', iconName: 'acc-splice-cu',
    unit: '개', sortOrder: 2, description: '구리케이블 접속자재 (슬리브, 열수축튜브)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['직선 슬리브', 'C형 슬리브', '열수축 튜브', '스파이럴 슬리브'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },

  // --- 잡자재 4종 ---
  {
    code: 'ACC-MISC-TIE', name: '케이블타이', parentCode: 'ACC-MISC', displayColor: '#a3a3a3', iconName: 'acc-tie',
    unit: '개', sortOrder: 1, description: '케이블 결속 (KS C IEC 62275)',
    specTemplate: {
      params: [
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [100, 150, 200, 300, 370, 450] },
        { key: 'width', label: '폭(mm)', inputType: 'select', options: [2.5, 3.6, 4.8, 7.6] },
      ],
      format: '케이블타이 {length}×{width}',
    },
  },
  {
    code: 'ACC-MISC-LABEL', name: '라벨/명판', parentCode: 'ACC-MISC', displayColor: '#a3a3a3', iconName: 'acc-label',
    unit: '개', sortOrder: 2, description: '케이블 라벨, 명판, 케이블 태그',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC 케이블 라벨', '케이블 태그', '명판 (포맥스)', '열전사 라벨'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
  {
    code: 'ACC-MISC-TAPE', name: '절연테이프', parentCode: 'ACC-MISC', displayColor: '#a3a3a3', iconName: 'acc-tape',
    unit: '개', sortOrder: 3, description: '절연테이프 (KS C IEC 60454)',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['PVC 절연테이프', '자기융착테이프', '면절연테이프'] },
        { key: 'width', label: '폭(mm)', inputType: 'select', options: [19, 25] },
      ],
      format: '{type} {width}mm',
    },
  },
  {
    code: 'ACC-MISC-ETC', name: '기타잡자재', parentCode: 'ACC-MISC', displayColor: '#a3a3a3', iconName: 'acc-etc',
    unit: '식', sortOrder: 4, description: '와이어프로텍터, 스파이럴 튜브, PVC 덕트, 전산볼트, 잡자재 일괄',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['와이어프로텍터', '스파이럴 튜브', 'PVC 덕트', '전산볼트', 'HEX NUT', '잡자재 일괄'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },

  // --- 접지부속 3종 ---
  {
    code: 'ACC-GND-ROD', name: '접지봉', parentCode: 'ACC-GND', displayColor: '#eab308', iconName: 'acc-gnd-rod',
    unit: '개', sortOrder: 1, description: '접지봉 — 동피복강봉 (KS C IEC 62305)',
    specTemplate: {
      params: [
        { key: 'dia', label: '직경(Φmm)', inputType: 'select', options: [12, 14.2, 16, 17.8, 20, 25] },
        { key: 'length', label: '길이(mm)', inputType: 'select', options: [500, 1000, 1500, 1800, 2400, 3000] },
      ],
      format: '접지봉 Φ{dia}×{length}',
    },
  },
  {
    code: 'ACC-GND-PLATE', name: '접지판', parentCode: 'ACC-GND', displayColor: '#eab308', iconName: 'acc-gnd-plate',
    unit: '개', sortOrder: 2, description: '접지판 — 동판 (KEC)',
    specTemplate: {
      params: [{ key: 'size', label: '규격', inputType: 'select', options: ['900×900×1.5t', '900×900×3.2t'] }],
      format: '접지판 {size}',
    },
  },
  {
    code: 'ACC-GND-BAR', name: '접지바/부속', parentCode: 'ACC-GND', displayColor: '#eab308', iconName: 'acc-gnd-bar',
    unit: '개', sortOrder: 3, description: '접지바, 접지클램프, 접지단자대, CAD Weld',
    specTemplate: {
      params: [
        { key: 'type', label: '종류', inputType: 'select', options: ['접지바', '접지클램프', '접지단자대', '접지테이프', 'CAD Weld'] },
        { key: 'spec', label: '규격', inputType: 'text' },
      ],
      format: '{type} {spec}',
    },
  },
];

export async function seedBomMaterials(prisma: PrismaClient) {
  console.log('🌱 Seeding bom materials...');

  const codeToId: Record<string, string> = {};

  for (const p of parents) {
    const result = await prisma.bomMaterial.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        parentId: null,
        description: p.description,
        iconName: p.iconName,
        unit: p.unit,
        specTemplate: (p.specTemplate as any) ?? undefined,
        displayColor: p.displayColor,
        sortOrder: p.sortOrder,
      },
      update: {
        name: p.name,
        parentId: null,
        description: p.description,
        iconName: p.iconName,
        unit: p.unit,
        specTemplate: (p.specTemplate as any) ?? undefined,
        displayColor: p.displayColor,
        sortOrder: p.sortOrder,
      },
    });
    codeToId[p.code] = result.id;
  }

  for (const l of leaves) {
    const parentId = l.parentCode ? codeToId[l.parentCode] : null;
    if (l.parentCode && !parentId) {
      console.warn(`  ⚠️ parent code '${l.parentCode}' not found for '${l.code}'`);
      continue;
    }
    await prisma.bomMaterial.upsert({
      where: { code: l.code },
      create: {
        code: l.code,
        name: l.name,
        parentId: parentId ?? null,
        description: l.description,
        iconName: l.iconName,
        unit: l.unit,
        specTemplate: (l.specTemplate as any) ?? undefined,
        displayColor: l.displayColor,
        sortOrder: l.sortOrder,
      },
      update: {
        name: l.name,
        parentId: parentId ?? null,
        description: l.description,
        iconName: l.iconName,
        unit: l.unit,
        specTemplate: (l.specTemplate as any) ?? undefined,
        displayColor: l.displayColor,
        sortOrder: l.sortOrder,
      },
    });
  }
  console.log(`  ✅ ${parents.length}개 parent + ${leaves.length}개 leaf BOM 자재 (총 ${parents.length + leaves.length}개)`);
}
