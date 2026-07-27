# Stage 4: 포트·케이블·추적 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 케이블을 포트↔포트로 연결(종류우선 UX)하고, @twin/core 추적 엔진을 클라이언트에서 그대로 사용해 경로 하이라이트를 보여준다 — role 분기 없는 데이터 파생 추적의 화면 증명.

**Architecture:** 백엔드는 v2 워킹카피 read에 cables를 추가하고 커밋에 cables ops(코어 `validateConnection` + 매체 검증 + OCC)를 확장한다. 추적은 **서버 API 없이** 클라이언트가 워킹카피 데이터(자산+포트+케이블+카탈로그)로 `buildTraceGraph`/`traceFrom`을 직접 호출 — 공유 패키지의 배당. 이 과정에서 2B 이월사항을 해소한다: accepts OR 판정(`isAccepted`)과 카탈로그 행→spec 투영(`specFromCatalog`)을 코어로 승격해 백/프론트 중복을 제거.

**Tech Stack:** 기존 스택 그대로. 신규 의존성 0. 신규 서버 엔드포인트 0 (기존 workingcopy/commit 확장만).

## 확정 설계 결정 (이월사항 해소)

- **connection direction 미검증 확정**: 방향(IN/OUT)은 표시 정보. 서버 검증은 점유·매체만 (구 시스템 거동 동일 — 잘못 연결은 사용자 책임, 추적은 어차피 데이터로 동작).
- **케이블↔포트 매체 검증**: 케이블 종류(category)의 그룹 `key`가 양쪽 포트의 `medium`과 일치해야 함 (Stage 1에서 medium=CableGroup.key로 통일한 것의 완성). 코어 `validateConnection`에 3번째 규칙으로 추가.
- **대국(크로스 변전소) 케이블은 Stage 5로 이월**: Stage 4 케이블은 양끝 모두 해당 변전소 자산의 포트. 선번장의 대국 표시와 함께 설계.
- **pathPoints**: 렌더는 지원(폴리라인), 생성 시 `[]`(직선), 경유점 편집 UI는 후속 (비목표에 명시).
- **자산 삭제 cascade에 케이블 포함**: 삭제 자산의 포트에 물린 케이블은 프론트 cascade가 함께 삭제 스테이지. 서버도 명시 검증(남은 케이블 있으면 409 CABLE_ATTACHED — DB Restrict의 친절판).

## Global Constraints

