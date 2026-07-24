import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES } from '@twin/core';
import { PrismaClient } from '../../src/generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  for (const c of SEED_CATEGORIES) {
    await prisma.assetCategory.upsert({
      where: { key: c.key },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: { key: c.key, name: c.name, sortOrder: c.sortOrder },
    });
  }

  for (const t of SEED_ASSET_TYPES) {
    const category = await prisma.assetCategory.findUniqueOrThrow({ where: { key: t.categoryKey } });
    const base = {
      name: t.name,
      categoryId: category.id,
      sortOrder: t.sortOrder,
      placeable: t.placement.placeable,
      defaultWidth: t.placement.defaultWidth ?? null,
      defaultHeight: t.placement.defaultHeight ?? null,
      laborType: t.labor.laborType,
      installHours: t.labor.installHours,
      removeHours: t.labor.removeHours,
      relocateHours: t.labor.relocateHours,
      fieldDefs: t.fields,
    };
    const type = await prisma.assetType.upsert({
      where: { key: t.key },
      update: base,
      create: { key: t.key, ...base },
    });
    // 명세는 delete-and-recreate (타입 편집 전 단계라 참조 없음 — 멱등)
    await prisma.assetContainerSpec.deleteMany({ where: { typeId: type.id } });
    await prisma.assetPortTemplate.deleteMany({ where: { typeId: type.id } });
    await prisma.assetLinkRule.deleteMany({ where: { typeId: type.id } });
    for (const [i, c] of t.containers.entries()) {
      await prisma.assetContainerSpec.create({
        data: { typeId: type.id, key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts, sortOrder: i },
      });
    }
    for (const [i, p] of t.ports.entries()) {
      await prisma.assetPortTemplate.create({
        data: { typeId: type.id, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, sortOrder: i },
      });
    }
    for (const l of t.links) {
      await prisma.assetLinkRule.create({
        data: { typeId: type.id, fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping },
      });
    }
  }

  for (const g of SEED_CABLE_GROUPS) {
    await prisma.cableGroup.upsert({
      where: { key: g.key },
      update: { name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
      create: { key: g.key, name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
    });
  }

  for (const cat of SEED_CABLE_CATEGORIES) {
    const group = await prisma.cableGroup.findUniqueOrThrow({ where: { key: cat.groupKey } });
    await prisma.cableCategory.upsert({
      where: { groupId_name: { groupId: group.id, name: cat.name } },
      update: { sortOrder: cat.sortOrder },
      create: { groupId: group.id, name: cat.name, sortOrder: cat.sortOrder },
    });
  }

  const counts = {
    categories: await prisma.assetCategory.count(),
    types: await prisma.assetType.count(),
    containerSpecs: await prisma.assetContainerSpec.count(),
    portTemplates: await prisma.assetPortTemplate.count(),
    linkRules: await prisma.assetLinkRule.count(),
    cableGroups: await prisma.cableGroup.count(),
    cableCategories: await prisma.cableCategory.count(),
  };
  console.log('[seed:next]', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
