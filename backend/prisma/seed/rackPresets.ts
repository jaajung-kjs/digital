import { PrismaClient } from '@prisma/client';

interface RackPresetSeed {
  code: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  modules: { slotU: number; heightU: number; categoryCode: string; defaultName: string }[];
  description?: string;
  sortOrder: number;
}

// 1개 — PITR-5000 표준 랙 (사용자 결정)
const rackPresets: RackPresetSeed[] = [
  {
    code: 'PRESET-PITR5000-STD',
    name: 'PITR-5000 표준 랙',
    totalU: 42,
    canvasWidth: 80,
    canvasHeight: 200,
    description: 'PITR-5000 본체 + 네트워크스위치 + UPS 표준 구성 (임시)',
    modules: [
      { slotU: 1, heightU: 2, categoryCode: 'EQP-PITR-5000', defaultName: 'PITR-5000' },
      { slotU: 4, heightU: 1, categoryCode: 'EQP-NET-SW',    defaultName: '네트워크 스위치' },
      { slotU: 6, heightU: 2, categoryCode: 'EQP-UPS',       defaultName: 'UPS' },
    ],
    sortOrder: 1,
  },
];

export async function seedRackPresets(prisma: PrismaClient) {
  console.log('🌱 Seeding rack presets...');
  for (const p of rackPresets) {
    await prisma.rackPreset.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        totalU: p.totalU,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        modules: p.modules as any,
        description: p.description,
        sortOrder: p.sortOrder,
      },
      update: {
        name: p.name,
        totalU: p.totalU,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        modules: p.modules as any,
        description: p.description,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`  ✅ ${rackPresets.length}개 랙 프리셋`);
}
