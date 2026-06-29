# Phase 3 — P3-3: 연결 대국 page-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 변전소를 열 때(=`load(substationId)`) 그 변전소에 **케이블로 직접 연결된 대국 변전소**(예: OPGW twin)까지 함께 resident 로 적재한다(스펙 §106). 그래야 P3-4 에서 전역 피드를 제거해도 광 대국(원격 설비명·포트) 읽기가 resident 에서 그대로 동작한다.

**Architecture:** 백엔드 `getWorkingCopy` 응답에 `connectedSubstationIds`(이 변전소 케이블의 반대편이 사는 다른 변전소들)를 추가. 클라 `load()`는 기존 동작(열린 변전소 적재) 후 그 목록 중 미-resident 만 `syncSubData`(merge-only, 1-hop — 재확장 없음)로 page-in 한다. 광 대국 소비처(AssetSelectCell/SlotPorts/slotRegister)는 **무변경** — resident 에서 그대로 읽는다.

**Tech Stack:** Express + Prisma (backend), Zustand store (frontend). Vitest 양쪽 + supertest(backend integration).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-06-29-phase3-demand-paging-design.md` §4a(connectedSubstationIds)·§5(page-in 트리거)·§10 P3-3.
- **`getAsset` 단건 resolver 는 이 plan 비범위(스펙 §5 에서 후순위/연기).** 디스커버리 결과: (a) 변전소-단위 demand-load 는 `useWorkingCopyLoader`(WorkspacePage)가 **이미** 수행, (b) 크로스변전소 자산 네비게이션은 floor-redirect 셸이 floorId→substationId 해소 후 그 로더가 적재, (c) 광 대국 이름은 연결 대국 page-in 으로 resident. → 단건 resolver 가 메울 잔여 gap 이 현재 없음. P3-4 스모크에서 실제 gap 이 드러나면 그때 추가.
- page-in 단위 = 변전소. resident = 연 변전소 + 연결 대국(§106). 새 page-in 함수 만들지 않고 기존 `load`/`syncSubData` 재사용.
- 1-hop 만: `syncSubData` 는 연결 대국을 **재확장하지 않는다**(cascade 금지). 연 변전소(`load`)만 연결 대국을 끌어온다.
- 전역 피드(`useHydrateGlobal`)는 **이 plan 에서 건드리지 않는다**(P3-4). 피드가 살아있어 connected page-in 은 현재 중복(무해) — 효과는 P3-4 에서 load-bearing.
- `frontend/vite.config.js` 무관 미커밋 — stage/touch 금지.
- 백엔드 `cd backend`, 프론트 `cd frontend`. `git add`/`commit` 은 repo 루트. 커밋 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 백엔드 vitest 는 실제 Prisma DB(통합). 단일 스레드 회피 플래키: `--no-file-parallelism`.

---

## File Structure

- **Modify** `backend/src/services/substationWorkingCopy.service.ts` — `getWorkingCopy` 가 `connectedSubstationIds` 도 반환.
- **Modify or Create** `backend/tests/substationWorkingCopy.integration.test.ts` (있으면 케이스 추가, 없으면 생성) — 크로스변전소 케이블 → connectedSubstationIds 검증.
- **Modify** `frontend/src/features/workingCopy/substationStore.ts` — `load()`가 연결 대국 page-in.
- **Create** `frontend/src/features/workingCopy/substationStore.connected.test.ts` — load() 연결 page-in 검증(api mock).

---

## Task 1: 백엔드 — `getWorkingCopy` 가 `connectedSubstationIds` 반환

**Files:**
- Modify: `backend/src/services/substationWorkingCopy.service.ts`
- Modify/Create: `backend/tests/substationWorkingCopy.integration.test.ts`

**Interfaces:**
- 현재: `getWorkingCopy(substationId): Promise<{ assets, cables }>` (assets=이 변전소 자산+records, cables=`cableService.getBySubstationId` — 끝점 하나가 이 변전소인 케이블, sourceAssetId/targetAssetId 보유).
- Produces: 반환에 `connectedSubstationIds: string[]` 추가(이 변전소 케이블의 반대편 자산이 사는 *다른* 변전소들, distinct).

- [ ] **Step 1: 통합 테스트 추가 (failing)**

`backend/tests/substationWorkingCopy.integration.test.ts` 에 케이스 추가(파일 없으면 `trace.integration.test.ts`/기존 통합 테스트의 express 앱·login·org/asset 생성 패턴으로 생성). 핵심 시나리오:
- 변전소 A, B 생성(같은 본부/지사 아래).
- A 에 자산 `eqA`(예: device/ofd), B 에 자산 `eqB`.
- `eqA`↔`eqB` 케이블 1개 생성(크로스변전소).
- `GET /api/substations/{A}/workingcopy` → `res.body.data.connectedSubstationIds` 가 B 를 포함.
- 같은 변전소 내부 케이블만 있는 변전소 → connectedSubstationIds 가 빈 배열(자기 제외).

```ts
it('크로스변전소 케이블의 반대편 변전소를 connectedSubstationIds 로 반환', async () => {
  const res = await request(app).get(`/api/substations/${subAId}/workingcopy`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data.connectedSubstationIds).toContain(subBId);
  expect(res.body.data.connectedSubstationIds).not.toContain(subAId); // 자기 제외
});
```
(login·org·asset·cable 생성 헬퍼는 기존 통합 테스트에서 차용. 케이블은 `prisma.cable.create({ data: { sourceAssetId: eqA, targetAssetId: eqB, ... } })` — 카테고리/그룹은 시드 또는 생성.)

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && npx vitest run tests/substationWorkingCopy.integration.test.ts`
Expected: 신규 케이스 FAIL — `connectedSubstationIds` 가 `undefined`(아직 미반환).

