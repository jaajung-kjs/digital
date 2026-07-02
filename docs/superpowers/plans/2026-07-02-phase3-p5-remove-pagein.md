# P3-5 연결 대국 page-in 제거 + fiber 대국 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` 체크박스.

**Goal:** 연결 대국 page-in(예측 preload) 을 제거하고, fiber 대국을 다른 자산과 동일 패턴(크로스변전소=검색+이름해소, 연결=케이블)으로 통일한다 — 대국 이름은 `useAssetRefs`, 대국 설비 연결(소실된 실기능)은 검색-피커로 복구, 대국 포트 표시는 서버가 대국 OUT 패치 케이블을 응답에 포함.

**Architecture:** 케이블이 단일 SSOT(farPorts 등 파생구조 없음). 서버가 워킹카피 `cables` 에 자국 OPGW 의 대국 OUT 패치를 포함(현 연결 표시) → `buildSlotPorts` 무변경으로 대국 산출. 대국 이름은 id→`useAssetRefs`. 대국 편집은 `useSearchAssets`(온디맨드 후보) + 대국 패치 케이블 쓰기(staged→전역커밋). 마지막에 page-in 루프 + `connectedSubstationIds` 삭제.

**Tech Stack:** React/TS, Vitest, Prisma, Express, React Query.

**참조 스펙:** `docs/superpowers/specs/2026-07-02-phase3-p5-remove-pagein-design.md`

## Global Constraints

- **케이블 단일 SSOT** — `farPorts` 등 새 파생 구조/필드/함수 신설 금지. `buildSlotPorts`/`slotPorts` 로직·시그니처 무변경.
- **데이터 모델·스키마·마이그레이션 없음** — 패치는 계속 케이블. 코어 1급 엔티티화 안 함.
- **순서 강제:** A(케이블 끝점 이름) → B-표시(서버 대국 패치 포함 + fiber 대국명 useAssetRefs) → B-편집(검색-피커) → C(page-in 삭제). **C 는 A·B 소비처 이전 완료 후에만**(아니면 비-resident 대국에서 이름/포트 깨짐). B-표시의 백엔드 대국-패치 포함은 additive 라 먼저 넣어도 page-in 과 공존(무해).
- **useAssetRefs/useSearchAssets 는 존치·활용**(삭제 아님). 대국 이름=`useAssetRefs(ids)`, 대국 후보=`useSearchAssets({substationId, role, q})`. 둘 다 이미 FE 훅+BE 엔드포인트 완비.
- **`frontend/vite.config.js` 절대 stage/커밋 금지.** 커밋 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 개발/테스트 로컬만: FE `cd frontend && npx vitest run <경로>` / `npx tsc --noEmit`; BE `cd backend && npx vitest run <경로> --no-file-parallelism`. dev Postgres `ict-twin-postgres` 가동 중. Docker 빌드 금지.
- UI 변경 시 `frontend/src/components/ui/CONVENTIONS.md` 준수.

## File Structure

- **Modify** `frontend/src/features/connections/cableRegister.ts` — `resolveName` 에 `refs?` 주입.
- **Modify** `frontend/src/features/connections/components/AssetConnectionsTab.tsx` — 대국 끝점 id 수집 → `useAssetRefs` → refs 주입.
- **Modify** `frontend/src/features/cables/components/CableInspector.tsx` — 끝점 이름 `useAssetRefs`.
- **Modify** `backend/src/services/substationWorkingCopy.service.ts` — (T3)대국 OUT 패치 포함, (T6)`connectedSubstationIds` 제거.
- **Modify** `frontend/src/features/fiber/components/SlotPortsPanel.tsx`, `frontend/src/features/fiber/slotRegister.ts`(+`fiberRegisterDescriptor.tsx`) — 대국명 `useAssetRefs`.
- **Modify** `frontend/src/features/fiber/components/AssetSelectCell.tsx` — 검색-피커 + 대국 패치 쓰기.
- **Modify** `frontend/src/features/workingCopy/substationStore.ts` — (T6)page-in 루프 삭제.

---

## Task 1: cableRegister far-end 이름 useAssetRefs 주입 (Part A)

**Files:**
- Modify: `frontend/src/features/connections/cableRegister.ts:27-43`
- Modify: `frontend/src/features/connections/components/AssetConnectionsTab.tsx:46-57`
- Test: `frontend/src/features/connections/cableRegister.test.ts` (있으면 갱신, 없으면 생성)

