import { describe, test, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('MaterialCategory Seed Data', () => {
  test('총 63개 카테고리 존재', async () => {
    const count = await prisma.materialCategory.count();
    expect(count).toBe(63);
  });

  test('케이블 16종', async () => {
    const count = await prisma.materialCategory.count({ where: { categoryType: 'CABLE' } });
    expect(count).toBe(16);
  });

  test('설비 13종', async () => {
    const count = await prisma.materialCategory.count({ where: { categoryType: 'EQUIPMENT' } });
    expect(count).toBe(13);
  });

  test('부속자재 34종 (9 parent + 25 leaf)', async () => {
    const count = await prisma.materialCategory.count({ where: { categoryType: 'ACCESSORY' } });
    expect(count).toBe(34);
  });

  test('부속자재 parent 9종 (parentId null, specTemplate null)', async () => {
    const count = await prisma.materialCategory.count({
      where: { categoryType: 'ACCESSORY', parentId: null },
    });
    expect(count).toBe(9);
  });

  test('부속자재 leaf 25종 (parentId not null)', async () => {
    const count = await prisma.materialCategory.count({
      where: { categoryType: 'ACCESSORY', parentId: { not: null } },
    });
    expect(count).toBe(25);
  });

  test('모든 leaf 카테고리에 specTemplate 존재', async () => {
    const leafWithoutSpec = await prisma.materialCategory.findMany({
      where: {
        specTemplate: { equals: null },
        OR: [
          { categoryType: { in: ['CABLE', 'EQUIPMENT'] } },
          { categoryType: 'ACCESSORY', parentId: { not: null } },
        ],
      },
    });
    expect(leafWithoutSpec).toHaveLength(0);
  });

  test('모든 leaf 카테고리에 unit 존재', async () => {
    const leafWithoutUnit = await prisma.materialCategory.findMany({
      where: {
        unit: null,
        OR: [
          { categoryType: { in: ['CABLE', 'EQUIPMENT'] } },
          { categoryType: 'ACCESSORY', parentId: { not: null } },
        ],
      },
    });
    expect(leafWithoutUnit).toHaveLength(0);
  });

  test('케이블 displayColor 존재', async () => {
    const withoutColor = await prisma.materialCategory.findMany({
      where: { categoryType: 'CABLE', displayColor: null },
    });
    expect(withoutColor).toHaveLength(0);
  });

  test('CBL-FCV specTemplate format 확인', async () => {
    const cat = await prisma.materialCategory.findUnique({ where: { code: 'CBL-FCV' } });
    expect(cat).not.toBeNull();
    const spec = cat!.specTemplate as any;
    expect(spec.format).toBe('{type} {sq}SQ {cores}C');
    expect(spec.params).toHaveLength(3);
  });

  test('ACC-PIPE 하위 5종 존재', async () => {
    const parent = await prisma.materialCategory.findUnique({ where: { code: 'ACC-PIPE' } });
    expect(parent).not.toBeNull();
    const children = await prisma.materialCategory.count({ where: { parentId: parent!.id } });
    expect(children).toBe(5);
  });

  test('ACC-GND (v3 신규) 하위 3종 존재', async () => {
    const parent = await prisma.materialCategory.findUnique({ where: { code: 'ACC-GND' } });
    expect(parent).not.toBeNull();
    const children = await prisma.materialCategory.count({ where: { parentId: parent!.id } });
    expect(children).toBe(3);
  });

  test('MaterialAlias 50건 이상 존재', async () => {
    const count = await prisma.materialAlias.count();
    expect(count).toBeGreaterThan(50);
  });

  test('UTP alias에서 카테고리 찾기', async () => {
    const alias = await prisma.materialAlias.findUnique({
      where: { aliasName: 'UTP' },
      include: { category: true },
    });
    expect(alias).not.toBeNull();
    expect(alias!.category.code).toBe('CBL-UTP');
  });
});