- [ ] **Step 3: `getWorkingCopy` 구현**

`backend/src/services/substationWorkingCopy.service.ts` 의 `getWorkingCopy` 끝(현재 `return { assets: assetsWithRecords, cables };` 직전)에 추가:
```ts
  // 연결 대국(§106) — 이 변전소를 한 끝점으로 갖는 케이블의 반대편이 다른 변전소면 그 substationId.
  // cables 는 끝점 하나가 이 변전소인 것만(getBySubstationId) → 반대편이 sAssetIds 밖이면 cross-substation.
  const sAssetIds = new Set(assets.map((a) => a.id));
  const farAssetIds = new Set<string>();
  for (const c of cables) {
    const src = c.sourceAssetId;
    const tgt = c.targetAssetId;
    if (!src || !tgt) continue;
    if (sAssetIds.has(src) && !sAssetIds.has(tgt)) farAssetIds.add(tgt);
    else if (sAssetIds.has(tgt) && !sAssetIds.has(src)) farAssetIds.add(src);
  }
  const farAssets = farAssetIds.size
    ? await prisma.asset.findMany({ where: { id: { in: [...farAssetIds] } }, select: { substationId: true } })
    : [];
  const connectedSubstationIds = [...new Set(farAssets.map((a) => a.substationId))].filter((id) => id !== substationId);

  return { assets: assetsWithRecords, cables, connectedSubstationIds };
```
(이 파일은 이미 `prisma` 를 사용하므로 import 추가 불필요. `cables` 원소가 `sourceAssetId`/`targetAssetId`(string|null)를 가짐 — `cable.service` slim DTO.)

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npx vitest run tests/substationWorkingCopy.integration.test.ts`
Expected: PASS(신규 + 기존).

- [ ] **Step 5: tsc + commit**

Run: `cd backend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/substationWorkingCopy.service.ts backend/tests/substationWorkingCopy.integration.test.ts
git commit -m "feat(workingcopy): getWorkingCopy 가 connectedSubstationIds 반환 (연결 대국 §106)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 프론트 — `load()` 가 연결 대국 page-in

**Files:**
- Modify: `frontend/src/features/workingCopy/substationStore.ts`
- Create: `frontend/src/features/workingCopy/substationStore.connected.test.ts`

**Interfaces:**
- Consumes: 백엔드 응답 `data.data.connectedSubstationIds: string[]`(Task 1); 기존 store `syncSubData(substationId)`(merge-only, store.substationId 불변), `saved.assets`.
- 배경(현재 `load`):
  ```ts
  load: async (substationId) => {
    const seq = ++loadSeq;
    const { data } = await api.get(`/substations/${substationId}/workingcopy`);
    if (seq !== loadSeq) return;
    const incoming = buildSaved(data.data);
    const t = useSubstationWorkingCopy.temporal.getState();
    t.pause();
    set((s) => ({ substationId, saved: mergeSavedById(s.saved, incoming, substationId), overlays: addBaseVersions(s.overlays, incoming) }));
    t.resume();
  },
  ```

- [ ] **Step 1: 테스트 먼저 (failing)**

