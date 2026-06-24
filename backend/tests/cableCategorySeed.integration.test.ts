import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../src/config/prisma.js';
import { seedCableCategories } from '../prisma/seed/cableCategories.js';

describe('seedCableCategories group', () => {
  beforeAll(async () => { await seedCableCategories(prisma); });
  it('그룹 5개 + 색', async () => {
    const g = await prisma.cableGroup.findMany();
    expect(g.map((x) => x.name).sort()).toEqual(['광', '네트워크', '전원', '접지', '제어']);
  });
  it('카테고리 groupId 연결', async () => {
    const cats = await prisma.cableCategory.findMany({ where: { groupId: { not: null } }, include: { group: true } });
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) expect(c.group).not.toBeNull();
  });
});
