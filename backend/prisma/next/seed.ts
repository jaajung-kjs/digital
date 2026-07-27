import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES } from '@twin/core';
import { PrismaClient } from '../../src/generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$transaction(async (tx) => {
    for (const c of SEED_CATEGORIES) {
      await tx.assetCategory.upsert({
        where: { key: c.key },
        update: { name: c.name, sortOrder: c.sortOrder },
        create: { key: c.key, name: c.name, sortOrder: c.sortOrder },
      });
    }

    for (const t of SEED_ASSET_TYPES) {
      const category = await tx.assetCategory.findUniqueOrThrow({ where: { key: t.categoryKey } });
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
      const type = await tx.assetType.upsert({
        where: { key: t.key },
        update: base,
        create: { key: t.key, ...base },
      });
      // 명세는 delete-and-recreate (타입 편집 전 단계라 참조 없음 — 멱등)
      await tx.assetContainerSpec.deleteMany({ where: { typeId: type.id } });
      await tx.assetPortTemplate.deleteMany({ where: { typeId: type.id } });
      await tx.assetLinkRule.deleteMany({ where: { typeId: type.id } });
      for (const [i, c] of t.containers.entries()) {
        await tx.assetContainerSpec.create({
          data: { typeId: type.id, key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts, sortOrder: i },
        });
      }
      for (const [i, p] of t.ports.entries()) {
        await tx.assetPortTemplate.create({
          data: { typeId: type.id, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, sortOrder: i },
        });
      }
      for (const l of t.links) {
        await tx.assetLinkRule.create({
          data: { typeId: type.id, fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping },
        });
      }
    }

    for (const g of SEED_CABLE_GROUPS) {
      await tx.cableGroup.upsert({
        where: { key: g.key },
        update: { name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
        create: { key: g.key, name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
      });
    }

    for (const cat of SEED_CABLE_CATEGORIES) {
      const group = await tx.cableGroup.findUniqueOrThrow({ where: { key: cat.groupKey } });
      await tx.cableCategory.upsert({
        where: { groupId_name: { groupId: group.id, name: cat.name } },
        update: { sortOrder: cat.sortOrder },
        create: { groupId: group.id, name: cat.name, sortOrder: cat.sortOrder },
      });
    }

    return {
      categories: await tx.assetCategory.count(),
      types: await tx.assetType.count(),
      containerSpecs: await tx.assetContainerSpec.count(),
      portTemplates: await tx.assetPortTemplate.count(),
      linkRules: await tx.assetLinkRule.count(),
      cableGroups: await tx.cableGroup.count(),
      cableCategories: await tx.cableCategory.count(),
    };
  }, { timeout: 30_000 });
  console.log('[seed:next]', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
