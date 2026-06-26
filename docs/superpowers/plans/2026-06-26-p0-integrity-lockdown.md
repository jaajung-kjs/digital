# P0 무결성 잠금 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데이터 입력 단계인 지금 DB 무결성 제약(unique·enum·FK·인덱스)을 추가해 중복·오염 데이터 유입을 차단한다.

**Architecture:** Prisma 스키마에 제약을 추가하고 단일 스키마 마이그레이션으로 적용. enum은 Prisma enum(DB+TS 강제). 실측상 실중복 0·enum 대상 데이터 거의 없음 → 캐스팅/dedup 위험 최소. 동작 변경 없음(제약·정합성만).

**Tech Stack:** PostgreSQL, Prisma, TypeScript, Vitest. 개발 DB는 `docker compose -f docker-compose.dev.yml up -d`. Docker 빌드 금지. 빌드검증 `npx tsc --noEmit`/`npm run build`.

## Global Constraints

- 이 작업은 **스키마 제약 추가가 본질** → 마이그레이션 생성이 정당(평소의 "마이그레이션 금지"는 적용 안 됨).
- enum은 Prisma enum 6종 중 **5종만 P0**: `CableRole`·`FailureSeverity`·`FailureLogType`·`FailureStatus`·`PhotoSide`. **`AuditAction`은 P1로 이관**(현재 `AuditLog.action`에 `'WORK_ORDER'` 값이 floor.service에서 쓰이고 있어 {CREATE,UPDATE,DELETE,MOVE} enum이 깨뜨림 — 워크오더 정리와 함께 P1에서 처리).
- 범위 밖(보류): `Asset.status`(P3), `laborType`(string 유지), cascade→retire(P3), 커밋 감사로그·피드 스코핑(P1), 모델 개명(P2).
- enum명은 `Failure*`(이 로그는 사실상 고장로그; P2의 `MaintenanceLog→FailureLog` 개명과 정합). P0에선 **모델명 `MaintenanceLog` 유지**, enum만 `Failure*`.
- 각 태스크 종료 게이트: `cd backend && npx tsc --noEmit && npx vitest run`(현 110 통과 유지) + 해당 마이그레이션 적용 성공.
- 시드 멱등: `findFirst→upsert`. `prisma migrate reset --force` 후 seed 2회 실행해도 무중복.

---

### Task 1: Prisma enum 5종 + 컬럼 전환 마이그레이션 + 소비처 정합

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum 정의 + Cable/MaintenanceLog/AssetPhoto 필드 타입)
- Create: `backend/prisma/migrations/<ts>_p0_enums/migration.sql` (생성 후 USING 캐스팅 검수)
- Modify: `backend/src/services/cable.service.ts:22-23,178-179` (CableRole 타입 정합)
- Modify: `backend/src/schemas/substationCommit.schema.ts:122-123` (이미 `z.enum(['IN','OUT'])` — enum import로 정합 확인)
- Test: `backend/tests/p0Enums.integration.test.ts` (신규 — enum 거부 검증)

**Interfaces:**
- Produces: Prisma enums `CableRole{IN,OUT}`, `FailureSeverity{LOW,MEDIUM,HIGH,CRITICAL}`, `FailureLogType{FAILURE,REPAIR}`, `FailureStatus{OPEN,IN_PROGRESS,RESOLVED,CLOSED}`, `PhotoSide{front,rear}`. 컬럼 타입: `Cable.sourceRole/targetRole: CableRole?`, `MaintenanceLog.severity: FailureSeverity?`, `.logType: FailureLogType`, `.status: FailureStatus @default(OPEN)`, `AssetPhoto.side: PhotoSide`.

- [ ] **Step 1: 운영/현DB 값 호환 probe (마이그레이션 전 안전 확인)**

