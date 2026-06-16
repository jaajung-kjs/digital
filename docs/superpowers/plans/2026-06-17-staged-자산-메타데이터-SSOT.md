# Staged 자산 메타데이터 SSOT 완전화 (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `buildTraceGraph`가 staged-create 자산에도 `subById`·`subNameById`(변전소 id·이름)를 채우게 해, 저장 전 staged 자산의 자국/대국 변전소명·파생 GUI가 즉시 정상 표기되도록 한다.

**Architecture:** staged 자산은 전부 현재 변전소 소속이고 `Asset`은 `substationId` 보유. `buildTraceGraph`가 slim 자산에서 `변전소id→이름` 맵을 만들고, staged 자산의 `substationId`로 조회해 `subNameById`를 채운다. slim에 없는 변전소는 `useTraceGraph`가 조직 트리에서 해소한 `currentSubName`으로 fallback.

**Tech Stack:** React + Zustand + Vitest + TS. 빌드: `cd frontend && npm run build`. 테스트: `cd frontend && npx vitest run`.

**근거 스펙:** `docs/superpowers/specs/2026-06-17-staged-자산-메타데이터-SSOT-design.md`

---

## Task 1: buildTraceGraph + useTraceGraph + loadProjection 메타데이터 완전화

**Files:**
- Modify: `frontend/src/features/trace/traceGraph.ts` (`buildTraceGraph`, `useTraceGraph`)
- Modify: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` (`loadProjection` 호출처)
- Test: `frontend/src/features/trace/traceGraph.test.ts` (없으면 생성)

- [ ] **Step 1: 실패 테스트 작성** — `traceGraph.test.ts` (있으면 append, 없으면 생성):

```ts
import { describe, it, expect } from 'vitest';
import { buildTraceGraph } from './traceGraph';

const slim = (over: Partial<{ id: string; name: string; substationId: string; substationName: string | null; parentAssetId: string | null; connectionKind: 'distributor'|'conduit'|null; code: string | null }>) => ({
  id: 'x', name: 'x', substationId: 'sub-A', substationName: 'A변전소', parentAssetId: null, connectionKind: null, code: null, ...over,
});

