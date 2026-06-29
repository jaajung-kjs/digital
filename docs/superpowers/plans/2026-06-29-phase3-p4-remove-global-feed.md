# Phase 3 — P3-4: 전역 피드 끄기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 eager 피드(`useHydrateGlobal` — 전 변전소 자산·케이블 통째 적재)를 제거한다. 이후 워킹카피 `saved` 는 **resident**(연 변전소 + P3-3 연결 대국)만 보유 → `read = base ⊕ overlay` 단일 불변식 완성, scope 휴리스틱의 마지막 뿌리 제거.

**Architecture:** `useHydrateGlobal()` 호출(WorkspacePage)을 삭제. 열린 변전소는 이미 `useWorkingCopyLoader`(WorkspacePage)가 demand-load, 연결 대국은 P3-3 `load()`가 page-in, 조직트리·평면도·카탈로그는 각자 로더 보유 → 전역 피드만 떼면 demand-paging 완성. 크로스변전소 이름(광 대국·공급원·OPGW 끝점)은 전부 **1-hop 케이블 이웃 = 연결 대국 = resident**(P3-3)라 그대로 해소된다.

**Tech Stack:** React + Zustand + @tanstack/react-query, Vitest. 프론트 전용.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-06-29-phase3-demand-paging-design.md` §7·§10 P3-4. **이게 Phase 3 의 마지막 조각**(P3-1 검색·P3-2 OFD피커·P3-3 연결 page-in 이 선행 완료, main 머지됨).
- **백엔드 전역 피드 엔드포인트(`GET /assets` listAll, `GET /cables`) 삭제는 이 plan 비범위(저가치 housekeeping 으로 연기).** 프론트가 더 이상 호출 안 하면 dead 지만 무해(가드레일이 재호출 차단). 백엔드 라우트 제거는 통합테스트 영향 큰 별도 정리.
- 크로스변전소 이름 해소는 P3-3 연결 page-in 에 의존(1-hop 케이블 이웃 resident). 이 plan 은 그 전제 위에서 피드만 제거.
- 네비게이션-시 로딩 윈도(새 변전소 도착 시 잠깐 빈/로딩) 수용(스펙 §11, 균일성 동력). 소비처는 이미 피드의 async 로딩을 견디던 가드(`!effective.length` 등) 보유 → self-healing.
- `frontend/vite.config.js` 무관 미커밋 — stage/touch 금지. 커밋 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 프론트 `cd frontend`. `git add`/`commit` 은 repo 루트.

---

## File Structure

- **Modify** `frontend/src/pages/WorkspacePage.tsx` — `useHydrateGlobal()` 호출 + import 제거.
- **Modify** `frontend/src/pages/WorkspacePage.test.tsx` — 삭제될 모듈의 `vi.mock('.../useHydrateGlobal')` 줄 제거.
- **Delete** `frontend/src/features/workingCopy/useHydrateGlobal.ts`
- **Delete** `frontend/src/features/workingCopy/useHydrateGlobal.test.tsx`
- **Modify** `frontend/src/features/workingCopy/substationStore.ts` — `hydrateGlobal` 액션(인터페이스 선언 + 구현) 제거.
- **Delete** `frontend/src/features/workingCopy/substationStore.hydrate.test.ts` (3 케이스 전부 hydrateGlobal 전용).
- **Modify** `frontend/src/architecture-ssot.guardrail.test.ts` — 전역 피드 가드레일을 "어디서도 안 읽음"으로 강화(ALLOW 비움).
- **Create** `frontend/src/features/workingCopy/substationStore.residentGraph.test.ts` — 연결 대국 이름이 resident 그래프에서 해소됨(P3-4 계약).

---

## Task 1: 전역 피드 호출·훅 제거

**Files:**
- Modify: `frontend/src/pages/WorkspacePage.tsx`
- Modify: `frontend/src/pages/WorkspacePage.test.tsx`
- Delete: `frontend/src/features/workingCopy/useHydrateGlobal.ts`
- Delete: `frontend/src/features/workingCopy/useHydrateGlobal.test.tsx`

**Interfaces:**
- 배경: `WorkspacePage.tsx` 16행 `import { useHydrateGlobal } from '../features/workingCopy/useHydrateGlobal';`, 181행 `useHydrateGlobal();`. 179행 `useWorkingCopyLoader(contextSubstationId);` 는 **유지**(열린 변전소 demand-load — P3-4 의 핵심 적재 경로). `WorkspacePage.test.tsx` 86행 `vi.mock('../features/workingCopy/useHydrateGlobal', () => ({ useHydrateGlobal: () => {} }));`.

- [ ] **Step 1: `WorkspacePage.tsx` 에서 호출·import 제거**

- 16행 import 줄 삭제.
- 181행 `useHydrateGlobal();` 삭제.
- 179행 `useWorkingCopyLoader(contextSubstationId);` 는 **그대로 유지**.

- [ ] **Step 2: `WorkspacePage.test.tsx` 의 mock 줄 제거**

86행 `vi.mock('../features/workingCopy/useHydrateGlobal', () => ({ useHydrateGlobal: () => {} }));` 삭제(모듈이 삭제되므로 mock 대상 부재 → 제거). 그 외 mock·테스트 무변경.

- [ ] **Step 3: 훅·훅테스트 파일 삭제**

```bash
cd /Users/jsk/1210/digital
git rm frontend/src/features/workingCopy/useHydrateGlobal.ts frontend/src/features/workingCopy/useHydrateGlobal.test.tsx
```

- [ ] **Step 4: tsc + WorkspacePage 테스트**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 (WorkspacePage 가 더 이상 useHydrateGlobal 참조 안 함; store.hydrateGlobal 은 T2 에서 제거하므로 여기선 아직 존재 — tsc 통과).

Run: `cd frontend && npx vitest run src/pages/WorkspacePage.test.tsx`
Expected: PASS(mock 제거 후에도 — WorkspacePage 는 useWorkingCopyLoader/effective 로 동작, 테스트는 그 경로를 이미 mock).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/WorkspacePage.tsx frontend/src/pages/WorkspacePage.test.tsx
git commit -m "feat(workingcopy): 전역 eager 피드(useHydrateGlobal) 호출 제거 — demand-paging 활성

열린 변전소는 useWorkingCopyLoader, 연결 대국은 load() page-in(P3-3)으로 적재.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(`git rm` 한 두 파일은 이 커밋에 함께 staged 됨 — `git status` 로 확인 후 포함.)

---

## Task 2: `hydrateGlobal` 액션 제거 + 가드레일 강화 + resident 그래프 테스트

**Files:**
- Modify: `frontend/src/features/workingCopy/substationStore.ts`
- Delete: `frontend/src/features/workingCopy/substationStore.hydrate.test.ts`
- Modify: `frontend/src/architecture-ssot.guardrail.test.ts`
- Create: `frontend/src/features/workingCopy/substationStore.residentGraph.test.ts`

**Interfaces:**
- `substationStore.ts`: `hydrateGlobal` 은 인터페이스 `SubstationWorkingCopyState` 의 선언(`hydrateGlobal: (...) => void` 류)과 `create()` 안의 구현 두 군데. 유일 호출처(useHydrateGlobal)가 T1 에서 삭제됨 → dead. `reconcileRows`/`mergeSavedById`/`buildSaved`/`load`/`syncSubData` 등은 **유지**(hydrateGlobal 과 무관, load 가 사용).

- [ ] **Step 1: `hydrateGlobal` 액션 제거**

`substationStore.ts` 에서:
- `SubstationWorkingCopyState` 인터페이스의 `hydrateGlobal` 선언 줄 삭제.
- `create(...)` 본문의 `hydrateGlobal: (...) => { ... }` 구현 블록 삭제.
- `hydrateGlobal` 만 쓰던 헬퍼가 있으면(없을 것 — reconcileRows 는 load 공유) 그대로 둠. `buildSaved`/`reconcileRows`/`mergeSavedById` 절대 삭제 금지.

- [ ] **Step 2: hydrate 전용 테스트 삭제**

```bash
cd /Users/jsk/1210/digital
git rm frontend/src/features/workingCopy/substationStore.hydrate.test.ts
```
(3 케이스 모두 `hydrateGlobal` 전용 — 액션 제거로 무의미. reconcileRows 회귀는 delta.test.ts/effective.test.ts/substationStore.connected.test.ts 가 커버.)

- [ ] **Step 3: 가드레일 강화 — 전역 피드 0 reader**

`architecture-ssot.guardrail.test.ts` 의 첫 `it('전역 자산/케이블 리스트 피드 ... useHydrateGlobal 에서만 읽는다')`:
- `const ALLOW = new Set(['features/workingCopy/useHydrateGlobal.ts']);` → `const ALLOW = new Set<string>([]);`
- 테스트 설명을 `'전역 자산/케이블 리스트 피드(/assets,/cables)는 어디서도 읽지 않는다 (demand-paging, P3-4)'` 로.
- 나머지 로직 무변경(`re` 정규식 그대로 — `GET /assets`·`GET /cables` 직접 호출 0 강제).

- [ ] **Step 4: resident 그래프 이름 해소 테스트 작성**

`frontend/src/features/workingCopy/substationStore.residentGraph.test.ts` — P3-3 의 `substationStore.connected.test.ts` 패턴(api mock + load) 차용. 핵심: 연 변전소 A + 연결 대국 B 적재 후, **resident saved 로 만든 TraceGraph 의 nameById 가 B 자산 이름을 해소**(전역 피드 없이도 광 대국 이름 OK):
```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { buildTraceGraph } from '../trace/traceGraph';

