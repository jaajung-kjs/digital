import { existsSync, readFileSync } from 'node:fs';
import { dropE2EChangeLog, leftovers, snapshot, withDb, type Snapshot } from './dbSnapshot';
import { BASELINE } from './globalSetup';

/**
 * 실행 뒤 — E2E 변경 이력을 걷고, 행 수가 시작과 같은지·E2E 행이 없는지 단언한다(어긋나면 실행이 실패한다).
 * 일부 spec 만 돌렸어도 같은 단언이다 — 어느 spec 이든 만든 것은 지우고 끝나야 한다.
 */
export default async function globalTeardown() {
  if (!existsSync(BASELINE)) return;
  const before = JSON.parse(readFileSync(BASELINE, 'utf8')) as Snapshot | null;
  if (!before) return;
  const problems = await withDb(async (db) => {
    const dropped = await dropE2EChangeLog(db, before.at);
    if (dropped > 0) console.log(`[e2e 위생] 이번 실행의 E2E 변경 이력 ${dropped}건을 걷었습니다`);
    const after = await snapshot(db);
    const diff = Object.keys(before.counts)
      .filter((k) => after.counts[k] !== before.counts[k])
      .map((k) => `${k} ${before.counts[k]} → ${after.counts[k]}`);
    return [...diff, ...(await leftovers(db))];
  });
  if (problems && problems.length > 0) {
    throw new Error(`[e2e 위생] 시험이 개발 DB 에 흔적을 남겼습니다 — ${problems.join(' · ')}`);
  }
}
