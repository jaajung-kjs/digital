# 단일 저장 경로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 분산된 저장(에디터 "저장" 버튼 + 커밋 바 + 드래프트 + 즉시저장 사진)을 단일 저장 바 + `useCommitWorkingCopy` + `useUnifiedDirty`로 통합. 모든 수정이 보류 → 저장 한 번으로 커밋.

**Architecture:** 통합 워킹카피(2d) 위에 단일 커밋 함수·단일 dirty 신호·단일 저장 UI. 사진/로그도 보류→단일커밋. 드래프트 제거.

**Tech Stack:** React+Zustand+@tanstack/react-query+vitest(+RTL). dev DB 떠 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-10-unified-save-path-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: useCommitWorkingCopy(단일 커밋) + useUnifiedDirty(단일 신호)

**Files:** Create `frontend/src/features/workingCopy/useCommitWorkingCopy.ts`; Modify `frontend/src/features/workingCopy/hooks.ts`(+useUnifiedDirty), `frontend/src/features/editor/stores/editorStore.ts`(+floorSettingsDirty 셀렉터)

- [ ] **Step 1: 현황 파악**

READ: `editor/hooks/useFloorPlanData.ts`(handleSave + saveMutation onSuccess — floorSection 빌드, commitSubstation 호출, pendingUploads/pendingLogs flush via idMaps.assets, load 재조정, clearPendingData, 쿼리 invalidate, localStorage 제거), `workingCopy/substationCommit.ts`(commitSubstation 시그니처 + FloorCommitSection), `workingCopy/WorkingCopyCommitBar.tsx`(onCommit), `workingCopy/hooks.ts`(useWorkingCopyDirty), `editor/stores/editorStore.ts`(pendingUploads/pendingLogs/stagedBackground*/baseFloorVersion/canvasWidth/gridSize, hasChanges).

- [ ] **Step 2: useCommitWorkingCopy 작성**

`useCommitWorkingCopy.ts`: `useFloorPlanData.handleSave`+`saveMutation`의 저장 로직을 그대로 옮긴 공용 훅.
```ts
export function useCommitWorkingCopy() {
  const queryClient = useQueryClient();
  return useCallback(async (): Promise<{ ok: true } | { ok: false; conflicts: Conflict[] }> => {
    const wc = useSubstationWorkingCopy.getState();
    const substationId = wc.substationId;
    if (!substationId) return { ok: true };
    const ed = useEditorStore.getState();
    // 활성 층 설정(에디터가 floor 를 들고 있을 때만). baseFloorVersion 없으면 floor 섹션 생략.
    const floor = ed.baseFloorVersion != null ? buildFloorSection(ed) : undefined;
    try {
      const result = await commitSubstation(substationId, wc.overlays, wc.saved.assets, queryClient, floor);
      await flushPendingMedia(ed, result.idMaps);     // 사진·로그 flush (tempId→realId)
      await wc.load(substationId);                     // 재조정
      ed.clearPendingData();                           // 보류/staged 정리
      invalidateMediaQueries(queryClient);
      return { ok: true };
    } catch (e) {
      if (is409(e)) return { ok: false, conflicts: extractConflicts(e) };
      throw e;
    }
  }, [queryClient]);
}
```
- `buildFloorSection`/`flushPendingMedia`/`invalidateMediaQueries`/`is409`/`extractConflicts` 는 useFloorPlanData 에서 추출(동일 로직). flushPendingMedia: pendingUploads→POST /equipment/:realId/photos, pendingLogs→POST /equipment/:realId/maintenance-logs (realId = idMaps.assets[tempId] ?? tempId).
- localStorage draft 제거 호출은 넣지 않음(드래프트는 T3에서 폐지).

- [ ] **Step 3: useUnifiedDirty + floorSettingsDirty**

