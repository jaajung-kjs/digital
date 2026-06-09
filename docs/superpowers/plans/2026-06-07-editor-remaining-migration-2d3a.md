# SSOT 2d-3a — 에디터 남은 소비처 이관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 2d-2가 누락한 editorStore.local* 2차 소비처(네트워크 토폴로지·랙 프리셋·랙모듈·케이블 웨이포인트·광경로·소스프리셋·InfoTab·버전 복원)를 통합 `useSubstationWorkingCopy` 스토어로 이관해 깨진 2차 기능 복구.

**Architecture:** 2d-2 패턴 — 읽기는 effective(getState/훅), 쓰기는 stage 액션. 버전 복원은 신규 `stageReplaceFloorFromSnapshot`(diff·단일 undo).

**Tech Stack:** React+Zustand(+zundo)+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-07-editor-remaining-migration-2d3a-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재(useCanvasEvents.ts 가드 등). 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: stageReplaceFloorFromSnapshot 스토어 액션 (단위)

**Files:** Modify `frontend/src/features/workingCopy/substationStore.ts`, `substationStore.test.ts`

- [ ] **Step 1: 현황 파악**

READ: `substationStore.ts`(stageAssetCreate/Update/Delete·stageCableCreate/Update/Delete·assetDescriptor/cableDescriptor·mergeEffective·isTempId·기존 cascade의 단일-set 패턴), `features/editor/hooks/useFloorAuditLogs.ts`(버전 복원 핸들러 — 스냅샷 fetch 모양: 그 층의 equipment[]·cables[] 형태; 현재 setLocalEquipment/setCables 로 적용). 스냅샷 항목 ↔ Asset/Cable 매핑 확인.

- [ ] **Step 2: 실패 테스트**

`substationStore.test.ts` 추가(load mock: 층 f1에 설비 a1·a2 + 케이블 c1). `stageReplaceFloorFromSnapshot('f1', { assets:[a1(수정)·a3(신규)], cables:[] })` →
- effectiveAssets: a1 패치 반영, a3 추가, a2 삭제(스냅샷에 없음), c1 삭제(스냅샷 cables 빔).
- `temporal.undo()` 한 번 → 모두 복원(단일 스텝).

- [ ] **Step 3: 구현**