- v2 자립 격리·구 소스 무접촉(수정 허용: packages/core, backend/src/v2/**, frontend/src/v2/**, V2WorkspacePage). CONVENTIONS 준수.
- 타입키/역할 분기 금지(양쪽 가드레일 강제). 판정은 @twin/core만 — 이번 스테이지에서 중복을 오히려 **줄인다**(isAccepted/specFromCatalog 승격).
- 프론트: 반응형 슬라이스 구독 + 핸들러 getState(), 조작당 스테이지 1회, no-op 가드.
- 백엔드 테스트는 digital_next 실 DB 통합(`t4-` 픽스처 접두사, afterAll 정리), 시드 전제. 레거시+기존 스위트 전부 그린 유지 (backend 168 → 증가).
- core 수정 후 `npm run build -w @twin/core` 필수(backend/frontend가 dist 소비).
- 커밋 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: @twin/core 확장 — isAccepted·specFromCatalog·validateConnection 매체 규칙 (+양측 리팩터)

**Files:**
- Create: `packages/core/src/catalog/specFromCatalog.ts`
- Modify: `packages/core/src/validation/slotPlacement.ts`, `packages/core/src/validation/connection.ts`, `packages/core/src/index.ts`
- Modify: `backend/src/v2/spec.ts`(specFromCatalog 사용으로 축소), `frontend/src/v2/newAsset.ts`(acceptedTypes가 isAccepted 사용)
- Test: `packages/core/src/catalog/specFromCatalog.test.ts`, `packages/core/src/validation/connection.test.ts`(추가), `packages/core/src/validation/slotPlacement.test.ts`(isAccepted 추가)

**Interfaces:**
- Produces:
  - `isAccepted(accepts: AcceptRule, child: { typeKey: string; categoryKey: string }): boolean` — 빈 규칙=전체 수용, categoryKeys/typeKeys OR. `validateSlotPlacement` 내부와 프론트 `acceptedTypes`가 이것만 사용 (§6-4 중복 해소).
  - `specFromCatalog(row: CatalogTypeRow): AssetTypeSpec` — 구조적 입력 타입:
    ```ts
    interface CatalogTypeRow {
      key: string; name: string; sortOrder: number;
      category: { key: string };
      placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
      laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
      fieldDefs: unknown;
      containerSpecs: { key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: unknown; sortOrder: number }[];
      portTemplates: { group: string; count: number; direction: string; medium: string; namePattern: string; sortOrder: number }[];
      linkRules: { fromGroup: string; toGroup: string; mapping: string }[];
    }
    ```
    백엔드 Prisma include 행과 프론트 `V2AssetType`(+category join) 모두 구조적으로 만족. 정렬(sortOrder asc) 포함.
  - `validateConnection(a, b, occupiedPortIds, cableMedium?)` — 4번째 인자 추가: 지정 시 `a.medium !== cableMedium` → `'medium-mismatch'` (b는 기존 a↔b 동일성 규칙으로 커버).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/catalog/specFromCatalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { specFromCatalog } from './specFromCatalog.js';

const row = {
  key: 'RACK', name: '랙', sortOrder: 10,
  category: { key: '구조' },
  placeable: true, defaultWidth: 60, defaultHeight: 80,
  laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3,
  fieldDefs: [{ key: 'installDate', label: '설치일', type: 'date' }],
  containerSpecs: [
    { key: 'b', name: 'B', slotCount: null, allowSpan: false, accepts: {}, sortOrder: 2 },
    { key: 'a', name: 'A', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] }, sortOrder: 1 },
  ],
  portTemplates: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }],
  linkRules: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

describe('specFromCatalog', () => {
  it('구조적 행 → AssetTypeSpec (컨테이너 sortOrder 정렬 포함)', () => {
    const spec = specFromCatalog(row);
    expect(spec.key).toBe('RACK');
    expect(spec.categoryKey).toBe('구조');
    expect(spec.placement).toEqual({ placeable: true, defaultWidth: 60, defaultHeight: 80 });
    expect(spec.containers.map((c) => c.key)).toEqual(['a', 'b']);
    expect(spec.ports[0]).toMatchObject({ group: 'P', medium: 'network' });
    expect(spec.links[0]).toEqual({ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' });
  });
  it('null 기본크기는 placement에서 생략', () => {
    const spec = specFromCatalog({ ...row, defaultWidth: null, defaultHeight: null });
    expect('defaultWidth' in spec.placement).toBe(false);
  });
});
```

`packages/core/src/validation/connection.test.ts`에 추가:

```ts
  it('cableMedium 지정 시 포트 매체와 불일치 → medium-mismatch', () => {
    expect(validateConnection(port('p1', 'fiber'), port('p2', 'fiber'), new Set(), 'power')).toBe('medium-mismatch');
    expect(validateConnection(port('p1', 'fiber'), port('p2', 'fiber'), new Set(), 'fiber')).toBeNull();
  });
```

`packages/core/src/validation/slotPlacement.test.ts`에 추가:

```ts
import { isAccepted } from './slotPlacement.js';
// describe 블록 추가:
describe('isAccepted', () => {
  it('빈 규칙 전체 수용, categoryKeys/typeKeys OR', () => {
    expect(isAccepted({}, { typeKey: 'X', categoryKey: 'Y' })).toBe(true);
    expect(isAccepted({ categoryKeys: ['통신'] }, { typeKey: 'X', categoryKey: '통신' })).toBe(true);
    expect(isAccepted({ categoryKeys: ['통신'] }, { typeKey: 'X', categoryKey: '구조' })).toBe(false);
    expect(isAccepted({ typeKeys: ['X'] }, { typeKey: 'X', categoryKey: '구조' })).toBe(true);
  });
});
```

- [ ] **Step 2: RED 확인** — `npm test -w @twin/core` FAIL.

- [ ] **Step 3: 구현**

`slotPlacement.ts` — accepts 판정을 분리 export하고 내부에서 사용:

```ts
export function isAccepted(accepts: AcceptRule, child: { typeKey: string; categoryKey: string }): boolean {
  const { categoryKeys, typeKeys } = accepts;
  if (!categoryKeys && !typeKeys) return true;
  return (categoryKeys?.includes(child.categoryKey) ?? false) || (typeKeys?.includes(child.typeKey) ?? false);
}
```
(validateSlotPlacement의 기존 인라인 판정을 `if (!isAccepted(spec.accepts, args.child)) return 'not-accepted';`로 교체.)

`connection.ts`:

```ts
export function validateConnection(
  a: PortRef,
  b: PortRef,
  occupiedPortIds: ReadonlySet<string>,
  cableMedium?: string,
): ConnectError | null {
  if (a.id === b.id) return 'same-port';
  if (occupiedPortIds.has(a.id) || occupiedPortIds.has(b.id)) return 'port-occupied';
  if (a.medium !== b.medium) return 'medium-mismatch';
  if (cableMedium !== undefined && a.medium !== cableMedium) return 'medium-mismatch';
  return null;
}
```

`specFromCatalog.ts`:

```ts
import type { AcceptRule, AssetTypeSpec, Direction, FieldDef } from './types.js';

export interface CatalogTypeRow {
  key: string; name: string; sortOrder: number;
  category: { key: string };
  placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  fieldDefs: unknown;
  containerSpecs: { key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: unknown; sortOrder: number }[];
  portTemplates: { group: string; count: number; direction: string; medium: string; namePattern: string; sortOrder: number }[];
  linkRules: { fromGroup: string; toGroup: string; mapping: string }[];
}

/** 카탈로그 행(백엔드 Prisma include / 프론트 V2AssetType+category) → 코어 spec. 유일한 투영 지점. */
export function specFromCatalog(row: CatalogTypeRow): AssetTypeSpec {
  return {
    key: row.key,
    name: row.name,
    categoryKey: row.category.key,
    sortOrder: row.sortOrder,
    placement: {
      placeable: row.placeable,
      ...(row.defaultWidth !== null ? { defaultWidth: row.defaultWidth } : {}),
      ...(row.defaultHeight !== null ? { defaultHeight: row.defaultHeight } : {}),
    },
    labor: { laborType: row.laborType, installHours: row.installHours, removeHours: row.removeHours, relocateHours: row.relocateHours },
    fields: row.fieldDefs as FieldDef[],
    containers: [...row.containerSpecs]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((c) => ({ key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts as AcceptRule })),
    ports: [...row.portTemplates]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction as Direction, medium: p.medium, namePattern: p.namePattern })),
    links: row.linkRules.map((l) => ({ fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping as 'byIndex' | 'all' })),
  };
}
```

`index.ts`에 `export * from './catalog/specFromCatalog.js';` 추가.

**리팩터** (동작 무변경 — 기존 테스트가 회귀 가드):
- `backend/src/v2/spec.ts`: `typeRowToSpec`을 `specFromCatalog` 위임으로 축소 (`import { specFromCatalog } from '@twin/core'` — TypeRow는 CatalogTypeRow를 구조적으로 만족; TYPE_INCLUDE에 `category: true` 이미 있음). 시그니처·export 유지(호출부 무수정).
- `frontend/src/v2/newAsset.ts`: `acceptedTypes`가 `isAccepted(spec.accepts, { typeKey: t.key, categoryKey: categoryKeyById.get(t.categoryId) ?? '' })` 사용.

- [ ] **Step 4: GREEN + 전파 검증**

```bash
npm test -w @twin/core && npm run build -w @twin/core
npm test -w backend          # 168 유지 (spec.ts 리팩터 회귀 확인)
npm test -w frontend -- run src/v2   # 52 유지
npm run build                # 루트 EXIT 0
```

- [ ] **Step 5: Commit** — `feat(core): isAccepted·specFromCatalog 승격 + validateConnection 케이블 매체 규칙 (백/프론트 중복 해소)`

---

### Task 2: 백엔드 — 워킹카피 cables + 커밋 cables ops

**Files:**
- Modify: `backend/src/v2/workingcopy.routes.ts`, `backend/src/v2/schemas.ts`, `backend/src/v2/commit.service.ts`
- Test: `backend/src/v2/__tests__/commit-cables.test.ts`

**Interfaces:**
- Produces:
  - workingcopy 응답에 `cables: [{ id, name, substationId, aPortId, bPortId, categoryId, pathPoints, specParams, updatedAt }]` 추가 (변전소 스코프 — `substationId` 기준).
  - 커밋 payload 확장:
    ```
    cables?: { creates?: [{ id(uuid), aPortId, bPortId, categoryId?, name?, pathPoints?, specParams? }],
               updates?: [{ id, patch: { name?, categoryId?, pathPoints?, specParams? } }],   // 끝점 변경 불가 — 재연결은 삭제+생성
               deletes?: [id] }
    ```
    `baseVersions`에 cable id도 포함 (OCC — checkVersions가 Asset과 Cable 양쪽 조회).
  - 검증(applyCableCreate): 양쪽 포트 실재 + 포트의 자산이 해당 변전소 소속(같은 커밋 creates 포함 — 자산 적용 후 케이블 적용이므로 tx 조회로 충족) + 점유(기존 케이블의 aPortId/bPortId — tx 조회) + `validateConnection(a, b, occupied, groupKey?)` (categoryId 있으면 category→group.key를 cableMedium으로) → 코드 `CONNECT_SAME_PORT | CONNECT_PORT_OCCUPIED | CONNECT_MEDIUM_MISMATCH` 422.
  - 자산 삭제 검증 강화: applyDeletes 진입 시, 삭제 자산들의 포트에 물린 케이블 중 이번 payload의 cables.deletes에 없는 것이 있으면 409 `CABLE_ATTACHED` `{ cableIds }`.
  - 적용 순서: cables.deletes → assets(deletes→updates→creates) → cables.updates → cables.creates → records.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/v2/__tests__/commit-cables.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t4-cb-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subId: string, devAId: string, devBId: string, fiberCatId: string, powerCatId: string;

const commit = (payload: unknown) => request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload);
const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, index }, orderBy: { group: 'asc' } })).id;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  subId = sub.id;
  // 광 그룹/종류 (시드: fiber 그룹 존재)
  const fiberGroup = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  fiberCatId = fiberGroup.categories[0]!.id;
  const powerGroup = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'power' }, include: { categories: true } });
  powerCatId = powerGroup.categories[0]!.id;
  // 광슬롯 2개를 커밋으로 생성(포트 자동 인스턴스화: A/B 12코어 fiber)
  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
  devAId = randomUUID();
  devBId = randomUUID();
  await commit({
    assets: { creates: [
      { id: devAId, name: `${uniq}-slotA`, typeId: slotType.id },
      { id: devBId, name: `${uniq}-slotB`, typeId: slotType.id },
    ] },
  }).expect(200);
});

afterAll(async () => {
  await nextDb.cable.deleteMany({ where: { substationId: subId } });
  await nextDb.asset.deleteMany({ where: { substationId: subId } });
  await nextDb.substation.deleteMany({ where: { id: subId } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('cables in commit + workingcopy', () => {
  it('케이블 생성 → workingcopy에 나타남', async () => {
    const cid = randomUUID();
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(devAId, 1), bPortId: await portOf(devBId, 1), categoryId: fiberCatId }] },
    }).expect(200);
    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.cables).toHaveLength(1);
    expect(wc.cables[0]).toMatchObject({ id: cid, categoryId: fiberCatId });
    expect(typeof wc.cables[0].updatedAt).toBe('string');
  });

  it('점유 포트 재사용 → 422 CONNECT_PORT_OCCUPIED', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devAId, 1), bPortId: await portOf(devBId, 2), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('CONNECT_PORT_OCCUPIED');
  });

  it('전원 케이블을 광 포트에 → 422 CONNECT_MEDIUM_MISMATCH', async () => {
    const res = await commit({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(devAId, 3), bPortId: await portOf(devBId, 3), categoryId: powerCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('CONNECT_MEDIUM_MISMATCH');
  });

  it('케이블 update(pathPoints)/OCC/delete', async () => {
    const cable = await nextDb.cable.findFirstOrThrow({ where: { substationId: subId } });
    // 낡은 버전 → 409
    await commit({
      cables: { updates: [{ id: cable.id, patch: { pathPoints: [{ x: 1, y: 2 }] } }] },
      baseVersions: { [cable.id]: new Date('2000-01-01').toISOString() },
    }).expect(409);
    // 정상 update
    await commit({
      cables: { updates: [{ id: cable.id, patch: { pathPoints: [{ x: 1, y: 2 }] } }] },
      baseVersions: { [cable.id]: cable.updatedAt.toISOString() },
    }).expect(200);
    const updated = await nextDb.cable.findUniqueOrThrow({ where: { id: cable.id } });
    expect(updated.pathPoints).toEqual([{ x: 1, y: 2 }]);
    // delete
    await commit({
      cables: { deletes: [cable.id] },
      baseVersions: { [cable.id]: updated.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.cable.count({ where: { id: cable.id } })).toBe(0);
  });

  it('케이블 물린 자산 삭제(케이블 미포함) → 409 CABLE_ATTACHED; 함께 삭제 → 200', async () => {
    const cid = randomUUID();
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(devAId, 5), bPortId: await portOf(devBId, 5), categoryId: fiberCatId }] },
    }).expect(200);
    const a = await nextDb.asset.findUniqueOrThrow({ where: { id: devAId } });
    const cbl = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    const r1 = await commit({
      assets: { deletes: [devAId] },
      baseVersions: { [devAId]: a.updatedAt.toISOString() },
    }).expect(409);
    expect(r1.body.error).toBe('CABLE_ATTACHED');
    await commit({
      assets: { deletes: [devAId] },
      cables: { deletes: [cid] },
      baseVersions: { [devAId]: a.updatedAt.toISOString(), [cid]: cbl.updatedAt.toISOString() },
    }).expect(200);
  });

  it('같은 커밋에서 자산 생성 + 그 포트로 케이블 생성', async () => {
    const newId = randomUUID();
    const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
    const cid = randomUUID();
    // 새 자산의 포트 id는 클라이언트가 모름 → 생성 후 케이블은 별도 커밋이 자연스러움.
    // 단일 커밋 지원 검증: 자산 생성 커밋 → 포트 조회 → 케이블 커밋 (2단계 계약 확인)
    await commit({ assets: { creates: [{ id: newId, name: `${uniq}-slotC`, typeId: slotType.id }] } }).expect(200);
    await commit({
      cables: { creates: [{ id: cid, aPortId: await portOf(newId, 7), bPortId: await portOf(devBId, 7), categoryId: fiberCatId }] },
    }).expect(200);
    expect(await nextDb.cable.count({ where: { id: cid } })).toBe(1);
  });
});
```

