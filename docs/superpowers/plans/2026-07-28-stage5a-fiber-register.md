# Stage 5A: 대국 케이블 + 선번장 (+S4 하드닝) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크로스 변전소(대국) 케이블을 지원하고, 선번장을 capability 질의(광 매체 포트 자식을 보유한 컨테이너)로 복원한다. Stage 4 이월 하드닝을 선행 정리한다. (전원 계통·설계서는 Stage 5B 별도 계획.)

**Architecture:** 대국 케이블 = 커밋 대상 변전소가 **소유**(Cable.substationId)하되 반대편 끝점은 임의 변전소 포트 허용. 워킹카피 read가 케이블 양끝의 자산·변전소·포트명을 **서버 파생 ref**로 내려줘(read-only enrichment) 프론트가 대국 이름을 즉시 표시 — 구 useAssetRefs의 단순화. 대국 끝점 선택은 검색 API(전 변전소 자산 이름 검색) + 포트 목록 API. 선번장은 코드 뷰 + 데이터 질의: 특정 role이 아니라 "광 매체(FIBER_MEDIUM='fiber' — CableGroup.key 데이터 값) 포트를 가진 자식을 실보유한 컨테이너"를 열거하고, 슬롯의 포트 **그룹을 동적으로 컬럼화**(A/B 하드코딩 없음 — 임의 그룹 수 지원).

**Tech Stack:** 기존 스택. 신규 의존성 0. 신규 엔드포인트 2 (search/assets, assets/:id/ports).

## 확정 설계 결정

- **케이블 소유권**: 생성한 변전소가 소유. 삭제/수정은 소유 변전소 커밋에서만. 반대편 변전소에서 끝점 자산 삭제 시 `CABLE_ATTACHED` 409 — details에 `{ cableIds, ownerSubstationNames }` 포함(어디서 지워야 하는지 안내).
- **케이블 생성 검증 완화**: 최소 한쪽 끝점이 커밋 대상 변전소 자산의 포트. 반대편은 임의 변전소(점유·매체 규칙은 동일 적용).
- **선번장 메타**: 케이블 `specParams` 관례 키 `{ lengthM?: number, lossDb?: number, inspectedAt?: string(YYYY-MM-DD) }` — 선번장에서 인라인 편집(stageCableUpdate, specParams 병합). 설계서(5B)의 케이블 공량 길이도 `lengthM` 사용.
- **케이블 이름 자동 생성 기각**: name은 선택 입력 유지. 표시는 항상 양끝 ref 조합("자산A·포트 ↔ 자산B·포트") — 이름 규칙이라는 상태를 만들지 않음(파생 표시가 SSOT).

## Global Constraints

