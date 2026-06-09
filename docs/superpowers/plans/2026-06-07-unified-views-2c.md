# SSOT 2c — 현황·연결을 통합 워킹카피에 연결 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 현황·연결 뷰를 2b `useSubstationWorkingCopy` 통합 스토어에 연결 — 라이브 effective 읽기 + 스테이징, 워크스페이스 단일 커밋 바로 `commitSubstation`(2a) 한 번에 커밋(git-like).

**Architecture:** React 바인딩 훅(effective/dirty) + 워크스페이스 로더 → 연결은 `useEffectiveCables` 읽기·`stageCable*` → 현황은 `useNodeAssets`+스토어 오버레이 머지(라이브)·인스펙터 편집 stage → 워크스페이스 `WorkingCopyCommitBar` 가 commitSubstation+재로드+ConflictDialog.

**Tech Stack:** React+Zustand(+zundo)+@tanstack/react-query+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트는 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-07-unified-views-2c-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**프론트 신규**: `features/workingCopy/hooks.ts`(+test), `features/workingCopy/WorkingCopyCommitBar.tsx`, `features/assets/useSubstationStatusRows.ts`(+test).
**프론트 수정**: `pages/SubstationWorkspacePage.tsx`(로더+커밋바), `features/connections/components/SubstationConnectionsView.tsx`(+Table), `features/assets/components/SubstationStatusView.tsx`(스토어 연결), `features/assets/components/NodeStatusView.tsx`(`rows?` prop).

---

## Task 1: React 바인딩 훅 + 로더 (RTL)

**Files:** Create `frontend/src/features/workingCopy/hooks.ts`, `hooks.test.ts`

- [ ] **Step 1: 스토어 API 확인**

READ `features/workingCopy/substationStore.ts`(2b): `useSubstationWorkingCopy` 상태 `{ substationId, saved:{assets,cables,distributionCircuits,fiberPaths}, overlays:{...} }`, `load(id)`, `effectiveCables()` 등 메서드, descriptors. `features/workingCopy/{effective,overlay}.ts`(`mergeEffective`, `overlayDirtyCount`).

- [ ] **Step 2: 실패 테스트**

Create `hooks.test.ts`(vitest+RTL renderHook; api mock 으로 load):
```ts
// load 후: useEffectiveCables() = saved.cables; stageCableUpdate → 반영; useWorkingCopyDirty()=1
// (renderHook + act 로 store load/stage 호출)
```

- [ ] **Step 3: 구현**