- `editorStore.ts`: `floorSettingsDirty` 파생(getter 또는 셀렉터) = `stagedBackgroundDrawing !== undefined || stagedBackgroundOpacity !== undefined || gridDirty…`(현재 hasChanges 를 세팅하던 층설정 트리거를 그대로 반영). hasChanges 는 T3에서 제거 — 지금은 둔다.
- `hooks.ts`: 
```ts
export function useUnifiedDirty(): number {
  const wc = useWorkingCopyDirty();
  const uploads = useEditorStore((s) => s.pendingUploads.length);
  const logs = useEditorStore((s) => s.pendingLogs.length);
  const floorDirty = useEditorStore(selectFloorSettingsDirty);
  return wc + uploads + logs + (floorDirty ? 1 : 0);
}
```

- [ ] **Step 4: 테스트 + Commit**

`hooks.test.ts`에 useUnifiedDirty 합산 테스트(오버레이 + 보류 사진/로그 mock). `cd frontend && npx vitest run src/features/workingCopy` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/useCommitWorkingCopy.ts frontend/src/features/workingCopy/hooks.ts frontend/src/features/workingCopy/hooks.test.ts frontend/src/features/editor/stores/editorStore.ts
git commit -m "feat(workingcopy): useCommitWorkingCopy(단일 커밋)+useUnifiedDirty(단일 dirty 신호)"
```

---

## Task 2: 단일 저장 바 + 에디터 저장 버튼/Ctrl+S 통합

**Files:** Modify `frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx`, `frontend/src/features/editor/components/Toolbar.tsx`, `frontend/src/features/editor/hooks/useEditorKeyboard.ts`, `frontend/src/features/editor/hooks/useFloorPlanData.ts`

- [ ] **Step 1: 저장 바 = 단일 UI**

`WorkingCopyCommitBar.tsx`: 카운트 = `useUnifiedDirty()`(라벨 "저장 N건", 버튼 "저장"). 커밋 버튼 → `useCommitWorkingCopy()` 호출(기존 onCommit의 commitSubstation 직접호출 대체) → 409면 ConflictDialog. 되돌리기 → `revert()` + `useEditorStore.getState().clearPendingData()`(보류 사진/로그·staged 폐기). `SubstationWorkspacePage`는 이미 status/plan/connections 노출(변경 시 dirty>0 게이트 확인).

- [ ] **Step 2: 에디터 저장 버튼 제거 + Ctrl+S 통합**

`Toolbar.tsx`: "저장 (N건 변경)" 버튼 제거(+ 미사용 props/handleSave 정리). 변경 카운트 표시가 필요하면 저장 바로 일원화(툴바에선 제거).
`useEditorKeyboard.ts`: Ctrl+S → `useCommitWorkingCopy()`(또는 상위에서 주입한 commit 콜백) 호출. 기존 handleSave 의존 제거.
`useFloorPlanData.ts`: handleSave/saveMutation 의 저장 로직은 useCommitWorkingCopy로 이전됐으므로 제거(또는 useCommitWorkingCopy 재노출). useFloorPlanData 는 로드/floor fetch 책임만 유지. 반환 시그니처에서 handleSave/isSaving 제거 시 소비처(FloorPlanEditor) 정리.

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx frontend/src/features/editor/components/Toolbar.tsx frontend/src/features/editor/hooks/useEditorKeyboard.ts frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "feat(save): 단일 저장 바(useUnifiedDirty/useCommitWorkingCopy) + 에디터 저장버튼·Ctrl+S 통합"
```

---

## Task 3: 드래프트 제거 + hasChanges 폐지 + 이탈 가드 통합

**Files:** Modify `frontend/src/features/editor/components/FloorPlanEditor.tsx`, `frontend/src/features/editor/stores/editorStore.ts`, `frontend/src/features/editor/hooks/useFloorPlanData.ts`, `frontend/src/features/editor/components/Toolbar.tsx`(잔여)

- [ ] **Step 1: 드래프트 제거**

`FloorPlanEditor.tsx`: autosave `useEffect`(2초 인터벌·localStorage 쓰기), 드래프트 감지 `useEffect`, `showDraftDialog` state, `handleRestoreDraft`, `handleDiscardDraft`, DraftDialog 렌더 — 전부 삭제. 관련 import/상태 정리. `useFloorPlanData`의 `localStorage.removeItem(draft-plan-*)` 도 제거.

- [ ] **Step 2: hasChanges 폐지 + 이탈 가드**