Run (backend dir):
```bash
cd backend && cat > ./_probe.mjs <<'EOF'
import { PrismaClient } from '@prisma/client'; const p=new PrismaClient();
const q=async(l,s)=>{try{console.log(l,JSON.stringify(await p.$queryRawUnsafe(s)))}catch(e){console.log(l,'ERR',e.message)}};
await q('roles',`SELECT DISTINCT source_role,target_role FROM cables`);
await q('mlog',`SELECT DISTINCT "logType","severity","status" FROM maintenance_logs`);
await q('side',`SELECT DISTINCT side FROM asset_photos`);
await p.$disconnect();
EOF
node ./_probe.mjs; rm ./_probe.mjs```
Expected: roles ⊆ {IN,OUT,null}; mlog/side 빈 결과 또는 enum 멤버뿐. 벗어난 값이 있으면 STOP, 보고(데이터 정리 선행 필요).

- [ ] **Step 2: schema.prisma 에 enum 5종 추가 + 필드 타입 변경**

`backend/prisma/schema.prisma` — 기존 `enum AssetRole` 블록 근처에 추가:
```prisma
enum CableRole { IN OUT }
enum FailureSeverity { LOW MEDIUM HIGH CRITICAL }
enum FailureLogType { FAILURE REPAIR }
enum FailureStatus { OPEN IN_PROGRESS RESOLVED CLOSED }
enum PhotoSide { front rear }
```
`Cable` 모델: `sourceRole String? @map("source_role") @db.VarChar(4)` → `sourceRole CableRole? @map("source_role")` (targetRole 동일). `@db.VarChar(4)` 제거.
`MaintenanceLog` 모델: `logType String @db.VarChar(20)` → `logType FailureLogType`; `severity String? @db.VarChar(20)` → `severity FailureSeverity?`; `status String @default("OPEN") @db.VarChar(20)` → `status FailureStatus @default(OPEN)`.
`AssetPhoto` 모델: `side String @db.VarChar(10)` → `side PhotoSide`.

- [ ] **Step 3: 마이그레이션 생성 + USING 캐스팅 검수**

```bash
cd backend && npx prisma migrate dev --name p0_enums --create-only
```
생성된 `migration.sql` 을 열어 각 컬럼 변환이 **USING 캐스팅**을 포함하는지 확인. Prisma가 빈/단순 컬럼엔 누락할 수 있으니, `cables.source_role`/`target_role`(데이터 존재)은 반드시 아래 형태여야 함 — 없으면 직접 보정:
```sql
ALTER TABLE "cables" ALTER COLUMN "source_role" TYPE "CableRole" USING ("source_role"::text::"CableRole");
ALTER TABLE "cables" ALTER COLUMN "target_role" TYPE "CableRole" USING ("target_role"::text::"CableRole");
```
(maintenance_logs/asset_photos는 빈 테이블이라 USING 없어도 통과하지만 일관성 위해 동일 패턴 권장.)

- [ ] **Step 4: 마이그레이션 적용 + generate**

```bash
cd backend && npx prisma migrate dev --name p0_enums && npx prisma generate
```
Expected: 적용 성공, `prisma migrate status` = up to date.

- [ ] **Step 5: 소비처 타입 정합**

`cable.service.ts`: `import { CableRole } from '@prisma/client'`. line 22-23 `sourceRole: 'IN'|'OUT'|null` → `sourceRole: CableRole | null`(targetRole 동일). line 178-179 캐스트 `as 'IN'|'OUT'|null` → `as CableRole | null` (또는 Prisma가 이미 enum 반환하니 캐스트 제거).
`substationCommit.schema.ts:122-123`: `z.enum(['IN','OUT'])` 유지(런타임 검증) — Prisma enum 과 값 일치하므로 그대로 둠. (zod→Prisma 자동 호환.)
maintenance/photo 레코드 쓰기는 `substationCommit.service` 의 동적 델리게이트 경유 — 프론트가 보내는 값(`FAILURE`/`REPAIR`, `front`/`rear` 등)이 enum 멤버와 일치하므로 추가 변경 불필요하나, 레코드 zod 스키마(`assetRecordSchema` 관련)가 자유 string을 받는다면 enum 값으로 좁힐 것(있으면).