describe('buildTraceGraph staged 메타데이터', () => {
  it('staged-create 자산: substationId 로 subById/subNameById 채움(slim 변전소명 사용)', () => {
    const g = buildTraceGraph({
      slimAssets: [slim({ id: 'committed1', substationId: 'sub-A', substationName: 'A변전소' })],
      globalCables: [],
      stagedAssets: [{ id: 'temp1', substationId: 'sub-A', name: '새슬롯', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } }],
      stagedCables: [],
      deletes: [],
    });
    expect(g.subById.get('temp1')).toBe('sub-A');
    expect(g.subNameById.get('temp1')).toBe('A변전소');
    expect(g.nameById.get('temp1')).toBe('새슬롯');
  });

  it('slim 에 그 변전소가 없으면 currentSubName fallback 으로 subNameById 채움', () => {
    const g = buildTraceGraph({
      slimAssets: [],
      globalCables: [],
      stagedAssets: [{ id: 'temp1', substationId: 'sub-NEW', name: 'x', assetType: { connectionKind: 'conduit' } }],
      stagedCables: [],
      deletes: [],
      currentSubName: '새변전소',
    });
    expect(g.subById.get('temp1')).toBe('sub-NEW');
    expect(g.subNameById.get('temp1')).toBe('새변전소');
  });

  it('커밋 자산(slim) 회귀: 기존대로 slim 의 substationName 사용', () => {
    const g = buildTraceGraph({
      slimAssets: [slim({ id: 'c1', substationId: 'sub-A', substationName: 'A변전소' })],
      globalCables: [], stagedAssets: [], stagedCables: [], deletes: [],
    });
    expect(g.subNameById.get('c1')).toBe('A변전소');
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/trace/traceGraph.test.ts`
  Expected: FAIL — staged 자산의 `subById`/`subNameById`가 비어 있어 첫 두 테스트 실패.

- [ ] **Step 3: `buildTraceGraph` 구현** — `frontend/src/features/trace/traceGraph.ts`:
  - 입력 타입(라인 77-83)을 수정: staged 자산에 `substationId?: string | null` 추가, 입력에 `currentSubName?: string | null` 추가:
    ```ts
    export function buildTraceGraph(input: {
      slimAssets: SlimAssetDTO[];
      globalCables: TraceCableInput[];
      stagedAssets: { id: string; substationId?: string | null; parentAssetId?: string | null; assetType?: { connectionKind?: string | null; code?: string | null } | null; name?: string }[];
      stagedCables: TraceCableInput[];
      deletes: string[];
      currentSubName?: string | null;
    }): TraceGraph {
    ```
  - assets 섹션(라인 96 근처) 변전소 id→이름 맵 구성 추가:
    ```ts
    const subNameByStationId = new Map<string, string>();
    for (const a of input.slimAssets) {
      if (a.substationId && a.substationName) subNameByStationId.set(a.substationId, a.substationName);
    }
    ```
  - staged-create 루프(라인 122-129) 끝에 subById/subNameById 채움 추가:
    ```ts
    for (const a of input.stagedAssets) {
      if (assetById.has(a.id) || deleted.has(a.id)) continue;
      assetById.set(a.id, { id: a.id, connectionKind: (a.assetType?.connectionKind ?? null) as TraceAsset['connectionKind'] });
      if (a.name) nameById.set(a.id, a.name);
      const sa = a as { parentAssetId?: string | null; assetType?: { code?: string | null } | null; substationId?: string | null };
      if (!parentById.has(a.id)) parentById.set(a.id, sa.parentAssetId ?? null);
      if (!codeById.has(a.id)) codeById.set(a.id, sa.assetType?.code ?? null);
      // staged 자산의 변전소 메타 — 저장(slim 리페치) 전에도 자국/대국명이 뜨도록 subById/subNameById 채움.
      const subId = sa.substationId ?? null;
      if (subId) {
        if (!subById.has(a.id)) subById.set(a.id, subId);
        if (!subNameById.has(a.id)) {
          const sname = subNameByStationId.get(subId) ?? input.currentSubName ?? null;
          if (sname) subNameById.set(a.id, sname);
        }
      }
    }
    ```
  - 라인 119-121의 낡은 주석("staged-create 자산은 substationName 을 안 들고 온다 ... P6에서")은 새 동작을 설명하도록 갱신.

- [ ] **Step 4: 통과 확인** — `cd frontend && npx vitest run src/features/trace/traceGraph.test.ts`
  Expected: PASS (3개 모두).

- [ ] **Step 5: `useTraceGraph`에서 currentSubName 전달** — 같은 파일 훅(라인 163~):
  - 조직 트리에서 현재 변전소 이름 해소. 조직 스토어에 노드 탐색 함수가 있으면 사용, 없으면 파일 상단에 순수 헬퍼 추가:
    ```ts
    function findNodeName(roots: { id: string; name: string; children?: unknown[] }[], id: string): string | null {
      for (const n of roots) {
        if (n.id === id) return n.name;
        const c = (n.children as typeof roots | undefined);
        if (c) { const r = findNodeName(c, id); if (r) return r; }
      }
      return null;
    }
    ```
    (실제 노드 타입은 `useOrganizationStore`의 트리 노드 타입에 맞춰 import/조정.)
  - 훅 본문:
    ```ts
    const subId = useSubstationWorkingCopy((s) => s.substationId);
    const currentSubName = useOrganizationStore((s) => (subId ? findNodeName(s.roots, subId) : null));
    ```
  - `buildTraceGraph({ ... })` 호출에 `currentSubName` 추가. `stagedAssets: wc.effectiveAssets()`는 full `Asset`(substationId 보유)이라 타입 OK — 만약 `as never[]` 캐스트가 있으면 제거하거나 적절히 좁힌다.

- [ ] **Step 6: `pathHighlightStore.loadProjection`도 currentSubName 전달** — `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`:
  - `loadProjection`의 `buildTraceGraph({...})` 호출에 `currentSubName` 추가(비-React이므로 getState 사용):
    ```ts
    const subId = useSubstationWorkingCopy.getState().substationId;
    const currentSubName = subId ? findNodeName(useOrganizationStore.getState().roots, subId) : null;
    // buildTraceGraph({ ..., currentSubName })
    ```
    `findNodeName`을 traceGraph.ts에서 export 해 재사용(또는 공용 위치로). import 추가.

- [ ] **Step 7: 타입체크 + 빌드 + 전체 테스트** — `cd frontend && npx tsc --noEmit && npm run build && npx vitest run`
  Expected: 0 에러, 빌드 통과, 전체 그린.

- [ ] **Step 8: Commit**
```
git add frontend/src/features/trace/traceGraph.ts frontend/src/features/trace/traceGraph.test.ts frontend/src/features/pathTrace/stores/pathHighlightStore.ts
git commit -m "fix(SSOT): staged 자산의 subById/subNameById 채움 — 저장 전 자국/대국명·파생 GUI 정상화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 검증 (빌드/테스트/브라우저) + 버그1 확인

**Files:** (없음 — 검증; 버그1에 별도 게이팅 발견 시 후속 수정)

- [ ] **Step 1:** `cd frontend && npm run build` 통과, `npx vitest run` 전체 그린.
- [ ] **Step 2: 브라우저 수동 검증** (dev: `docker compose -f docker-compose.dev.yml up -d` + `npm run dev`):
  1. 새 경로슬롯/OPGW를 staged(저장 전) 한 직후 → 슬롯 이름이 "자국 - 대국 #포트번호"로 즉시 표기되는지.
  2. 피더(분전반) 정보탭 파생 GUI가 저장 전에도 완전한지(회로/대국명).
  3. 저장 후에도 동일(회귀 없음).
- [ ] **Step 3: 버그1 분기** — 만약 (2)에서 피더 정보탭 GUI가 *여전히* 안 나오면, 메타데이터와 무관한 게이팅 문제다. `AssetInspector`/`AssetDetailBody`/`resolveAssetDetailKind`에서 staged DIST(분전반/피더) 자산이 분배 섹션을 노출하는 조건을 정밀 추적해 그 게이팅만 수정(systematic-debugging). 메타데이터 수정으로 해결됐으면 이 스텝은 생략.
- [ ] **Step 4:** 후속 수정이 있었으면 별도 커밋.

---

## Self-Review
- **스펙 커버리지:** §3.1=Task1 Step3, §3.2=Step5, §3.3=Step6, §6 테스트=Step1-4, 버그1 검증=Task2. 전부 매핑.
- **타입 일관성:** `subById`/`subNameById`/`subNameByStationId`/`currentSubName`/`findNodeName` 명칭 Task 전반 일치.
- **플레이스홀더:** `findNodeName`은 "org 스토어에 기존 탐색 함수 있으면 사용, 없으면 제공된 순수 헬퍼" — 구현 시 org 노드 타입에 맞춰 확정(명시됨).
- **주의:** `useTraceGraph`의 `stagedAssets` 캐스트(`as never[]`) 존재 시 타입 좁히기 필요.
