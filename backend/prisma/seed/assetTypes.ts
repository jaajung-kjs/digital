import { PrismaClient } from '@prisma/client';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'month' | 'select';
  required?: boolean;
  options?: string[];
  group?: string;
  unit?: string;
}

interface AssetTypeSeed {
  /** 로컬 식별 키 (= DB code 컬럼 값, S5 이전까지 유지). */
  key: string;
  name: string;
  /** 카테고리 이름 (로컬 키 — AssetCategory 해소용, DB group 컬럼 미기록). */
  category: string;
  role: AssetRole;
  isContainer: boolean;
  displayColor: string;
  sortOrder: number;
  fieldTemplate: FieldDef[];
  defaultSlotSpan?: number;
}

type AssetRole = 'rack' | 'ofd' | 'panel' | 'slot' | 'feeder' | 'standalone' | 'device';

const ASSET_LIFECYCLE: FieldDef[] = [
  { key: 'model', label: '모델명', type: 'text' },
  { key: 'vendor', label: '제작사', type: 'text' },
  { key: 'mfgYm', label: '제작년월', type: 'month' },
  { key: 'serialNo', label: 'S/N', type: 'text' },
];

const OPT_FIELDS: FieldDef[] = [
  { key: 'remote', label: '대국', type: 'text' },
  { key: 'topology', label: '구성형태', type: 'select', options: ['링', 'P-TO-P'] },
  { key: 'ringName', label: '링 명칭', type: 'text' },
  { key: 'spec', label: '규격', type: 'text' },
  { key: 'introYear', label: '도입년도', type: 'number' },
  { key: 'ipMain', label: 'IP(주)', type: 'text' },
  { key: 'ipExt', label: 'IP(확장)', type: 'text' },
  ...ASSET_LIFECYCLE,
];

// 계통보호전송장치(PITR-2000/5000) 공통 필드. 2000·5000 은 별개 자산(다른 장비)이나 속성 동일.
const PITR_FIELDS: FieldDef[] = [
  { key: 'tlName', label: 'T/L명', type: 'text' },
  { key: 'tlVoltage', label: 'T/L전압', type: 'text' },
  { key: 'typeCode', label: 'TYPE', type: 'text' },
  { key: 'ipCot', label: 'IP(COT)', type: 'text' },
  { key: 'ipRt', label: 'IP(RT)', type: 'text' },
  { key: 'routePrimary', label: '회선경로(주)', type: 'text' },
  { key: 'routeBackup', label: '회선경로(예)', type: 'text' },
  ...ASSET_LIFECYCLE,
];

// 설비 종류코드 → { laborType, install/remove/relocate 개당 시간 } (기존 EQP-* 템플릿에서 도출)
const ASSET_LABOR: Record<string, { laborType: string; install: number; remove: number; relocate?: number }> = {
  RACK:         { laborType: '통신내선공', install: 2.0, remove: 1.0, relocate: 3.0 },
  OFD:          { laborType: '통신내선공', install: 1.5, remove: 0.8 },
  RTU:          { laborType: '통신내선공', install: 4.0, remove: 2.0, relocate: 5.0 },
  SCADA:        { laborType: '통신내선공', install: 4.0, remove: 2.0, relocate: 5.0 },
  UPS:          { laborType: '통신내선공', install: 1.0, remove: 0.5, relocate: 1.5 },
  'NET-SW':     { laborType: '통신내선공', install: 0.5, remove: 0.3 },
  'OPT-SWITCH': { laborType: '통신내선공', install: 0.5, remove: 0.3 },
  UTM:          { laborType: '통신내선공', install: 1.0, remove: 0.5 },
  NAC:          { laborType: '통신내선공', install: 1.0, remove: 0.5 },
  'PITR-2000':  { laborType: '통신내선공', install: 3.0, remove: 1.5 },
  'PITR-5000':  { laborType: '통신내선공', install: 3.0, remove: 1.5 },
  SPD:          { laborType: '통신내선공', install: 0.3, remove: 0.15 },
};

