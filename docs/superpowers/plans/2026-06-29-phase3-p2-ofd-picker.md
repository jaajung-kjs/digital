# Phase 3 — P3-2: OFD 피어 피커 → searchAssets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `OfdSlotRail`의 대국 OFD 피어 피커를 전역 그래프 열거(`ofdAssets(graph)`)에서 단일 검색 프리미티브(`useSearchAssets({role:'ofd'})`, P3-1)로 전환하고, 죽은 `ofdAssets`/`assetsInSubstation`(+ 전용 private 헬퍼)을 삭제한다.

**Architecture:** 미지의 원격 OFD 열거(전 변전소)는 edge-following으로 못 풀어 서버 검색이 본질(스펙 §110). `OfdSlotRail`은 `useTraceGraph`를 **계속** 쓰되(슬롯 라벨 `fiberSlotLabel`/`remoteSlotSubstation` — 열린 변전소 resident 읽기) OFD 열거만 `useSearchAssets`로 바꾼다. 피어/자국 도출(`filter`/`find`)·`addRoute`는 무변경.

**Tech Stack:** React + @tanstack/react-query, Vitest + @testing-library/react. 프론트 전용(백엔드 변경 없음 — P3-1 엔드포인트 재사용).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-06-29-phase3-demand-paging-design.md` §5(OFD 피커)·§10 P3-2. page-in·광대국·피드끄기는 후속(P3-3·P3-4) — 이 plan 아님.
- `useSearchAssets`(P3-1, main 머지됨)는 `frontend/src/features/assets/useSearchAssets.ts` 에서 `useSearchAssets({role?,q?,substationId?}): { results: AssetRef[]; isLoading }` + `interface AssetRef { id; name; substationId: string|null; substationName: string|null }` 를 export.
- 소비처별 전용 헬퍼 금지(§111): OFD 피커는 단일 `searchAssets` 사용, OFD 전용 서버 경로 만들지 않는다.
- `frontend/vite.config.js` 무관 미커밋 — stage/touch 금지. 커밋은 변경 파일만 `git add`.
- 프론트 tsc/vitest 는 `cd frontend`. `git add`/`commit` 은 repo 루트.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 행동 불변: 전역 피드가 아직 살아있어(P3-4 전) `useSearchAssets`와 `ofdAssets`는 같은 OFD 집합을 돌려준다 → 전환은 회귀 없이 동치.

---

## File Structure

- **Modify** `frontend/src/features/fiber/components/OfdSlotRail.tsx` — OFD 열거를 `useSearchAssets`로. `useTraceGraph`는 슬롯 라벨용 유지. `AssetRef` import 출처 변경.
- **Modify** `frontend/src/features/fiber/components/OfdSlotGrid.test.tsx` — (이 파일이 `OfdSlotRail`을 렌더하는 기존 테스트) `useSearchAssets` mock 추가.
- **Modify** `frontend/src/features/fiber/components/OfdRoutePopover.tsx` — `AssetRef` import 출처 변경(traceGraph → useSearchAssets).
- **Modify** `frontend/src/features/trace/traceGraph.ts` — 죽은 `ofdAssets`/`assetsInSubstation`/`toRef`/`graphIsOfd`/`AssetRef` 삭제(`remoteSlotSubstation` 유지).
- **Modify** `frontend/src/features/trace/traceGraph.test.ts` — `ofdAssets`/`assetsInSubstation` import·테스트 블록 삭제.

---

## Task 1: `OfdSlotRail` — OFD 열거를 `useSearchAssets`로

**Files:**
- Modify: `frontend/src/features/fiber/components/OfdSlotRail.tsx`
- Modify: `frontend/src/features/fiber/components/OfdSlotGrid.test.tsx`

**Interfaces:**
- Consumes: `useSearchAssets({ role: 'ofd' }): { results: AssetRef[]; isLoading }`, `type AssetRef` (from `../../assets/useSearchAssets`).
- 배경(현재 코드):
  - 5행: `import { useTraceGraph, ofdAssets, type AssetRef } from '../../trace/traceGraph';`
  - 43행: `const { graph } = useTraceGraph();` (슬롯 라벨용 — 유지)
  - 51행: `const allOfds = useMemo(() => (graph ? ofdAssets(graph) : []), [graph]);`
  - 52행: `const peerOfds = useMemo(() => allOfds.filter((a) => a.id !== ofdId), [allOfds, ofdId]);`
  - 53행: `const localOfd = useMemo(() => allOfds.find((a) => a.id === ofdId) ?? null, [allOfds, ofdId]);`
  - 113행 부근: `const title = fiberSlotLabel(slot.id, graph) || slot.name;` (graph 사용 — 유지)

- [ ] **Step 1: 테스트 먼저 — `OfdSlotGrid.test.tsx` 에 useSearchAssets mock 추가 (failing)**

`OfdSlotGrid.test.tsx` 의 `vi.mock` 선언부(다른 `vi.mock` 들 사이, 예: `useAssetTypeIdByRole` mock 위/아래)에 추가:
```ts
// OFD 피어 피커 — 전역 그래프 열거 대신 단일 검색 프리미티브(P3-2).
// vi.mock 은 호이스팅되므로 모듈 상단 const(OFD_ID 등) 참조 불가 → 리터럴 인라인.
vi.mock('../../assets/useSearchAssets', () => ({
  useSearchAssets: ({ role }: { role?: string }) => ({
    results:
      role === 'ofd'
        ? [
            { id: 'ofd1', name: '원주OFD', substationId: 's1', substationName: '원주변전소' },
            { id: 'ofd2', name: '홍천OFD', substationId: 's2', substationName: '홍천변전소' },
          ]
        : [],
    isLoading: false,
  }),
}));
```
(나머지 테스트는 그대로 — 기존 7개 케이스가 OFD 열거 출처만 바뀌어도 동일 동작이어야 한다. 이 단계에서 실행하면 `OfdSlotRail`이 아직 `ofdAssets`를 쓰므로 mock 이 무시되어 기존대로 통과하거나, import 충돌은 없음 → 진짜 fail 은 Step 2 의 소비처 전환 후 mock 이 실효되는지로 확인. 우선 mock 만 추가.)

- [ ] **Step 2: `OfdSlotRail.tsx` 전환**

(a) 5행 import 교체:
```ts
import { useTraceGraph } from '../../trace/traceGraph';
import { useSearchAssets, type AssetRef } from '../../assets/useSearchAssets';
```
(b) 51행 교체(useMemo 제거, 훅으로):
```ts
  // 대국 OFD 후보 = 단일 검색 프리미티브(미지 원격 열거 = 서버, §110). 전역 그래프 의존 제거.
  const { results: allOfds } = useSearchAssets({ role: 'ofd' });