**Interfaces:**
- `AssetRef = { id: string; name: string; substationId: string | null; substationName: string | null }` (from `../assets/useSearchAssets` 또는 `../assets/useAssetRefs`).
- Produces: `buildCableRegister(opts & { refs?: Map<string, AssetRef> })`.

- [ ] **Step 1: 실패 테스트**

`cableRegister.test.ts` 에 추가:
```ts
import { describe, it, expect } from 'vitest';
import { buildCableRegister } from './cableRegister';
import type { TraceGraph } from '../trace/traceGraph';

const graph = {
  cables: [{ id: 'c1', sourceAssetId: 'self', targetAssetId: 'far', sourceRole: null, targetRole: null, categoryId: 'cat' }],
  nameById: new Map([['self', '자국설비']]),  // far 는 없음(비-resident)
} as unknown as TraceGraph;
const assets = [{ id: 'self', name: '자국설비', assetType: { role: 'device' } }] as never;
const cat = () => ({ key: 'k', label: 'L', color: null });

it('대국 끝점 이름을 refs 로 해소(그래프에 없어도)', () => {
  const refs = new Map([['far', { id: 'far', name: '대국설비', substationId: 's2', substationName: '북춘천S/S' }]]);
  const out = buildCableRegister({ graph, assets, assetId: 'self', categoryGroupOf: cat, refs });
  expect(out[0].rows[0].toName).toBe('대국설비');
});
it('refs 미주입이면 기존 폴백(id)', () => {
  const out = buildCableRegister({ graph, assets, assetId: 'self', categoryGroupOf: cat });
  expect(out[0].rows[0].toName).toBe('far');
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/connections/cableRegister.test.ts` → FAIL(`refs` 미지원, `toName='far'`).

- [ ] **Step 3: 구현** — `cableRegister.ts` opts 에 `refs?` 추가하고 `resolveName` 폴백에 삽입:
```ts
export function buildCableRegister(opts: {
  graph: TraceGraph;
  assets: Asset[];
  assetId: string;
  categoryGroupOf: (c: { categoryId?: string | null }) => CategoryGroup;
  refs?: Map<string, { name: string }>;
}): CableSection[] {
  const { graph, assets, assetId, categoryGroupOf, refs } = opts;
  const isSelf = buildSelfSideChecker(assets, assetId);
  const nameOf = buildEndpointNameResolver(assets);
  const byId = toMapById(assets);
  const resolveName = (id?: string | null) => {
    if (!id) return '';
    const a = byId.get(id);
    if (a && a.assetType?.role === 'slot') return nameOf(id) || refs?.get(id)?.name || id;
    return nameOf(id) || refs?.get(id)?.name || graph.nameById.get(id) || id;
  };
  // …(이하 기존 그대로)
```

- [ ] **Step 4: 통과 확인** — 위 테스트 PASS.

- [ ] **Step 5: 호출부** — `AssetConnectionsTab.tsx`: 대국 끝점 id 수집 → `useAssetRefs` → 주입. import 추가 `import { useAssetRefs } from '../../assets/useAssetRefs';`. sections useMemo 앞에:
```ts
  const remoteIds = useMemo(() => {
    if (!graph) return [];
    const ids = new Set<string>();
    for (const c of graph.cables) {
      for (const e of [c.sourceAssetId, c.targetAssetId]) if (e) ids.add(e);
    }
    return [...ids];
  }, [graph]);
  const refs = useAssetRefs(remoteIds);
  const sections = useMemo(() => {
    if (!graph || !categories) return [];
    return buildCableRegister({ graph, assets, assetId, categoryGroupOf: makeCategoryGroupOf(categories), refs });
  }, [graph, categories, assets, assetId, refs]);
```
(resident id 는 useAssetRefs 가 즉시 반환하므로 전 끝점 id 를 넘겨도 무해 — miss 만 fetch.)

- [ ] **Step 6: 검증** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/connections` → PASS.

- [ ] **Step 7: 커밋**
```bash
git add frontend/src/features/connections/cableRegister.ts frontend/src/features/connections/cableRegister.test.ts frontend/src/features/connections/components/AssetConnectionsTab.tsx
git commit -m "refactor(connections): cableRegister 대국 끝점 이름 useAssetRefs 주입 (Part A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: CableInspector 끝점 이름 useAssetRefs (Part A)

