# 경로슬롯 이름 저장 — SSOT 단순화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 경로슬롯 이름을 생성 시 1회 조립해 `name`에 저장하고, 이후엔 다른 자산처럼 그대로 읽어 표시한다. 매 표시마다 계산하던 `fiberSlotLabel` 및 특수 대국 조회를 제거하고, 생성/삭제만 twin 원자로 묶어 고아를 없앤다.

**Architecture:** FE는 생성 시 `composeSlotName`으로 완성 라벨을 저장하고 6개 표시 지점은 저장된 `name`을 읽는다(계산 삭제). BE는 커밋 시 경로슬롯 삭제를 twin까지 자동 확장(고아 방지)하고, 기존 데이터는 1회 backfill로 이름을 채운다. 대국 자산 이름 조회용 `useAssetRefs`는 존치.

**Tech Stack:** React/TypeScript, Vitest, Prisma, Express, tsx.

**참조 스펙:** `docs/superpowers/specs/2026-07-01-slot-name-ssot-simplification-design.md`

## Global Constraints

- **이름 포맷(정확·verbatim):** `composeSlotName(local, remote, n, cores)` = `[local, remote].filter(Boolean).join(' - ')` 를 base 로, `base===''` 면 `''` 반환, 이어서 `n > 0` 이면 ` -${n}`, `cores > 0` 이면 ` #${cores}` 를 붙인다. (기존 `fiberSlotLabel` 출력과 1:1 동일: 예 `"춘천 - 북춘천 -2 #24"`.)
- **`-N` 산출:** 같은 OFD(부모) 아래 같은 대국 substationId 로 가는 기존 형제 슬롯 수 + 1. 자국측(local slot)은 항상 resident → 정확. 대국측(remote slot)의 번호는 대국 미적재 시 resident 기준 best-effort — **의도된 트레이드오프**(이름은 편집 가능 필드, 기존 데이터는 Task 7 backfill 이 전량 정정). 백엔드 재계산 없음.
- **개명 대응:** 변전소 개명 시 슬롯 `name`은 수동 수정(자동 갱신/트리거 없음).
- **useAssetRefs 존치:** 삭제 금지. 슬롯 라벨용 배선만 제거하고 함수 자체는 T2/T3(대국 설비·포트 이름) 위해 남긴다.
- **`frontend/vite.config.js` 절대 stage 금지.** 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **개발:** `docker compose -f docker-compose.dev.yml up -d` + `npm run dev`. Docker 빌드/`docker compose up` 금지. 빌드검증은 `npm run build` 또는 `npx tsc --noEmit`.
- **UI 규칙:** 표시 변경 전 `frontend/src/components/ui/CONVENTIONS.md` 확인(본 계획은 라벨 소스만 바꾸므로 마크업 변경 없음).
- **테스트 명령:** FE `cd frontend && npx vitest run <경로>` / 전수 `npx vitest run`. BE `cd backend && npx vitest run <경로> --no-file-parallelism`.

## File Structure

- **Create** `frontend/src/features/fiber/slotName.ts` — 순수 이름 조립기 `composeSlotName` + `nextRouteNumber`. (책임: 슬롯 이름 조립·번호 산출.)
- **Create** `frontend/src/features/fiber/slotName.test.ts`.
- **Modify** `frontend/src/features/fiber/fiberWrite.ts` — `buildRouteCreate` 가 `composeSlotName` 으로 이름 저장.
- **Modify** `frontend/src/features/fiber/components/OfdSlotRail.tsx` — 번호 계산·전달 + 표시=`slot.name`, 라벨용 useAssetRefs 배선 제거.
- **Modify** 표시 5곳: `connections/cableRegister.ts`, `connections/internalPath.ts`, `fiber/fiberRegisterDescriptor.tsx`, `assets/components/AssetInspector.tsx`, `assets/components/AssetDetailPanel.tsx`.
- **Delete** `frontend/src/features/fiber/fiberSlotLabel.ts` + `.test.ts`; `remoteSlotSubstation`(traceGraph.ts).
- **Modify** `backend/src/services/substationCommit.service.ts` — 경로슬롯 삭제 twin 자동 확장.
- **Create** `backend/prisma/backfill/slotNames.ts` (+`.test.ts`) — 기존 슬롯 이름 backfill + 고아 리포트.

---

## Task 1: `composeSlotName` + `nextRouteNumber` 순수 헬퍼

**Files:**
- Create: `frontend/src/features/fiber/slotName.ts`
- Test: `frontend/src/features/fiber/slotName.test.ts`

**Interfaces:**
- Produces:
  - `composeSlotName(local: string | null, remote: string | null, n: number, cores: number): string`
  - `nextRouteNumber(ofdId: string, twinSubId: string | null, graph: TraceGraph): number`

- [ ] **Step 1: 실패 테스트**