```
(c) 52~53행(`peerOfds`/`localOfd`)·`addRoute`·슬롯 라벨(`graph`)·나머지 무변경. `useTraceGraph`/`graph` 는 `fiberSlotLabel(slot.id, graph)` 때문에 유지.

- [ ] **Step 3: 테스트 실행 — 전수 통과 확인**

Run: `cd frontend && npx vitest run src/features/fiber/components/OfdSlotGrid.test.tsx`
Expected: PASS (기존 7개 — 슬롯 타일 제목, 빈 슬롯 팝오버 "홍천변전소 대국", 48/24 코어 경로생성 put 3회 등). 이제 OFD 후보는 `useSearchAssets` mock 에서 옴(자국 ofd1 제외 → 피어 홍천만 팝오버에 표시).

- [ ] **Step 4: tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0. (`AssetRef`가 useSearchAssets 출처로 바뀌었지만 동일 shape → `peerOfds`/`OfdRoutePopover`(아직 traceGraph AssetRef) 간 구조적 호환. T2에서 popover 도 통일.)

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/components/OfdSlotRail.tsx frontend/src/features/fiber/components/OfdSlotGrid.test.tsx
git commit -m "feat(fiber): OFD 피어 피커를 useSearchAssets({role:ofd})로 — 전역 열거 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 죽은 `ofdAssets`/`assetsInSubstation` 삭제 + `AssetRef` 통일

**Files:**
- Modify: `frontend/src/features/fiber/components/OfdRoutePopover.tsx`
- Modify: `frontend/src/features/trace/traceGraph.ts`
- Modify: `frontend/src/features/trace/traceGraph.test.ts`

**Interfaces:**
- T1 후 `ofdAssets`/`assetsInSubstation`/`toRef`/`graphIsOfd`/`AssetRef`(traceGraph)의 유일한 잔여 참조는 `OfdRoutePopover`(`type AssetRef`)뿐. 이걸 useSearchAssets로 옮기면 다섯 심볼 모두 dead → 삭제.

- [ ] **Step 1: `OfdRoutePopover.tsx` AssetRef 출처 변경**

2행 교체:
```ts
import type { AssetRef } from '../../assets/useSearchAssets';
```
(기존: `import type { AssetRef } from '../../trace/traceGraph';`. 나머지 무변경 — `AssetRef` shape 동일.)

- [ ] **Step 2: `traceGraph.ts` 죽은 코드 삭제**

다음 5개를 삭제(나머지 — 특히 `remoteSlotSubstation`(`fiberSlotLabel`가 사용), `buildTraceGraph`, `useTraceGraph`, `isOpgwTwin`/`other` import — 모두 유지):
- `function graphIsOfd(graph, id)` (roleById==='ofd' 판정)
- `export interface AssetRef { ... }`
- `function toRef(graph, id): AssetRef`
- `export function ofdAssets(graph): AssetRef[]`
- `export function assetsInSubstation(graph, substationId): AssetRef[]`

- [ ] **Step 3: `traceGraph.test.ts` 정리**

(a) 2행 import 에서 `ofdAssets, assetsInSubstation` 제거:
```ts
import { buildTraceGraph, remoteSlotSubstation } from './traceGraph';
```
(b) `describe('ofdAssets / assetsInSubstation (staged 가 저장 전에도 후보에 보임)', ...)` 블록 전체 삭제(현재 ~109~163행). `buildTraceGraph`/`remoteSlotSubstation` 등 다른 describe 는 유지.

- [ ] **Step 4: 빌드 + 게이트**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0(미해결 참조 없음 — 모든 AssetRef 소비처가 useSearchAssets 출처).

Run: `cd /Users/jsk/1210/digital/frontend/src && git grep -n "ofdAssets\|assetsInSubstation"`
Expected: 출력 없음(0 — 정의·소비처·테스트 모두 제거).

- [ ] **Step 5: 영향 테스트 실행**

Run: `cd frontend && npx vitest run src/features/trace/traceGraph.test.ts src/features/fiber/components/OfdSlotGrid.test.tsx`
Expected: PASS(traceGraph 잔여 테스트 + OfdSlotRail 7개).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/components/OfdRoutePopover.tsx frontend/src/features/trace/traceGraph.ts frontend/src/features/trace/traceGraph.test.ts
git commit -m "refactor(trace): 죽은 ofdAssets/assetsInSubstation 삭제, AssetRef 를 useSearchAssets 로 통일

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 회귀

**Files:** 없음(검증 전용).

- [ ] **Step 1: 프론트 tsc + 전수**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; vitest 전수 PASS(traceGraph 테스트는 ofdAssets 블록만큼 감소, 그 외 동일).

- [ ] **Step 2: 게이트 재확인**

Run: `cd /Users/jsk/1210/digital/frontend/src && git grep -n "ofdAssets\|assetsInSubstation"`
Expected: 0. OFD 피커는 `useSearchAssets({role:'ofd'})` 단일 프리미티브 사용. 전역 `useTraceGraph`는 슬롯 라벨(resident 읽기)용으로만 잔존(정상 — 광대국·피드끄기는 P3-3·P3-4).

- [ ] **Step 3: 스모크(선택, dev 서버)**

OFD 상세의 빈 슬롯 클릭 → 대국 OFD 팝오버가 다른 변전소 OFD(+미저장 OFD)를 나열 → 선택 시 경로 생성. 전역 피드 살아있는 현재는 기존과 동일해야 함(동치 전환).

---

## Self-Review (작성자 점검)

**1. Spec coverage:** 스펙 §5(OfdSlotRail: `ofdAssets` → `useSearchAssets({role:'ofd'})`; 죽은 `assetsInSubstation` 삭제) → T1(전환)+T2(삭제). §10 P3-2 분해와 일치. page-in(P3-3)·피드끄기(P3-4)는 범위 밖 — 명시. ✓

**2. Placeholder scan:** 삭제 대상 5심볼·라인 위치 명시, 테스트 mock 코드 실물 포함, grep 게이트 구체. TBD/모호 없음. traceGraph.test 블록 범위는 "현재 ~109~163행 describe 전체"로 명시(grep 으로 확인 가능). ✓

**3. Type consistency:** `AssetRef`(useSearchAssets) = `{id; name; substationId: string|null; substationName: string|null}` — traceGraph 의 기존 `AssetRef`와 동일 필드 → `OfdSlotRail`/`OfdRoutePopover` 전환 시 구조 호환. `useSearchAssets({role})` 반환 `{results, isLoading}` ↔ T1 `const { results: allOfds }` 일치. `peerOfds`/`localOfd`/`addRoute(remote: AssetRef)` 무변경 — 동일 타입. ✓