const asset = (id: string, name: string, substationId: string) => ({
  id, name, substationId, parentAssetId: null, slotIndex: null,
  assetType: { role: 'device' }, updatedAt: '2020-01-01T00:00:00Z',
});

beforeEach(() => {
  useSubstationWorkingCopy.getState().reset();
  (api.get as Mock).mockReset();
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes('/s1/workingcopy')) return Promise.resolve({ data: { data: { assets: [asset('eqA', '자국단말', 's1')], cables: [{ id: 'opgw', sourceAssetId: 'eqA', targetAssetId: 'eqB', cableType: 'FIBER' }], connectedSubstationIds: ['s2'] } } });
    if (url.includes('/s2/workingcopy')) return Promise.resolve({ data: { data: { assets: [asset('eqB', '대국단말', 's2')], cables: [], connectedSubstationIds: [] } } });
    return Promise.resolve({ data: { data: { assets: [], cables: [], connectedSubstationIds: [] } } });
  });
});

describe('전역 피드 제거 후 resident 그래프 이름 해소 (P3-4)', () => {
  it('연결 대국 자산 이름이 resident 그래프에서 해소된다(피드 없이)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const saved = useSubstationWorkingCopy.getState().saved;
    const g = buildTraceGraph({ assets: saved.assets as never[], cables: saved.cables as never[], substationNames: new Map() });
    expect(g.nameById.get('eqA')).toBe('자국단말');
    expect(g.nameById.get('eqB')).toBe('대국단말'); // 대국(연결 page-in)도 resident → 이름 해소
  });
});
```
(`buildTraceGraph` 시그니처는 `{ assets, cables, substationNames }` — 기존 traceGraph.test.ts 와 동일. substationNames 는 org 트리 맵; 이 테스트는 자산 이름만 검증하므로 빈 맵.)

- [ ] **Step 5: 실행 — 신규/수정 테스트**

Run: `cd frontend && npx vitest run src/features/workingCopy/substationStore.residentGraph.test.ts src/architecture-ssot.guardrail.test.ts`
Expected: PASS(이름 해소 + 가드레일 0 offender). tsc 도: `npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationStore.ts frontend/src/architecture-ssot.guardrail.test.ts frontend/src/features/workingCopy/substationStore.residentGraph.test.ts
git commit -m "refactor(workingcopy): hydrateGlobal 액션 제거 + 전역피드 0-reader 가드레일 + resident 그래프 이름해소 테스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 회귀 + 불변식 게이트