- v2 자립 격리·구 소스 무접촉(수정 허용: backend/src/v2/**, frontend/src/v2/**, V2WorkspacePage). CONVENTIONS 준수(선번장 테이블도 text-sm/text-xs·시맨틱 토큰).
- 타입키/역할 분기 금지(가드레일). 매체 상수 `FIBER_MEDIUM = 'fiber'`는 뷰 파라미터(데이터 값 참조)로 1곳 선언.
- 판정은 @twin/core만. 프론트: 반응형 슬라이스 구독 + 핸들러 getState(), 조작당 스테이지 1회.
- 백엔드 테스트 digital_next 실 DB(`t5-` 접두사, afterAll 정리). 전 스위트 그린 유지(core 43·backend 179·fe 62 시작점).
- 커밋 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: S4 하드닝 묶음 (프론트)

**Files:**
- Modify: `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/components/PortPickerPopover.tsx`, `frontend/src/v2/pages/V2WorkspacePage.tsx`, `frontend/src/v2/traceSelectors.ts`, `frontend/src/v2/components/ConflictDialog.tsx`
- Test: `frontend/src/v2/__tests__/traceSelectors.test.ts` (추가)

**Interfaces:**
- Produces:
  - `traceSelectors.ts`에 `expandToPlacedAncestors(traceAssetIds: Set<string>, assets: { id: string; parentAssetId: string | null }[]): Set<string>` — 추적 자산 집합을 조상 체인 포함으로 확장(부모 맵 1회 구성, O(n)). FloorPlanView의 렌더 루프는 per-frame 계산 대신 **traceResult 변경 시 1회** 이 함수로 확장된 Set을 ref에 저장해 사용.
  - 케이블 스테이지 전 사전 검증: `handlePortSelect` 두 번째 끝점에서 `validateConnection(aPortRef, bPortRef, occupied, groupKey)` (@twin/core) 호출 — 에러면 stage 대신 안내 텍스트(피커 내 `text-danger text-xs`, 코드→한글: same-port '같은 포트' / port-occupied '이미 연결됨' / medium-mismatch '매체 불일치').
  - stale 추적 클리어: V2WorkspacePage에서 `useEffect(() => { if (traceResult) setTraceResult(null); }, [overlays])` (스테이지 발생 시 추적 해제 — overlays 슬라이스 구독).
  - 팝오버 클리핑 해소: PortPickerPopover 본체를 `fixed` + viewport 좌표로 전환(호출부가 client 좌표 전달), 화면 우/하단 넘칠 때 반대 방향 플립.
  - ConflictDialog: 충돌 id가 effective 케이블이면 "케이블: {a자산}↔{b자산}" 로컬 해소 표기(자산이면 자산명 — 기존), 미해소 id는 축약 id.

- [ ] **Step 1: expandToPlacedAncestors TDD**

```ts
// traceSelectors.test.ts 에 추가
import { expandToPlacedAncestors } from '../traceSelectors';

describe('expandToPlacedAncestors', () => {
  it('추적 자산의 조상 체인 포함 확장', () => {
    const assets = [
      { id: 'ofd', parentAssetId: null },
      { id: 'slot', parentAssetId: 'ofd' },
      { id: 'sub', parentAssetId: 'slot' },
      { id: 'other', parentAssetId: null },
    ];
    expect(expandToPlacedAncestors(new Set(['sub']), assets)).toEqual(new Set(['sub', 'slot', 'ofd']));
    expect(expandToPlacedAncestors(new Set(['ofd']), assets)).toEqual(new Set(['ofd']));
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (구현: parentById 맵 1회 → 각 id에서 체인 상승하며 추가)
- [ ] **Step 3: 나머지 하드닝 구현** (명세대로 — FloorPlanView의 기존 per-frame withDescendants 스캔 제거)
- [ ] **Step 4: 검증 → Commit** — `npm test -w frontend -- run src/v2` 전체 그린, 빌드 EXIT 0.
`fix(v2-fe): S4 하드닝 — 사전 연결검증·추적확장 프리컴퓨트·stale 추적 클리어·팝오버 fixed·충돌 케이블 표기`

---

### Task 2: 백엔드 — 대국 케이블 + refs enrichment + 검색/포트 API

**Files:**
- Modify: `backend/src/v2/commit.service.ts`(applyCableCreate 완화, assertNoAttachedCables details 확장), `backend/src/v2/workingcopy.routes.ts`(refs enrichment), `backend/src/v2/router.ts`
- Create: `backend/src/v2/search.routes.ts`
- Test: `backend/src/v2/__tests__/remote-cables.test.ts`

**Interfaces:**
- Produces:
  - applyCableCreate: `a.asset.substationId === substationId || b.asset.substationId === substationId` (둘 다 아니면 422 INVALID_PORT). 점유·매체 검증은 기존 그대로(양쪽 무관).
  - assertNoAttachedCables: 409 details `{ cableIds: string[], ownerSubstationNames: string[] }` (남은 케이블들의 소유 변전소명 distinct — Cable→Substation join).
  - workingcopy cables 응답 각 항목에 파생 필드 추가:
    ```
    aRef: { portName, portGroup, portIndex, assetId, assetName, substationId, substationName },
    bRef: { ...동일 }
    ```
    (Port→Asset→Substation join. 항상 포함 — 로컬 끝점도.)
  - `GET /api/v2/search/assets?q=<부분일치>&limit=<기본 20, 최대 50>` (authenticate) → `[{ id, name, substationId, substationName, typeName }]` — 이름 contains(대소문자 무시), 이름·변전소명 순 정렬. q 미제공/공백 → 400.
  - `GET /api/v2/assets/:id/ports` (authenticate) → `[{ id, group, index, name, direction, medium, occupied: boolean }]` — occupied = 케이블 aPortId/bPortId 존재. 미존재 자산 404.

- [ ] **Step 1: 실패하는 테스트 작성** — `remote-cables.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t5-rc-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subAId: string, subBId: string, slotAId: string, slotBId: string, fiberCatId: string;

const portOf = async (assetId: string, index: number) =>
  (await nextDb.port.findFirstOrThrow({ where: { assetId, group: 'A', index } })).id;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sA = await nextDb.substation.create({ data: { name: `${uniq}-국사A`, branchId: br.id } });
  const sB = await nextDb.substation.create({ data: { name: `${uniq}-국사B`, branchId: br.id } });
  subAId = sA.id;
  subBId = sB.id;
  const slotType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'OFD-SLOT' } });
  slotAId = randomUUID();
  slotBId = randomUUID();
  await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin)
    .send({ assets: { creates: [{ id: slotAId, name: `${uniq}-슬롯A`, typeId: slotType.id }] } }).expect(200);
  await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin)
    .send({ assets: { creates: [{ id: slotBId, name: `${uniq}-슬롯B`, typeId: slotType.id }] } }).expect(200);
  const g = await nextDb.cableGroup.findUniqueOrThrow({ where: { key: 'fiber' }, include: { categories: true } });
  fiberCatId = g.categories[0]!.id;
});

afterAll(async () => {
  await nextDb.cable.deleteMany({ where: { substationId: { in: [subAId, subBId] } } });
  await nextDb.asset.deleteMany({ where: { substationId: { in: [subAId, subBId] } } });
  await nextDb.substation.deleteMany({ where: { id: { in: [subAId, subBId] } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('대국 케이블', () => {
  it('A국사 커밋으로 B국사 포트와 연결 — 소유=A', async () => {
    const cid = randomUUID();
    await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
      cables: { creates: [{ id: cid, aPortId: await portOf(slotAId, 1), bPortId: await portOf(slotBId, 1), categoryId: fiberCatId }] },
    }).expect(200);
    const cable = await nextDb.cable.findUniqueOrThrow({ where: { id: cid } });
    expect(cable.substationId).toBe(subAId);
  });

  it('양끝 모두 타 변전소 → 422 INVALID_PORT', async () => {
    const res = await request(app).put(`/api/v2/substations/${subAId}/commit`).set(admin).send({
      cables: { creates: [{ id: randomUUID(), aPortId: await portOf(slotBId, 2), bPortId: await portOf(slotBId, 3), categoryId: fiberCatId }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_PORT');
  });

  it('워킹카피 refs: 대국 끝점의 자산·변전소명 포함', async () => {
    const wc = (await request(app).get(`/api/v2/substations/${subAId}/workingcopy`).set(admin).expect(200)).body;
    const c = wc.cables[0];
    expect(c.aRef).toMatchObject({ assetName: `${uniq}-슬롯A`, substationName: `${uniq}-국사A`, portGroup: 'A', portIndex: 1 });
    expect(c.bRef).toMatchObject({ assetName: `${uniq}-슬롯B`, substationName: `${uniq}-국사B` });
  });

  it('반대편(B국사)에서 끝점 자산 삭제 → 409 CABLE_ATTACHED + 소유 변전소명', async () => {
    const b = await nextDb.asset.findUniqueOrThrow({ where: { id: slotBId } });
    const res = await request(app).put(`/api/v2/substations/${subBId}/commit`).set(admin).send({
      assets: { deletes: [slotBId] },
      baseVersions: { [slotBId]: b.updatedAt.toISOString() },
    }).expect(409);
    expect(res.body.error).toBe('CABLE_ATTACHED');
    expect(res.body.details.ownerSubstationNames).toContain(`${uniq}-국사A`);
  });
});

describe('검색/포트 API', () => {
  it('자산 이름 검색 — 전 변전소, 변전소명 포함', async () => {
    const rows = (await request(app).get(`/api/v2/search/assets?q=${encodeURIComponent(`${uniq}-슬롯`)}`).set(admin).expect(200)).body;
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveProperty('substationName');
  });
  it('빈 q → 400', async () => {
    await request(app).get('/api/v2/search/assets?q=%20').set(admin).expect(400);
  });
  it('포트 목록 + occupied', async () => {
    const ports = (await request(app).get(`/api/v2/assets/${slotBId}/ports`).set(admin).expect(200)).body;
    const p1 = ports.find((p: { group: string; index: number }) => p.group === 'A' && p.index === 1);
    expect(p1.occupied).toBe(true);
    const p5 = ports.find((p: { group: string; index: number }) => p.group === 'A' && p.index === 5);
    expect(p5.occupied).toBe(false);
  });
  it('미존재 자산 포트 → 404', async () => {
    await request(app).get(`/api/v2/assets/${randomUUID()}/ports`).set(admin).expect(404);
  });
});
```

- [ ] **Step 2: RED → 구현** (핵심: applyCableCreate 소유 검증을 OR로, `substationId`는 커밋 대상 유지. workingcopy: cable include `{ aPort: { include: { asset: { include: { substation: true } } } }, bPort: {...동일} }` → 응답 매핑에서 aRef/bRef 구성 + aPort/bPort 원본 오브젝트는 응답에서 제거(평탄 계약 유지). assertNoAttachedCables: 남은 케이블 include substation → distinct 이름. search.routes.ts: contains + mode 'insensitive', take clamp. ports: findUnique asset 404 → ports findMany + occupied 케이블 존재 조회.)
- [ ] **Step 3: GREEN** — `npm test -w backend` (179 + 8 신규). 빌드 EXIT 0.
- [ ] **Step 4: Commit** — `feat(v2): 대국 케이블 — 소유 변전소 모델·refs enrichment·검색/포트 API`

---

### Task 3: 프론트 — 대국 연결 UX + refs 반영

**Files:**
- Modify: `frontend/src/v2/types.ts`(V2CableRef, V2Cable.aRef/bRef optional), `frontend/src/v2/api.ts`(searchAssets/fetchAssetPorts), `frontend/src/v2/components/PortPickerPopover.tsx`, `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/components/ConnectionsTab.tsx`
- Create: `frontend/src/v2/components/RemoteEndpointModal.tsx`
- Test: `frontend/src/v2/__tests__/api.test.ts`(경로 추가)

**Interfaces:**
- Produces:
  - `V2CableRef = { portName; portGroup; portIndex; assetId; assetName; substationId; substationName }`; `V2Cable`에 `aRef?: V2CableRef; bRef?: V2CableRef` (read 전용 — buildCommitPayload create 투영에 포함 금지 확인).
  - `searchAssets(q): Promise<{id,name,substationId,substationName,typeName}[]>` → `/v2/search/assets?q=`; `fetchAssetPorts(assetId)` → `/v2/assets/:id/ports`.
  - PortPickerPopover 하단에 `다른 변전소에서 찾기…` 버튼(첫 끝점이 있을 때만) → `RemoteEndpointModal`: 검색 Input(300ms 디바운스) → 결과 리스트(이름·변전소명·타입) → 자산 선택 → 포트 리스트(occupied 제외 + medium 필터 + excludePortId) → 선택 시 두 번째 끝점으로 `handlePortSelect` 동일 경로(사전 validateConnection 포함 — PortRef는 응답 필드로 구성).
  - ConnectionsTab 상대편 표시: 로컬 해소 실패 시 saved 케이블의 `aRef/bRef`에서 상대편 이름·변전소 표기("자산B (국사B) · 선로 3"). staged 케이블(refs 없음)은 기존 로컬 해소.

- [ ] **Step 1: api 경로 테스트 추가** (기존 api.test.ts 패턴):

```ts
await searchAssets('슬롯');
expect(api.get).toHaveBeenCalledWith('/v2/search/assets', { params: { q: '슬롯' } });
await fetchAssetPorts('a-1');
expect(api.get).toHaveBeenCalledWith('/v2/assets/a-1/ports');
```

- [ ] **Step 2: RED → 구현 → GREEN → 빌드 EXIT 0**
- [ ] **Step 3: Commit** — `feat(v2-fe): 대국 끝점 검색 모달 + 케이블 refs 표시`

---

### Task 4: 선번장 행 파생 (fiberSelectors)

**Files:**
- Create: `frontend/src/v2/fiberSelectors.ts`
- Test: `frontend/src/v2/__tests__/fiberSelectors.test.ts`

**Interfaces:**
- Produces:
  - `FIBER_MEDIUM = 'fiber'` (뷰 파라미터 상수 — CableGroup.key 데이터 값 참조, 유일 선언 지점)
  - `fiberContainers(assets: V2Asset[]): V2Asset[]` — 자식(parentAssetId=자신) 중 `ports.some(p => p.medium === FIBER_MEDIUM)`인 자산을 1개 이상 보유한 자산들 (이름순)
  - `FiberRow = { slotId; slotName; coreIndex; cells: { group: string; portId: string | null; portName: string | null; cableId: string | null; peer: { assetName: string; portName: string; substationName: string | null; remote: boolean } | null }[]; meta: { cableId: string | null; lengthM: number | null; lossDb: number | null; inspectedAt: string | null } }`
  - `buildFiberRows(container: V2Asset, assets: V2Asset[], cables: V2Cable[]): { groups: string[]; rows: FiberRow[] }` —
    - 대상 슬롯 = 컨테이너의 자식 중 광 포트 보유 자산(이름순)
    - `groups` = 슬롯들의 광 포트 그룹명 합집합(포트 정렬 순 — A/B 하드코딩 없음)
    - 행 = 슬롯 × coreIndex(1..그룹별 max index), 셀 = 각 그룹의 해당 index 포트 + 연결 케이블 + 상대(peer): 케이블 반대편 포트를 로컬 effective에서 해소(자산·포트명, remote:false); 실패 시 saved refs(aRef/bRef)에서 (substationName 포함, remote = 상대 substationId ≠ 컨테이너.substationId); 그것도 없으면 peer null에 cableId만
    - `meta` = 마지막 그룹(선로측 관례) 셀의 케이블 specParams에서 lengthM/lossDb/inspectedAt (케이블 없으면 null들)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { buildFiberRows, fiberContainers } from '../fiberSelectors';

const port = (id: string, assetId: string, group: string, index: number, medium = 'fiber', name?: string) =>
  ({ id, assetId, group, index, name: name ?? `${group === 'A' ? '성단' : '선로'} ${index}`, direction: 'BI' as const, medium });
const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: object = {}) => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const ofd = asset('ofd', 'OFD-1');
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [port('a1', 'slot', 'A', 1), port('a2', 'slot', 'A', 2), port('b1', 'slot', 'B', 1), port('b2', 'slot', 'B', 2)],
});
const dev = asset('dev', '장비1', { ports: [port('d1', 'dev', 'P', 1, 'fiber', '포트 1')] });

describe('fiberContainers', () => {
  it('광 포트 자식을 실보유한 자산만', () => {
    expect(fiberContainers([ofd, slot, dev] as never).map((a) => a.id)).toEqual(['ofd']);
  });
});

describe('buildFiberRows', () => {
  it('그룹 동적 컬럼 + 코어별 행 + 로컬 peer 해소', () => {
    const cables = [cable('c1', 'd1', 'a1')];
    const { groups, rows } = buildFiberRows(ofd as never, [ofd, slot, dev] as never, cables as never);
    expect(groups).toEqual(['A', 'B']);
    expect(rows).toHaveLength(2); // core 1, 2
    const r1 = rows[0]!;
    expect(r1.cells[0]).toMatchObject({ group: 'A', cableId: 'c1', peer: { assetName: '장비1', portName: '포트 1', remote: false } });
    expect(r1.cells[1]).toMatchObject({ group: 'B', cableId: null, peer: null });
  });

  it('로컬 미해소 시 saved refs로 대국 표시', () => {
    const remoteCable = cable('c2', 'b2', 'remote-port', {
      aRef: { portName: '선로 2', portGroup: 'B', portIndex: 2, assetId: 'slot', assetName: '슬롯1', substationId: 'sub-1', substationName: '국사A' },
      bRef: { portName: '성단 7', portGroup: 'A', portIndex: 7, assetId: 'r-a', assetName: '원격슬롯', substationId: 'sub-2', substationName: '국사B' },
    });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [remoteCable] as never);
    const r2 = rows[1]!;
    expect(r2.cells[1]!.peer).toMatchObject({ assetName: '원격슬롯', substationName: '국사B', remote: true });
  });

  it('meta는 마지막 그룹 케이블의 specParams', () => {
    const c = cable('c3', 'b1', 'x', { specParams: { lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' } });
    const { rows } = buildFiberRows(ofd as never, [ofd, slot] as never, [c as never] as never);
    expect(rows[0]!.meta).toMatchObject({ cableId: 'c3', lengthM: 12.5, lossDb: 0.3, inspectedAt: '2026-07-01' });
    expect(rows[1]!.meta).toMatchObject({ cableId: null, lengthM: null });
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN → Commit** — `feat(v2-fe): 선번장 행 파생 — capability 질의·그룹 동적 컬럼·대국 refs`

---

### Task 5: FiberRegisterView + 뷰 토글 + 메타 편집

**Files:**
- Create: `frontend/src/v2/components/FiberRegisterView.tsx`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx`(뷰 토글에 '선번장')
- Test: 없음 (파생은 Task 4가 커버 — 뷰는 브라우저 검증)

**Interfaces:**
- Produces: `FiberRegisterView({ substationId, selectedAssetId, onSelectAsset })` —
  - 상단: 컨테이너 선택(fiberContainers — 탭 or Select; 0개면 "광 포트를 가진 자산이 없습니다")
  - 테이블: 그룹헤더 행=슬롯명(colspan), 데이터 행=코어별 — 컬럼: `코어 | {groups 동적: 그룹별 연결(peer 표기: "자산 · 포트" + remote면 `Badge`로 변전소명)} | 길이(m) | 손실(dB) | 점검일`
  - 메타 3컬럼 인라인 편집(blur/Enter, 무변경 가드): `stageCableUpdate(meta.cableId, { specParams: { ...기존, lengthM: n } })` — 기존 specParams는 getState의 effective 케이블에서 읽어 병합. meta.cableId 없으면 셀 '—' 비편집.
  - 행 클릭 → `onSelectAsset(slotId)` (상세 패널 연동). staged(refs 없는) 케이블 peer는 로컬 해소 — Task 4가 처리.
  - 뷰 토글: `현황 | 평면도 | 선번장` (변전소 스코프). 선번장 뷰에서도 AssetDetailPanel/SaveBar/ConflictDialog 공통.
  - 반응형: saved/overlays 슬라이스 구독 + useMemo(fiberContainers/buildFiberRows).

- [ ] **Step 1: 구현** (CONVENTIONS — 테이블은 StatusTable 스타일 재사용 감각: `w-full text-sm`, 헤더 `text-xs text-content-muted`, 그룹헤더 행 `bg-surface-2 text-xs font-medium`)
- [ ] **Step 2: 검증** — 전체 fe 테스트 그린 + 빌드 EXIT 0. 브라우저 스팟: 토글 표시·컨테이너 열거.
- [ ] **Step 3: Commit** — `feat(v2-fe): 선번장 뷰 — 슬롯×코어 테이블·대국 배지·메타 인라인 편집`

---

### Task 6: 종합 검증 + 브라우저 시나리오

- [ ] **Step 1: 전체 검증**

```bash
npm test -w @twin/core && npm test -w backend && npm test -w frontend -- run src/v2 && npm run build
```

- [ ] **Step 2: 브라우저 종합 시나리오 (컨트롤러 — DB 확인 포함)**
1. 국사A·국사B 두 변전소 생성, 각각 OFD+광슬롯 배치·저장
2. 국사A에서 로컬 케이블(슬롯A A1↔A2 같은 국사 내 다른 슬롯 또는 자기 B측) 1개 + **대국 케이블**(A국사 슬롯 B2 ↔ 검색 모달로 국사B 슬롯 A7) 1개 생성 → 저장 → DB 소유=A 확인
3. 선번장 뷰: 컨테이너 선택 → 슬롯×코어 행, 로컬 peer("자산·포트")와 대국 peer(변전소명 배지) 표시
4. 메타 편집: 길이 12.5 입력 → dirty → 저장 → DB specParams 확인 → 재로드 후 표시 유지
5. 사전 검증: 점유 포트 연결 시도 → 피커 내 에러 안내(422 왕복 없이)
6. 반대편(B국사)에서 끝점 자산 삭제 시도 → CABLE_ATTACHED에 소유 변전소명 안내
7. 추적: 대국 케이블 [추적] → 경로 목록에 원격 자산명(캔버스 하이라이트는 로컬만 — 정상)

- [ ] **Step 3: Commit** (수정 발생 시) — `fix(v2): Stage5A 브라우저 검증 반영 — <내용>`

---

## 완료 기준 (Stage 5A DoD)

1. 전 스위트 그린(core 43 / backend 179+8 / fe 62+α), 루트 빌드 EXIT 0.
2. 브라우저 7항목 통과 (DB 확인 포함).
3. main 머지.

## 명시적 비목표 (Stage 5A)

- 전원 계통·설계서 — Stage 5B
- 케이블 경유점 편집 UI — 후속
- 선번장 심층 추적 열(최종 원단까지) — [추적] 재사용으로 대체 (필요 시 5B+)
- 케이블 이름 자동 생성 — 기각 확정(파생 표시가 SSOT)
- 검색 API의 고급 필터(타입/변전소 스코프) — q 부분일치로 충분(YAGNI)