**Files:**
- Modify: `frontend/src/features/cables/components/CableInspector.tsx:35,56-57,70`

**Interfaces:** Consumes `useAssetRefs`.

- [ ] **Step 1: 구현** — CableInspector 는 컴포넌트(순수단위 아님) → tsc + 수동 스모크로 검증. import 추가 `import { useAssetRefs } from '../../assets/useAssetRefs';`. `const { graph } = useTraceGraph();` 다음에 끝점 이름을 refs 로:
```ts
  const endpointIds = [cable?.sourceAssetId as string, cable?.targetAssetId as string].filter(Boolean);
  const refs = useAssetRefs(endpointIds);
  // …
  const src = refs.get(cable.sourceAssetId as string)?.name ?? (graph?.nameById.get(cable.sourceAssetId as string) ?? '');
  const tgt = refs.get(cable.targetAssetId as string)?.name ?? (graph?.nameById.get(cable.targetAssetId as string) ?? '');
```
주의: `cable` 은 `if (!cable) return …` 아래에서 non-null 이지만 `useAssetRefs` 는 훅이라 **early-return 위에서** 호출해야 한다. `cable` 조회를 훅 뒤로 미루지 말고, endpointIds 를 `cables.find` 결과로 훅 호출 전에 구성(없으면 `[]`).

정확한 순서(early-return 前 훅):
```ts
  const cables = useEffectiveCables();
  const { data: categories } = useCableCategories();
  const { graph } = useTraceGraph();
  const cable = cables.find((c) => c.id === cableId);
  const refs = useAssetRefs([cable?.sourceAssetId as string, cable?.targetAssetId as string].filter(Boolean));
  if (!cable) return <DetailCard><DetailNote>케이블을 찾을 수 없습니다.</DetailNote></DetailCard>;
```

- [ ] **Step 2: 검증** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/cables` → tsc 0, PASS(훅 규칙 위반 없음 — 모든 훅이 early-return 위).

- [ ] **Step 3: 커밋**
```bash
git add frontend/src/features/cables/components/CableInspector.tsx
git commit -m "refactor(cables): CableInspector 끝점 이름 useAssetRefs (Part A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 백엔드 — 워킹카피에 대국 OUT 패치 포함 (Part B-표시, additive)

**Files:**
- Modify: `backend/src/services/substationWorkingCopy.service.ts:21-29`
- Test: `backend/tests/substationWorkingCopy.integration.test.ts` (없으면 생성; 기존 패턴은 `substationCommit.integration.test.ts` 참고)

**Interfaces:** Produces: `getWorkingCopy` 반환 `cables` 에 자국 OPGW 의 대국 OUT 패치 케이블 포함(기존 `connectedSubstationIds` 는 T6 까지 유지).