export const ASSET_TYPE_SEEDS: AssetTypeSeed[] = [
  { key: 'RACK', name: '랙', category: '구조', role: 'rack', isContainer: true, displayColor: '#44403c', sortOrder: 10,
    fieldTemplate: [] },
  { key: 'OFD', name: 'OFD(광분배함)', category: '통신', role: 'ofd', isContainer: true, displayColor: '#78716c', sortOrder: 20,
    fieldTemplate: [] },
  { key: 'OFD-SLOT', name: '광슬롯', category: '통신', role: 'slot', isContainer: false, displayColor: '#a8a29e', sortOrder: 21,
    fieldTemplate: [] },
  { key: 'DIST', name: '분전반', category: '전원', role: 'panel', isContainer: true, displayColor: '#78716c', sortOrder: 30,
    fieldTemplate: [] },
  // 통합 노드 모델 — 분전반 내부 회로를 노드 계층으로(분전반→FEEDER). 미배치 내부 노드.
  { key: 'FEEDER', name: '피더', category: '전원', role: 'feeder', isContainer: true, displayColor: '#78716c', sortOrder: 33,
    fieldTemplate: [] },
  { key: 'GROUNDING', name: '접지함체', category: '구조', role: 'standalone', isContainer: false, displayColor: '#44403c', sortOrder: 31,
    fieldTemplate: [] },
  { key: 'HVAC', name: '공조설비', category: '공조', role: 'standalone', isContainer: false, displayColor: '#a8a29e', sortOrder: 32,
    fieldTemplate: [] },
  { key: 'RTU', name: 'SCADA RTU', category: '통신', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 50,
    fieldTemplate: [
      { key: 'hostOffice', label: '급전(분)소', type: 'text' },
      { key: 'voltage', label: '전압', type: 'text' },
      { key: 'substationType', label: '변전소형태', type: 'text' },
      { key: 'operation', label: '운영', type: 'select', options: ['유인', '무인'] },
      { key: 'kind', label: '종류', type: 'text' },
      { key: 'category', label: '구분', type: 'text' },
      { key: 'timeSync', label: '시각동기장치', type: 'text' },
      { key: 'protocol', label: '프로토콜', type: 'text' },
      { key: 'hostCircuits', label: '상위Host회선수', type: 'number' },
      { key: 'scadaLink', label: 'SCADA연계', type: 'text' },
      { key: 'ipAddr', label: 'IP', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { key: 'CHARGER', name: '충전기', category: '전원', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 70,
    fieldTemplate: [
      { key: 'spec', label: '규격', type: 'text' },
      { key: 'formType', label: '형식', type: 'text' },
      { key: 'control', label: '제어', type: 'text' },
      { key: 'inputV', label: '입력', type: 'text' },
      { key: 'outputV', label: '출력V', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { key: 'UPS', name: 'UPS', category: '전원', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 80,
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },
  { key: 'BATTERY', name: '축전지', category: '전원', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 90,
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },

  // ── 광전송 하위종류 ──
  { key: 'OPT-COT', name: '통합단말', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 61, fieldTemplate: OPT_FIELDS },
  { key: 'OPT-TERM', name: '송변전광단말장치', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 63, fieldTemplate: OPT_FIELDS },
  { key: 'PCM', name: 'PCM', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 64, fieldTemplate: OPT_FIELDS },

  // 계통보호전송장치 — 2000·5000 별개 자산(다른 장비). 통신 단일 자산구조(부모자산으로 랙 내부 배치).
  { key: 'PITR-2000', name: 'PITR-2000', category: '통신', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 41, fieldTemplate: PITR_FIELDS },
  { key: 'PITR-5000', name: 'PITR-5000', category: '통신', role: 'device', isContainer: false, displayColor: '#78716c', sortOrder: 42, fieldTemplate: PITR_FIELDS },
  // 기타 통신장비 (랙모듈 카탈로그 통일 — 단일 자산구조라 별도 모듈 종류 불요)
  { key: 'SCADA',  name: 'SCADA', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 51, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'NET-SW', name: '네트워크스위치', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 104, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'SPD',    name: '서지보호기', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 105, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'UTM',    name: 'UTM', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 108, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'NAC',    name: 'NAC', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 109, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'PWR-AC', name: '전원(AC)', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 113, fieldTemplate: ASSET_LIFECYCLE },
  { key: 'PWR-DC', name: '전원(DC)', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 114, fieldTemplate: ASSET_LIFECYCLE },

  // 직할 통신자산 적재 신규 종류 (2026-06-19) — PIU·SPS·DAS·POWERDUCT·MUX 는 사용자 검토로 제외
  // (PIU/SPS=송변전광단말장치 모듈, DAS/전력구감시=별도 자산 불요, MUX=별도 불요).
  // 광전송장치(구 OPT-XPONDER) = 권역망전송장치 = KEPCIT 통일. 광설비 공통 OPT_FIELDS + 세대.
  { key: 'KEPCIT',     name: '권역망전송장치', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 60, fieldTemplate: [
    { key: 'generation', label: '세대', type: 'select', options: ['차세대', '구'] }, ...OPT_FIELDS ] },
  { key: 'OPT-SWITCH', name: '광스위치', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 145, fieldTemplate: [
    { key: 'ipAddress', label: 'IP', type: 'text' }, { key: 'ringNode', label: '링 노드', type: 'number' }, { key: 'maker', label: '제작사', type: 'text' }, { key: 'spec', label: '규격', type: 'text' } ] },
  { key: 'OPT-CONV',   name: '광컨버터', category: '통신', role: 'device', isContainer: false, displayColor: '#a8a29e', sortOrder: 146, fieldTemplate: [
    { key: 'spec', label: '규격', type: 'text' } ] },
];

/**
 * 시드 후 반환: key(= 구 code 문자열) → AssetType.id 맵.
 * rackPresets·jikhalAssets 시드가 이를 받아 categoryId/typeId 해소에 사용한다.
 */
export async function seedAssetTypes(prisma: PrismaClient): Promise<Map<string, string>> {
  // 1) category → AssetCategory 멱등 upsert, 이름→id 맵 구성
  const categories = [...new Set(ASSET_TYPE_SEEDS.map((t) => t.category))];
  const categoryId = new Map<string, string>();
  for (const name of categories) {
    const cat = await prisma.assetCategory.upsert({ where: { name }, update: {}, create: { name } });
    categoryId.set(name, cat.id);
  }

  // 2) 종류 upsert — name 기반 멱등 (기존 행 id 보존). code 컬럼은 S5 드롭 전까지 계속 기록.
  const typeKeyToId = new Map<string, string>();
  for (const t of ASSET_TYPE_SEEDS) {
    const lab = ASSET_LABOR[t.key];
    const common = {
      name: t.name, role: t.role, categoryId: categoryId.get(t.category) ?? null,
      isContainer: t.isContainer, displayColor: t.displayColor, sortOrder: t.sortOrder,
      fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      defaultSlotSpan: t.defaultSlotSpan ?? 1,
      ...(lab ? { laborType: lab.laborType, installHoursPerUnit: lab.install, removeHoursPerUnit: lab.remove, relocateHoursPerUnit: lab.relocate ?? null } : {}),
    };
    const existing = await prisma.assetType.findFirst({ where: { name: t.name } });
    let row;
    if (existing) {
      row = await prisma.assetType.update({ where: { id: existing.id }, data: common });
    } else {
      // code 컬럼이 @unique NOT NULL 이므로 S5 드롭 전까지 계속 기록
      row = await prisma.assetType.create({ data: { code: t.key, ...common } });
    }
    typeKeyToId.set(t.key, row.id);
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types + ${categories.length} categories`);
  return typeKeyToId;
}