(주의: 마지막 테스트가 문서화하는 계약 — **케이블 생성은 저장된 포트 id를 요구**한다. 같은 커밋 내 신규 자산의 포트로 케이블을 만드는 것은 지원하지 않음(포트 id는 서버 생성). 프론트 UX는 미저장 자산에 케이블 연결 시작을 막고 "먼저 저장하세요" 안내 — Task 4에서 반영.)

- [ ] **Step 2: RED 확인** — `npm test -w backend` FAIL (cables 필드 없음).

- [ ] **Step 3: 구현**

`schemas.ts` — commitPayloadSchema에 추가:

```ts
export const cableCreateSchema = z.object({
  id: z.string().uuid(),
  aPortId: z.string().uuid(),
  bPortId: z.string().uuid(),
  categoryId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).nullish(),
  pathPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  specParams: z.record(z.unknown()).optional(),
});
export const cablePatchSchema = z.object({
  name: z.string().trim().min(1).nullish().optional(),
  categoryId: z.string().uuid().nullish().optional(),
  pathPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  specParams: z.record(z.unknown()).optional(),
});
// commitPayloadSchema에:
  cables: z.object({
    creates: z.array(cableCreateSchema).optional(),
    updates: z.array(z.object({ id: z.string().uuid(), patch: cablePatchSchema })).optional(),
    deletes: z.array(z.string().uuid()).optional(),
  }).optional(),
```

