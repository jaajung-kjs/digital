import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E 위생 — 실행 앞뒤로 개발 DB(digital_simplify)의 행 수를 재어 **E2E 가 남긴 것이 없는지** 본다.
 *
 * 시험은 시드 변전소 위에서 랙·설비·연결·광선로·측정을 만들고 끝에 지운다. 지우는 흐름이 실패하거나 빠지면
 * 시드 데이터가 소리 없이 늘어난다(예: 빈 「4층」이 남았던 일). 그래서 끝에 한 번 단언한다:
 *  - 층·랙·설비·광선로·연결·측정·변경 이력 수가 시작과 같다(변경 이력은 걷은 뒤)
 *  - 이름·표기·측정자가 `E2E` 로 시작하는 행이 없다
 * 그리고 이번 실행이 남긴 변경 이력(`ChangeLog`)을 걷는다 — 저장했다 지운·되돌린 흔적이 시드 설비의
 * 「변경 이력」 탭에 쌓이지 않게.
 *
 * **시험은 전용 계정 `e2e`(역할 admin)로 돈다**(`E2E_USER`). globalSetup 이 없으면 만들고(있으면 역할·비밀번호를 맞춘다),
 * teardown 은 **그 계정이 쓴 변경 이력만** 걷는다. 개발 관리자(`admin`)의 이력은 어떤 경우에도 건드리지 않는다 —
 * 시험이 도는 동안 사람이나 다른 에이전트가 `admin` 으로 저장해도 그 이력은 남는다(그래서 `admin` 이력 수도 앞뒤로 단언한다).
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

/** 시험 전용 계정 — 개발 DB 에만 있다(globalSetup 이 만든다). 로그인은 `e2e/helpers.ts login`. */
export const E2E_USER = { username: 'e2e', password: process.env.E2E_PASSWORD ?? 'e2e-only-123' } as const;

/** 전용 계정을 둔다 — 없으면 만들고, 있으면 역할(admin)·비밀번호를 맞추고 잠금을 푼다. 계정 id 를 돌려준다. */
export async function ensureE2EUser(db: Db): Promise<string> {
  const require = createRequire(join(ROOT, 'backend', 'package.json'));
  const bcrypt = require('bcryptjs') as { hash: (s: string, r: number) => Promise<string> };
  const hash = (await bcrypt.hash(E2E_USER.password, 10)).replace(/'/g, "''");
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `insert into "User" (id, username, "passwordHash", role, "failedLoginCount", "lockedUntil", "createdAt", "updatedAt")
     values (gen_random_uuid()::text, '${E2E_USER.username}', '${hash}', 'admin', 0, null, now(), now())
     on conflict (username) do update set "passwordHash" = excluded."passwordHash", role = 'admin', "failedLoginCount" = 0, "lockedUntil" = null, "updatedAt" = now()
     returning id`,
  );
  return rows[0]!.id;
}

export interface Snapshot { at: string; e2eUserId: string; counts: Record<string, number> }

const COUNTS: Record<string, string> = {
  floors: 'select count(*)::int as n from "Floor"',
  racks: 'select count(*)::int as n from "Rack"',
  equipment: 'select count(*)::int as n from "Equipment"',
  lines: 'select count(*)::int as n from "FiberLine"',
  links: 'select count(*)::int as n from "Link"',
  measurements: 'select count(*)::int as n from "CoreMeasurement"',
  changelog: 'select count(*)::int as n from "ChangeLog"',
  /* 개발 관리자의 이력 — 시험이 절대 건드리지 않는다(앞뒤 같아야 한다; 시험 중 사람이 admin 으로 저장하면 어긋나 알린다). */
  'changelog(admin)': `select count(*)::int as n from "ChangeLog" where username = 'admin'`,
  inspections: 'select count(*)::int as n from "InspectionLog"',
  maintenance: 'select count(*)::int as n from "MaintenanceLog"',
  photos: 'select count(*)::int as n from "EquipmentPhoto"',
};

const LEFTOVERS: Record<string, string> = {
  'E2E 랙': `select count(*)::int as n from "Rack" where name like 'E2E%'`,
  'E2E 설비': `select count(*)::int as n from "Equipment" where name like 'E2E%'`,
  'E2E 광선로': `select count(*)::int as n from "FiberLine" where name like 'E2E%'`,
  'E2E 포트 표기': `select count(*)::int as n from "LinkEnd" where label like 'E2E%'`,
  'E2E 측정': `select count(*)::int as n from "CoreMeasurement" where "measuredBy" like 'E2E%'`,
  'E2E 점검 기록': `select count(*)::int as n from "InspectionLog" where content like 'E2E%'`,
  'E2E 고장 기록': `select count(*)::int as n from "MaintenanceLog" where content like 'E2E%'`,
};

async function one(db: Db, q: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(q);
  return rows[0]?.n ?? 0;
}

export async function snapshot(db: Db, e2eUserId: string): Promise<Snapshot> {
  const counts: Record<string, number> = {};
  for (const [k, q] of Object.entries(COUNTS)) counts[k] = await one(db, q);
  /* 시각은 timestamptz 그대로(세션 시간대와 무관한 한 순간) — 비교할 때 `at`(UTC 로 적힌 timestamp)에 시간대를 붙인다. */
  const [{ now }] = await db.$queryRawUnsafe<Array<{ now: Date }>>('select now() as now');
  return { at: now.toISOString(), e2eUserId, counts };
}

export async function leftovers(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (const [k, q] of Object.entries(LEFTOVERS)) {
    const n = await one(db, q);
    if (n > 0) out.push(`${k} ${n}건`);
  }
  return out;
}

/**
 * 시험이 남긴 변경 이력을 걷는다. 걷은 수를 돌려준다.
 *
 * - 전용 계정 `e2e` 가 쓴 이력 전부 — 그 계정은 시험만 쓴다(시드 값을 고쳤다 되돌린 저장도 여기 든다).
 * - 이번 실행 동안 쓰인, E2E 이름(`"E2E…`)이 든 이력 — 단 **`admin` 이 쓴 것은 빼고**.
 * 개발 관리자(`admin`)의 이력은 어떤 조건으로도 걷지 않는다.
 */
export async function dropE2EChangeLog(db: Db, since: string, e2eUserId: string): Promise<number> {
  const at = since.replace(/'/g, '');
  const uid = e2eUserId.replace(/'/g, '');
  return db.$executeRawUnsafe(
    `delete from "ChangeLog" where username <> 'admin' and (
       "userId" = '${uid}'
       or (("at" at time zone 'UTC') >= '${at}'::timestamptz and summary::text like '%"E2E%')
     )`,
  );
}
