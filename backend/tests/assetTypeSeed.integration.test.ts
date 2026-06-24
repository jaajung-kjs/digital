import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../src/config/prisma.js';
import { seedAssetTypes } from '../prisma/seed/assetTypes.js';

/** 시드 멱등 검증 — seed 후 role/categoryId 가 채워진다(실제 dev DB). */
describe('seedAssetTypes role/category', () => {
  beforeAll(async () => { await seedAssetTypes(prisma); });

  it('role-bearing 타입에 role 을 시드한다', async () => {
    const slot = await prisma.assetType.findUnique({ where: { code: 'OFD-SLOT' } });
    const feeder = await prisma.assetType.findUnique({ where: { code: 'FEEDER' } });
    expect(slot?.role).toBe('slot');
    expect(feeder?.role).toBe('feeder');
  });

  it('group 으로 AssetCategory 를 만들고 categoryId 를 연결한다', async () => {
    const t = await prisma.assetType.findUnique({ where: { code: 'OPT-TERM' }, include: { category: true } });
    expect(t?.role).toBe('device');
    expect(t?.category?.name).toBe('통신');
  });
});
