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
}

const ASSET_LIFECYCLE: FieldDef[] = [
  { key: 'model', label: '모델명', type: 'text' },
  { key: 'vendor', label: '제작사', type: 'text' },
  { key: 'mfgYm', label: '제작년월', type: 'month' },
  { key: 'serialNo', label: 'S/N', type: 'text' },
  { key: 'installYm', label: '설치년월', type: 'month' },
  { key: 'replacePlan', label: '교체예정', type: 'text' },
  { key: 'warrantyUntil', label: '하자보수기한', type: 'date' },
];

export const ASSET_TYPE_SEEDS: AssetTypeSeed[] = [
  { code: 'RACK', name: '랙', group: '구조', isContainer: true, displayColor: '#64748b', sortOrder: 10,
    fieldTemplate: [{ key: 'totalU', label: 'U수', type: 'number', unit: 'U' }] },
  { code: 'OFD', name: 'OFD(광분배함)', group: '통신', isContainer: true, displayColor: '#0ea5e9', sortOrder: 20,
    fieldTemplate: [{ key: 'portCount', label: '포트수', type: 'number' }] },
  { code: 'DIST', name: '분전반', group: '전원', isContainer: true, displayColor: '#f59e0b', sortOrder: 30,
    fieldTemplate: [] },
  { code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false, displayColor: '#6366f1', sortOrder: 40,
    fieldTemplate: [
      { key: 'tlName', label: 'T/L명', type: 'text' },
      { key: 'tlVoltage', label: 'T/L전압', type: 'text' },
      { key: 'typeCode', label: 'TYPE', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'RTU', name: 'SCADA RTU', group: '통신', isContainer: false, displayColor: '#8b5cf6', sortOrder: 50,
    fieldTemplate: [
      { key: 'hostOffice', label: '급전(분)소', type: 'text' },
      { key: 'voltage', label: '전압', type: 'text' },
      { key: 'kind', label: '종류', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'OPT-XPONDER', name: '광전송장치', group: '통신', isContainer: false, displayColor: '#06b6d4', sortOrder: 60,
    fieldTemplate: [
      { key: 'remote', label: '대국', type: 'text' },
      { key: 'topology', label: '구성형태', type: 'select', options: ['링', 'P-TO-P'] },
      { key: 'ringName', label: '링 명칭', type: 'text' },
      ...ASSET_LIFECYCLE,
    ] },
  { code: 'CHARGER', name: '충전기', group: '전원', isContainer: false, displayColor: '#ef4444', sortOrder: 70,
    fieldTemplate: ASSET_LIFECYCLE },
  { code: 'UPS', name: 'UPS', group: '전원', isContainer: false, displayColor: '#f97316', sortOrder: 80,
    fieldTemplate: ASSET_LIFECYCLE },
  { code: 'BATTERY', name: '축전지', group: '전원', isContainer: false, displayColor: '#eab308', sortOrder: 90,
    fieldTemplate: ASSET_LIFECYCLE },
];

export async function seedAssetTypes(prisma: PrismaClient): Promise<void> {
  for (const t of ASSET_TYPE_SEEDS) {
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: {
        name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      },
      create: {
        code: t.code, name: t.name, group: t.group, isContainer: t.isContainer,
        displayColor: t.displayColor, sortOrder: t.sortOrder,
        fieldTemplate: t.fieldTemplate, requiredToCreate: ['name'],
      },
    });
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types`);
}