`workingcopy.routes.ts` — Promise.all에 추가:

```ts
nextDb.cable.findMany({ where: { substationId: substation.id }, orderBy: { createdAt: 'asc' } }),
```
응답에 `cables` 포함.

`commit.service.ts` — 핵심 추가 (전문):

```ts
// checkVersions 확장: cable ids 도 조회
async function checkVersions(tx: Tx, payload: CommitPayload): Promise<void> {
  const base = payload.baseVersions ?? {};
  const assetIds = [...new Set([...(payload.assets?.updates ?? []).map((u) => u.id), ...(payload.assets?.deletes ?? [])])];
  const cableIds = [...new Set([...(payload.cables?.updates ?? []).map((u) => u.id), ...(payload.cables?.deletes ?? [])])];
  if (assetIds.length === 0 && cableIds.length === 0) return;
  const [assetRows, cableRows] = await Promise.all([
    assetIds.length ? tx.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, updatedAt: true } }) : [],
    cableIds.length ? tx.cable.findMany({ where: { id: { in: cableIds } }, select: { id: true, updatedAt: true } }) : [],
  ]);
  const server = new Map([...assetRows, ...cableRows].map((r) => [r.id, r.updatedAt.toISOString()]));
  type Conflict = { id: string; reason: 'deleted' } | { id: string; reason: 'modified'; serverUpdatedAt: string };
  const conflicts: Conflict[] = [...assetIds, ...cableIds].flatMap((id): Conflict[] => {
    const now = server.get(id);
    if (!now) return [{ id, reason: 'deleted' }];
    if (base[id] !== now) return [{ id, reason: 'modified', serverUpdatedAt: now }];
    return [];
  });
  if (conflicts.length > 0) throw new HttpError(409, 'CONFLICT', '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.', conflicts);
}

// commitSubstation 본문 적용 순서 교체:
    const cables = payload.cables ?? {};
    await applyCableDeletes(tx, substationId, cables.deletes ?? []);
    await assertNoAttachedCables(tx, assets.deletes ?? []);
    await applyDeletes(tx, substationId, assets.deletes ?? []);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c);
    for (const u of cables.updates ?? []) await applyCableUpdate(tx, substationId, u);
    for (const c of cables.creates ?? []) await applyCableCreate(tx, substationId, c);
    await applyRecords(tx, substationId, payload.records);

async function assertNoAttachedCables(tx: Tx, deletedAssetIds: string[]): Promise<void> {
  if (deletedAssetIds.length === 0) return;
  const remaining = await tx.cable.findMany({
    where: { OR: [
      { aPort: { assetId: { in: deletedAssetIds } } },
      { bPort: { assetId: { in: deletedAssetIds } } },
    ] },
    select: { id: true },
  });
  if (remaining.length > 0) {
    throw new HttpError(409, 'CABLE_ATTACHED', '삭제할 자산에 연결된 케이블이 있습니다. 케이블을 함께 삭제하세요.', { cableIds: remaining.map((c) => c.id) });
  }
}

async function applyCableDeletes(tx: Tx, substationId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const del = await tx.cable.deleteMany({ where: { id, substationId } });
    if (del.count === 0) throw new HttpError(422, 'INVALID_CABLE', '삭제 대상 케이블이 유효하지 않습니다');
  }
}

async function applyCableUpdate(tx: Tx, substationId: string, u: { id: string; patch: Record<string, unknown> }): Promise<void> {
  const existing = await tx.cable.findUnique({ where: { id: u.id } });
  if (!existing || existing.substationId !== substationId) throw new HttpError(422, 'INVALID_CABLE', '수정 대상 케이블이 유효하지 않습니다');
  const p = u.patch as { name?: string | null; categoryId?: string | null; pathPoints?: unknown; specParams?: unknown };
  await tx.cable.update({
    where: { id: u.id },
    data: {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.categoryId !== undefined ? { categoryId: p.categoryId } : {}),
      ...(p.pathPoints !== undefined ? { pathPoints: p.pathPoints as Prisma.InputJsonValue } : {}),
      ...(p.specParams !== undefined ? { specParams: p.specParams as Prisma.InputJsonValue } : {}),
    },
  });
}

async function applyCableCreate(tx: Tx, substationId: string, input: {
  id: string; aPortId: string; bPortId: string; categoryId?: string | null;
  name?: string | null; pathPoints?: { x: number; y: number }[]; specParams?: Record<string, unknown>;
}): Promise<void> {
  const [a, b] = await Promise.all([
    tx.port.findUnique({ where: { id: input.aPortId }, include: { asset: { select: { substationId: true } } } }),
    tx.port.findUnique({ where: { id: input.bPortId }, include: { asset: { select: { substationId: true } } } }),
  ]);
  if (!a || !b || a.asset.substationId !== substationId || b.asset.substationId !== substationId) {
    throw new HttpError(422, 'INVALID_PORT', '케이블 끝점 포트가 유효하지 않습니다');
  }
  const occupied = await tx.cable.findMany({
    where: { OR: [{ aPortId: { in: [a.id, b.id] } }, { bPortId: { in: [a.id, b.id] } }] },
    select: { id: true },
  });
  let cableMedium: string | undefined;
  if (input.categoryId) {
    const cat = await tx.cableCategory.findUnique({ where: { id: input.categoryId }, include: { group: true } });
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 종류가 유효하지 않습니다');
    cableMedium = cat.group.key;
  }
  const err = validateConnection(
    { id: a.id, assetId: a.assetId, group: a.group, index: a.index, name: a.name, direction: a.direction as 'IN' | 'OUT' | 'BI', medium: a.medium },
    { id: b.id, assetId: b.assetId, group: b.group, index: b.index, name: b.name, direction: b.direction as 'IN' | 'OUT' | 'BI', medium: b.medium },
    new Set(occupied.length > 0 ? [a.id] : []),  // 점유 존재 시 트리거용 — 아래 참고
    cableMedium,
  );
  if (occupied.length > 0) throw new HttpError(422, 'CONNECT_PORT_OCCUPIED', '이미 케이블이 연결된 포트입니다');
  if (err) throw new HttpError(422, `CONNECT_${err.toUpperCase().replace(/-/g, '_')}`, `연결할 수 없습니다: ${err}`);
  await tx.cable.create({
    data: {
      id: input.id, substationId, aPortId: a.id, bPortId: b.id,
      categoryId: input.categoryId ?? null, name: input.name ?? null,
      pathPoints: (input.pathPoints ?? []) as Prisma.InputJsonValue,
      specParams: (input.specParams ?? {}) as Prisma.InputJsonValue,
    },
  });
}
```