`frontend/src/features/workingCopy/substationStore.connected.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../utils/api', () => ({ api: { get: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';

const asset = (id: string, substationId: string) => ({
  id, name: id, substationId, parentAssetId: null, slotIndex: null,
  assetType: { role: 'device' }, updatedAt: '2020-01-01T00:00:00Z',
});

beforeEach(() => {
  useSubstationWorkingCopy.getState().reset();
  (api.get as Mock).mockReset();
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes('/s1/workingcopy')) {
      return Promise.resolve({ data: { data: { assets: [asset('eqA', 's1')], cables: [{ id: 'opgw', sourceAssetId: 'eqA', targetAssetId: 'eqB', cableType: 'FIBER' }], connectedSubstationIds: ['s2'] } } });
    }
    if (url.includes('/s2/workingcopy')) {
      return Promise.resolve({ data: { data: { assets: [asset('eqB', 's2')], cables: [], connectedSubstationIds: [] } } });
    }
    return Promise.resolve({ data: { data: { assets: [], cables: [], connectedSubstationIds: [] } } });
  });
});

describe('load — 연결 대국 page-in (§106)', () => {
  it('변전소 열기 시 connectedSubstationIds 의 대국까지 resident', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const s = useSubstationWorkingCopy.getState();
    expect(s.substationId).toBe('s1'); // 열린 변전소는 s1 유지(syncSubData 가 안 바꿈)
    expect(s.saved.assets.map((a) => a.id).sort()).toEqual(['eqA', 'eqB']); // s2 대국 page-in
  });

  it('이미 resident 인 대국은 재요청하지 않는다(dedup)', async () => {
    await useSubstationWorkingCopy.getState().load('s1'); // s1 + s2
    (api.get as Mock).mockClear();
    await useSubstationWorkingCopy.getState().load('s1'); // 재로드
    const s2Calls = (api.get as Mock).mock.calls.filter((c) => String(c[0]).includes('/s2/workingcopy'));
    expect(s2Calls.length).toBe(0); // s2 이미 resident → connected page-in 건너뜀
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/workingCopy/substationStore.connected.test.ts`
Expected: 1번째 케이스 FAIL — `eqB` 미적재(연결 page-in 없음). (2번째는 우연 통과 가능 — 1번째가 핵심.)

- [ ] **Step 3: `load()` 에 연결 page-in 추가**

`substationStore.ts` 의 `load` 에서 `t.resume();` **다음**에 추가:
```ts
        // 연결 대국 page-in(§106) — resident 아닌 연결 변전소만 merge-only 로(1-hop, syncSubData 는 재확장 안 함).
        const connectedIds: string[] = (data.data.connectedSubstationIds as string[] | undefined) ?? [];
        if (connectedIds.length) {
          const st = useSubstationWorkingCopy.getState();
          const resident = new Set((st.saved.assets as { substationId: string }[]).map((a) => a.substationId));
          for (const cid of connectedIds) {
            if (cid && !resident.has(cid)) await st.syncSubData(cid);
          }
        }
```
(`set()` 후라 `getState().saved` 에 s1 이 이미 병합돼 resident 에 's1' 포함. `syncSubData` 는 store.substationId 를 바꾸지 않으므로 열린 변전소는 그대로.)

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/features/workingCopy/substationStore.connected.test.ts`
Expected: PASS(둘 다 — 대국 적재 + dedup).

- [ ] **Step 5: tsc + commit**

Run: `cd frontend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/substationStore.connected.test.ts
git commit -m "feat(workingcopy): load() 가 연결 대국까지 page-in (§106, syncSubData 1-hop)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 회귀

**Files:** 없음(검증 전용).

- [ ] **Step 1: 백엔드 tsc + 전수**

Run: `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: tsc 0; 전수 PASS(+connectedSubstationIds 통합).

- [ ] **Step 2: 프론트 tsc + 전수**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; 전수 PASS(+connected page-in). 기존 load 동작(post-commit 재조정 등) 무회귀 — connected page-in 은 additive.

- [ ] **Step 3: 스모크(선택, dev 서버)**

전역 피드 살아있는 현재는 광 대국이 이미 보이므로 육안 회귀는 "느려짐 없음" 정도. 핵심 검증은 콘솔/네트워크: 변전소 A 열 때 `/substations/A/workingcopy` + 연결된 대국 B `/substations/B/workingcopy` 호출이 뜨는지(연결 page-in 작동). 효과(피드 없이도 광 대국 표시)는 P3-4 에서 검증.

---

## Self-Review (작성자 점검)

**1. Spec coverage:** §4a(getWorkingCopy connectedSubstationIds) → T1. §5/§106(변전소 열기 시 연결 대국 page-in, 기존 load/syncSubData 재사용) → T2. getAsset resolver(§5) → 디스커버리 근거로 연기(Global Constraints 에 명시 — 기존 nav/loader 가 커버). page-in 트리거는 기존 `useWorkingCopyLoader`(WorkspacePage)가 이미 수행 → 별도 트리거 배선 불필요(load() 확장으로 충분). ✓

**2. Placeholder scan:** T1 통합 테스트의 org/login/asset/cable 생성은 "기존 통합 테스트 패턴 차용"으로 위임(실코드 존재). 그 외 코드·게이트 구체. TBD 없음. ✓

**3. Type consistency:** 백엔드 `connectedSubstationIds: string[]` ↔ 프론트 `data.data.connectedSubstationIds as string[]` 일치. `syncSubData(substationId: string)` 기존 시그니처 재사용. resident 체크는 `saved.assets[].substationId`(string) — 기존 Asset 필드. ✓
