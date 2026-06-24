import { PrismaClient } from '@prisma/client';

interface CableCategorySeed {
  name: string;
  groupName: '전원' | '접지' | '네트워크' | '광' | '제어';
  sortOrder: number;
}

// 16종 (구 MaterialCategory.CABLE 그대로 이전)
const cableCategories: CableCategorySeed[] = [
  { name: 'F-CV 전력케이블',       groupName: '전원',    sortOrder: 1 },
  { name: '난연/내화케이블',        groupName: '전원',    sortOrder: 2 },
  { name: '캡타이어 VCT',          groupName: '전원',    sortOrder: 3 },
  { name: '비닐절연전선 HIV',       groupName: '전원',    sortOrder: 4 },
  { name: 'UTP/S-FTP케이블',       groupName: '네트워크', sortOrder: 5 },
  { name: '광케이블',               groupName: '광',      sortOrder: 6 },
  { name: '광점퍼코드',             groupName: '광',      sortOrder: 7 },
  { name: '브레이크아웃케이블',     groupName: '광',      sortOrder: 8 },
  { name: 'OPGW(광복합가공지선)',   groupName: '광',      sortOrder: 9 },
  { name: '접지전선 IV/F-GV',       groupName: '접지',    sortOrder: 10 },
  { name: '나동연선',               groupName: '접지',    sortOrder: 11 },
  { name: '제어케이블 CVV-S',       groupName: '전원',    sortOrder: 12 },
  { name: '통신케이블 CPEV-S',      groupName: '네트워크', sortOrder: 13 },
  { name: 'PCM케이블',              groupName: '제어',    sortOrder: 14 },
  { name: '동축케이블',             groupName: '제어',    sortOrder: 15 },
  { name: '챔프케이블',             groupName: '네트워크', sortOrder: 16 },
  { name: '데이터/신호케이블',       groupName: '제어',    sortOrder: 17 },
];

// 분류명 → { kind, color, laborType, install/remove m당 시간 } (고정 5분류)
const GROUP_RULES: Record<string, { kind: string; color: string; laborType: string; install: number; remove: number }> = {
  '전원':     { kind: 'POWER',   color: '#ef4444', laborType: '통신내선공', install: 0.03,  remove: 0.015 },
  '네트워크': { kind: 'NETWORK', color: '#3b82f6', laborType: '통신내선공', install: 0.02,  remove: 0.01 },
  '광':       { kind: 'FIBER',   color: '#22c55e', laborType: '통신외선공', install: 0.04,  remove: 0.02 },
  '제어':     { kind: 'CONTROL', color: '#6b7280', laborType: '통신내선공', install: 0.025, remove: 0.012 },
  '접지':     { kind: 'GROUND',  color: '#eab308', laborType: '통신내선공', install: 0.02,  remove: 0.01 },
};

export async function seedCableCategories(prisma: PrismaClient) {
  console.log('🌱 Seeding cable categories...');
  // 1) 그룹 멱등 upsert (이름→id 맵, kind+노무규칙 포함)
  const groupIdByName = new Map<string, string>();
  let order = 1;
  for (const [name, r] of Object.entries(GROUP_RULES)) {
    const g = await prisma.cableGroup.upsert({
      where: { name },
      update: { kind: r.kind, color: r.color, laborType: r.laborType, installHoursPerMeter: r.install, removeHoursPerMeter: r.remove, sortOrder: order },
      create: { name, kind: r.kind, color: r.color, laborType: r.laborType, installHoursPerMeter: r.install, removeHoursPerMeter: r.remove, sortOrder: order },
    });
    groupIdByName.set(name, g.id);
    order++;
  }

  // 2) 카테고리 upsert — name+groupId 기반 멱등 (code @unique 드롭됨)
  for (const cat of cableCategories) {
    const groupId = groupIdByName.get(cat.groupName) ?? null;
    if (!groupId) continue;
    const existing = await prisma.cableCategory.findFirst({ where: { name: cat.name, groupId } });
    if (existing) {
      await prisma.cableCategory.update({ where: { id: existing.id }, data: { sortOrder: cat.sortOrder } });
    } else {
      await prisma.cableCategory.create({ data: { name: cat.name, groupId, sortOrder: cat.sortOrder } });
    }
  }
  console.log(`  ✅ ${cableCategories.length}개 케이블 카테고리 + ${Object.keys(GROUP_RULES).length}개 그룹`);
}