- [ ] **Step 6: enum 거부 검증 테스트**

`backend/tests/p0Enums.integration.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import prisma from '../src/config/prisma.js';

describe('P0 enum 제약', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it('cables.source_role 에 잘못된 값은 DB가 거부', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE cables SET source_role='BOGUS' WHERE false`)
    ).rejects.toThrow(); // 'BOGUS' 는 CableRole 멤버 아님 → invalid input value for enum
  });
});
```

- [ ] **Step 7: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git add backend/prisma backend/src/services/cable.service.ts backend/tests/p0Enums.integration.test.ts
git commit -m "feat(integrity): Prisma enum 5종 전환 (CableRole·Failure*·PhotoSide)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: tsc 0, vitest 통과(110 + 신규).

---

### Task 2: Unique 제약 + 시드 upsert + 통합테스트 fixture 정리

**Files:**
- Modify: `backend/prisma/schema.prisma` (4개 unique)
- Create: `backend/prisma/migrations/<ts>_p0_unique/migration.sql`
- Modify: `backend/prisma/seed/assetTypes.ts:87`, `backend/prisma/seed/cableCategories.ts:58`, `backend/prisma/seed/seed.ts`(HQ/Substation 생성부)
- Modify: `backend/tests/cableConnections.integration.test.ts:28,69`, `backend/tests/nodeAssets.integration.test.ts:18,35`

**Interfaces:**
- Consumes: Task 1 결과(무관, 독립).
- Produces: `AssetType.name @unique`, `CableCategory @@unique([name, groupId])`, `Substation.name @unique`, `Headquarters.name @unique`. 시드는 upsert(멱등 키=새 unique).

- [ ] **Step 1: 통합테스트 fixture 를 unique-safe 하게 수정**

`cableConnections.integration.test.ts:28`: `name: '__conn_hq__'` → 유니크명 + afterAll 정리. 예:
```ts
const HQ_NAME = `__conn_hq__${Date.now()}`;
const hq = await prisma.headquarters.create({ data: { name: HQ_NAME } }); hqId = hq.id;
```
`afterAll`(line 69 블록)에 추가: `await prisma.headquarters.deleteMany({ where: { id: hqId } });`
`nodeAssets.integration.test.ts:18,35` 동일 패턴(`__na_hq__${Date.now()}` + afterAll HQ 삭제).

- [ ] **Step 2: dev DB 테스트 쓰레기 정리**

```bash
cd backend && cat > ./_clean.mjs <<'EOF'
import { PrismaClient } from '@prisma/client'; const p=new PrismaClient();
const r = await p.headquarters.deleteMany({ where: { name: { in: ['__na_hq__','__conn_hq__'] } } });
console.log('deleted hq garbage:', r.count); await p.$disconnect();
EOF
node ./_clean.mjs; rm ./_clean.mjs```
Expected: deleted 8 (또는 현 잔존수). (자식 FK는 cascade.)

- [ ] **Step 3: schema 에 unique 추가**

`backend/prisma/schema.prisma`:
- `AssetType`: `name String @db.VarChar(100)` → `name String @unique @db.VarChar(100)`
- `Substation`: `name String @db.VarChar(100)` → `name String @unique @db.VarChar(100)`
- `Headquarters`: `name String @db.VarChar(100)` → `name String @unique @db.VarChar(100)`
- `CableCategory`: 모델 끝 `@@map` 위에 `@@unique([name, groupId])` 추가.

- [ ] **Step 4: 마이그레이션 생성·적용**

```bash
cd backend && npx prisma migrate dev --name p0_unique && npx prisma generate
```
Expected: 적용 성공(쓰레기 정리됐으니 HQ unique 충돌 없음). 충돌 나면 Step 2 미완 — 재실행.

- [ ] **Step 5: 시드 findFirst → upsert**

`assetTypes.ts:87` 영역: `const existing = await prisma.assetType.findFirst({ where: { name: t.name } });` 이후 update/create 분기를 →
```ts
const row = await prisma.assetType.upsert({
  where: { name: t.name },
  update: { /* 기존 update 필드 동일 */ },
  create: { /* 기존 create 필드 동일 */ },
});
```
(기존 분기의 데이터 객체를 update/create 에 그대로 매핑. 결과 id 를 기존처럼 key→id 맵에 저장.)
`cableCategories.ts:58`: `findFirst({where:{name,groupId}})` → `upsert({ where: { name_groupId: { name: cat.name, groupId } }, update:{...}, create:{...} })` (복합 unique의 Prisma where 이름은 `name_groupId`).
`seed.ts` HQ/Substation 생성부: 이름 기준 `upsert({ where: { name }, ... })` 로(현재 생성 로직을 upsert로; 첫배포 가드 로직은 유지).

- [ ] **Step 6: 멱등 검증**

```bash
cd backend && npx prisma migrate reset --force
```
Expected: 마이그레이션 전체 적용 + seed 성공, 에러 없음. (reset이 seed 1회 실행. upsert라 재실행해도 안전.)

- [ ] **Step 7: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git add backend/prisma backend/tests/cableConnections.integration.test.ts backend/tests/nodeAssets.integration.test.ts
git commit -m "feat(integrity): name unique 4종 + 시드 upsert + 테스트 fixture 정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: FK 추가/강화 (sourcePresetId, category/group Restrict)

**Files:**
- Modify: `backend/prisma/schema.prisma` (Asset.sourcePresetId 관계, RackPreset 역관계, AssetType/CableCategory FK onDelete)
- Create: `backend/prisma/migrations/<ts>_p0_fk/migration.sql`

**Interfaces:**
- Produces: `Asset.sourcePreset RackPreset? @relation(...)`, `RackPreset.assets Asset[]`. `AssetType.categoryId`·`CableCategory.groupId` FK → `onDelete: Restrict`.

- [ ] **Step 1: schema — sourcePresetId FK 신설**

`Asset` 모델: 관계 추가 (기존 `sourcePresetId String? @map("source_preset_id")` 유지하고 relation 필드 추가):
```prisma
  sourcePreset RackPreset? @relation("AssetSourcePreset", fields: [sourcePresetId], references: [id], onDelete: SetNull)
