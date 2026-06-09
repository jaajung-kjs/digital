# 단일 저장 경로(Unified Save Path) 설계

- 작성일: 2026-06-10
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 분산된 저장 경로(에디터 "저장" 버튼 + 워크스페이스 커밋 바 + localStorage 드래프트 + 즉시저장 사진)를 **단일 저장 바 + 단일 커밋 함수**로 통합. 무엇을 수정하든(현황·평면도·랙모듈·케이블·사진·점검로그·층설정) 통합 워킹카피에 보류 → 저장 한 번으로 서버 저장.

---

## 1. 배경 / 문제
SSOT Phase 2 후 `commitSubstation`이 단일 트랜잭션 저장이지만 **UI·신호가 분산**:
- **두 저장 버튼**: 에디터 툴바 "저장"(층설정+오버레이+사진/로그 flush) vs 워크스페이스 커밋 바(오버레이만) — 둘 다 commitSubstation 호출하나 분리.
- **세 dirty 신호**: `useWorkingCopyDirty`(오버레이) / `editorStore.hasChanges`(에디터/이탈가드/autosave) / `localStorage draft`(드래프트 존재).
- **드래프트 버그**: 2초 autosave 인터벌이 커밋 후 `hasChanges=false`를 보기 전 stale 드래프트를 다시 써, 페이지 이동 후 "이어서하기/폐기" 재출현.
- **사진 이원화**: 에디터 PhotosTab=보류(pending, 저장 시 flush) vs 현황 AssetPhotoSection=즉시저장(2c).

근거 맵: 탐색 보고(저장/드래프트 아키텍처). 사용자 결정: 단일 저장 바 + 드래프트 제거 + 사진/로그 스테이징 일원화.

## 2. 목표 / 비목표

### 목표
1. **단일 저장 바** — `WorkingCopyCommitBar`가 유일 저장 UI. 현황·평면도·연결 전 뷰에 dirty>0 시 표시. 라벨 "저장 N건"·버튼 "저장". 에디터 툴바 "저장" 버튼·Ctrl+S 독자 경로 제거(Ctrl+S → 통합 저장 호출).
2. **단일 커밋 함수** `useCommitWorkingCopy` — 한 구현: `commitSubstation(overlays + 활성 층 설정 floor 섹션)` → 보류 사진·로그 flush(tempId→realId) → 재조정(load)·보류/staged 정리. 저장 바·Ctrl+S 둘 다 이 함수.
3. **단일 dirty 신호** — `useUnifiedDirty()` = `useWorkingCopyDirty`(오버레이) + 보류 사진 수 + 보류 로그 수 + 층설정 dirty(파생). 저장 바 표시·카운트·이탈 가드(beforeunload)·저장 버튼 enable 모두 이 하나. `editorStore.hasChanges` 제거.
4. **드래프트 제거** — `FloorPlanEditor`의 localStorage autosave 인터벌·드래프트 감지·"이어서하기/폐기" 다이얼로그·restore/discard 삭제. (크래시 복구는 후속 별도 — 통합 오버레이 persistence.)
5. **사진·로그 스테이징 일원화** — 에디터 PhotosTab + 현황 AssetPhotoSection/점검 섹션 **둘 다 보류(pending)**. 즉시저장(2c) 되돌림. 보류 미리보기 유지. 단일 저장이 commitSubstation 후 flush.

### 비목표 (후속)
- 통합 오버레이 localStorage persistence(진짜 크래시 복구) — 별도 후속.
- 충돌 다이얼로그 완전 일원화(저장 바의 ConflictDialog 사용; 에디터 floorConflict 경로는 통합 저장으로 단일화되어 자연 제거).
- registerStore/`/assets` 정리.

## 3. 설계

### A. `useCommitWorkingCopy` (단일 커밋 함수)
`features/workingCopy/useCommitWorkingCopy.ts` (신규 훅) — 현재 `useFloorPlanData.handleSave`/`saveMutation`의 로직 + 커밋 바 onCommit을 하나로:
```
async commit():
  s = useSubstationWorkingCopy.getState()
  floorSection = 활성 층 설정(editorStore: baseFloorVersion + canvasWidth/Height/grid/major/staged background) — 에디터 활성 시에만
  result = await commitSubstation(substationId, s.overlays, s.saved.assets, queryClient, floorSection)
  // 보류 사진/로그 flush (tempId→realId via result.idMaps.assets)
  for up in pendingUploads: POST /equipment/:realId/photos
  for log in pendingLogs: POST /equipment/:realId/maintenance-logs
  await s.load(substationId)              // 재조정(오버레이 비우고 saved 갱신)
  editorStore.clearPendingData()          // 보류/staged 정리
  invalidate(photos/logs/floorPlan)
catch 409 → ConflictDialog (저장 바)
```
- 저장 대상 substationId: 활성 변전소(워크스페이스 컨텍스트).
- 사진/로그는 commitSubstation **후** flush(신규 설비 realId 필요). 한 흐름.

