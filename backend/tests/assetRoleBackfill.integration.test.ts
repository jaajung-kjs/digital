import { describe, it, expect } from 'vitest';
import prisma from '../src/config/prisma.js';

/**
 * 마이그레이션 백필 검증 — 실제 dev DB(seed 선행) 를 읽어 role/categoryId 가
 * 기존 분류 필드에서 올바르게 파생됐는지 확인한다.
 * 전제: `npm run db:migrate` + `npm run db:seed` 가 선행됨.
 */
describe('asset role/category 백필 (마이그레이션)', () => {
  const roleOf = async (code: string) =>
    (await prisma.assetType.findUnique({ where: { code } }))?.role;

  it('placement/connection/code 에서 role 을 파생한다', async () => {
    expect(await roleOf('RACK')).toBe('rack');
    expect(await roleOf('OFD')).toBe('ofd');
    expect(await roleOf('DIST')).toBe('panel');
    expect(await roleOf('GROUNDING')).toBe('standalone');
    expect(await roleOf('HVAC')).toBe('standalone');
    expect(await roleOf('OFD-SLOT')).toBe('slot');
    expect(await roleOf('FEEDER')).toBe('feeder');
    expect(await roleOf('OPT-TERM')).toBe('device');
  });

  it('group_name 으로 AssetCategory 를 만들고 categoryId 를 연결한다', async () => {
    const rack = await prisma.assetType.findUnique({
      where: { code: 'RACK' }, include: { category: true },
    });
    expect(rack?.categoryId).toBeTruthy();
    expect(rack?.category?.name).toBe('구조'); // RACK.group_name === '구조'
  });
});
