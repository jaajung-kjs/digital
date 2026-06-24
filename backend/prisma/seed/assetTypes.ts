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
  code: string;
  name: string;
  group: string;
  isContainer: boolean;
  displayColor: string;
  sortOrder: number;
  fieldTemplate: FieldDef[];
  placementKind?: string | null;
  connectionKind?: string;
  defaultSlotSpan?: number;
}

type AssetRole = 'rack' | 'ofd' | 'panel' | 'slot' | 'feeder' | 'standalone' | 'device';

/** 마이그레이션 백필과 동일 규칙으로 role 파생 (단일 소스). */
function deriveRole(t: AssetTypeSeed): AssetRole {
  if (t.placementKind === 'RACK') return 'rack';
  if (t.placementKind === 'OFD' || t.code === 'OFD') return 'ofd';
  if (t.placementKind === 'DIST' || t.code === 'DIST') return 'panel';
  if (t.placementKind === 'GROUNDING' || t.placementKind === 'HVAC') return 'standalone';
  if (t.connectionKind === 'conduit') return 'slot';
  if (t.connectionKind === 'distributor') return 'feeder';
  return 'device';
}

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
  { code: 'RACK', name: '랙', group: '구조', isContainer: true, displayColor: '#44403c', sortOrder: 10,
    placementKind: 'RACK',
    fieldTemplate: [] },
  { code: 'OFD', name: 'OFD(광분배함)', group: '통신', isContainer: true, displayColor: '#78716c', sortOrder: 20,
    // OFD 는 일반 컨테이너(connectionKind 없음). conduit 인 건 자식 OFD-SLOT.
    placementKind: 'OFD',
    fieldTemplate: [] },
  { code: 'OFD-SLOT', name: '광슬롯', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 21,
    connectionKind: 'conduit',
    fieldTemplate: [] },
  { code: 'DIST', name: '분전반', group: '전원', isContainer: true, displayColor: '#78716c', sortOrder: 30,
    placementKind: 'DIST',
    fieldTemplate: [] },
  // 통합 노드 모델 — 분전반 내부 회로를 노드 계층으로(분전반→FEEDER). 미배치 내부 노드(placementKind 없음).
  { code: 'FEEDER', name: '피더', group: '전원', isContainer: true, displayColor: '#78716c', sortOrder: 33,
    connectionKind: 'distributor',
    fieldTemplate: [] },
  { code: 'GROUNDING', name: '접지함체', group: '구조', isContainer: false, displayColor: '#44403c', sortOrder: 31,
    placementKind: 'GROUNDING', fieldTemplate: [] },
  { code: 'HVAC', name: '공조설비', group: '공조', isContainer: false, displayColor: '#a8a29e', sortOrder: 32,
    placementKind: 'HVAC', fieldTemplate: [] },
  { code: 'RTU', name: 'SCADA RTU', group: '통신', isContainer: false, displayColor: '#78716c', sortOrder: 50,
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
  { code: 'CHARGER', name: '충전기', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 70,
    fieldTemplate: [
      { key: 'spec', label: '규격', type: 'text' },
      { key: 'formType', label: '형식', type: 'text' },
      { key: 'control', label: '제어', type: 'text' },
      { key: 'inputV', label: '입력', type: 'text' },
      { key: 'outputV', label: '출력V', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'UPS', name: 'UPS', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 80,
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },
  { code: 'BATTERY', name: '축전지', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 90,
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },

  // ── 광전송 하위종류 ──
  { code: 'OPT-COT', name: '통합단말', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 61, fieldTemplate: OPT_FIELDS },
  { code: 'OPT-TERM', name: '송변전광단말장치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 63, fieldTemplate: OPT_FIELDS },
  { code: 'PCM', name: 'PCM', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 64, fieldTemplate: OPT_FIELDS },

  // 계통보호전송장치 — 2000·5000 별개 자산(다른 장비). 통신 단일 자산구조(부모자산으로 랙 내부 배치).
  { code: 'PITR-2000', name: 'PITR-2000', group: '통신', isContainer: false, displayColor: '#78716c', sortOrder: 41, fieldTemplate: PITR_FIELDS },
  { code: 'PITR-5000', name: 'PITR-5000', group: '통신', isContainer: false, displayColor: '#78716c', sortOrder: 42, fieldTemplate: PITR_FIELDS },
  // 기타 통신장비 (랙모듈 카탈로그 통일 — 단일 자산구조라 별도 모듈 종류 불요)
  { code: 'SCADA',  name: 'SCADA', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 51, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'NET-SW', name: '네트워크스위치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 104, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'SPD',    name: '서지보호기', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 105, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'UTM',    name: 'UTM', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 108, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'NAC',    name: 'NAC', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 109, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'PWR-AC', name: '전원(AC)', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 113, fieldTemplate: ASSET_LIFECYCLE },
  { code: 'PWR-DC', name: '전원(DC)', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 114, fieldTemplate: ASSET_LIFECYCLE },

  // 직할 통신자산 적재 신규 종류 (2026-06-19) — PIU·SPS·DAS·POWERDUCT·MUX 는 사용자 검토로 제외
  // (PIU/SPS=송변전광단말장치 모듈, DAS/전력구감시=별도 자산 불요, MUX=별도 불요).
  // 광전송장치(구 OPT-XPONDER) = 권역망전송장치 = KEPCIT 통일. 광설비 공통 OPT_FIELDS + 세대.
  { code: 'KEPCIT',     name: '권역망전송장치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 60, fieldTemplate: [
    { key: 'generation', label: '세대', type: 'select', options: ['차세대', '구'] }, ...OPT_FIELDS ] },
  { code: 'OPT-SWITCH', name: '광스위치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 145, fieldTemplate: [
    { key: 'ipAddress', label: 'IP', type: 'text' }, { key: 'ringNode', label: '링 노드', type: 'number' }, { key: 'maker', label: '제작사', type: 'text' }, { key: 'spec', label: '규격', type: 'text' } ] },
  { code: 'OPT-CONV',   name: '광컨버터', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 146, fieldTemplate: [
    { key: 'spec', label: '규격', type: 'text' } ] },
];

export async function seedAssetTypes(prisma: PrismaClient): Promise<void> {
  // 1) group → AssetCategory 멱등 upsert, 이름→id 맵 구성
  const groups = [...new Set(ASSET_TYPE_SEEDS.map((t) => t.group))];
  const categoryId = new Map<string, string>();
  for (const name of groups) {
    const cat = await prisma.assetCategory.upsert({ where: { name }, update: {}, create: { name } });
    categoryId.set(name, cat.id);
  }

  // 2) 종류 upsert (role 파생 + categoryId 연결 + 노무규칙)
  for (const t of ASSET_TYPE_SEEDS) {
    const lab = ASSET_LABOR[t.code];
    const common = {
      name: t.name, group: t.group, role: deriveRole(t), categoryId: categoryId.get(t.group) ?? null,
      isContainer: t.isContainer, displayColor: t.displayColor, sortOrder: t.sortOrder,
      fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      placementKind: t.placementKind ?? null, connectionKind: t.connectionKind ?? null,
      defaultSlotSpan: t.defaultSlotSpan ?? 1,
      ...(lab ? { laborType: lab.laborType, installHoursPerUnit: lab.install, removeHoursPerUnit: lab.remove, relocateHoursPerUnit: lab.relocate ?? null } : {}),
    };
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: common,
      create: { code: t.code, ...common },
    });
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types + ${groups.length} categories`);
}