- [ ] **Step 1: 실패 테스트** — 두 변전소 A/B, A에 자국슬롯 sa·B에 대국슬롯 sb, OPGW(sa↔sb, IN-IN), 대국 OUT 패치(sb→대국설비 dev, OUT, number 1) 생성. `getWorkingCopy(A)` 의 `cables` 에 그 대국 패치 id 가 포함되는지:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../src/config/prisma.js';
import { getWorkingCopy } from '../src/services/substationWorkingCopy.service.js';
// (setup: hq/branch/subA/subB/floor/types — substationCommit.integration.test.ts 의 beforeAll 패턴 복사)
it('워킹카피 cables 에 자국 OPGW 의 대국 OUT 패치가 포함된다', async () => {
  const slotType = (await prisma.assetType.findFirstOrThrow({ where: { role: 'slot' } })).id;
  const devType = (await prisma.assetType.findFirstOrThrow({ where: { role: 'device' } })).id;
  const sa = await prisma.asset.create({ data: { substationId: subAId, assetTypeId: slotType, name: 'sa' } });
  const sb = await prisma.asset.create({ data: { substationId: subBId, assetTypeId: slotType, name: 'sb' } });
  const dev = await prisma.asset.create({ data: { substationId: subBId, assetTypeId: devType, name: '대국설비' } });
  await prisma.cable.create({ data: { sourceAssetId: sa.id, targetAssetId: sb.id, sourceRole: 'IN', targetRole: 'IN' } });
  const farPatch = await prisma.cable.create({ data: { sourceAssetId: sb.id, targetAssetId: dev.id, sourceRole: 'OUT', number: 1 } });
  const wc = await getWorkingCopy(subAId);
  expect(wc.cables.some((c: { id: string }) => c.id === farPatch.id)).toBe(true);   // 대국 패치 포함
  expect(wc.assets.some((a: { id: string }) => a.id === dev.id)).toBe(false);        // 대국 자산은 미포함
});
```

- [ ] **Step 2: 실패 확인** — `cd backend && npx vitest run tests/substationWorkingCopy.integration.test.ts --no-file-parallelism` → FAIL(대국 패치 미포함).

- [ ] **Step 3: 구현** — `getWorkingCopy` 의 cables 로드 뒤에 대국 OUT 패치 병합:
```ts
export async function getWorkingCopy(substationId: string) {
  const [assets, cables] = await Promise.all([
    prisma.asset.findMany({
      where: { substationId },
      include: { assetType: { select: { id: true, name: true, role: true, categoryId: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    cableService.getBySubstationId(substationId),
  ]);

  // 대국 OUT 패치 포함 — 자국 OPGW(IN-IN) 의 대국(twin) 슬롯에 닿는 OUT 패치를 추가(현 대국 연결 표시용).
  // 대국 자산은 싣지 않는다(이름은 클라 useAssetRefs). 예측 아님 — 자국 OPGW 로 결정.
  const localAssetIds = new Set(assets.map((a) => a.id));
  const twinSlotIds = new Set<string>();
  for (const c of cables) {
    if (c.sourceRole === 'IN' && c.targetRole === 'IN') {
      for (const e of [c.sourceAssetId, c.targetAssetId]) {
        if (e && !localAssetIds.has(e)) twinSlotIds.add(e);   // 반대편(대국) 슬롯
      }
    }
  }
  if (twinSlotIds.size) {
    const seen = new Set(cables.map((c) => c.id));
    const farPatches = await cableService.getByEndpointAssetIds([...twinSlotIds]);  // 아래 §Step3b
    for (const fp of farPatches) if (!seen.has(fp.id)) cables.push(fp);
  }
  // …(records 이하 기존 그대로) …
  return { assets: assetsWithRecords, cables, connectedSubstationIds };
}
```

- [ ] **Step 3b: cableService.getByEndpointAssetIds 추가** — `backend/src/services/cable.service.ts` 에 끝점 자산 id 로 케이블을 뽑는 메서드(getBySubstationId 와 동일 DTO 매핑 재사용). 없으면 추가:
```ts
async getByEndpointAssetIds(assetIds: string[]) {
  const rows = await prisma.cable.findMany({
    where: { OR: [{ sourceAssetId: { in: assetIds } }, { targetAssetId: { in: assetIds } }] },
    // …getBySubstationId 와 동일한 select/include/DTO 매핑…
  });
  return rows.map(/* 동일 매퍼 */);
}
```
(getBySubstationId 의 매퍼를 공용 함수로 추출해 재사용 — 중복 금지.)

- [ ] **Step 4: 통과 + 전수** — `cd backend && npx vitest run tests/substationWorkingCopy.integration.test.ts --no-file-parallelism` → PASS. 이어 `npx vitest run --no-file-parallelism` 전수 PASS.

- [ ] **Step 5: 커밋**
```bash
git add backend/src/services/substationWorkingCopy.service.ts backend/src/services/cable.service.ts backend/tests/substationWorkingCopy.integration.test.ts
git commit -m "feat(workingcopy): 자국 OPGW 의 대국 OUT 패치를 응답에 포함 — 대국 포트 표시(케이블 SSOT)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: fiber 대국설비 이름 useAssetRefs (Part B-표시 FE)

**Files:**
- Modify: `frontend/src/features/fiber/components/SlotPortsPanel.tsx:80-87`
- Modify: `frontend/src/features/fiber/slotRegister.ts:61` + `frontend/src/features/fiber/fiberRegisterDescriptor.tsx`

**Interfaces:** `buildSlotPorts` 는 무변경(대국 id 는 §T3 로 resident 케이블에서 나옴). 이름만 useAssetRefs.

- [ ] **Step 1: SlotPortsPanel 대국명** — `nameOf`/`subOf` 가 대국 id 에 대해 useAssetRefs 폴백을 쓰게. import `import { useAssetRefs } from '../../assets/useAssetRefs';`. ports 계산 후 대국 id 수집 → refs:
```ts
  const remoteIds = useMemo(() => ports.map((p) => p.remoteAssetId).filter((x): x is string => !!x), [ports]);
  const refs = useAssetRefs(remoteIds);
  const nameOf = (id: string | null) => (id ? (graph?.nameById.get(id) ?? refs.get(id)?.name ?? id) : null);
  const subOf = (id: string | null) => (id ? (graph?.subNameById.get(id) ?? refs.get(id)?.substationName ?? null) : null);
```

- [ ] **Step 2: slotRegister farName** — `slotRegister.ts` `buildSlotCoreRows` 에 `refs?: Map<string, { name: string }>` 파라미터 추가, farName 폴백:
```ts
export function buildSlotCoreRows(slot: SlotLike, localCables: CableLike[], graph: TraceGraph | null, refs?: Map<string, { name: string }>): SlotCoreRow[] {
  // …
    const farName = remoteAssetId ? (graph?.nameById.get(remoteAssetId) ?? refs?.get(remoteAssetId)?.name ?? remoteAssetId) : null;
  // …
}
```
`fiberRegisterDescriptor.tsx` 는 순수 디스크립터라 훅 불가 → `ConnectionRegisterGrid` 가 refs 를 `ctx` 로 전달. `registerTypes.ts` `RegisterCtx` 에 `refs?: Map<string, { name: string }>` 추가, `ConnectionRegisterGrid.tsx:19-24` 에서 대국 id 수집 → `useAssetRefs` → `ctx.refs` 주입, `fiberRegisterDescriptor.buildSection` 이 `buildSlotCoreRows(..., ctx.refs)` 로 전달. (grid 가 대국 id 를 알려면 slot 들의 `buildSlotPorts` remoteAssetId 를 수집 — 또는 descriptor 에 `collectRemoteIds?(assets, cables, graph): string[]` 옵셔널 추가해 fiber 만 구현, power 는 미구현. 후자 추천: grid 제네릭 유지.)

- [ ] **Step 3: 테스트** — `slotRegister` 단위: refs 주입 시 farName 해소, 미주입 시 id 폴백. `buildSlotPorts` 무변경 회귀 확인.
```ts
it('farName: refs 주입 시 이름, 미주입 시 id', () => {
  const g = { nameById: new Map(), cables: [/* 대국 OUT 패치 */] } as never;
  // remoteAssetId='dev' 로 나오는 상황 구성
  const withRefs = buildSlotCoreRows(slot, cables, g, new Map([['dev', { name: '대국설비' }]]));
  const noRefs = buildSlotCoreRows(slot, cables, g);
  expect(withRefs.find(r => r.remoteAssetId==='dev' || r.farName==='대국설비')?.farName).toBe('대국설비');
});
```

- [ ] **Step 4: 검증** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/fiber src/features/connections` → PASS.

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/fiber/components/SlotPortsPanel.tsx frontend/src/features/fiber/slotRegister.ts frontend/src/features/fiber/slotRegister.test.ts frontend/src/features/fiber/fiberRegisterDescriptor.tsx frontend/src/features/connections/registerGrid/registerTypes.ts frontend/src/features/connections/registerGrid/ConnectionRegisterGrid.tsx
git commit -m "refactor(fiber): 대국설비 이름 useAssetRefs (Part B-표시) — buildSlotPorts 무변경

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: AssetSelectCell 대국 검색-피커 + 대국 패치 쓰기 (Part B-편집)

**Files:**
- Modify: `frontend/src/features/fiber/components/AssetSelectCell.tsx` (읽기전용 → 피커)
- Test: `frontend/src/features/fiber/components/AssetSelectCell.test.tsx`

**Interfaces:** Consumes `useSearchAssets({ substationId, role, q })`, `useAssetRefs`, `buildCoreOutCable`(`fiberWrite.ts`), `useSubstationWorkingCopy`.

**설계:** side='remote' 일 때 편집 가능 피커. 후보 = `useSearchAssets({ substationId: 대국sub, role: 'device' })` (연결 가능 대국 설비 — 근단측 대상 role 과 동일; 시드 통신단말=role 'device'). 선택 → 대국 OUT 패치 케이블 생성(교체 시 기존 삭제 후 생성). 대국 sub = twin 슬롯의 substationId — twin id 로 `useAssetRefs([twinId])` 해 `substationId` 획득(또는 §T3 로 resident 된 대국슬롯 자산이 있으면 거기서). side='local' 은 기존 읽기전용 표시 유지(근단 편집은 SlotPortsPanel 담당).

- [ ] **Step 1: 실패 테스트** — remote 피커가 후보를 보여주고 선택 시 대국 패치를 stage 하는지(useSearchAssets/useSubstationWorkingCopy 목):
```tsx
// mock useSearchAssets → [{id:'dev2', name:'단말2', substationId:'s2', substationName:'북춘천'}]
// 렌더 → 피커 열기 → '단말2' 선택 → wc.put('cables', {sourceAssetId: 대국슬롯, targetAssetId:'dev2', sourceRole:'OUT', number}) 호출 검증
```
(구체 렌더/피커 UX 는 CONVENTIONS.md 공용 컴포넌트 사용 — 기존 자국 피커/드롭다운 패턴 참고. act/waitFor 로 비동기 후보.)

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/fiber/components/AssetSelectCell.test.tsx` → FAIL.

- [ ] **Step 3: 구현** — AssetSelectCell(remote):
  - `twinId = twinSlotIdOf(slot.id, cables)`; 대국 sub = `useAssetRefs([twinId]).get(twinId)?.substationId`.
  - `const { results } = useSearchAssets({ substationId: 대국sub ?? undefined, role: 'device', q })` (대국sub 없으면 빈 결과).
  - 현재 값 = 기존 대국 OUT 패치의 반대끝(있으면). 표시 이름은 `useAssetRefs`.
  - 선택 시: 기존 대국 패치 있으면 `wc.remove('cables', oldId)`, `buildCoreOutCable({ id: generateTempId(), slotId: twinId, assetId: 선택id, coreNumber, category: <OPGW/OUT cat>, pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null })` → `wc.put('cables', patch)`.
  - side='local' 분기는 현행 읽기전용 span 유지.

- [ ] **Step 4: 통과 확인** — 테스트 PASS.

- [ ] **Step 5: 크로스변전소 커밋 가드 확인(BE)** — 대국 단독 케이블(양끝 대국)을 자국 세션에서 stage→commit 이 통과하는지 통합 테스트로 확인. `substationCommit.integration.test.ts` 에 케이스: subA 세션에서 subB 자산 두 개를 잇는 케이블 create 커밋 → 성공 + subB 케이블로 저장. 실패(스코프 가드 차단)하면 `substationCommit.service.ts` 의 케이블 create 스코핑을 조정(엔드포인트 기반 허용). 통과하면 코드 변경 없음.

- [ ] **Step 6: 검증** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/fiber` + `cd backend && npx vitest run tests/substationCommit.integration.test.ts --no-file-parallelism` → PASS.

- [ ] **Step 7: 커밋**
```bash
git add frontend/src/features/fiber/components/AssetSelectCell.tsx frontend/src/features/fiber/components/AssetSelectCell.test.tsx
# (BE 조정 있었으면) backend/src/services/substationCommit.service.ts backend/tests/substationCommit.integration.test.ts
git commit -m "feat(fiber): 대국설비 연결을 검색-피커로 복구 — 대국 패치 케이블 쓰기(전역 커밋) (Part B-편집)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 연결 대국 page-in 제거 (Part C)

**Files:**
- Modify: `frontend/src/features/workingCopy/substationStore.ts:395-403`
- Modify: `backend/src/services/substationWorkingCopy.service.ts` (`connectedSubstationIds` 계산+필드 제거)
- Modify/Delete: `frontend/src/features/workingCopy/substationStore.connected.test.ts`, `substationStore.residentGraph.test.ts`

- [ ] **Step 1: 소비처 잔재 게이트** — A·B 완료 확인: 대국 이름/포트를 전역 `graph.nameById`/resident 에만 의존하는 곳이 없어야(전부 useAssetRefs/서버 대국 패치). `cd frontend/src && git grep -n "useTraceGraph" features | grep -v test` 결과 중 대국 이름 동기조회 0 확인.

- [ ] **Step 2: FE page-in 루프 삭제** — `substationStore.ts` `load()` 의 다음 블록(395-403) 삭제:
```ts
        // 연결 대국 page-in(§106) …
        const connectedIds: string[] = (data.data.connectedSubstationIds as string[] | undefined) ?? [];
        if (connectedIds.length) { … await st.syncSubData(cid) … }
```
`syncSubData`(406+) 는 유지.

- [ ] **Step 3: BE connectedSubstationIds 제거** — `substationWorkingCopy.service.ts` 의 `farAssetIds`/`farAssets`/`connectedSubstationIds` 계산(63-77) 및 반환 필드(79) 삭제. 반환 = `{ assets: assetsWithRecords, cables }` (T3 의 대국 패치 포함은 유지).

- [ ] **Step 4: 테스트 갱신** — `substationStore.connected.test.ts`(page-in 검증) 제거/갱신. `residentGraph.test.ts` 가 대국 resident 전제면 갱신(대국은 이제 비-resident, 대국 패치만 옴).

- [ ] **Step 5: 게이트 + 전수** — `cd frontend/src && git grep -n "connectedSubstationIds" features` → 0. `cd frontend && npx tsc --noEmit && npx vitest run` 전수. `cd backend && npx vitest run --no-file-parallelism` 전수.

- [ ] **Step 6: 커밋**
```bash
git add frontend/src/features/workingCopy/substationStore.ts backend/src/services/substationWorkingCopy.service.ts frontend/src/features/workingCopy/substationStore.connected.test.ts frontend/src/features/workingCopy/substationStore.residentGraph.test.ts
git commit -m "refactor(workingcopy): 연결 대국 page-in 제거 — 예측 preload 소멸(대국은 검색+대국패치+useAssetRefs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 스모크 + 문서/로드맵

- [ ] **Step 1: dev 스모크** — docker-compose.dev.yml + npm run dev. 대국 미방문 상태에서: (1) 선번장 대국설비 표시, (2) 대국설비 **검색-피커로 연결/변경/해제**(저장 후 유지), (3) 연결탭 상대끝·CableInspector 양끝 이름 정상(잠깐 placeholder 후). 대국 변전소 열었을 때 그 편집이 반영됐는지.
- [ ] **Step 2: 문서** — 스펙 상태 "구현 완료" + 커밋범위 기입. `docs/architecture/data-scope-architecture-roadmap.md` Phase 3 "연결 대국 page-in 제거 완료 — scope 휴리스틱 0" 표기. Phase 4(검색 프리미티브)와 연결 명시(대국 편집이 검색-피커로 복구됨).
- [ ] **Step 3: 커밋** — `docs: P3-5 page-in 제거 완료 반영 — 로드맵 Phase 3 완료`

## Self-Review

- **스펙 커버리지:** §4.1 Part A=T1·T2 / §4.2 대국 패치 포함=T3 / §4.2 이름=T4 / §4.3 편집 검색-피커=T5 / §4.4 page-in 제거=T6 / §8 스모크=T7. ✓
- **원칙 반영:** farPorts 없음(대국=케이블), buildSlotPorts 무변경(T3·T4), useSearchAssets+useAssetRefs 활용(T4·T5), 전원 무변경(비목표), 스키마/마이그 없음. ✓
- **타입 일관성:** `refs?: Map<string, {name…}>` — cableRegister(T1)·buildSlotCoreRows(T4)·RegisterCtx(T4) 일관. `useAssetRefs(ids)→Map<id,AssetRef>`·`useSearchAssets({substationId,role,q})→AssetRef[]` 기존 시그니처 준수(변경 없음). `buildCoreOutCable`(T5) 기존 시그니처 사용. ✓
- **순서:** A→B-표시→B-편집→C, C 게이트(T6 Step1)로 소비처 이전 강제. T3(대국 패치 포함) additive 라 page-in 과 공존 안전. ✓
- **훅 규칙:** CableInspector(T2)·AssetSelectCell(T5) 훅을 early-return 위에 배치 명시. ✓
- **잔여 위험:** (a) 대국 피커 role='device' 가정 — 근단측 연결 대상 role 과 다르면 T5 에서 조정(시드=device). (b) 크로스변전소 케이블 커밋 가드 — T5 Step5 에서 확인 후 필요시 조정. (c) `ConnectionRegisterGrid` 대국 id 수집은 descriptor `collectRemoteIds` 옵셔널로(제네릭 유지).