(구현 노트: 점유 검사는 위처럼 occupied.length로 직접 422를 던지는 게 명확 — validateConnection의 occupied set 인자는 빈 Set으로 호출해도 됨. 구현자가 더 깔끔히 정리해도 좋으나 에러 코드 3종(SAME_PORT/PORT_OCCUPIED/MEDIUM_MISMATCH)은 테스트 계약.)

- [ ] **Step 4: GREEN** — `npm test -w backend` 전체(기존 168 + 신규). `npm run build -w backend` EXIT 0.

- [ ] **Step 5: Commit** — `feat(v2): 커밋 cables ops — 코어 연결검증·매체·OCC·CABLE_ATTACHED + 워킹카피 cables`

---

### Task 3: 프론트 스토어 — cables 컬렉션 + cascade 케이블 + 페이로드

**Files:**
- Modify: `frontend/src/v2/types.ts`(V2Cable, V2Workingcopy.cables, V2CommitPayload.cables), `frontend/src/v2/store/workingCopyStore.ts`, `frontend/src/v2/store/buildCommitPayload.ts`
- Test: `frontend/src/v2/store/__tests__/workingCopyStore.test.ts`(추가), `frontend/src/v2/store/__tests__/buildCommitPayload.test.ts`(추가)

**Interfaces:**
- Produces:
  - `V2Cable = { id; name: string|null; substationId; aPortId; bPortId; categoryId: string|null; pathPoints: {x,y}[]; specParams: Record<string,unknown>; updatedAt: string }`
  - 스토어: `saved.cables`, `overlays.cables`, `baseVersions`에 cable updatedAt 포함(load 시), `stageCableCreate(cable)`, `stageCableUpdate(id, patch)`, `stageCableDelete(id)`, `effectiveCables()`, dirtyCount에 포함.
  - **cascade 확장**: `stageAssetDeleteCascade`가 대상 자산들의 포트 id 집합에 물린 effective 케이블을 함께 삭제 스테이지 (2A CABLE_ATTACHED 409를 프론트에서 예방).
  - `buildCommitPayload`: cables creates(서버 파생 substationId/updatedAt 제외)/updates/deletes + baseVersions(cable updates+deletes), **삭제 자산 관련 케이블은 cascade가 이미 deletes에 넣으므로 별도 드랍 규칙 불필요** — 단, deletes에 있는 케이블의 update 엔트리는 드랍(자산과 동일 방어).

- [ ] **Step 1: 실패하는 테스트 작성**

`workingCopyStore.test.ts`의 fixture `wc`에 cables 추가 + 테스트 추가:

