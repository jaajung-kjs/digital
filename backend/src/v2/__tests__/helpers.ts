import express, { type Request, type Response, type NextFunction } from 'express';
import { signAccessToken } from '../jwt.js';
import { v2Router } from '../router.js';
import { nextDb } from '../db.js';

export function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', v2Router);
  // Fallback 500 handler for errors passed via next(err) from v2Router
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[test 500]', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: String(err) });
  });
  return app;
}

/**
 * v2 jwt(signAccessToken)로 Bearer 헤더를 생성한다.
 * v2 auth.middleware 가 동일한 v2 jwt(verifyAccessToken)로 검증하므로
 * v2 인증 경로를 완전히 통과한다.
 * 기존 테스트의 동기 호출 패턴을 유지하기 위해 동기 함수로 제공한다.
 */
export function authHeader(role: 'admin' | 'viewer' = 'admin'): string {
  return `Bearer ${signAccessToken({ userId: 'test-user', username: 'tester', role })}`;
}

/**
 * 안정 prefix 기반 전체 스윕 — 과거 런 잔재까지 일괄 회수.
 * 각 테스트 파일의 beforeAll/afterAll 에서 호출한다.
 *
 * nameStartsWith: 조직 계층·자산 이름 prefix (타임스탬프 없는 안정 prefix)
 * keyStartsWith: 카탈로그 키 prefix (catalog.crud KEY_PREFIX 접두사)
 *
 * ⚠ vitest `fileParallelism: false` 에 의존한다 — 파일 병렬 실행을 켜면
 *   한 파일의 beforeAll 스윕이 다른 파일의 살아있는 픽스처를 지운다.
 * ⚠ 케이블은 변전소 이름 prefix 경유로만 지운다. 케이블 픽스처를 새로 만들 때
 *   소속 변전소 이름에도 같은 prefix 를 붙여야 회수된다(카테고리명만 prefix면 잔존).
 */
