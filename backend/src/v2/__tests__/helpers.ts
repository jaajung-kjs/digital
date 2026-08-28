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
  const nameStartsWith = ['t4-cb-', 't2a-', 't5-rc-', 't6-bg-'];
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
  // 6. auth 테스트 사용자 (auth.test.ts: test_auth_<ts> / viewer_<ts>)
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'test_auth_' } } }); } catch { /* ignore */ }
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'viewer_' } } }); } catch { /* ignore */ }
  /* 잠금 시험이 남긴 계정도 걷는다 — 이게 남아 있으면 개발 DB 에 쓰레기 계정이 쌓이고,
     예전 시드는 「사용자가 하나라도 있으면 admin 을 만들지 않는」 조건이라 그 바람에
     admin 이 영영 되살아나지 않았다(로그인이 막혔다). */
  try { await nextDb.user.deleteMany({ where: { username: { startsWith: 'test_lock_' } } }); } catch { /* ignore */ }
}
