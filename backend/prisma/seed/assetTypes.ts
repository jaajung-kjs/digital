import { PrismaClient } from '@prisma/client';

interface AssetTypeSeed {
  /** 로컬 식별 키 (key→id 맵 구성용; DB code 컬럼은 S5에서 드롭됨). */
  key: string;
  name: string;
  /** 카테고리 이름 (로컬 키 — AssetCategory 해소용). */
  category: string;
  role: AssetRole;
  sortOrder: number;
}

type AssetRole = 'rack' | 'ofd' | 'panel' | 'slot' | 'feeder' | 'standalone' | 'device';

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
  { key: 'RACK',      name: '랙',               category: '구조', role: 'rack',       sortOrder: 10 },
  { key: 'OFD',       name: 'OFD(광분배함)',     category: '통신', role: 'ofd',        sortOrder: 20 },
  { key: 'OFD-SLOT',  name: '광슬롯',            category: '통신', role: 'slot',       sortOrder: 21 },
  { key: 'DIST',      name: '분전반',            category: '전원', role: 'panel',      sortOrder: 30 },
  // 통합 노드 모델 — 분전반 내부 회로를 노드 계층으로(분전반→FEEDER). 미배치 내부 노드.
  { key: 'FEEDER',    name: '피더',              category: '전원', role: 'feeder',     sortOrder: 33 },
  { key: 'GROUNDING', name: '접지함체',          category: '구조', role: 'standalone', sortOrder: 31 },
  { key: 'HVAC',      name: '공조설비',          category: '공조', role: 'standalone', sortOrder: 32 },
  { key: 'RTU',       name: 'SCADA RTU',         category: '통신', role: 'device',     sortOrder: 50 },
  { key: 'CHARGER',   name: '충전기',            category: '전원', role: 'device',     sortOrder: 70 },
  { key: 'UPS',       name: 'UPS',               category: '전원', role: 'device',     sortOrder: 80 },
  { key: 'BATTERY',   name: '축전지',            category: '전원', role: 'device',     sortOrder: 90 },
  // ── 광전송 하위종류 ──
  { key: 'OPT-COT',   name: '통합단말',          category: '통신', role: 'device',     sortOrder: 61 },
  { key: 'OPT-TERM',  name: '송변전광단말장치',  category: '통신', role: 'device',     sortOrder: 63 },
  { key: 'PCM',       name: 'PCM',               category: '통신', role: 'device',     sortOrder: 64 },
  // 계통보호전송장치 — 2000·5000 별개 자산(다른 장비).
  { key: 'PITR-2000', name: 'PITR-2000',         category: '통신', role: 'device',     sortOrder: 41 },
  { key: 'PITR-5000', name: 'PITR-5000',         category: '통신', role: 'device',     sortOrder: 42 },
  // 기타 통신장비
  { key: 'SCADA',     name: 'SCADA',             category: '통신', role: 'device',     sortOrder: 51 },
  { key: 'NET-SW',    name: '네트워크스위치',    category: '통신', role: 'device',     sortOrder: 104 },
  { key: 'SPD',       name: '서지보호기',        category: '통신', role: 'device',     sortOrder: 105 },
  { key: 'UTM',       name: 'UTM',               category: '통신', role: 'device',     sortOrder: 108 },
  { key: 'NAC',       name: 'NAC',               category: '통신', role: 'device',     sortOrder: 109 },
  { key: 'PWR-AC',    name: '전원(AC)',          category: '통신', role: 'device',     sortOrder: 113 },
  { key: 'PWR-DC',    name: '전원(DC)',          category: '통신', role: 'device',     sortOrder: 114 },
  // 직할 통신자산 적재 신규 종류 (2026-06-19)
  { key: 'KEPCIT',     name: '권역망전송장치',   category: '통신', role: 'device',     sortOrder: 60 },
  { key: 'OPT-SWITCH', name: '광스위치',         category: '통신', role: 'device',     sortOrder: 145 },
  { key: 'OPT-CONV',   name: '광컨버터',         category: '통신', role: 'device',     sortOrder: 146 },
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

  // 2) 종류 upsert — name 기반 멱등 (기존 행 id 보존).
  const typeKeyToId = new Map<string, string>();
  for (const t of ASSET_TYPE_SEEDS) {
    const lab = ASSET_LABOR[t.key];
    const common = {
      name: t.name, role: t.role, categoryId: categoryId.get(t.category) ?? null,
      sortOrder: t.sortOrder,
      ...(lab ? { laborType: lab.laborType, installHoursPerUnit: lab.install, removeHoursPerUnit: lab.remove, relocateHoursPerUnit: lab.relocate ?? null } : {}),
    };
    const existing = await prisma.assetType.findFirst({ where: { name: t.name } });
    let row;
    if (existing) {
      row = await prisma.assetType.update({ where: { id: existing.id }, data: common });
    } else {
      row = await prisma.assetType.create({ data: common });
    }
    typeKeyToId.set(t.key, row.id);
  }
  console.log(`✅ seeded ${ASSET_TYPE_SEEDS.length} asset types + ${categories.length} categories`);
  return typeKeyToId;
}
