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
export function authHeader(role: 'ADMIN' | 'VIEWER' | 'admin' | 'viewer' = 'admin'): string {
  const normalizedRole = role.toLowerCase() as 'admin' | 'viewer';
  return `Bearer ${signAccessToken({ userId: 'test-user', username: 'tester', role: normalizedRole })}`;
}

/**
 * 안정 prefix 기반 전체 스윕 — 과거 런 잔재까지 일괄 회수.
 * 각 테스트 파일의 beforeAll/afterAll 에서 호출한다.
 *
 * nameStartsWith: 조직 계층·자산 이름 prefix (타임스탬프 없는 안정 prefix)
 * keyStartsWith: 카탈로그 키 prefix (catalog.crud KEY_PREFIX 접두사)
 */
export async function sweepTestFixtures(): Promise<void> {
  const nameStartsWith = ['t4-cb-', 't2a-', 't5-rc-'];
  const keyStartsWith = ['TEST_'];

  // 1. cables (substation name prefix 경유)
  for (const p of nameStartsWith) {
    try { await nextDb.cable.deleteMany({ where: { substation: { name: { startsWith: p } } } }); } catch { /* ignore */ }
  }
  // 2. catalog: assets by type key
  for (const p of keyStartsWith) {
    try { await nextDb.asset.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetLinkRule.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetPortTemplate.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetContainerSpec.deleteMany({ where: { type: { key: { startsWith: p } } } }); } catch { /* ignore */ }
    try { await nextDb.assetType.deleteMany({ where: { key: { startsWith: p } } }); } catch { /* ignore */ }
    try { await nextDb.assetCategory.deleteMany({ where: { key: { startsWith: p } } }); } catch { /* ignore */ }
  }
  // 3. assets by name prefix (children first)
  for (const p of nameStartsWith) {
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
}