### B. 저장 바 (단일 UI)
`WorkingCopyCommitBar`: 라벨 "저장 N건"(N=`useUnifiedDirty`), 버튼 "저장" → `useCommitWorkingCopy().commit()`. 되돌리기는 `revert()` + 보류 사진/로그 clear + staged 정리. `SubstationWorkspacePage`에서 status/plan/connections 모두 표시(dirty>0). 에디터 `Toolbar`의 "저장" 버튼 제거. `useEditorKeyboard` Ctrl+S → 통합 commit.

### C. 단일 dirty 신호
`features/workingCopy/hooks.ts`에 `useUnifiedDirty()` 추가:
```
useWorkingCopyDirty() + pendingUploads.length + pendingLogs.length + (floorSettingsDirty ? 1 : 0)
```
- `floorSettingsDirty` = editorStore staged 파생(stagedBackgroundDrawing!==undefined || stagedBackgroundOpacity!==undefined || grid 변경 등). `hasChanges` 대신 이 파생만.
- 이탈 가드(beforeunload): `useUnifiedDirty()>0` 읽음(editorStore.hasChanges 대신).
- editorStore.hasChanges 필드·setHasChanges·관련 분기 제거.

### D. 드래프트 제거
`FloorPlanEditor`: autosave `useEffect`(2초 인터벌)·드래프트 감지 `useEffect`·`showDraftDialog`·`handleRestoreDraft`·`handleDiscardDraft`·DraftDialog 렌더 삭제. `useFloorPlanData`의 `localStorage.removeItem(draft-plan-...)`도 불필요(제거). localStorage `draft-plan-*` 더는 안 씀.

### E. 사진·로그 스테이징 일원화
- 에디터 `PhotosTab`/`LogsTab`: 현행 보류(pendingUploads/pendingLogs) 유지.
- 현황 `AssetPhotoSection`(+ 점검 섹션): 즉시 `useUploadAssetPhoto`/`useCreate...Log` 직접 호출(2c) → **보류로 변경**: `addPendingUpload`/`addPendingLog` + 보류 미리보기. 단일 저장이 flush.
- 보류 큐(pendingUploads/pendingLogs)는 editorStore에 잔류(전역). 현황·에디터 공용. (네이밍은 후속에서 중립화 검토 — 이번엔 기능 우선.)

## 4. 영향 받는 파일
**신규**: `features/workingCopy/useCommitWorkingCopy.ts`, `hooks.ts`(useUnifiedDirty).
**수정**: `WorkingCopyCommitBar.tsx`(단일 저장), `SubstationWorkspacePage.tsx`(전 뷰 노출 — 이미 plan 포함), `editor/components/Toolbar.tsx`(저장 버튼 제거), `editor/hooks/useEditorKeyboard.ts`(Ctrl+S→통합), `editor/hooks/useFloorPlanData.ts`(handleSave/saveMutation→useCommitWorkingCopy로 이전, 드래프트 제거), `editor/components/FloorPlanEditor.tsx`(드래프트 로직·beforeunload 가드 제거/이전), `editor/stores/editorStore.ts`(hasChanges 제거, floorSettingsDirty 파생), `equipment/.../AssetPhotoSection`(+점검)(즉시→보류), `equipment/.../PhotosTab`/`LogsTab`(유지).

## 5. 테스트
- **단위**: `useUnifiedDirty`(오버레이+사진+로그+층설정 합산), `useCommitWorkingCopy`(commit→flush 순서, idMaps 해소; 모킹). floorSettingsDirty 파생.
- **수동(브라우저, 필수)**: ① 평면도 설비/배치/케이블/랙모듈 수정 + 현황 속성 수정 + 사진/로그 추가 → 저장 바에 합산 "저장 N건". ② **저장 한 번** → 전부 서버 반영(설비·사진·로그·층설정), 카운트 0. ③ 저장 후 다른 페이지 갔다 와도 **드래프트 다이얼로그 안 뜸**. ④ 미저장 상태 이탈 시 beforeunload 경고. ⑤ 409 충돌 → 저장 바 다이얼로그(중복 없음). ⑥ 현황 사진이 보류로 표시되다 저장 시 업로드. ⑦ 에디터 툴바에 "저장" 버튼 없음·Ctrl+S 동작. ⑧ 회귀: 2d 전체·현황·연결.

## 6. 성공 기준
1. 저장 UI·dirty 신호·커밋 함수가 각각 **하나**. 에디터 툴바 저장 버튼·드래프트 다이얼로그 없음.
2. 모든 수정(현황·평면도·랙모듈·케이블·사진·로그·층설정)이 보류 → **저장 바 한 번**으로 커밋.
3. 커밋 후 드래프트 노이즈 없음. 이탈 가드·카운트·409가 단일 신호/경로.
4. 회귀 없음(2d·현황·연결).

## 7. 이후
- 통합 오버레이 persistence(크래시 복구), pendingUploads/Logs 중립 위치 이전, registerStore/`/assets` 정리.
