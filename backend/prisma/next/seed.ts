import bcrypt from 'bcryptjs';
import { SEED_ASSET_TYPES, SEED_ASSEMBLIES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES } from '@twin/core';
import { PrismaClient } from '../../src/generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$transaction(async (tx) => {
    // ── Admin 시드 — 카탈로그 skip 여부와 독립(User 수만 검사) ──────────────
    const userCount = await tx.user.count();
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await tx.user.create({
        data: { username: 'admin', passwordHash, role: 'admin' },
      });
      console.log('[seed:next] admin user created');
    } else {
      console.log('[seed:next] users already exist — skip admin seed');
    }

    // Stage 6 이후 카탈로그는 관리자 편집 대상(운영 데이터) — 빈 카탈로그일 때만 시드.
    // (운영 데이터 원복 방지 원칙: 참조데이터 upsert 는 편집 UI 가 없던 Stage 5 까지의 정책)
    const existing = await tx.assetType.count();
    if (existing > 0) {
      console.log('[seed:next] catalog already populated — skip');
      return null;
    }

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
      };
      const type = await tx.assetType.upsert({
        where: { key: t.key },
        update: base,
        create: { key: t.key, ...base },
      });
      // 명세는 delete-and-recreate (타입 편집 전 단계라 참조 없음 — 멱등)
      await tx.assetPortTemplate.deleteMany({ where: { typeId: type.id } });
      for (const [i, p] of t.ports.entries()) {
        await tx.assetPortTemplate.create({
          data: { typeId: type.id, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1, sortOrder: i },
        });
      }
    }

    /* 형판 — **도면에 놓이는 것**은 이것들이다. 부품 목록은 초기 구성이라, 놓고 나서
       그 설비만 따로 고칠 수 있다. */
    for (const a of SEED_ASSEMBLIES) {
      /* 이미 있으면 손대지 않는다 — 형판은 사용자가 고치는 것이라 참조 데이터가 아니다.
         시드는 컨테이너가 뜰 때마다 도는데(배포 멱등성), 덮어쓰면 매 재시작마다
         현장에서 짠 구성이 원본으로 되돌아간다. 첫 배포(빈 DB)에만 만든다. */
      if (await tx.assembly.findUnique({ where: { key: a.key } })) continue;
      const category = await tx.assetCategory.findUniqueOrThrow({ where: { key: a.categoryKey } });
      const asm = await tx.assembly.create({
        data: {
          key: a.key, name: a.name, categoryId: category.id,
          gridCols: a.grid.cols, gridRows: a.grid.rows, sortOrder: a.sortOrder,
        },
      });
      for (const [i, item] of a.items.entries()) {
        const type = await tx.assetType.findUniqueOrThrow({ where: { key: item.typeKey } });
        await tx.assemblyItem.create({
          data: {
            assemblyId: asm.id, typeId: type.id, name: item.name,
            col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
            portCounts: (item.portCounts ?? {}) as object,
            portPositions: (item.portPositions ?? {}) as object,
            sortOrder: i,
          },
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
      portTemplates: await tx.assetPortTemplate.count(),
      assemblies: await tx.assembly.count(),
      cableGroups: await tx.cableGroup.count(),
      cableCategories: await tx.cableCategory.count(),
    };
  }, { timeout: 30_000 });
  if (counts !== null) {
    console.log('[seed:next]', JSON.stringify(counts));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
