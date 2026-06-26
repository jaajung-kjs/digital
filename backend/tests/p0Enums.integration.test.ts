import { describe, it, expect, afterAll } from 'vitest';
import prisma from '../src/config/prisma.js';

describe('P0 enum 제약', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it('cables.source_role 에 잘못된 값은 DB가 거부', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE cables SET source_role='BOGUS' WHERE false`)
    ).rejects.toThrow(); // 'BOGUS' 는 CableRole 멤버 아님 → invalid input value for enum
  });
});