```ts
// fixture: 자산 a-rack(port p-r1), a-mod(port p-m1) — asset() 헬퍼의 ports에 삽입
// asset('a-rack', ..., { ports: [{ id: 'p-r1', assetId: 'a-rack', group: 'P', index: 1, name: '포트 1', direction: 'BI', medium: 'network' }] })
// wc.cables = [{ id: 'c-1', name: null, substationId: 'sub-1', aPortId: 'p-r1', bPortId: 'p-m1', categoryId: null, pathPoints: [], specParams: {}, updatedAt: '2026-07-27T00:00:02.000Z' }]

it('load: cables saved + baseVersions 포함', () => {
  const s = useV2WorkingCopy.getState();
  expect(s.effectiveCables()).toHaveLength(1);
  expect(s.baseVersions['c-1']).toBe('2026-07-27T00:00:02.000Z');
});

it('stageCableCreate/Delete + dirty 반영', () => {
  const s = useV2WorkingCopy.getState();
  s.stageCableCreate({ id: 'c-tmp', name: null, substationId: 'sub-1', aPortId: 'p-x', bPortId: 'p-y', categoryId: null, pathPoints: [], specParams: {}, updatedAt: '' });
  expect(useV2WorkingCopy.getState().effectiveCables()).toHaveLength(2);
  expect(useV2WorkingCopy.getState().dirtyCount()).toBe(1);
  s.stageCableDelete('c-tmp');
  expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
});

it('cascade: 자산 삭제 시 그 포트의 케이블도 삭제 스테이지', () => {
  useV2WorkingCopy.getState().stageAssetDeleteCascade('a-rack'); // p-r1 보유 → c-1 물림
  const s = useV2WorkingCopy.getState();
  expect(s.effectiveCables()).toHaveLength(0);
  expect(s.overlays.cables.deletes).toEqual(['c-1']);
});
```

`buildCommitPayload.test.ts`에 추가:

```ts
it('cables: create 서버필드 제외 + baseVersions는 updates/deletes만 + 삭제 케이블 update 드랍', () => {
  const cable = { id: 'c-1', name: null, substationId: 's', aPortId: 'pa', bPortId: 'pb', categoryId: 'cat', pathPoints: [], specParams: {}, updatedAt: 'v' };
  const p = buildCommitPayload(
    { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(),
      cables: { creates: { 'c-1': cable }, updates: { 'c-2': { pathPoints: [{ x: 1, y: 2 }] }, 'c-3': { name: 'x' } }, deletes: ['c-3'] } },
    { 'c-2': 'v2', 'c-3': 'v3' },
  );
  const c = p.cables!.creates![0]! as Record<string, unknown>;
  expect('substationId' in c).toBe(false);
  expect('updatedAt' in c).toBe(false);
  expect(p.cables!.updates).toEqual([{ id: 'c-2', patch: { pathPoints: [{ x: 1, y: 2 }] } }]);
  expect(p.cables!.deletes).toEqual(['c-3']);
  expect(p.baseVersions).toEqual({ 'c-2': 'v2', 'c-3': 'v3' });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (store: Overlays에 `cables: Overlay<V2Cable>` 추가, load에서 `wc.cables` 적재 + baseVersions에 `...wc.cables.map((c) => [c.id, c.updatedAt])`, cascade는 대상 자산 집합 확정 후 `const portIds = new Set(effAssets.filter((a) => targets.has(a.id)).flatMap((a) => a.ports.map((p) => p.id)))` → effective 케이블 중 `portIds.has(aPortId) || portIds.has(bPortId)` 인 것 stageDelete. buildCommitPayload: toCableCreateInput이 `{ id, aPortId, bPortId, categoryId, name, pathPoints, specParams }` 투영.)

- [ ] **Step 3: 검증 → Commit** — `npm test -w frontend -- run src/v2` 전체, `npm run build -w frontend` EXIT 0.
`feat(v2-fe): 스토어 cables 컬렉션 — cascade 케이블 포함·OCC·페이로드`

---

### Task 4: 케이블 연결 UX + 캔버스 렌더

**Files:**
- Create: `frontend/src/v2/components/PortPickerPopover.tsx`, `frontend/src/v2/cableSelectors.ts`
- Modify: `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/canvas/renderers.ts`(케이블 렌더 추가)
- Test: `frontend/src/v2/__tests__/cableSelectors.test.ts`

**Interfaces:**
- Produces:
  - `cableSelectors.ts` (순수, TDD):
    - `freePortsOf(asset: V2Asset, cables: V2Cable[], medium?: string): V2Port[]` — 케이블 미점유 + (medium 지정 시) 일치 포트
    - `occupiedPortIds(cables: V2Cable[]): Set<string>`
    - `cableEndpointsForRender(cables, placedAssets, portsById... )` 대신 단순화: `cableSegments(cables: V2Cable[], assets: V2Asset[], floorId: string): { id: string; categoryId: string|null; points: {x,y}[]; aAssetId: string; bAssetId: string }[]` — 양끝 포트의 자산이 **해당 층에 배치된** 케이블만, points = [a자산 중심, ...pathPoints, b자산 중심]
  - `canvas/renderers.ts`에 `renderCables(ctx, segments: {points, color, selected}[], ): void` — 폴리라인(색=그룹 색, 선택 시 SELECTION_STYLES stroke 두껍게). **색은 호출부가 categoryId→group.color 매핑해 넘김** (렌더러는 데이터만).
  - FloorPlanView 케이블 도구: 도구바에 `케이블` 토글 + 종류 Select(그룹별 optgroup — useV2Catalog cableGroups). 활성(armed) 상태에서:
    1) 자산 클릭 → `PortPickerPopover` (해당 자산의 freePortsOf(medium=선택 종류의 그룹 key), 그룹·이름 표시, `updatedAt===''`인 미저장 자산이면 "저장 후 연결 가능" 안내만)
    2) 포트 선택 → 첫 끝점 확정(캔버스에 해당 자산 강조)
    3) 두 번째 자산 클릭 → 피커 → 선택 시 `stageCableCreate(makeNewCable(...))` (id=randomUUID, pathPoints:[], substationId, categoryId=선택 종류) → 도구 유지(연속 연결), ESC로 해제
  - 케이블 클릭 선택: 캔버스 클릭 히트(세그먼트 근접 8/scale — 순수 함수 `distanceToPolyline(p, points): number`를 cableSelectors에 추가+테스트) → `selectedCableId` 로컬 state → Delete 키 또는 우클릭 메뉴 없이 상단 소형 액션(선택 시 "케이블 삭제" 버튼) → `stageCableDelete`.

- [ ] **Step 1: 셀렉터 TDD**

```ts
import { describe, expect, it } from 'vitest';
import { cableSegments, distanceToPolyline, freePortsOf, occupiedPortIds } from '../cableSelectors';