`hooks.ts`(셀렉터는 saved/overlay 슬라이스 구독 후 useMemo — 매 렌더 새 배열로 인한 루프 방지):
```ts
import { useMemo } from 'react';
import { useSubstationWorkingCopy } from './substationStore';
import { mergeEffective } from './effective';
import { overlayDirtyCount } from './overlay';
// descriptors 는 substationStore 에서 export (없으면 export 추가)

export function useEffectiveCables() {
  const saved = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.cables);
  return useMemo(() => mergeEffective(saved, overlay, cableDescriptor), [saved, overlay]);
}
export function useEffectiveAssetsOverlay() {
  return useSubstationWorkingCopy((s) => s.overlays.assets);
}
export function useWorkingCopyDirty() {
  const o = useSubstationWorkingCopy((s) => s.overlays);
  return useMemo(() => overlayDirtyCount(o.assets) + overlayDirtyCount(o.cables) + overlayDirtyCount(o.distributionCircuits) + overlayDirtyCount(o.fiberPaths), [o]);
}
export function useWorkingCopyLoaded(substationId: string | null) {
  return useSubstationWorkingCopy((s) => s.substationId === substationId);
}
export function useWorkingCopyLoader(substationId: string | null) {
  const load = useSubstationWorkingCopy((s) => s.load);
  useEffect(() => { if (substationId) void load(substationId); }, [substationId, load]);
}
```
(`cableDescriptor` 등 descriptor 를 substationStore 에서 export — 없으면 추가. `useEffect` import.)

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/hooks.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/hooks.ts frontend/src/features/workingCopy/hooks.test.ts frontend/src/features/workingCopy/substationStore.ts
git commit -m "feat(workingcopy): React 바인딩 훅(effective/dirty/loader)"
```
(substationStore 는 descriptor export 추가 시에만 add.)

---

## Task 2: 워크스페이스 커밋 바 + 로더 배선

**Files:** Create `frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx`; Modify `frontend/src/pages/SubstationWorkspacePage.tsx`

- [ ] **Step 1: 커밋 바 컴포넌트**

READ `features/assets/components/SubstationStatusView.tsx`(기존 커밋 바 마크업·ConflictDialog 사용법), `features/workingCopy/substationCommit.ts`(`commitSubstation`), `features/workingCopy/ConflictDialog`(있으면). Create `WorkingCopyCommitBar.tsx`:
```tsx
export function WorkingCopyCommitBar({ substationId }: { substationId: string }) {
  const dirty = useWorkingCopyDirty();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<...|null>(null);
  if (dirty === 0) return null;
  const onCommit = async () => {
    const s = useSubstationWorkingCopy.getState();
    try {
      await commitSubstation(substationId, s.overlays, s.saved.assets, queryClient);
      await useSubstationWorkingCopy.getState().load(substationId); // reconcile: saved 갱신·overlays 비움·히스토리 클리어
    } catch (e) { if (is409(e)) setConflict(extract(e)); else window.alert('커밋 실패'); }
  };
  return (<div className="...">미커밋 {dirty}건 <button onClick={onCommit}>커밋</button><button onClick={()=>useSubstationWorkingCopy.getState().revert()}>되돌리기</button>{conflict && <ConflictDialog .../>}</div>);
}
```
(기존 SubstationStatusView 커밋 바 스타일·ConflictDialog·409 추출 로직 재사용.)

- [ ] **Step 2: 워크스페이스 배선**

`SubstationWorkspacePage.tsx`: `useWorkingCopyLoader(substationId)` 호출(스토어 load). status·connections 뷰 위에 `<WorkingCopyCommitBar substationId={substationId} />`(평면도 뷰는 2d). (현 status 분기의 기존 커밋 바는 T4에서 제거.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/workingCopy src/features/workspace` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx frontend/src/pages/SubstationWorkspacePage.tsx
git commit -m "feat(workingcopy): 워크스페이스 단일 커밋 바 + 스토어 로더 배선"
```

---

## Task 3: 연결 → 통합 스토어 (스테이징)

**Files:** Modify `frontend/src/features/connections/components/SubstationConnectionsView.tsx` (+ `SubstationConnectionsTable` if separate)

- [ ] **Step 1: 읽기·편집 repoint**

READ the connections view + table (현재 `useSubstationConnections`(fetch) + `useCableMutations`(즉시 update/delete)). 변경:
- 읽기: `const cables = useEffectiveCables()`(스토어). (스토어 load 가 cables 채움.)
- 편집(인라인 라벨/종류): `stageCableUpdate(id, patch)` = `useSubstationWorkingCopy.getState().stageCableUpdate(...)`. 삭제: `stageCableDelete(id)`. (`useCableMutations` 즉시 호출 제거.)
- 케이블 DTO 모양: 스토어 cables 는 2b 벌크로드의 CableDetail. 테이블이 기대하는 필드와 일치하는지 확인(이름/종류/엔드포인트 표시).
- 커밋은 워크스페이스 커밋 바(별도). 이 뷰는 스테이징만.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/connections src/features/workingCopy` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/components/SubstationConnectionsView.tsx
git commit -m "feat(connections): 연결 뷰를 통합 스토어로 — effective 읽기 + 케이블 스테이징(git-like)"
```
(Table 파일도 수정 시 함께 add.)

---

## Task 4: 현황 → 통합 스토어 (머지 라이브 + 인스펙터)

**Files:** Create `frontend/src/features/assets/useSubstationStatusRows.ts`, `useSubstationStatusRows.test.ts`; Modify `frontend/src/features/assets/components/NodeStatusView.tsx`, `SubstationStatusView.tsx`

- [ ] **Step 1: 머지 훅 (실패 테스트 → 구현)**

Create `useSubstationStatusRows.test.ts`: mock `useNodeAssets`(list with a1,a2) + 스토어 오버레이(update a1 name, delete a2, create temp t1) → 결과 행: a1 patched, a2 없음, t1 추가, 랙모듈 자식 제외.
Create `useSubstationStatusRows.ts`:
```ts
export function useSubstationStatusRows(substationId: string): AssetListItem[] {
  const { data: list = [] } = useNodeAssets('substation', substationId);
  const overlay = useEffectiveAssetsOverlay();
  return useMemo(() => {
    const deleted = new Set(overlay.deletes);
    const rows = list
      .filter((r) => !deleted.has(r.id))
      .map((r) => (overlay.updates[r.id] ? { ...r, ...assetPatchToListItem(overlay.updates[r.id]) } : r));
    const creates = Object.values(overlay.creates)
      .filter((a) => !(a.parentAssetId && a.slotIndex != null))  // 랙모듈 자식 제외
      .map(assetCreateToListItem);
    return [...rows, ...creates];
  }, [list, overlay]);
}
// assetPatchToListItem: 공유 필드(name/manager/installDate/status) 매핑
// assetCreateToListItem: 신규 자산 → 부분 AssetListItem(assetTypeName/이름/상태; floorName/점검일 미정 — 커밋 후 refetch)
```

- [ ] **Step 2: NodeStatusView rows prop**

`NodeStatusView.tsx`: `rows?: AssetListItem[]` prop 추가. 제공되면 그 행 사용, 없으면 기존 `useNodeAssets` 경로(홈). 나머지(검색/필터/그룹/행클릭) 동일.

- [ ] **Step 3: SubstationStatusView → 스토어**

READ `SubstationStatusView.tsx`(현재 registerStore+commitRegister+커밋바+인스펙터). 변경:
- 리스트: `<NodeStatusView nodeType="substation" nodeId={substationId} rows={useSubstationStatusRows(substationId)} />`.
- 인스펙터: 선택 자산 = `useSubstationWorkingCopy(s => effectiveAssets().find(id))`(스테이징 반영). `onPatch(id,patch)` → `useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)`. 사진·점검 섹션 그대로(즉시).
- **기존 커밋 바·registerStore·commitRegister 제거**(워크스페이스 커밋 바가 대체). `useSubstationAssets`→registerStore.load 흐름 제거(스토어 로더가 대체).
- `?assetId` 딥링크 선택 유지(setSelectedAssetId).

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets src/features/workingCopy` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/useSubstationStatusRows.ts frontend/src/features/assets/useSubstationStatusRows.test.ts frontend/src/features/assets/components/NodeStatusView.tsx frontend/src/features/assets/components/SubstationStatusView.tsx
git commit -m "feat(assets): 현황을 통합 스토어로 — 리스트 라이브 머지 + 인스펙터 stage(registerStore 분리)"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev, 브라우저 — 이 단계는 시각 변경이라 스모크 권장): ① 변전소 현황 인스펙터로 이름 편집 → 리스트 라이브 반영 + 커밋 바 "N건". ② 연결 케이블 라벨/삭제 스테이징 → 커밋 바 합산. ③ 커밋 → 반영·카운트 0. ④ 되돌리기·409·변전소 전환 리셋. ⑤ 평면도·홈 현황 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 현황·연결이 통합 스토어 읽기+스테이징, 워크스페이스 단일 커밋 바로 커밋
- [ ] 현황 리스트 라이브(설치장소·점검일 유지), 연결 git-like
- [ ] 커밋/되돌리기/409/전환 정상, registerStore·즉시 mutation 분리
- [ ] 평면도·홈 현황 회귀 없음

## 이후
- 2d 에디터 이관(평면도까지 같은 워킹카피·커밋바, editorStore/registerStore·구 엔드포인트 퇴역).