export async function sweepTestFixtures(): Promise<void> {
  const nameStartsWith = ['t4-cb-', 't2a-', 't5-rc-', 't6-bg-', 't7-rh-'];
  const keyStartsWith = ['TEST_'];

  // 1. cables (substation name prefix 경유)
  for (const p of nameStartsWith) {
    try { await nextDb.cable.deleteMany({ where: { substation: { name: { startsWith: p } } } }); } catch { /* ignore */ }
  }
  // 2. catalog: assets by type key
  for (const p of keyStartsWith) {
    try { await nextDb.asset.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetPortTemplate.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetType.deleteMany({ where: { key: { startsWith: p } } }); } catch { /* ignore */ }
    try { await nextDb.assetCategory.deleteMany({ where: { key: { startsWith: p } } }); } catch { /* ignore */ }
  }
  /* 3. 자산 — **그 변전소에 있는 것 전부**(자식 먼저).
        이름 접두로만 지우면 시험이 만든 것 중 이름이 다른 것이 남는다: 설비 품목으로 놓은
        슬롯은 구성이 준 이름(「슬롯 1」)을 갖는다. 하나라도 남으면 변전소가 FK 에 걸려
        지워지지 않고, 그 픽스처가 다음 사람 화면의 조직 트리에 그대로 선다(실제로 그랬다). */
  for (const p of nameStartsWith) {
    try { await nextDb.asset.deleteMany({ where: { substation: { name: { startsWith: p } }, parentAssetId: { not: null } } }); } catch { /* ignore */ }
    try { await nextDb.asset.deleteMany({ where: { substation: { name: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.asset.deleteMany({ where: { name: { startsWith: p }, parentAssetId: { not: null } } }); } catch { /* ignore */ }
    try { await nextDb.asset.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
  }
  // 4. cableCategory (catalog.crud 가 `${uniq}-ccat` 이름으로 생성 — 케이블 삭제 후)
  for (const p of nameStartsWith) {
    try { await nextDb.cableCategory.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
  }
  // 5. floors, substations, branches, headquarters
  for (const p of nameStartsWith) {
    try { await nextDb.floor.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
    try { await nextDb.substation.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
    try { await nextDb.branch.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
    try { await nextDb.headquarters.deleteMany({ where: { name: { startsWith: p } } }); } catch { /* ignore */ }
  }
  /* 6. 시험이 세운 카탈로그 픽스처 — 개발 DB 에 남으면 사람 화면에 그대로 선다.
        **자산이 물린 것은 손대지 않는다**: 시드가 만든 광슬롯처럼 실데이터가 걸린 종류를
        시험이 걷어 버리면 안 된다(강원 12국의 판 26장이 그것으로 서 있다). */
  for (const key of TEST_FIXTURE_ASSEMBLY_KEYS) {
    try {
      const asm = await nextDb.assembly.findUnique({ where: { key }, include: { _count: { select: { assets: true } } } });
      if (asm && asm._count.assets === 0) await nextDb.assembly.delete({ where: { id: asm.id } });
    } catch { /* ignore */ }
  }
  for (const key of TEST_FIXTURE_TYPE_KEYS) {
    try {
      const t = await nextDb.assetType.findUnique({
        where: { key },
        include: { _count: { select: { assets: true, assemblyItems: true } } },
      });
      if (t && t._count.assets === 0 && t._count.assemblyItems === 0) {
        await nextDb.assetPortTemplate.deleteMany({ where: { typeId: t.id } });
        await nextDb.assetType.delete({ where: { id: t.id } });
      }
    } catch { /* ignore */ }
  }

  // 7. auth 테스트 사용자 (auth.test.ts: test_auth_<ts> / viewer_<ts>)
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'test_auth_' } } }); } catch { /* ignore */ }
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'viewer_' } } }); } catch { /* ignore */ }
  /* 잠금 시험이 남긴 계정도 걷는다 — 이게 남아 있으면 개발 DB 에 쓰레기 계정이 쌓이고,
     예전 시드는 「사용자가 하나라도 있으면 admin 을 만들지 않는」 조건이라 그 바람에
     admin 이 영영 되살아나지 않았다(로그인이 막혔다). */
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'test_lock_' } } }); } catch { /* ignore */ }
}

/**
 * 시험이 쓰는 **장비 품목 픽스처** — 없으면 만든다.
 *
 * 예전에는 시드 카탈로그를 픽스처로 삼았다(`GROUNDING`·`CHARGER`·`PWR-AC`…). 그런데 그
 * 서른 종은 재구축 초기에 「대충 이런 게 있겠지」로 세워 둔 임시값이었고, 실물을 보고
 * 카탈로그를 다시 짜면서 지웠다 — 그러자 시험 열넷이 함께 무너졌다.
 *
 * **시드는 운영 설정이지 시험 픽스처가 아니다.** 운영에서 품목 하나를 지웠다고 시험이
 * 무너지면, 그 시험은 제가 무엇을 지키는지 말하지 못하는 것이다. 그래서 시험이 쓰는
 * 모양은 여기서 **시험이 직접** 세운다.
 *
 * 키는 시드와 같은 것을 쓴다(`GROUNDING` 등) — 시드에 그 키가 되살아나도 충돌하지 않고
 * 그대로 쓰이며, 시험 파일들을 한 줄도 고치지 않아도 된다.
 */
/**
 * 시험이 세우는 품목의 키 — **만들 때와 걷을 때가 같은 목록을 본다.**
 *
 * 시험은 개발 DB 에 대고 돈다. 그래서 픽스처를 남겨 두면 그것이 **사람의 카탈로그 화면에
 * 그대로 선다** — 실제로 시험을 한 번 돌린 뒤 「PITR-5000·전원(AC) 이 왜 있냐」는 말을
 * 들었다. 세운 것은 걷는다.
 */
export const TEST_FIXTURE_TYPE_KEYS = [
  'GROUNDING', 'HVAC', 'CHARGER', 'PWR-AC', 'PWR-DC', 'PITR-5000',
] as const;
export const TEST_FIXTURE_ASSEMBLY_KEYS = ['OPT-SET'] as const;

