import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E 위생 — 실행 앞뒤로 개발 DB(digital_simplify)의 행 수를 재어 **E2E 가 남긴 것이 없는지** 본다.
 *
 * 시험은 시드 변전소 위에서 랙·설비·연결·광선로·측정을 만들고 끝에 지운다. 지우는 흐름이 실패하거나 빠지면
 * 시드 데이터가 소리 없이 늘어난다(예: 빈 「4층」이 남았던 일). 그래서 끝에 한 번 단언한다:
 *  - 층·랙·설비·광선로·연결·측정 수가 시작과 같다
 *  - 이름·표기·측정자가 `E2E` 로 시작하는 행이 없다
 * 그리고 이번 실행이 남긴 변경 이력(`ChangeLog`, 내용에 E2E 가 든 것)을 걷는다 — 저장했다 지운 흔적이 시드 설비의
 * 「변경 이력」 탭에 쌓이지 않게.
 *
 * DB 주소는 backend/.env 의 DATABASE_URL_NEXT(개발 DB). 없으면 검사를 건너뛴다(CI 등 DB 를 모르는 곳).
 */
const ROOT = join(__dirname, '..', '..');

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL_NEXT) return process.env.DATABASE_URL_NEXT;
  try {
    const env = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const m = /^DATABASE_URL_NEXT\s*=\s*"?([^"\n]+)"?/m.exec(env);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

type Db = { $queryRawUnsafe: <T>(q: string) => Promise<T>; $executeRawUnsafe: (q: string) => Promise<number>; $disconnect: () => Promise<void> };

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T | null> {
  const url = databaseUrl();
  if (!url) return null;
  if (url.includes('digital_next')) throw new Error('E2E 위생 검사는 digital_next 를 건드리지 않는다');
  const require = createRequire(join(ROOT, 'backend', 'package.json'));
  const { PrismaClient } = require('./src/generated/next-client/index.js') as { PrismaClient: new (o: unknown) => Db };
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

export interface Snapshot { at: string; counts: Record<string, number> }

const COUNTS: Record<string, string> = {
  floors: 'select count(*)::int as n from "Floor"',
  racks: 'select count(*)::int as n from "Rack"',
  equipment: 'select count(*)::int as n from "Equipment"',
  lines: 'select count(*)::int as n from "FiberLine"',
  links: 'select count(*)::int as n from "Link"',
  measurements: 'select count(*)::int as n from "CoreMeasurement"',
};

const LEFTOVERS: Record<string, string> = {
  'E2E 랙': `select count(*)::int as n from "Rack" where name like 'E2E%'`,
  'E2E 설비': `select count(*)::int as n from "Equipment" where name like 'E2E%'`,
  'E2E 광선로': `select count(*)::int as n from "FiberLine" where name like 'E2E%'`,
  'E2E 포트 표기': `select count(*)::int as n from "LinkEnd" where label like 'E2E%'`,
  'E2E 측정': `select count(*)::int as n from "CoreMeasurement" where "measuredBy" like 'E2E%'`,
};

async function one(db: Db, q: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(q);
  return rows[0]?.n ?? 0;
}

export async function snapshot(db: Db): Promise<Snapshot> {
  const counts: Record<string, number> = {};
  for (const [k, q] of Object.entries(COUNTS)) counts[k] = await one(db, q);
  const [{ now }] = await db.$queryRawUnsafe<Array<{ now: Date }>>('select now()::timestamp(3) as now');
  return { at: now.toISOString(), counts };
}

export async function leftovers(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (const [k, q] of Object.entries(LEFTOVERS)) {
    const n = await one(db, q);
    if (n > 0) out.push(`${k} ${n}건`);
  }
  return out;
}

/** 이번 실행(since 이후)이 남긴 변경 이력 중 E2E 흔적이 든 것을 걷는다. 걷은 수를 돌려준다. */
export async function dropE2EChangeLog(db: Db, since: string): Promise<number> {
  return db.$executeRawUnsafe(
    `delete from "ChangeLog" where at >= '${since.replace(/'/g, '')}'::timestamp and summary::text like '%E2E%'`,
  );
}
