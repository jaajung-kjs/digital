import bcrypt from 'bcryptjs';
import { SEED_ORG, DIRECT_BRANCH } from '@twin/core';
import { PrismaClient } from '../generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    /* admin 이 없으면 만든다 — 있는 계정의 비밀번호는 건드리지 않는다(현장이 바꾼 값을 되돌리면 사고다). */
    const admin = await tx.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await tx.user.create({ data: { username: 'admin', passwordHash, role: 'admin' } });
      console.log('[seed:next] admin user created');
    } else {
      console.log('[seed:next] admin already exists — skip (비밀번호는 건드리지 않는다)');
    }

    /* 조직 — 본부가 하나도 없을 때만(재시작마다 도는 시드가 현장이 고친 조직을 되돌리면 안 된다). */
    if ((await tx.headquarters.count()) === 0) {
      for (const [i, hq] of SEED_ORG.entries()) {
        const created = await tx.headquarters.create({ data: { name: hq.name, sortOrder: i } });
        for (const [j, name] of [DIRECT_BRANCH, ...hq.branches].entries()) {
          await tx.branch.create({ data: { name, headquartersId: created.id, sortOrder: j } });
        }
      }
      console.log(`[seed:next] org created — 본부 ${SEED_ORG.length}`);
    } else {
      console.log('[seed:next] org already exists — skip');
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