const port = (id: string, assetId: string, medium = 'fiber') => ({ id, assetId, group: 'A', index: 1, name: id, direction: 'BI' as const, medium });
const cable = (id: string, a: string, b: string, pathPoints: {x:number;y:number}[] = []) => ({ id, name: null, substationId: 's', aPortId: a, bPortId: b, categoryId: null, pathPoints, specParams: {}, updatedAt: 'v' });

describe('freePortsOf / occupiedPortIds', () => {
  const asset = { id: 'a1', ports: [port('p1', 'a1'), port('p2', 'a1', 'power')] } as never;
  it('점유 제외 + medium 필터', () => {
    const cables = [cable('c1', 'p1', 'px')];
    expect(freePortsOf(asset, cables as never).map((p) => p.id)).toEqual(['p2']);
    expect(freePortsOf(asset, [] as never, 'fiber').map((p) => p.id)).toEqual(['p1']);
    expect(occupiedPortIds(cables as never)).toEqual(new Set(['p1', 'px']));
  });
});

describe('cableSegments', () => {
  const a1 = { id: 'a1', floorId: 'f1', x: 0, y: 0, width: 20, height: 20, ports: [port('p1', 'a1')] };
  const a2 = { id: 'a2', floorId: 'f1', x: 100, y: 0, width: 20, height: 20, ports: [port('p2', 'a2')] };
  const a3 = { id: 'a3', floorId: 'f2', x: 0, y: 0, width: 20, height: 20, ports: [port('p3', 'a3')] };
  it('양끝 모두 해당 층 배치 케이블만, 중심점+경유점', () => {
    const segs = cableSegments([cable('c1', 'p1', 'p2', [{ x: 50, y: 50 }]), cable('c2', 'p1', 'p3')] as never, [a1, a2, a3] as never, 'f1');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.points).toEqual([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 110, y: 10 }]);
  });
});