`frontend/src/features/fiber/slotName.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { composeSlotName, nextRouteNumber } from './slotName';
import type { TraceGraph } from '../trace/traceGraph';

describe('composeSlotName', () => {
  it('자국 - 대국 -N #코어 전체', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 2, 24)).toBe('춘천S/S - 북춘천S/S -2 #24');
  });
  it('코어 0 이면 # 생략', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 1, 0)).toBe('춘천S/S - 북춘천S/S -1');
  });
  it('n<=0 이면 -N 생략', () => {
    expect(composeSlotName('춘천S/S', '북춘천S/S', 0, 24)).toBe('춘천S/S - 북춘천S/S #24');
  });
  it('대국 없으면 자국만', () => {
    expect(composeSlotName('춘천S/S', null, 1, 24)).toBe('춘천S/S -1 #24');
  });
  it('둘 다 없으면 빈 문자열', () => {
    expect(composeSlotName(null, null, 1, 24)).toBe('');
  });
});

// nextRouteNumber: OFD 'ofd' 아래 슬롯들. slotA→대국 sub-bc, 기존 slotX→sub-bc 1개 있으면 새 번호=2.
const opgw = (id: string, s: string, t: string) => ({ id, cableType: 'FIBER', sourceAssetId: s, targetAssetId: t, sourceRole: 'IN', targetRole: 'IN' });
function graphOf(over: Partial<TraceGraph> = {}): TraceGraph {
  return {
    assets: [{ id: 'slotX', role: 'slot' }],
    cables: [opgw('o1', 'slotX', 'twinX')],
    subById: new Map([['twinX', 'sub-bc']]),
    parentById: new Map([['slotX', 'ofd']]),
    roleById: new Map([['slotX', 'slot']]),
    ...over,
  } as unknown as TraceGraph;
}

describe('nextRouteNumber', () => {
  it('같은 대국 기존 형제 1개 → 새 번호 2', () => {
    expect(nextRouteNumber('ofd', 'sub-bc', graphOf())).toBe(2);
  });
  it('기존 형제 없음 → 1', () => {
    expect(nextRouteNumber('ofd', 'sub-other', graphOf())).toBe(1);
  });
  it('twinSubId null → 1', () => {
    expect(nextRouteNumber('ofd', null, graphOf())).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/fiber/slotName.test.ts`
Expected: FAIL — `slotName.ts` 없음("Cannot find module").

- [ ] **Step 3: 구현**

`frontend/src/features/fiber/slotName.ts`:
```ts
import { isOpgwTwin } from '../cables/cableEndpoint';
import type { TraceGraph } from '../trace/traceGraph';

/**
 * 경로슬롯 표시 이름(생성 시 1회 조립). 포맷 = "자국 - 대국 -N #코어수".
 * 자국/대국 하나라도 없으면 있는 것만. base 가 비면 '', n<=0 이면 -N 생략, cores<=0 이면 # 생략.
 * 저장된 뒤엔 다른 자산처럼 name 을 그대로 읽는다(재계산 없음).
 */
export function composeSlotName(local: string | null, remote: string | null, n: number, cores: number): string {
  const base = [local, remote].filter(Boolean).join(' - ');
  if (!base) return '';
  const route = n > 0 ? ` -${n}` : '';
  return cores ? `${base}${route} #${cores}` : `${base}${route}`;
}