```
`RackPreset` 모델: 역관계 `assets Asset[] @relation("AssetSourcePreset")` 추가.

- [ ] **Step 2: schema — category/group FK 를 Restrict 로**

`AssetType.category`: `@relation(fields: [categoryId], references: [id])` → `@relation(fields: [categoryId], references: [id], onDelete: Restrict)`.
`CableCategory.group`: `@relation(fields: [groupId], references: [id])` → `... onDelete: Restrict`.

- [ ] **Step 3: 마이그레이션 생성·적용**

```bash
cd backend && npx prisma migrate dev --name p0_fk && npx prisma generate
```
Expected: 성공. 생성 SQL에 `ADD CONSTRAINT ... FOREIGN KEY ("source_preset_id") REFERENCES "rack_presets"("id") ON DELETE SET NULL` 및 category/group의 DROP+ADD(Restrict) 확인.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git add backend/prisma
git commit -m "feat(integrity): sourcePresetId FK + category/group onDelete Restrict

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 인덱스 + 주석/문서 정정

**Files:**
- Modify: `backend/prisma/schema.prisma` (인덱스 5개 + 주석)
- Create: `backend/prisma/migrations/<ts>_p0_indexes/migration.sql`

**Interfaces:**
- Produces: `Cable @@index([sourceAssetId])·([targetAssetId])·([categoryId])`, `MaintenanceLog @@index([assetId])`, `AssetPhoto @@index([assetId])`.

- [ ] **Step 1: schema 인덱스 추가**

`Cable` 모델 `@@map` 위: `@@index([sourceAssetId])` / `@@index([targetAssetId])` / `@@index([categoryId])`.
`MaintenanceLog` 모델 `@@map` 위: `@@index([assetId])`.
`AssetPhoto` 모델 `@@map` 위: `@@index([assetId])`.

- [ ] **Step 2: 주석 정정**

`Cable` 모델 상단 주석(현 "각 side 한쪽만 NOT NULL — CHECK constraint로 강제" / "RACK kind Asset 는 endpoint 불가") →
```
// endpoint = sourceAssetId/targetAssetId 모두 NOT NULL 필수 (통합노드 모델, CHECK 없음).
// 컨테이너 role(rack/ofd/panel)은 케이블 endpoint 불가 (service validation: planApply.assertContainerNotEndpoint).
```
`CableCategory` 상단 주석 "16종 시드" → "18종 시드".

- [ ] **Step 3: 마이그레이션 생성·적용**

```bash
cd backend && npx prisma migrate dev --name p0_indexes && npx prisma generate
```
Expected: `CREATE INDEX` 5개. (주석은 SQL 무관.)

- [ ] **Step 4: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git add backend/prisma
git commit -m "feat(integrity): cables/logs/photos 인덱스 + 거짓 주석 정정

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 최종 회귀

- [ ] **Step 1: 전체 빌드 + 테스트**

```bash
cd /Users/jsk/1210/digital && npm run build
cd backend && npx vitest run
```
Expected: build 성공, vitest 전수 통과(110 + P0 신규).

- [ ] **Step 2: fresh reset + seed 멱등**

```bash
cd backend && npx prisma migrate reset --force && npx prisma migrate status
```
Expected: 모든 마이그레이션 적용, seed 성공, status = up to date(드리프트 없음).

- [ ] **Step 3: 무결성 스모크 (수동 확인)**

```bash
cd backend && cat > ./_smoke.mjs <<'EOF'
import { PrismaClient } from '@prisma/client'; const p=new PrismaClient();
const t=async(l,fn)=>{try{await fn();console.log('FAIL(거부됐어야)',l)}catch{console.log('OK 거부:',l)}};
await t('dup assetType name', ()=>p.assetType.create({data:{name:'랙'}})); // 시드에 '랙' 있으면 unique 거부
await p.$disconnect();
EOF
node ./_smoke.mjs; rm ./_smoke.mjs```
Expected: "OK 거부" (unique/enum이 실제로 막는지). 시드 종류명에 맞춰 조정.

- [ ] **Step 4: (변경 없으면 커밋 불필요)**

---

## Self-Review (작성자 점검)

- **Spec 커버리지**: §A unique→T2; §B enum→T1(AuditAction은 P1로 이관, Global Constraints에 명시); §C FK→T3; §D 주석→T4; §E 인덱스→T4; §검증→각 태스크+T5. `Asset.status`/laborType/cascade는 spec §3대로 보류.
- **Spec 대비 변경 1건**: `AuditAction` enum을 P0→P1로 이관(근거: `AuditLog.action='WORK_ORDER'` 가 floor.service:383에서 쓰임 → {CREATE,UPDATE,DELETE,MOVE} enum이 런타임 깨뜨림. P1의 감사로그 작업과 함께 처리). 이 변경은 사용자에게 고지함.
- **타입 일관성**: enum명 `CableRole`/`FailureSeverity`/`FailureLogType`/`FailureStatus`/`PhotoSide` 전 태스크 동일. unique where 복합키 `name_groupId` 명시.
- **마이그레이션 4개 분리**(enums/unique/fk/indexes) — 태스크별 독립 검토·롤백 용이. reset 시 순서대로 적용됨.
- **플레이스홀더 스캔**: 없음(각 step 실제 코드/명령 포함). upsert의 update/create 필드는 "기존 분기 데이터 그대로 매핑"으로 지시(원본 시드 코드가 SSOT).