- `editorStore.ts`: `hasChanges` 필드·`setHasChanges`·이를 세팅하던 분기 제거. 층설정 dirty 는 `floorSettingsDirty` 파생(T1)으로 대체. (pendingUploads/pendingLogs/stagedBackground add 시 hasChanges 세팅하던 부분 제거 — 이제 useUnifiedDirty 가 직접 셈.)
- `FloorPlanEditor.tsx` beforeunload 가드: `useEditorStore.getState().hasChanges` → `useUnifiedDirty()>0`(또는 getState 기반 동등 계산). 미저장 시 경고.
- `Toolbar.tsx`: hasChanges 잔여 참조 제거(T2에서 버튼 제거됐으면 추가 정리).

- [ ] **Step 3: 빌드 + grep + Commit**

`cd frontend && npx tsc --noEmit` → 0(hasChanges 참조 0). `npx vite build` → ✓. `npx vitest run src/features` → PASS.
grep(0 확인): `grep -rn "hasChanges\|draft-plan\|showDraftDialog\|handleRestoreDraft" src/features/editor` → 잔여 없음.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/components/FloorPlanEditor.tsx frontend/src/features/editor/stores/editorStore.ts frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/features/editor/components/Toolbar.tsx
git commit -m "refactor(editor): 드래프트(localStorage) 제거 + hasChanges 폐지(이탈 가드→useUnifiedDirty)"
```

---

## Task 4: 사진·로그 스테이징 일원화 + 최종 검증 + 스모크

**Files:** Modify `frontend/src/features/.../AssetPhotoSection*`(현황 사진), 현황 점검로그 섹션(실경로 확인)

- [ ] **Step 1: 현황 사진/로그 즉시→보류**

READ 현황 사진 섹션(2c에서 즉시 `useUploadAssetPhoto` 직접 호출) + 점검 섹션. 변경:
- 사진 추가 → `useEditorStore.getState().addPendingUpload(...)`(에디터 PhotosTab과 동일 보류 큐) + 보류 미리보기(savedPhotos + pendingUploads 머지 표시, PhotosTab 패턴 재사용).
- 점검 로그 추가 → `addPendingLog(...)` + 보류 표시.
- 즉시 mutation 직접 호출 제거(저장 시 flushPendingMedia 가 업로드). 단, 기존 설비(realId 있음)도 보류로 — flush 가 realId 그대로 사용.
- 보류 삭제(removePendingUpload/removePendingLog)도 노출.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features` → PASS(mock 갱신).
```bash
cd /Users/jsk/1210/digital
git add <현황 사진/로그 섹션 파일들>
git commit -m "feat(status): 현황 사진·점검로그를 보류(단일 저장으로) — 즉시저장 일원화"
```

- [ ] **Step 3: 최종 브라우저 스모크 (필수)**

dev 서버(5173). ① 평면도 설비/배치/케이블/랙모듈 + 현황 속성 + 사진/로그 추가 → 저장 바 "저장 N건" 합산. ② **저장 한 번** → 전부 서버 반영(설비·사진·로그·층설정), 카운트 0. ③ 저장 후 다른 페이지 갔다 와도 **드래프트 다이얼로그 안 뜸**. ④ 미저장 이탈 시 beforeunload 경고. ⑤ 409 → 저장 바 다이얼로그(중복 없음). ⑥ 현황 사진 보류 표시→저장 시 업로드. ⑦ 에디터 툴바 "저장" 버튼 없음·Ctrl+S 동작. ⑧ 회귀: 2d 전체·현황·연결.

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] grep: hasChanges·draft-plan 잔여 0.
- [ ] 브라우저 스모크 통과 — 저장 UI·dirty·커밋 함수 각각 하나, 드래프트 노이즈 없음.

## 완료 기준 (spec §6)
- [ ] 저장 바·dirty 신호·커밋 함수 각각 하나, 에디터 저장 버튼·드래프트 없음
- [ ] 모든 수정(현황·평면도·랙모듈·케이블·사진·로그·층설정) 보류 → 저장 한 번
- [ ] 회귀 없음(2d·현황·연결)

## 이후
- 통합 오버레이 persistence(크래시 복구), pendingUploads/Logs 중립 위치, registerStore/`/assets` 정리.
