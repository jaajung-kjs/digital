import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshot, withDb } from './dbSnapshot';

export const BASELINE = join(__dirname, '..', '..', 'test-results', 'e2e-db-baseline.json');

/** 실행 앞 DB 행 수 — 끝(globalTeardown)에서 같은지 본다. DB 를 모르면 아무것도 적지 않는다. */
export default async function globalSetup() {
  const snap = await withDb(snapshot);
  mkdirSync(join(BASELINE, '..'), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(snap));
}
