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

export const ASSET_TYPE_SEEDS: AssetTypeSeed[] = [
  { code: 'RACK', name: '랙', group: '구조', isContainer: true, displayColor: '#44403c', sortOrder: 10,
    placementKind: 'RACK',
    fieldTemplate: [] },
  { code: 'OFD', name: 'OFD(광분배함)', group: '통신', isContainer: true, displayColor: '#78716c', sortOrder: 20,
    placementKind: 'OFD', connectionKind: 'conduit',
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
  { code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false, displayColor: '#78716c', sortOrder: 40,
    fieldTemplate: [
      { key: 'tlName', label: 'T/L명', type: 'text' },
      { key: 'tlVoltage', label: 'T/L전압', type: 'text' },
      { key: 'typeCode', label: 'TYPE', type: 'text' },
      { key: 'ipCot', label: 'IP(COT)', type: 'text' },
      { key: 'ipRt', label: 'IP(RT)', type: 'text' },
      { key: 'routePrimary', label: '회선경로(주)', type: 'text' },
      { key: 'routeBackup', label: '회선경로(예)', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
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
  { code: 'OPT-XPONDER', name: '광전송장치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 60,
    fieldTemplate: OPT_FIELDS },
  { code: 'CHARGER', name: '충전기', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 70,
    connectionKind: 'distributor',
    fieldTemplate: [
      { key: 'spec', label: '규격', type: 'text' },
      { key: 'formType', label: '형식', type: 'text' },
      { key: 'control', label: '제어', type: 'text' },
      { key: 'inputV', label: '입력', type: 'text' },
      { key: 'outputV', label: '출력V', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'UPS', name: 'UPS', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 80,
    connectionKind: 'distributor',
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },
  { code: 'BATTERY', name: '축전지', group: '전원', isContainer: false, displayColor: '#78716c', sortOrder: 90,
    fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE] },

  // ── 광전송 하위종류 ──
  { code: 'OPT-COT', name: '통합단말', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 61, fieldTemplate: OPT_FIELDS },
  { code: 'OPT-SMALL', name: '소형광', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 62, fieldTemplate: OPT_FIELDS },
  { code: 'OPT-TRANS', name: '송변전광', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 63, fieldTemplate: OPT_FIELDS },
  { code: 'PCM', name: 'PCM', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 64, fieldTemplate: OPT_FIELDS },

  // ── 흡수된 랙 모듈 카테고리 (구 RackModuleCategory) — placementKind=null(모듈) ──
  // 랙 프리셋(rackPresets.ts)이 이 code 로 모듈을 참조한다. 기존 카테고리는
  // defaultSlotSpan 을 갖지 않았으므로 모두 기본값 1.
  { code: 'EQP-PITR-2000', name: 'PITR-2000', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 101, fieldTemplate: [] },
  { code: 'EQP-OPT-TERM',  name: '송변전광단말장치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 102, fieldTemplate: [] },
  { code: 'EQP-PITR-5000', name: 'PITR-5000', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 103, fieldTemplate: [] },
  { code: 'EQP-NET-SW',    name: '네트워크스위치', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 104, fieldTemplate: [] },
  { code: 'EQP-SPD',       name: '서지보호기', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 105, fieldTemplate: [] },
  { code: 'EQP-SCADA',     name: 'SCADA', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 106, fieldTemplate: [] },
  { code: 'EQP-RTU',       name: 'RTU', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 107, fieldTemplate: [] },
  { code: 'EQP-UTM',       name: 'UTM', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 108, fieldTemplate: [] },
  { code: 'EQP-NAC',       name: 'NAC', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 109, fieldTemplate: [] },
  { code: 'EQP-UPS',       name: 'UPS', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 110, fieldTemplate: [] },
  { code: 'EQP-CHARGER',   name: '충전기', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 111, fieldTemplate: [] },
  { code: 'EQP-BATTERY',   name: '축전지', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 112, fieldTemplate: [] },
  { code: 'EQP-PWR-AC',    name: '전원(AC)', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 113, fieldTemplate: [] },
  { code: 'EQP-PWR-DC',    name: '전원(DC)', group: '통신', isContainer: false, displayColor: '#a8a29e', sortOrder: 114, fieldTemplate: [] },
];

export async function seedAssetTypes(prisma: PrismaClient): Promise<void> {
  for (const t of ASSET_TYPE_SEEDS) {
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: {
        name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
        placementKind: t.placementKind ?? null, connectionKind: t.connectionKind ?? null, defaultSlotSpan: t.defaultSlotSpan ?? 1,
      },
      create: {
        code: t.code, name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
        placementKind: t.placementKind ?? null, connectionKind: t.connectionKind ?? null, defaultSlotSpan: t.defaultSlotSpan ?? 1,
      },
    });
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types`);
}
