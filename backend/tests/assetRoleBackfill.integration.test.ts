import { describe, it, expect } from 'vitest';
import prisma from '../src/config/prisma.js';

/**
 * 마이그레이션 백필 검증 — 실제 dev DB(seed 선행) 를 읽어 role/categoryId 가
 * 올바르게 설정됐는지 확인한다.
 * 전제: `npm run db:migrate` + `npm run db:seed` 가 선행됨.
 * S5: code 컬럼 드롭 → name 기반 조회로 전환.
 */
describe('asset role/category 백필 (마이그레이션)', () => {
  const roleOf = async (name: string) =>
    (await prisma.assetType.findFirst({ where: { name } }))?.role;

  it('name 으로 role 을 확인한다', async () => {
    expect(await roleOf('랙')).toBe('rack');
    expect(await roleOf('OFD(광분배함)')).toBe('ofd');
    expect(await roleOf('분전반')).toBe('panel');
    expect(await roleOf('접지함체')).toBe('standalone');
    expect(await roleOf('공조설비')).toBe('standalone');
    expect(await roleOf('광슬롯')).toBe('slot');
    expect(await roleOf('피더')).toBe('feeder');
    expect(await roleOf('송변전광단말장치')).toBe('device');
  });

  it('AssetCategory 를 만들고 categoryId 를 연결한다', async () => {
    const rack = await prisma.assetType.findFirst({
      where: { name: '랙' }, include: { category: true },
    });
    expect(rack?.categoryId).toBeTruthy();
    expect(rack?.category?.name).toBe('구조');
  });
});