/** 슬롯의 대국(twin) 변전소 id — OPGW(IN-IN) 반대쪽 슬롯의 substationId. */
function twinSubOf(slotId: string, graph: TraceGraph): string | null {
  const opgw = graph.cables.find(
    (c) => isOpgwTwin(c) && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  if (!opgw) return null;
  const twin = opgw.sourceAssetId === slotId ? opgw.targetAssetId : opgw.sourceAssetId;
  return twin ? (graph.subById?.get(twin) ?? null) : null;
}

/**
 * 새 경로슬롯의 -N(선로번호) = 같은 OFD 아래에서 같은 대국 변전소로 가는 기존 형제 슬롯 수 + 1.
 * 자국은 항상 resident → 정확. 대국측은 대국 미적재 시 best-effort(Global Constraints).
 */
export function nextRouteNumber(ofdId: string, twinSubId: string | null, graph: TraceGraph): number {
  if (!twinSubId) return 1;
  const count = graph.assets.filter(
    (a) => graph.roleById.get(a.id) === 'slot'
      && graph.parentById.get(a.id) === ofdId
      && twinSubOf(a.id, graph) === twinSubId,
  ).length;
  return count + 1;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/slotName.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/fiber/slotName.ts frontend/src/features/fiber/slotName.test.ts
git commit -m "feat(fiber): composeSlotName·nextRouteNumber — 경로슬롯 이름 조립 순수 헬퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `buildRouteCreate` 가 이름을 조립해 저장

**Files:**
- Modify: `frontend/src/features/fiber/fiberWrite.ts:21-46`
- Test: `frontend/src/features/fiber/fiberWrite.test.ts` (기존)

**Interfaces:**
- Consumes: `composeSlotName` (Task 1).
- Produces: `buildRouteCreate(p: { localOfd; remoteOfd; cores; slotTypeId; opgwCategory; ids; numbers: { a: number; b: number } })` — slotA.name/slotB.name 이 조립된 라벨.

- [ ] **Step 1: 실패 테스트 갱신**

`fiberWrite.test.ts` 의 `buildRouteCreate` 케이스에 `numbers` 를 넘기고 이름을 검증(기존 케이스는 `numbers` 누락으로 타입 에러 → 갱신). 다음 테스트를 추가/갱신:
```ts
it('buildRouteCreate — slotA/slotB name 을 자국-대국-N #코어 로 저장', () => {
  const r = buildRouteCreate({
    localOfd: { id: 'ofdA', substationId: 'subA', substationName: '춘천S/S' },
    remoteOfd: { id: 'ofdB', substationId: 'subB', substationName: '북춘천S/S' },
    cores: 24, slotTypeId: 'st', opgwCategory: { id: 'cat', name: 'OPGW' },
    ids: { slotA: 'a', slotB: 'b', opgw: 'o' },
    numbers: { a: 2, b: 1 },
  });
  const [slotA, slotB] = r.slots;
  expect(slotA.name).toBe('춘천S/S - 북춘천S/S -2 #24');
  expect(slotB.name).toBe('북춘천S/S - 춘천S/S -1 #24');
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/fiber/fiberWrite.test.ts`
Expected: FAIL — `numbers` 없는 시그니처 + name 이 대국명 스냅샷(`'북춘천S/S'`)이라 불일치.

- [ ] **Step 3: 구현**

`fiberWrite.ts` 상단에 import 추가:
```ts
import { composeSlotName } from './slotName';
```
`baseSlot` 세 번째 인자명을 `remoteName` → `name` 로(값만 그대로 사용):
```ts
const baseSlot = (id: string, ofd: OfdRef, name: string, slotTypeId: string): SlotCreate => ({
  id, substationId: ofd.substationId, assetTypeId: slotTypeId,
  assetType: { code: 'OFD-SLOT', role: 'slot' },
  name, parentAssetId: ofd.id,
  floorId: null, positionX: null, positionY: null, width2d: null, height2d: null,
  rotation: 0, totalU: null, slotIndex: null, slotSpan: null,
  description: null, manager: null, installDate: null, status: null,
  sourcePresetId: null, sortOrder: 0, updatedAt: '',
});
```
`buildRouteCreate` 시그니처에 `numbers` 추가 + 이름 조립:
```ts
export function buildRouteCreate(p: {
  localOfd: OfdRef; remoteOfd: OfdRef; cores: number; slotTypeId: string; opgwCategory: CatRef;
  ids: { slotA: string; slotB: string; opgw: string };
  numbers: { a: number; b: number };
}): { slots: SlotCreate[]; opgw: CableCreate } {
  const nameA = composeSlotName(p.localOfd.substationName, p.remoteOfd.substationName, p.numbers.a, p.cores);
  const nameB = composeSlotName(p.remoteOfd.substationName, p.localOfd.substationName, p.numbers.b, p.cores);
  const slotA = baseSlot(p.ids.slotA, p.localOfd, nameA, p.slotTypeId);
  const slotB = baseSlot(p.ids.slotB, p.remoteOfd, nameB, p.slotTypeId);
  const opgw: CableCreate = {
    id: p.ids.opgw, sourceAssetId: p.ids.slotA, targetAssetId: p.ids.slotB,
    categoryId: p.opgwCategory.id, categoryName: p.opgwCategory.name,
    sourceRole: 'IN', targetRole: 'IN', number: null,
    specParams: { cores: p.cores }, specification: p.opgwCategory.name,
    pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
  };
  return { slots: [slotA, slotB], opgw };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/fiberWrite.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/fiber/fiberWrite.ts frontend/src/features/fiber/fiberWrite.test.ts
git commit -m "feat(fiber): buildRouteCreate 가 슬롯 name 에 완성 라벨 저장(numbers 주입)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: OfdSlotRail — 번호 계산·전달 + 표시=`slot.name` + 라벨 배선 제거

**Files:**
- Modify: `frontend/src/features/fiber/components/OfdSlotRail.tsx`

**Interfaces:**
- Consumes: `buildRouteCreate`(numbers 포함, Task 2), `nextRouteNumber`(Task 1).

- [ ] **Step 1: import 정리**

`OfdSlotRail.tsx` 상단에서 라벨 관련 import 제거·추가:
- 제거: `import { useAssetRefs } from '../../assets/useAssetRefs';` (line 9), `import { fiberSlotLabel } from '../fiberSlotLabel';` (line 12).
- 추가: `import { buildRouteCreate, routeDeleteIds } from '../fiberWrite';` 는 유지, 그 아래 `import { nextRouteNumber } from '../slotName';`.

- [ ] **Step 2: 대국명 useAssetRefs 배선 제거**

`OfdSlotRail.tsx:71-89` 의 `twinIds` useMemo 와 `const remoteRefs = useAssetRefs(twinIds);` 전체 삭제.

- [ ] **Step 3: addRoute 에서 번호 계산·전달**

`addRoute`(현 91-104) 를 다음으로 교체:
```ts
  const addRoute = (remote: AssetRef, cores: number, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!slotTypeId || !cat || !localOfd?.substationId || !remote.substationId) return;
    // -N = 같은 OFD→같은 대국 기존 형제 수 +1. 자국(a)은 resident 정확, 대국(b)은 best-effort.
    const a = nextRouteNumber(localOfd.id, remote.substationId, graph);
    const b = nextRouteNumber(remote.id, localOfd.substationId, graph);
    const { slots: newSlots, opgw } = buildRouteCreate({
      localOfd: { id: localOfd.id, substationId: localOfd.substationId, substationName: localOfd.substationName },
      remoteOfd: { id: remote.id, substationId: remote.substationId, substationName: remote.substationName },
      cores, slotTypeId, opgwCategory: cat,
      ids: { slotA: generateTempId(), slotB: generateTempId(), opgw: generateTempId() },
      numbers: { a, b },
    });
    const wc = useSubstationWorkingCopy.getState();
    for (const s of newSlots) wc.put('assets', s as unknown as { id: string; [k: string]: unknown });
    wc.put('cables', opgw as unknown as { id: string; [k: string]: unknown });
    setPopover(null);
  };
```

- [ ] **Step 4: 표시 = 저장된 name**

렌더의 점유 슬롯 블록(현 134-155)에서 라벨 계산부를 제거하고 `slot.name` 사용. `const c = opgwOf(slot.id)` / `twinId` / `remoteName` / `fiberSlotLabel(...)` 줄을 지우고:
```tsx
        {slots.map((slot, i) => {
          const title = slot.name ?? '';
          return (
            <SlotTile
              key={slot.id}
              title={title}
```
(deleteRoute 에서 쓰는 `opgwOf` 함수 정의 자체는 유지 — 렌더 안의 지역 `c`/`twinId` 만 제거.)

- [ ] **Step 5: 타입체크 + 스위트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/fiber`
Expected: tsc 0 에러(`useAssetRefs`/`fiberSlotLabel`/`graph` 미사용 경고 없음 — `graph` 는 addRoute 에서 사용 유지). PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/fiber/components/OfdSlotRail.tsx
git commit -m "refactor(fiber): OfdSlotRail 표시=slot.name, 생성 시 번호 계산 전달, 라벨용 useAssetRefs 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 나머지 5개 표시 지점 — 저장된 name 읽기 + 라벨 배선 제거

**Files:**
- Modify: `frontend/src/features/connections/cableRegister.ts:3,43`
- Modify: `frontend/src/features/connections/internalPath.ts:2,81`
- Modify: `frontend/src/features/fiber/fiberRegisterDescriptor.tsx:5,23`
- Modify: `frontend/src/features/assets/components/AssetInspector.tsx` (fiberSlotLabel/useAssetRefs 슬롯라벨 배선)
- Modify: `frontend/src/features/assets/components/AssetDetailPanel.tsx` (동일)
- Test: 위 각 파일의 라벨 기대치를 저장 name 으로 갱신(`cableRegister`·`internalPath`·`traceProjection` 테스트).

**Interfaces:** 없음(표시 소스 교체).

- [ ] **Step 1: 라벨 기대 테스트를 저장 name 으로 갱신(RED)**

`fiberSlotLabel` 계산 라벨을 기대하던 테스트를 저장된 `name` 기대로 바꾼다. 대상: `internalPath.test.ts`, `traceProjection.test.ts`, `cableRegister` 관련 테스트 중 슬롯 라벨을 `"자국 - 대국 -N …"` 로 단언하는 곳 → 목 그래프의 해당 슬롯 `nameById`(또는 asset.name) 값으로 기대치를 바꾼다. (목 그래프에 슬롯 `name` 을 세팅하고 그 값을 기대.)

Run(RED 확인): `cd frontend && npx vitest run src/features/connections src/features/trace`
Expected: FAIL — 아직 코드가 `fiberSlotLabel` 계산값을 반환.

- [ ] **Step 2: cableRegister**

`cableRegister.ts:3` 의 `import { fiberSlotLabel } ...` 삭제. `:43` 을:
```ts
    if (a && a.assetType?.role === 'slot') return nameOf(id) || id;
```

- [ ] **Step 3: internalPath**

`internalPath.ts:2` 의 `import { fiberSlotLabel } ...` 삭제. `:81` 의 삼항을:
```ts
    kindOf(id) === 'slot' ? (graph.nameById.get(id) || id) : (graph.nameById.get(id) || id);
```
(양분기가 동일해지므로 `graph.nameById.get(id) || id` 로 단순화 가능.)

- [ ] **Step 4: fiberRegisterDescriptor**

`fiberRegisterDescriptor.tsx:5` 의 import 삭제. `:23` 을:
```tsx
    const title = slot.name ?? '광경로';
```
(`graph` 인자가 이 지점에서만 쓰였다면 미사용 경고 확인 후 정리 — 사용처 있으면 유지.)

- [ ] **Step 5: AssetInspector**

`AssetInspector.tsx`: `import { fiberSlotLabel } ...`(line 15) 삭제. `:204` 을:
```tsx
      return <ReadField key="name" label={field.label} value={asset.name ?? ''} />;
```
슬롯 라벨용 `useAssetRefs`/twinId/`slotRemoteName` 배선(`:175-181` 인근)이 이 라벨 외 용도 없으면 제거. `useAssetRefs` import 는 이 컴포넌트 내 다른 사용처 없으면 삭제.

- [ ] **Step 6: AssetDetailPanel**

`AssetDetailPanel.tsx`: `import { fiberSlotLabel } ...`(line 14) 삭제. `:124` 을:
```tsx
    asset && asset.assetType?.role === 'slot' ? (asset.name ?? '') : '';
```
슬롯 라벨용 `useAssetRefs`/twinId/`slotRemoteName` 배선(`:120-121` 인근) 제거(다른 용도 없을 시). `useAssetRefs` import 도 미사용이면 삭제.

- [ ] **Step 7: GREEN + 타입체크**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/connections src/features/trace src/features/assets src/features/fiber`
Expected: tsc 0, PASS.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/features/connections/cableRegister.ts frontend/src/features/connections/internalPath.ts frontend/src/features/fiber/fiberRegisterDescriptor.tsx frontend/src/features/assets/components/AssetInspector.tsx frontend/src/features/assets/components/AssetDetailPanel.tsx frontend/src/features/connections/*.test.ts frontend/src/features/trace/*.test.ts
git commit -m "refactor(fiber): 표시 5곳을 저장된 slot.name 읽기로 전환 — fiberSlotLabel 호출 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `fiberSlotLabel`·`remoteSlotSubstation` 삭제 + 유휴 그래프필드 정리

**Files:**
- Delete: `frontend/src/features/fiber/fiberSlotLabel.ts`, `frontend/src/features/fiber/fiberSlotLabel.test.ts`
- Modify: `frontend/src/features/trace/traceGraph.ts:127-137` (`remoteSlotSubstation` 삭제) 및 `subById`/`slotIndexById` 미사용 시 정리

- [ ] **Step 1: 잔여 참조 0 확인**

Run: `cd frontend/src && git grep -n "fiberSlotLabel"`
Expected: 결과 0(Task 3·4 후). 남아 있으면 그 지점을 저장 name 으로 먼저 교체.

- [ ] **Step 2: 파일 삭제**

```bash
cd /Users/jsk/1210/digital && git rm frontend/src/features/fiber/fiberSlotLabel.ts frontend/src/features/fiber/fiberSlotLabel.test.ts
```

- [ ] **Step 3: remoteSlotSubstation 삭제**

`traceGraph.ts:127-137` 의 `remoteSlotSubstation` export 함수(주석 포함) 삭제. 이어서:
```bash
cd frontend/src && git grep -n "remoteSlotSubstation"
```
Expected: 0(Task 4 에서 호출부 제거됨). 남으면 그 호출부 제거.

- [ ] **Step 4: subById / slotIndexById 유휴 확인**

```bash
cd frontend/src && git grep -n "subById" ; git grep -n "slotIndexById"
```
- `subById` 사용처가 `slotName.ts`(nextRouteNumber) 외에 없고 그래프 구성에서만 채워지면, `nextRouteNumber` 가 유일 소비자이므로 **유지**(Task 1 이 사용).
- `slotIndexById` 가 어디서도 안 쓰이면(과거 fiberSlotLabel 정렬 전용) `traceGraph.ts` 의 생성·타입에서 제거. 트레이스/서버트레이스에서 쓰이면 유지. **grep 결과로 판정 후 조치**(불명확하면 유지 — 유휴 필드는 무해).

- [ ] **Step 5: 전수 + 타입체크 + 게이트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0, 전수 PASS.
Run: `cd frontend/src && git grep -c "fiberSlotLabel\|remoteSlotSubstation" | cat`
Expected: 출력 없음(0).

- [ ] **Step 6: 커밋**

```bash
git add -A frontend/src/features/trace/traceGraph.ts
git commit -m "refactor(fiber): fiberSlotLabel·remoteSlotSubstation 삭제 — 슬롯 이름은 저장값 SSOT

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 백엔드 — 경로슬롯 삭제 twin 자동 확장(고아 방지)

**Files:**
- Modify: `backend/src/services/substationCommit.service.ts:530-532`
- Test: `backend/tests/substationCommit.integration.test.ts` (기존 통합 스위트에 케이스 추가)

**Interfaces:** 없음(커밋 삭제 경로 내부 로직).

- [ ] **Step 1: 실패 테스트 추가(RED)**

`substationCommit.integration.test.ts` 에 케이스 추가. 두 변전소(subId/sub2Id) 에 슬롯 A·B + IN-IN OPGW 를 만들고, **slotA 만** 삭제 커밋 → slotB·OPGW 도 사라짐을 단언. (헬퍼 slotType id 는 role 'slot' 조회.)
```ts
it('경로슬롯 삭제는 twin 슬롯까지 자동 확장(고아 방지)', async () => {
  const slotType = (await prisma.assetType.findFirstOrThrow({ where: { role: 'slot' } })).id;
  const sa = await prisma.asset.create({ data: { substationId: subId, assetTypeId: slotType, name: 'A', parentAssetId: null } });
  const sb = await prisma.asset.create({ data: { substationId: sub2Id, assetTypeId: slotType, name: 'B', parentAssetId: null } });
  const opgw = await prisma.cable.create({ data: { sourceAssetId: sa.id, targetAssetId: sb.id, sourceRole: 'IN', targetRole: 'IN' } });

  // slotA 만 삭제 커밋(전역 커밋 — deletes 에 sa.id).
  await commitSubstation(subId, {
    baseVersion: undefined,
    assets: { creates: [], updates: [], deletes: [{ id: sa.id }] },
    cables: { creates: [], updates: [], deletes: [] },
  } as never, userId);

  expect(await prisma.asset.findUnique({ where: { id: sa.id } })).toBeNull();
  expect(await prisma.asset.findUnique({ where: { id: sb.id } })).toBeNull();      // twin 자동 삭제
  expect(await prisma.cable.findUnique({ where: { id: opgw.id } })).toBeNull();    // OPGW cascade
});
```
> 주: `baseVersion`/payload 형태는 같은 파일의 기존 케이스와 동일 스키마를 따른다(위는 최소형; 스키마 필수 필드는 인접 케이스에서 복사).

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npx vitest run tests/substationCommit.integration.test.ts --no-file-parallelism`
Expected: FAIL — slotB 가 남아 있음(twin 미삭제).

- [ ] **Step 3: 구현 — 삭제 확장**

`substationCommit.service.ts` 의 asset 삭제 블록(현 530-532)을 교체:
```ts
    if (a.deletes.length) {
      let delIds = a.deletes.map((d) => d.id);
      // 경로슬롯 twin 자동 확장 — 삭제 대상에 닿는 OPGW(IN-IN)의 반대쪽 슬롯도 함께 삭제(고아 방지).
      // OPGW 케이블 자체는 엔드포인트 FK cascade 로 삭제되므로 여기선 asset 만 확장.
      const opgws = await tx.cable.findMany({
        where: {
          sourceRole: 'IN', targetRole: 'IN',
          OR: [{ sourceAssetId: { in: delIds } }, { targetAssetId: { in: delIds } }],
        },
        select: { sourceAssetId: true, targetAssetId: true },
      });
      const delSet = new Set(delIds);
      for (const o of opgws) {
        for (const end of [o.sourceAssetId, o.targetAssetId]) {
          if (end && !delSet.has(end)) delSet.add(end);
        }
      }
      delIds = [...delSet];
      await tx.asset.deleteMany({ where: { id: { in: delIds } } });
    }
```

- [ ] **Step 4: 통과 확인 + 전수**

Run: `cd backend && npx vitest run tests/substationCommit.integration.test.ts --no-file-parallelism`
Expected: PASS.
Run: `cd backend && npx vitest run --no-file-parallelism`
Expected: 전수 PASS(기존 삭제 케이스 회귀 없음 — 비-슬롯 삭제는 확장 대상 없음).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/services/substationCommit.service.ts backend/tests/substationCommit.integration.test.ts
git commit -m "feat(commit): 경로슬롯 삭제 시 twin 슬롯 자동 확장 삭제 — 고아 방지 백엔드 강제

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 기존 슬롯 이름 backfill + 고아 리포트(1회)

**Files:**
- Create: `backend/prisma/backfill/slotNames.ts` (pure `planSlotNames` + `main()` 러너)
- Test: `backend/prisma/backfill/slotNames.test.ts` (pure 함수 단위 테스트)

**Interfaces:**
- Produces: `planSlotNames(rows: SlotRow[]): { id: string; name: string }[]` — 순수. `SlotRow = { id; ofdId; ownSub: string | null; twinId: string | null; twinSub: string | null; twinSubName: string | null; cores: number; slotIndex: number | null }`.

- [ ] **Step 1: 실패 테스트(pure)**

`backend/prisma/backfill/slotNames.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planSlotNames, type SlotRow } from './slotNames.js';

const row = (o: Partial<SlotRow>): SlotRow => ({
  id: 'x', ofdId: 'ofd', ownSub: '춘천S/S', twinId: 't', twinSub: 'sub-bc', twinSubName: '북춘천S/S',
  cores: 24, slotIndex: null, ...o,
});

describe('planSlotNames', () => {
  it('같은 OFD·같은 대국 형제는 slotIndex→id 순으로 -1,-2', () => {
    const out = planSlotNames([
      row({ id: 'b', slotIndex: 2 }),
      row({ id: 'a', slotIndex: 1 }),
    ]);
    expect(out.find((r) => r.id === 'a')!.name).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(out.find((r) => r.id === 'b')!.name).toBe('춘천S/S - 북춘천S/S -2 #24');
  });
  it('대국 다르면 각자 -1', () => {
    const out = planSlotNames([
      row({ id: 'a', twinSub: 'sub-bc', twinSubName: '북춘천S/S' }),
      row({ id: 'b', twinSub: 'sub-xx', twinSubName: '세종S/S' }),
    ]);
    expect(out.find((r) => r.id === 'a')!.name).toBe('춘천S/S - 북춘천S/S -1 #24');
    expect(out.find((r) => r.id === 'b')!.name).toBe('춘천S/S - 세종S/S -1 #24');
  });
  it('코어 0 이면 # 생략', () => {
    expect(planSlotNames([row({ cores: 0 })])[0].name).toBe('춘천S/S - 북춘천S/S -1');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npx vitest run prisma/backfill/slotNames.test.ts --no-file-parallelism`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`backend/prisma/backfill/slotNames.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export interface SlotRow {
  id: string; ofdId: string; ownSub: string | null;
  twinId: string | null; twinSub: string | null; twinSubName: string | null;
  cores: number; slotIndex: number | null;
}

// FE composeSlotName 과 동일 포맷(패키지 경계로 인라인 복제).
function composeSlotName(local: string | null, remote: string | null, n: number, cores: number): string {
  const base = [local, remote].filter(Boolean).join(' - ');
  if (!base) return '';
  const route = n > 0 ? ` -${n}` : '';
  return cores ? `${base}${route} #${cores}` : `${base}${route}`;
}

/** 각 슬롯의 -N = 같은 (ofdId, twinSub) 그룹 내 slotIndex(없으면 뒤)→id 순 위치. 순수. */
export function planSlotNames(rows: SlotRow[]): { id: string; name: string }[] {
  const groups = new Map<string, SlotRow[]>();
  for (const r of rows) {
    const key = `${r.ofdId}|${r.twinSub ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: { id: string; name: string }[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const ai = a.slotIndex ?? Number.MAX_SAFE_INTEGER;
      const bi = b.slotIndex ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    list.forEach((r, i) => {
      out.push({ id: r.id, name: composeSlotName(r.ownSub, r.twinSubName, i + 1, r.cores) });
    });
  }
  return out;
}

/** DB 러너 — 경로슬롯 로드 → planSlotNames → name update. 고아(짝 없는 슬롯/반쪽 OPGW)는 리포트만. */
export async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const opgws = await prisma.cable.findMany({
      where: { sourceRole: 'IN', targetRole: 'IN' },
      select: { sourceAssetId: true, targetAssetId: true },
    });
    // slotId → twinId
    const twinOf = new Map<string, string>();
    for (const o of opgws) {
      if (o.sourceAssetId && o.targetAssetId) {
        twinOf.set(o.sourceAssetId, o.targetAssetId);
        twinOf.set(o.targetAssetId, o.sourceAssetId);
      }
    }
    const slotIds = [...twinOf.keys()];
    const assets = await prisma.asset.findMany({
      where: { id: { in: slotIds } },
      select: { id: true, parentAssetId: true, substationId: true, slotIndex: true,
        substation: { select: { name: true } } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    // cores: 슬롯의 OPGW specParams.cores
    const opgwFull = await prisma.cable.findMany({
      where: { sourceRole: 'IN', targetRole: 'IN' },
      select: { sourceAssetId: true, targetAssetId: true, specParams: true },
    });
    const coresOf = new Map<string, number>();
    for (const o of opgwFull) {
      const c = Number((o.specParams as Record<string, unknown> | null)?.cores ?? 0);
      if (o.sourceAssetId) coresOf.set(o.sourceAssetId, c);
      if (o.targetAssetId) coresOf.set(o.targetAssetId, c);
    }

    const rows: SlotRow[] = [];
    let orphans = 0;
    for (const id of slotIds) {
      const a = byId.get(id);
      const twinId = twinOf.get(id) ?? null;
      const twin = twinId ? byId.get(twinId) : null;
      if (!a || !twin) { orphans++; continue; }              // 짝 없음 → 리포트만
      rows.push({
        id, ofdId: a.parentAssetId ?? id, ownSub: a.substation?.name ?? null,
        twinId, twinSub: twin.substationId, twinSubName: twin.substation?.name ?? null,
        cores: coresOf.get(id) ?? 0, slotIndex: a.slotIndex ?? null,
      });
    }
    const plan = planSlotNames(rows);
    for (const p of plan) {
      await prisma.asset.update({ where: { id: p.id }, data: { name: p.name } });
    }
    // eslint-disable-next-line no-console
    console.log(`[slotNames] backfilled ${plan.length} slots; orphans(짝없음) reported: ${orphans}`);
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행: npx tsx prisma/backfill/slotNames.ts
if (process.argv[1] && process.argv[1].endsWith('slotNames.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && npx vitest run prisma/backfill/slotNames.test.ts --no-file-parallelism`
Expected: PASS(3).

- [ ] **Step 5: dev DB 에 1회 실행(검증)**

Run: `cd backend && npx tsx prisma/backfill/slotNames.ts`
Expected: `[slotNames] backfilled N slots; orphans(짝없음) reported: M` 출력. dev 앱에서 선번장 라벨이 이전과 동일하게 표시되는지 스모크.

- [ ] **Step 6: 커밋**

```bash
git add backend/prisma/backfill/slotNames.ts backend/prisma/backfill/slotNames.test.ts
git commit -m "feat(backfill): 기존 경로슬롯 name 을 완성 라벨로 채우는 1회 스크립트 + 고아 리포트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 통합 스모크 + 문서 갱신

- [ ] **Step 1: dev 스모크**

`docker compose -f docker-compose.dev.yml up -d` + `npm run dev`. 확인:
- 선번장(OfdSlotRail) 라벨이 저장된 `name` 그대로 표시.
- 새 경로 생성 → `"자국 - 대국 -N #코어"` 저장·표시. 대국 변전소를 열었을 때 대국측 슬롯 라벨도 정상.
- 경로 하나 삭제 → 자국·대국 슬롯·OPGW 모두 사라짐(고아 없음).
- 연결탭·CableInspector·자산 인스펙터의 슬롯 라벨 정상.

- [ ] **Step 2: 스펙/로드맵 관계 메모**

`docs/superpowers/specs/2026-07-01-slot-name-ssot-simplification-design.md` 하단에 "구현 완료(브랜치/커밋)" 한 줄 추가. `docs/architecture/data-scope-architecture-roadmap.md` 에 "슬롯 라벨 page-in 의존 제거" 반영(P3 진행 노트).

- [ ] **Step 3: 커밋**

```bash
git add docs/
git commit -m "docs: 슬롯 이름 저장 구현 반영 — 스펙 상태·로드맵 노트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **스펙 커버리지:** §3.1 이름저장=T1·T2·T3·T4 / §3.2~3.3 twin 원자·백엔드 고아=T6 / §3.4 개명 수동=비목표(코드 없음) / §3.5 삭제=T4·T5 / §3.6 6곳 표시=T3·T4 / §3.7 마이그레이션=T7 / §4 P3 관계=T8. ✓
- **결정 반영:** (A)자동 twin 삭제=T6, (B)코어수 name 포함=composeSlotName(cores), (C)(OFD,대국)쌍 -N=nextRouteNumber/planSlotNames, (D)useAssetRefs 존치=삭제 안 함(라벨 배선만 제거). ✓
- **타입 일관성:** `composeSlotName(local, remote, n, cores)` 시그니처 T1·T2·T7 동일. `buildRouteCreate` 의 `numbers:{a,b}` T2 정의·T3 사용 일치. `nextRouteNumber(ofdId, twinSubId, graph)` T1 정의·T3 사용 일치. ✓
- **플레이스홀더:** 각 코드 스텝에 실제 코드 포함. Task 5 Step4·Task 4 Step5-6 의 "미사용 시 정리"는 grep 판정 기준 명시(무해 시 유지) — 모호성 아님. ✓
- **잔여 위험:** 대국측 -N best-effort(Global Constraints 로 수용). Task 6 payload 스키마 필수 필드는 인접 케이스에서 복사(스키마 파일 참조).
