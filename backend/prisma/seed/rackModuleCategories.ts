import { PrismaClient } from '@prisma/client';

interface RackModuleCategorySeed {
  code: string;
  name: string;
  description?: string;
  displayColor?: string;
  sortOrder: number;
}

// 12종 — 사용자 명시 (P6)
const rackModuleCategories: RackModuleCategorySeed[] = [
  { code: 'EQP-PITR-2000', name: 'PITR-2000', displayColor: '#a855f7', sortOrder: 1 },
  { code: 'EQP-OPT-TERM',  name: '송변전광단말장치', displayColor: '#a855f7', sortOrder: 2 },
  { code: 'EQP-PITR-5000', name: 'PITR-5000', displayColor: '#a855f7', sortOrder: 3 },
  { code: 'EQP-NET-SW',    name: '네트워크스위치', displayColor: '#3b82f6', sortOrder: 4 },
  { code: 'EQP-SPD',       name: '서지보호기', displayColor: '#eab308', sortOrder: 5 },
  { code: 'EQP-SCADA',     name: 'SCADA', displayColor: '#ef4444', sortOrder: 6 },
  { code: 'EQP-RTU',       name: 'RTU', displayColor: '#ef4444', sortOrder: 7 },
  { code: 'EQP-UTM',       name: 'UTM', displayColor: '#06b6d4', sortOrder: 8 },
  { code: 'EQP-NAC',       name: 'NAC', displayColor: '#06b6d4', sortOrder: 9 },
  { code: 'EQP-UPS',       name: 'UPS', displayColor: '#f97316', sortOrder: 10 },
  { code: 'EQP-CHARGER',   name: '충전기', displayColor: '#f97316', sortOrder: 11 },
  { code: 'EQP-BATTERY',   name: '축전지', displayColor: '#f97316', sortOrder: 12 },
  { code: 'EQP-PWR-AC',    name: '전원(AC)', displayColor: '#f97316', sortOrder: 13 },
  { code: 'EQP-PWR-DC',    name: '전원(DC)', displayColor: '#f97316', sortOrder: 14 },
];

export async function seedRackModuleCategories(prisma: PrismaClient) {
  console.log('🌱 Seeding rack module categories...');
  for (const cat of rackModuleCategories) {
    await prisma.rackModuleCategory.upsert({
      where: { code: cat.code },
      create: { ...cat },
      update: {
        name: cat.name,
        description: cat.description,
        displayColor: cat.displayColor,
        sortOrder: cat.sortOrder,
      },
    });
  }
  console.log(`  ✅ ${rackModuleCategories.length}개 랙 모듈 카테고리`);
}