export async function ensureTestTypes(): Promise<void> {
  const category = await nextDb.assetCategory.upsert({
    where: { key: '구조' },
    update: {},
    create: { key: '구조', name: '구조', sortOrder: 1 },
  });

  /** 키 → 그 품목이 갖는 포트 선언. 시드가 갖고 있던 모양 그대로다. */
  const SPECS: Record<string, { name: string; ports: {
    group: string; count: number; direction: string; medium: string; namePattern: string;
    positions?: number; variant?: string | null;
  }[] }> = {
    'OFD-SLOT': { name: '광슬롯', ports: [
      { group: 'FIBER-TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
    ] },
    GROUNDING: { name: '접지함체', ports: [
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ] },
    HVAC: { name: '공조설비', ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ] },
    /* 충전기는 **교류를 받아 직류를 내보낸다** — 갈래가 갈리는 자리라 갈래 시험이 이걸 쓴다. */
    CHARGER: { name: '충전기', ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' },
    ] },
    'PWR-AC': { name: '전원(AC)', ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 13, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'AC' },
    ] },
    'PWR-DC': { name: '전원(DC)', ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 13, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'DC' },
    ] },
    /* 매체 넷을 다 갖는다 — 「설비를 놓으면 포트가 저절로 선다」를 보는 시험이 그 넷을 센다. */
    'PITR-5000': { name: 'PITR-5000', ports: [
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ] },
  };

  for (const [key, spec] of Object.entries(SPECS)) {
    const existing = await nextDb.assetType.findUnique({
      where: { key },
      include: { _count: { select: { assets: true } } },
    });
    /* 이미 있으면 **선언을 여기 적은 모양으로 맞춘다** — 픽스처를 고쳤는데 옛 행이 남아
       시험이 엉뚱하게 무너지는 일을 없앤다.
       다만 **자산이 하나라도 있으면 손대지 않는다.** 시드가 만든 광슬롯은 강원 직할
       12국의 판 26장이 그것으로 서 있다 — 시험 픽스처가 실데이터의 선언을 갈아엎으면 안 된다. */
    if (existing && existing._count.assets > 0) continue;
    const type = existing
      ? (await nextDb.assetPortTemplate.deleteMany({ where: { typeId: existing.id } }), existing)
      : await nextDb.assetType.create({
          data: { key, name: spec.name, categoryId: category.id, sortOrder: 0 },
        });
    for (const [i, p] of spec.ports.entries()) {
      await nextDb.assetPortTemplate.create({
        data: {
          typeId: type.id, group: p.group, count: p.count, direction: p.direction,
          medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1,
          variant: p.variant ?? null, sortOrder: i,
        },
      });
    }
  }

  /* 설비 품목 픽스처 — 「장비 여럿을 격자에 놓은 것」을 놓는 시험이 쓴다. */
  const ASSEMBLIES: Record<string, { name: string; items: { typeKey: string; name: string; row: number }[] }> = {
    'OPT-SET': { name: '송변전광단말장치', items: [
      { typeKey: 'PITR-5000', name: 'PITR 1', row: 0 },
      { typeKey: 'PITR-5000', name: 'PITR 2', row: 1 },
    ] },
  };
  for (const [key, spec] of Object.entries(ASSEMBLIES)) {
    if (await nextDb.assembly.findUnique({ where: { key } })) continue;
    const asm = await nextDb.assembly.create({
      data: { key, name: spec.name, categoryId: category.id, sortOrder: 0 },
    });
    for (const [i, item] of spec.items.entries()) {
      const type = await nextDb.assetType.findUniqueOrThrow({ where: { key: item.typeKey } });
      await nextDb.assemblyItem.create({
        data: {
          assemblyId: asm.id, typeId: type.id, name: item.name,
          col: 0, row: item.row, colSpan: 10, rowSpan: 1, sortOrder: i,
        },
      });
    }
  }
}
