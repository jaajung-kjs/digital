import express, { type Request, type Response, type NextFunction } from 'express';
import { signAccessToken } from '../jwt.js';
import { v2Router } from '../router.js';
import { nextDb } from '../db.js';

export function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', v2Router);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[test 500]', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: String(err) });
  });
  return app;
}

export function authHeader(role: 'admin' | 'viewer' = 'admin'): string {
  return `Bearer ${signAccessToken({ userId: 'test-user', username: 'tester', role })}`;
}

/** 시험 픽스처의 이름 접두 — 안정 접두라 지난 런의 잔재까지 쓸어 담는다. */
export const TEST_PREFIXES = ['t3-'] as const;
const TEST_KEY_PREFIX = 'TEST_';

/**
 * 시험이 만든 것을 **국 단위로** 쓸어 낸다 — 국의 이름이 접두로 시작하면 그 안의 것은 다 시험 것이다.
 * 순서는 FK 가 정한다: 연결 → 광선로 → 설비 → 랙 → 층 → 국 → 지사 → 본부, 그다음 시험 마스터.
 * ⚠ vitest `fileParallelism: false` 에 의존한다(한 파일의 스윕이 다른 파일의 살아 있는 픽스처를 지우지 않게).
 */
export async function sweepTestFixtures(): Promise<void> {
  for (const p of TEST_PREFIXES) {
    const subs = await nextDb.substation.findMany({ where: { name: { startsWith: p } }, select: { id: true } });
    const ids = subs.map((s) => s.id);
    if (ids.length > 0) {
      await nextDb.link.deleteMany({ where: { substationId: { in: ids } } });
      await nextDb.fiberLine.deleteMany({ where: { OR: [{ aSubstationId: { in: ids } }, { bSubstationId: { in: ids } }] } });
      await nextDb.equipment.deleteMany({ where: { substationId: { in: ids } } });
      await nextDb.rack.deleteMany({ where: { substationId: { in: ids } } });
      await nextDb.floor.deleteMany({ where: { substationId: { in: ids } } });
      await nextDb.substation.deleteMany({ where: { id: { in: ids } } });
    }
    await nextDb.branch.deleteMany({ where: { name: { startsWith: p } } });
    await nextDb.headquarters.deleteMany({ where: { name: { startsWith: p } } });
  }
  await nextDb.changeLog.deleteMany({ where: { userId: 'test-user' } });
  await nextDb.equipmentType.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
  await nextDb.rackType.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
  await nextDb.cableType.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
  await nextDb.category.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
}

/** 본부 하나·지사 하나·국 둘 — 국 이름은 `${prefix}-S1`, `${prefix}-S2`. prefix 는 TEST_PREFIXES 로 시작해야 한다. */
export async function makeOrg(prefix: string): Promise<{ hqId: string; branchId: string; s1: string; s2: string }> {
  const hq = await nextDb.headquarters.create({ data: { name: `${prefix}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${prefix}-br`, headquartersId: hq.id } });
  const s1 = await nextDb.substation.create({ data: { name: `${prefix}-S1`, branchId: br.id } });
  const s2 = await nextDb.substation.create({ data: { name: `${prefix}-S2`, branchId: br.id } });
  return { hqId: hq.id, branchId: br.id, s1: s1.id, s2: s2.id };
}

export interface TestMaster {
  categoryId: string; rackTypeId: string; equipmentTypeId: string;
  powerCableId: string; commCableId: string; fiberCableId: string;
}

/** 시험용 마스터 — 키 접두 `TEST_`. 있으면 그대로 쓴다. */
export async function ensureTestMaster(): Promise<TestMaster> {
  const category = await nextDb.category.upsert({
    where: { key: `${TEST_KEY_PREFIX}CAT` }, update: {}, create: { key: `${TEST_KEY_PREFIX}CAT`, name: '시험 분야' },
  });
  const rackType = await nextDb.rackType.upsert({
    where: { key: `${TEST_KEY_PREFIX}RACK` }, update: {},
    create: { key: `${TEST_KEY_PREFIX}RACK`, name: '시험 랙', installManDays: 1, removeManDays: 0.5, relocateManDays: 1 },
  });
  const equipmentType = await nextDb.equipmentType.upsert({
    where: { key: `${TEST_KEY_PREFIX}EQ` }, update: {},
    create: { key: `${TEST_KEY_PREFIX}EQ`, name: '시험 설비', categoryId: category.id, installManDays: 1, removeManDays: 0.5, relocateManDays: 1 },
  });
  const cable = (suffix: string, medium: string) => nextDb.cableType.upsert({
    where: { key: `${TEST_KEY_PREFIX}${suffix}` }, update: {},
    create: { key: `${TEST_KEY_PREFIX}${suffix}`, name: `시험 ${suffix}`, medium },
  });
  return {
    categoryId: category.id, rackTypeId: rackType.id, equipmentTypeId: equipmentType.id,
    powerCableId: (await cable('POWER', 'power')).id,
    commCableId: (await cable('COMM', 'comm')).id,
    fiberCableId: (await cable('FIBER', 'fiber')).id,
  };
}
