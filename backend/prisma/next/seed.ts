import bcrypt from 'bcryptjs';
import {
  SEED_ASSET_TYPES, SEED_ASSEMBLIES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES,
  SEED_ORG, DIRECT_BRANCH,
} from '@twin/core';
import { PrismaClient } from '../../src/generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$transaction(async (tx) => {
    /*
     * ── Admin 시드 — **admin 이 없으면** 만든다(사용자 수가 아니라). ────────────
     *
     * 예전에는 「사용자가 하나도 없을 때만」이었다. 그런데 시험이 남긴 계정 하나만 있어도
     * 그 조건이 거짓이 되어, admin 이 지워진 개발 DB 에서는 다시 만들어지지 않았다 —
     * 시드를 몇 번 돌려도 로그인이 안 됐다(실제로 그렇게 막혔다).
     *
     * 있는 계정의 비밀번호는 **건드리지 않는다**: 배포 뒤 현장이 바꾼 비밀번호를 시드가
     * 재시작마다 admin123 으로 되돌리면 그게 더 큰 사고다.
     */
    const admin = await tx.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await tx.user.create({ data: { username: 'admin', passwordHash, role: 'admin' } });
      console.log('[seed:next] admin user created');
    } else {
      console.log('[seed:next] admin already exists — skip (비밀번호는 건드리지 않는다)');
    }

    /*
     * 조직 — **본부가 하나도 없을 때만** 세운다.
     *
     * 시드는 컨테이너가 뜰 때마다 도는데(배포 멱등성), 조직은 현장이 고치는 운영 데이터라
     * 덮어쓰면 재시작마다 지사 이름과 순서가 원본으로 되돌아간다. 변전소는 넣지 않는다
     * (`SEED_ORG` 주석 참고 — 반쯤 맞는 목록은 지우는 수고를 만든다).
     */
    if ((await tx.headquarters.count()) === 0) {
      for (const [i, hq] of SEED_ORG.entries()) {
        const created = await tx.headquarters.create({ data: { name: hq.name, sortOrder: i } });
        /* 「직할」이 늘 첫 줄이다 — 본부가 직접 맡는 사업소이고, 어느 본부에나 있다. */
        for (const [j, name] of [DIRECT_BRANCH, ...hq.branches].entries()) {
          await tx.branch.create({ data: { name, headquartersId: created.id, sortOrder: j } });
        }
      }
      console.log(`[seed:next] org created — 본부 ${SEED_ORG.length}, 사업소 ${SEED_ORG.reduce((n, h) => n + h.branches.length + 1, 0)}`);
    } else {
      console.log('[seed:next] org already exists — skip');
    }

    /*
     * 케이블 그룹은 **고정 어휘**다 — 사용자가 늘리거나 지울 수 없고(`PORT_KINDS` 가
     * 그 목록이다), 고치는 것은 이름·색뿐이다. 그래서 아래 카탈로그 skip 가드보다
     * 위에 둔다: 어휘에 종류가 하나 늘면 이미 쓰고 있는 DB 에도 그 그룹이 생겨야 한다
     * (안 그러면 그 매체의 포트에 물릴 케이블 종류가 하나도 없다).
     *
     * **없는 것만 만든다** — 이름·색은 현장이 고친 값일 수 있어 덮지 않는다(대장에서
     * 고칠 수 있다). 어휘에서 이름을 바꾸는 경우에만 손으로 한 번 맞춰 준다.
     */
    for (const g of SEED_CABLE_GROUPS) {
      await tx.cableGroup.upsert({
        where: { key: g.key },
        update: {},
        create: { key: g.key, name: g.name, color: g.color, sortOrder: g.sortOrder },
      });
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
        laborCode: t.labor.laborCode,
        unitPrice: t.labor.unitPrice,
        installManDays: t.labor.installManDays,
        removeManDays: t.labor.removeManDays,
        relocateManDays: t.labor.relocateManDays,
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
          data: { typeId: type.id, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1, variant: p.variant ?? null, sortOrder: i },
        });
      }
    }

    /* 설비 종류 — **도면에 놓이는 것**은 이것들이다. 부품 목록은 초기 구성이라, 놓고 나서
       그 설비만 따로 고칠 수 있다. */
    for (const a of SEED_ASSEMBLIES) {
      /* 이미 있으면 손대지 않는다 — 설비 종류는 사용자가 고치는 것이라 참조 데이터가 아니다.
         시드는 컨테이너가 뜰 때마다 도는데(배포 멱등성), 덮어쓰면 매 재시작마다
         현장에서 짠 구성이 원본으로 되돌아간다. 첫 배포(빈 DB)에만 만든다. */
      if (await tx.assembly.findUnique({ where: { key: a.key } })) continue;
      const category = await tx.assetCategory.findUniqueOrThrow({ where: { key: a.categoryKey } });
      const asm = await tx.assembly.create({
        data: {
          key: a.key, name: a.name, categoryId: category.id,
          sortOrder: a.sortOrder,
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

    for (const cat of SEED_CABLE_CATEGORIES) {
      const group = await tx.cableGroup.findUniqueOrThrow({ where: { key: cat.groupKey } });
      await tx.cableCategory.upsert({
        where: { groupId_name: { groupId: group.id, name: cat.name } },
        update: { sortOrder: cat.sortOrder },
        create: {
          groupId: group.id, name: cat.name, sortOrder: cat.sortOrder,
          laborCode: cat.laborCode, unitPrice: cat.unitPrice,
          installManDays: cat.installManDays, removeManDays: cat.removeManDays,
        },
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
