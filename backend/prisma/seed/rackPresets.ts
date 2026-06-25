import { PrismaClient } from '@prisma/client';

interface RackPresetSeed {
  code: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  // 12-slot 스키마: slotIndex(0..11) + slotSpan(1..12), slotIndex + slotSpan ≤ 12.
  modules: { slotIndex: number; slotSpan: number; categoryKey: string; defaultName: string }[];
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
      { slotIndex: 0, slotSpan: 2, categoryKey: 'PITR-5000', defaultName: 'PITR-5000' },
      { slotIndex: 3, slotSpan: 1, categoryKey: 'NET-SW',    defaultName: '네트워크 스위치' },
      { slotIndex: 5, slotSpan: 2, categoryKey: 'UPS',       defaultName: 'UPS' },
    ],
    sortOrder: 1,
  },
];

export async function seedRackPresets(prisma: PrismaClient, typeKeyToId: Map<string, string>) {
  console.log('🌱 Seeding rack presets...');

  for (const p of rackPresets) {
    // categoryKey → categoryId (AssetType.id) 해소
    const modules = p.modules.map((m) => {
      const categoryId = typeKeyToId.get(m.categoryKey);
      if (!categoryId) {
        console.warn(`  ⚠️  rackPresets: categoryKey "${m.categoryKey}" 해소 실패 — 모듈 건너뜀`);
        return null;
      }
      return { slotIndex: m.slotIndex, slotSpan: m.slotSpan, categoryId, defaultName: m.defaultName };
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    await prisma.rackPreset.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        totalU: p.totalU,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        modules: modules as any,
        description: p.description,
        sortOrder: p.sortOrder,
      },
      update: {
        name: p.name,
        totalU: p.totalU,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        modules: modules as any,
        description: p.description,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`  ✅ ${rackPresets.length}개 랙 프리셋`);
}