describe('distanceToPolyline', () => {
  it('세그먼트 수직거리', () => {
    expect(distanceToPolyline({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(3);
    expect(distanceToPolyline({ x: -5, y: 0 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(5);
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (distanceToPolyline은 구 `geometryUtils.pointToPolylineDistance` 이식 가능 — ported 주석)

- [ ] **Step 3: UX/렌더 구현** (인터페이스 명세대로. 렌더 순서: 배경→그리드→**케이블**→자산→프리뷰. 색: `categoryId→cableGroups` 맵은 FloorPlanView가 useMemo로 구성해 segments에 병합.)

- [ ] **Step 4: 검증 → Commit** — 전체 테스트+빌드. 브라우저: 광슬롯 2개 배치·저장 → 케이블 도구로 연결 → 선 렌더(그룹 색) → 저장.
`feat(v2-fe): 케이블 연결 UX(종류우선·포트 피커) + 캔버스 케이블 렌더`

---

### Task 5: 연결 탭 + 클라이언트 추적

**Files:**
- Create: `frontend/src/v2/traceSelectors.ts`, `frontend/src/v2/components/ConnectionsTab.tsx`
- Modify: `frontend/src/v2/components/AssetDetailPanel.tsx`(연결 탭 추가), `frontend/src/v2/components/FloorPlanView.tsx`(추적 하이라이트 오버레이)
- Test: `frontend/src/v2/__tests__/traceSelectors.test.ts`

**Interfaces:**
- Produces:
  - `traceSelectors.ts` (순수, TDD):
    - `buildTraceInputs(args: { types: V2AssetType[]; categories: V2Category[]; assets: V2Asset[]; cables: V2Cable[] }): { types: Record<string, AssetTypeSpec>; assets: AssetRef[]; ports: PortRef[]; cables: CableRef[] }` — `specFromCatalog`로 spec 변환(카테고리 join), V2Asset→AssetRef(typeKey는 typesById 경유), ports 평탄화, V2Cable→CableRef
    - `traceHighlight(inputs, startPortId): { assetIds: Set<string>; cableIds: Set<string>; hops: TraceHop[] }` — `buildTraceGraph`+`traceFrom` 호출 후 방문 포트의 assetId·케이블 id 집합
  - `ConnectionsTab({ assetId })`: 상세 패널 4번째 탭 '연결' — 자산의 포트 목록(그룹별): 각 포트에 연결 상태(상대 자산·포트 이름 — effective cables + 전체 assets에서 해소) 표시, 연결 포트에 [추적] 버튼 → `traceHighlight` 결과를 페이지 레벨 state `traceResult: { assetIds, cableIds } | null`로 올림(콜백 prop) + 경로 텍스트 목록(hop 순서: 자산명·포트명, internal hop은 "↔ 내부"), [지우기]로 해제
  - FloorPlanView: `traceResult` prop — 있으면 해당 자산·케이블을 강조(선택 하이라이트 스타일, 나머지는 알파 감쇠 0.3), 클릭·편집은 정상 동작
  - 트레이스는 **effective 데이터** 기준(미저장 케이블도 추적됨 — 워킹카피 SSOT 일관).

- [ ] **Step 1: 추적 셀렉터 TDD** — OFD 채널 보존 시나리오 (코어 테스트와 동형이지만 **V2 형상 입력→코어 호출 배선**을 검증):

```ts
import { describe, expect, it } from 'vitest';
import { buildTraceInputs, traceHighlight } from '../traceSelectors';

const cat = { id: 'cat-t', key: '통신', name: '통신', sortOrder: 1 };
const slotType = {
  id: 't-slot', key: 'OFD-SLOT', name: '광슬롯', categoryId: 'cat-t', sortOrder: 1, isActive: true,
  placeable: false, defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [],
  containerSpecs: [],
  portTemplates: [
    { id: 'pt-a', group: 'A', count: 4, direction: 'BI', medium: 'fiber', namePattern: '성단 {n}', sortOrder: 0 },
    { id: 'pt-b', group: 'B', count: 4, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', sortOrder: 1 },
  ],
  linkRules: [{ id: 'lr', fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};
const devType = { ...slotType, id: 't-dev', key: 'DEV-X', portTemplates: [{ id: 'pt-p', group: 'P', count: 2, direction: 'BI', medium: 'fiber', namePattern: '포트 {n}', sortOrder: 0 }], linkRules: [] };

const mkPort = (id: string, assetId: string, group: string, index: number) => ({ id, assetId, group, index, name: `${group}${index}`, direction: 'BI' as const, medium: 'fiber' });
const mkAsset = (id: string, typeId: string, ports: ReturnType<typeof mkPort>[]) => ({
  id, name: id, typeId, substationId: 's', status: 'normal', floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null, fieldValues: {}, updatedAt: '', ports,
});

const assets = [
  mkAsset('dev1', 't-dev', [mkPort('d1p1', 'dev1', 'P', 1)]),
  mkAsset('slot1', 't-slot', [mkPort('s1a3', 'slot1', 'A', 3), mkPort('s1b3', 'slot1', 'B', 3), mkPort('s1b4', 'slot1', 'B', 4)]),
  mkAsset('dev2', 't-dev', [mkPort('d2p1', 'dev2', 'P', 1)]),
];
const cables = [
  { id: 'c1', name: null, substationId: 's', aPortId: 'd1p1', bPortId: 's1a3', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
  { id: 'c2', name: null, substationId: 's', aPortId: 's1b3', bPortId: 'd2p1', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
];

describe('traceHighlight — OFD 채널 보존 (V2→코어 배선)', () => {
  it('dev1 포트에서 시작 → 슬롯 내부(byIndex) 경유 → dev2까지', () => {
    const inputs = buildTraceInputs({ types: [slotType, devType] as never, categories: [cat] as never, assets: assets as never, cables: cables as never });
    const r = traceHighlight(inputs, 'd1p1');
    expect(r.assetIds).toEqual(new Set(['dev1', 'slot1', 'dev2']));
    expect(r.cableIds).toEqual(new Set(['c1', 'c2']));
    expect(r.hops.map((h) => h.kind)).toEqual(['cable', 'internal', 'cable']);
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (buildTraceInputs: typesById로 typeKey 해소, categoriesById로 category.key join → specFromCatalog. traceHighlight: 코어 buildTraceGraph/traceFrom + hops에서 포트→assetId·cableId 수집 — 시작 포트의 assetId 포함.)

- [ ] **Step 3: 탭 + 하이라이트 구현 → 검증 → Commit** — 전체 테스트+빌드.
`feat(v2-fe): 연결 탭 + 클라이언트 추적 하이라이트 — 코어 그래프 엔진 직결`

---

### Task 6: 종합 검증 + 브라우저 시나리오

- [ ] **Step 1: 전체 검증**

```bash
npm test -w @twin/core && npm test -w backend && npm test -w frontend -- run src/v2 && npm run build
```

- [ ] **Step 2: 브라우저 종합 시나리오 (컨트롤러 검증 — 저장은 DB 확인)**
1. 변전소에 OFD 배치 → OFD 슬롯(광슬롯) 추가 ×1, 장비(PITR 등) 2대 배치 → 저장
2. 케이블 도구(광 종류) → 장비1 포트 ↔ 슬롯 성단3 연결, 슬롯 선로3 ↔ 장비2 연결 → 캔버스에 그룹 색 선 2개 → 저장 → DB cable 2행 확인
3. 점유 포트 재연결 시도 → 포트 피커에 해당 포트 미표시(freePortsOf) 확인
4. 전원 종류로 광 포트 연결 시도 → 피커에 광 포트 미표시(medium 필터)
5. 장비1 상세 → 연결 탭 → 포트에 상대편 표시 → [추적] → 캔버스에 장비1·슬롯·장비2 + 케이블 2개 하이라이트, 경로 목록에 internal hop 표시 (**OFD 채널 보존의 화면 증명**)
6. 장비1 삭제(cascade confirm) → 케이블도 함께 스테이지 삭제(dirty에 반영) → 저장 → DB에서 자산·케이블 소거 확인
7. 미저장 신규 자산에 케이블 연결 시도 → "저장 후 연결 가능" 안내

- [ ] **Step 3: Commit** (수정 발생 시) — `fix(v2-fe): Stage4 브라우저 검증 반영 — <내용>`

---

## 완료 기준 (Stage 4 DoD)

1. 전 스위트 그린(코어·백엔드·프론트), 루트 빌드 EXIT 0. isAccepted/specFromCatalog 승격으로 백/프론트 중복 판정 코드 0.
2. 브라우저 7항목 통과 (DB 확인 포함).
3. main 머지.

## 명시적 비목표 (Stage 4)

- 대국(크로스 변전소) 케이블 — Stage 5 (선번장과 함께)
- pathPoints 경유점 편집 UI — 후속 (렌더는 지원)
- 서버 trace API — 스케일 트리거 시 (클라이언트 추적으로 충분)
- 케이블 이름 자동 생성 규칙 — Stage 5(선번장)에서 결정
- 포트 수량 오버라이드 UI(portCounts) — Stage 6
- 연결 direction 검증 — 확정 기각(표시 정보)
