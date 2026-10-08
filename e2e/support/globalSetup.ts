import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureE2EUser, snapshot, withDb } from './dbSnapshot';

export const BASELINE = join(__dirname, '..', '..', 'test-results', 'e2e-db-baseline.json');

/**
 * 실행 앞 — 전용 계정 `e2e`(admin)를 두고(없으면 만든다), DB 행 수를 적는다. 끝(globalTeardown)에서 같은지 본다.
 * DB 를 모르면 아무것도 적지 않는다(그때는 `e2e` 계정이 이미 있어야 로그인된다).
 */
export default async function globalSetup() {
  const snap = await withDb(async (db) => snapshot(db, await ensureE2EUser(db)));
  mkdirSync(join(BASELINE, '..'), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(snap));
}
