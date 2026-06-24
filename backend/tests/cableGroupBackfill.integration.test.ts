import { describe, it, expect } from 'vitest';
import prisma from '../src/config/prisma.js';

/** 마이그레이션 백필 검증 — dev DB(seed 선행) 의 케이블 카테고리가 그룹에 연결됐는지. */
describe('CableGroup 백필', () => {
  it('5개 그룹이 색과 함께 생성된다', async () => {
    const groups = await prisma.cableGroup.findMany();
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(['광', '네트워크', '전원', '접지', '제어']);
    expect(groups.find((g) => g.name === '광')?.color).toBe('#22c55e');
  });

  it('카테고리가 displayGroup 으로 groupId 에 연결된다', async () => {
    const cats = await prisma.cableCategory.findMany({ where: { displayGroup: { not: null } }, include: { group: true } });
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) expect(c.group?.name).toBe(c.displayGroup);
  });
});