**Files:** 없음(검증 전용).

- [ ] **Step 1: 프론트 tsc + 전수**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; vitest 전수 PASS. **이게 핵심 게이트** — 모든 소비처가 resident(open+연결대국) 데이터로 동작함을 전수 테스트가 보증(전역 피드 제거 후 회귀 0).

- [ ] **Step 2: 백엔드 무회귀(프론트 전용이지만 가드)**

Run: `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: tsc 0; PASS(백엔드 미변경 — p0Enums 플래키면 1회 재실행).

- [ ] **Step 3: 불변식 grep 게이트**

Run:
```bash
cd /Users/jsk/1210/digital/frontend/src
echo "[1] useHydrateGlobal 잔존(0):"; git grep -n "useHydrateGlobal" . || echo "  none ✓"
echo "[2] hydrateGlobal 잔존(0):"; git grep -n "hydrateGlobal" . || echo "  none ✓"
```
Expected: [1] none ✓ [2] none ✓. (가드레일 테스트가 `GET /assets`·`/cables` 직접 호출 0 도 이미 강제.)

- [ ] **Step 4: 스모크(권장 — 사용자 브라우저 확인 항목으로 기록)**

dev 서버(`docker compose -f docker-compose.dev.yml up -d` + `npm run dev`)에서 육안 확인 권장(단위테스트가 못 잡는 통합 거동):
- (a) 앱 시작 → 네트워크에 `GET /assets`·`GET /cables` **없음**(전역 피드 제거 확인).
- (b) 변전소 A 열기 → `/substations/A/workingcopy` + 연결 대국 `/substations/B/workingcopy` 호출.
- (c) 광 선번장 대국설비·OPGW 슬롯 라벨·피더 공급원 이름이 정상 표시(연결 대국 resident).
- (d) 다른 변전소로 네비게이션 → 잠깐 로딩 후 정상(네비게이션 윈도 수용 범위).
- (e) 편집→커밋 후 재조정 정상.

**주의(자동화 한계):** 위 통합 거동(특히 c·d 의 크로스변전소 이름·네비게이션 플리커)은 브라우저 스모크로만 완전 검증 가능. 단위/전수 테스트는 resident 데이터 경로의 회귀 0 까지 보증.

---

## Self-Review (작성자 점검)

**1. Spec coverage:** §7(useHydrateGlobal 제거 + 호출부 + 전역 lite hydrate 경로 정리) → T1(호출·훅)+T2(hydrateGlobal 액션). §9 게이트(useHydrateGlobal 0, 전역 graph.cables 크로스변전소 미의존) → T3 grep + 가드레일 + resident 그래프 테스트. 백엔드 전역 피드 엔드포인트 정리(§7 일부)는 저가치 housekeeping 으로 명시 연기(Global Constraints). page-in 트리거는 기존 useWorkingCopyLoader(유지) + P3-3 연결 page-in. ✓

**2. Placeholder scan:** 삭제 대상 파일·라인·액션 명시. 테스트 코드 실물 포함. 가드레일 변경 구체(ALLOW 비움). 스모크는 "사용자 브라우저 확인 + 자동화 한계" 로 정직히 기록(placeholder 아님 — 단위 검증 가능분은 T3 Step1 전수가 커버). ✓

**3. Type consistency:** `buildTraceGraph({assets,cables,substationNames})`(T2 테스트) — 기존 시그니처 일치. `load`/`reset`/`saved.assets` 기존 store API. 가드레일 `ALLOW = new Set<string>([])` 타입 명시. hydrateGlobal 제거로 인터페이스↔구현 동시 삭제(불일치 없음). ✓
