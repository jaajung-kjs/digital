import bcrypt from 'bcryptjs';
import {
  SEED_ASSET_TYPES, SEED_ASSEMBLIES, SEED_CATEGORIES, SEED_CABLE_GROUPS, SEED_CABLE_CATEGORIES,
  SEED_ORG, DIRECT_BRANCH,
} from '@twin/core';
import { PrismaClient } from '../generated/next-client/index.js';
import { seedJikhalGangwon } from './jikhalGangwon.js';

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

    /*
     * 카탈로그는 관리자 편집 대상(운영 데이터)이다 — **있는 것은 절대 안 건드린다.**
     *
     * 예전에는 「장비 품목이 하나라도 있으면 통째로 건너뛴다」였다. 안쪽이 `upsert` +
     * 포트 선언 delete-and-recreate 라, 그러지 않으면 재시작마다 현장이 고친 선언이
     * 원본으로 되돌아갔기 때문이다.
     *
     * 그런데 그 가드는 **새 표준 품목이 영영 못 들어온다**는 뜻이기도 했다 — 실물을 보고
     * 품목을 하나 더 표준화할 때마다 운영 DB 에 손으로 넣어야 한다. 가드를 통째로 두는
     * 대신 **없는 것만 만든다**로 바꾼다: 새 키는 들어오고, 있는 키는 손대지 않는다.
     */
    for (const c of SEED_CATEGORIES) {
      /* 있으면 손대지 않는다 — 이름·순서를 현장이 고쳤을 수 있다(가드를 푼 뒤로는
         `update` 가 매 시작마다 그것을 되돌린다). */
      await tx.assetCategory.upsert({
        where: { key: c.key },
        update: {},
        create: { key: c.key, name: c.name, sortOrder: c.sortOrder },
      });
    }

    for (const t of SEED_ASSET_TYPES) {
      /* **있으면 손대지 않는다** — 이름도 품셈도 포트 선언도 현장이 고쳤을 수 있다. */
      if (await tx.assetType.findUnique({ where: { key: t.key } })) continue;
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
      const type = await tx.assetType.create({ data: { key: t.key, ...base } });
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
          /* 「1식」 공량 — 통째로 사는 설비(UPS)는 여기 적고 안의 모듈은 0 이다.
             안 적으면(null) 안에 든 자산의 공량을 합쳐 센다. */
          ...(a.labor ?? {}),
        },
      });
      /* 항목 이름 → 만들어진 id. 배선이 이름으로 항목을 가리키므로(시드에는 id 가 없다)
         이 다리가 필요하다. 이름은 한 설비 품목 안에서 유일하다. */
      const itemId = new Map<string, string>();
      for (const [i, item] of a.items.entries()) {
        const type = await tx.assetType.findUniqueOrThrow({ where: { key: item.typeKey } });
        const row = await tx.assemblyItem.create({
          data: {
            assemblyId: asm.id, typeId: type.id, name: item.name,
            col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
            portCounts: (item.portCounts ?? {}) as object,
            portPositions: (item.portPositions ?? {}) as object,
            sortOrder: i,
          },
        });
        itemId.set(item.name, row.id);
      }
      /* 내부 배선 — 놓으면 이 케이블들이 함께 선다(`placeAssembly`). */
      for (const [i, l] of (a.links ?? []).entries()) {
        const aItemId = itemId.get(l.aItem);
        const bItemId = itemId.get(l.bItem);
        if (!aItemId || !bItemId) throw new Error(`배선이 없는 항목을 가리킨다: ${l.aItem} ↔ ${l.bItem}`);
        await tx.assemblyLink.create({
          data: {
            assemblyId: asm.id,
            aItemId, aGroup: l.aGroup, aIndex: l.aIndex,
            bItemId, bGroup: l.bGroup, bIndex: l.bIndex,
            sortOrder: i,
          },
        });
      }
    }

    for (const cat of SEED_CABLE_CATEGORIES) {
      const group = await tx.cableGroup.findUniqueOrThrow({ where: { key: cat.groupKey } });
      /* 있으면 손대지 않는다 — 위와 같은 이유. */
      await tx.cableCategory.upsert({
        where: { groupId_name: { groupId: group.id, name: cat.name } },
        update: {},
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

  /* 강원본부 직할 — 국·OFD·OPGW. 카탈로그가 선 **뒤에**, 그리고 위 트랜잭션 **밖에서**
     돈다(커밋 서비스가 제 트랜잭션을 연다). 첫 배포(빈 DB)에만 만든다. */
  await seedJikhalGangwon();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