```ts
stageReplaceFloorFromSnapshot: (floorId, snapshot) => set((s) => {
  const effA = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor)
    .filter((a) => a.floorId === floorId);          // 그 층 현재(자식 포함)
  const effC = mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor); // 변전소 케이블(층 필터는 끝점 기반 — 보고)
  let assets = s.overlays.assets, cables = s.overlays.cables;
  const snapA = new Map(snapshot.assets.map((a) => [a.id, a]));
  // delete: 현재에만
  for (const a of effA) if (!snapA.has(a.id)) assets = stageDelete(assets, a.id, isTempId(a.id));
  // create/update
  const curA = new Map(effA.map((a) => [a.id, a]));
  for (const a of snapshot.assets) {
    if (!curA.has(a.id)) assets = stageCreate(assets, a.id, a);
    else assets = stageUpdate(assets, a.id, /* 변경 필드 patch (또는 전체) */ a);
  }
  // cables 동일 로직(그 층 끝점 케이블만 대상 — 끝점→층 해소)
  return { overlays: { ...s.overlays, assets, cables } };
}),
```
- 케이블의 "그 층" 판정: 끝점 설비가 floorId인 케이블만(2d-2 `useEffectiveFloorCables` 로직 재사용/추출). 스냅샷 cables 도 동일 범위.
- 단일 `set` → 단일 undo. 액션 인터페이스 시그니처 추가. 스냅샷 항목이 Asset/Cable 모양과 다르면 매핑(useFloorAuditLogs의 스냅샷 모양 확인).

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/substationStore.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/substationStore.test.ts
git commit -m "feat(workingcopy): stageReplaceFloorFromSnapshot — 버전 복원 diff 스테이징(단일 undo)"
```

---

## Task 2: 랙 소비처 → stage

**Files:** Modify `frontend/src/features/editor/components/rack/PresetActionsBar.tsx`, `frontend/src/features/editor/components/rack/RackModuleDialog.tsx`, `frontend/src/features/editor/components/rack/utils/sourcePreset.ts`

- [ ] **Step 1: repoint 쓰기**

READ each. 랙 프리셋 배치(PresetActionsBar) `setLocalEquipment`(랙) + `addRackModule`(모듈) → `useSubstationWorkingCopy.getState().stageEquipmentCreate({...rack, floorId}, useKindToAssetTypeId()('RACK'))` + 각 모듈 `stageRackModuleCreate(m)`. `RackModuleDialog` add/update → `stageRackModuleCreate/Update`. `sourcePreset` `setLocalEquipment` → `stageEquipment*`(생성/수정 맥락에 맞게). floorId/kindToAssetTypeId 확보(컴포넌트에 hook context — `useKindToAssetTypeId` 호출, undefined 가드).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/editor` → PASS(mock 갱신 시).
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/components/rack/PresetActionsBar.tsx frontend/src/features/editor/components/rack/RackModuleDialog.tsx frontend/src/features/editor/components/rack/utils/sourcePreset.ts
git commit -m "feat(editor): 랙 프리셋·모듈 다이얼로그·소스프리셋을 통합 스토어 stage로"
```

---

## Task 3: 케이블 웨이포인트 + 광경로 → stage

**Files:** Modify `frontend/src/features/connections/components/CableWaypointHandles.tsx`, `frontend/src/features/fiber/components/FiberPathManager.tsx`

- [ ] **Step 1: repoint 쓰기**

READ each. `CableWaypointHandles` 웨이포인트 드래그 `updateCable(id, {pathPoints})` → `useSubstationWorkingCopy.getState().stageCableUpdate(id, { pathPoints })`(드래그 다중이면 `stageCableUpdates`). `FiberPathManager` `addPendingFiberPath`/`removePendingFiberPath`/`deleteFiberPath` → `stageFiberPathCreate/Delete`(2b 존재; 시그니처 일치). 읽기(pendingFiberPaths 표시)도 effective fiber로.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/connections src/features/fiber` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/components/CableWaypointHandles.tsx frontend/src/features/fiber/components/FiberPathManager.tsx
git commit -m "feat(editor): 케이블 웨이포인트·광경로를 통합 스토어 stage로"
```

---

## Task 4: 토폴로지 읽기 + InfoTab + 버전 복원 배선 + 스모크

**Files:** Modify `frontend/src/features/network/store.ts`, `frontend/src/features/equipment/components/detail/InfoTab.tsx`(live시), `frontend/src/features/editor/hooks/useFloorAuditLogs.ts`

- [ ] **Step 1: 읽기/복원 repoint**

- `network/store.ts`: localEquipment/cables/rackModules/distCircuits 읽기 → `useSubstationWorkingCopy.getState().effectiveAssets()/effectiveCables()/effective*` (토폴로지 빌드 시점). 변경 반응 필요하면 구독.
- `InfoTab.tsx`: `setLocalEquipment` 호출이 **live**(스냅샷 전용 아님)면 `stageEquipmentUpdate(id, patch)`로. ②A 후 snapshot 전용이면 변경 없음 — 확인·보고.
- `useFloorAuditLogs.ts`: 버전 복원 핸들러의 `setLocalEquipment(snapshot)/setCables` → `useSubstationWorkingCopy.getState().stageReplaceFloorFromSnapshot(floorId, snapshot)`(T1). 스냅샷 모양을 액션 입력에 맞춰 매핑.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/network/store.ts frontend/src/features/equipment/components/detail/InfoTab.tsx frontend/src/features/editor/hooks/useFloorAuditLogs.ts
git commit -m "feat(editor): 네트워크 토폴로지 읽기·InfoTab·버전 복원을 통합 스토어로"
```

- [ ] **Step 3: 최종 브라우저 스모크 (필수)**

dev 서버(branch 반영, 5173). 평면도/연결에서: ① 네트워크 토폴로지 모달 — 설비·연결 표시. ② 랙 프리셋 배치·랙모듈 다이얼로그 → 캔버스·랙뷰 + 커밋 바. ③ 케이블 웨이포인트 드래그 → 경로. ④ 광경로 추가/삭제 → 커밋 시 저장. ⑤ 버전 복원 → 스냅샷이 스테이징, 커밋 반영. ⑥ 2d-2 핵심(배치·이동·삭제·저장)·현황·연결 회귀 없음. **이상 시 수정.**

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 브라우저 스모크 통과(§T4-3) — 2차 기능 전부 통합 스토어로.

## 완료 기준 (spec §6)
- [ ] editorStore.local* 모든 2차 소비처가 통합 스토어로(읽기 effective·쓰기 stage)
- [ ] 토폴로지·랙·웨이포인트·광경로·버전 복원 정상(브라우저)
- [ ] 2d-2 핵심·현황·연결 회귀 없음 → 2d-3b 정리 가능

## 이후
- 2d-3b 정리(editorStore 영속·zundo·commitWorkingCopy·bulkUpdatePlan 제거, 충돌 다이얼로그 통합).
