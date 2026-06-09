# SSOT 2c — 현황·연결을 통합 워킹카피에 연결 설계

- 작성일: 2026-06-07
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 변전소 **현황(SubstationStatusView)**·**연결(SubstationConnectionsView)** 뷰를 2b `useSubstationWorkingCopy` 통합 스토어에 연결한다. 두 뷰가 하나의 워킹카피·하나의 커밋을 공유(git-like, 라이브 스테이징). 평면도(에디터) 연결은 2d.

---

## 1. 배경
SSOT Phase 2: 2a(백엔드 통합 커밋) + 2b(프론트 통합 스토어) 완료. 2c는 스토어를 *처음으로 뷰에 연결* — 현황·연결이 통합 스토어의 effective를 읽고 stage하며, 워크스페이스 레벨 단일 커밋 바로 `commitSubstation`(2a) 호출. 결정(브레인스토밍): **현황 리스트 라이브 effective**, **연결 git-like 스테이징**.

현재: 현황=`registerStore`(자체 커밋 바 + 인스펙터 편집) + 리스트=`useNodeAssets`(읽기). 연결=`useCableMutations`(즉시). → 2c가 통합 스토어로 일원화.

## 2. 목표 / 비목표

### 목표
1. **React 바인딩 훅** — `features/workingCopy/hooks.ts`: `useWorkingCopyDirty()`, `useEffectiveCables()`, `useEffectiveAssetsOverlay()`(현황 머지용), `useWorkingCopyLoaded()` 등(스토어 구독→리렌더).
2. **스토어 로더** — 변전소 워크스페이스 진입 시 `load(substationId)`, 이탈/전환 시 리셋(이전 변전소 잔류 방지).
3. **연결 → 스토어**: `SubstationConnectionsView`가 `effectiveCables()` 읽기 + 케이블 메타 편집·삭제를 `stageCableUpdate/Delete`(즉시 mutation 제거 → 스테이징).
4. **현황 → 스토어**: `SubstationStatusView`의 `registerStore`를 통합 스토어로 교체. 변전소 현황 리스트는 **백엔드 리스트(useNodeAssets, 표시 필드) + 스토어 자산 오버레이 머지**로 라이브 편집 반영. 인스펙터 편집 → `stageAssetUpdate`. (홈 본부/사업소 현황은 그대로 읽기전용 useNodeAssets.)
5. **워크스페이스 단일 커밋 바** — `WorkingCopyCommitBar`(워크스페이스 레벨): 스토어 dirty면 "N건 변경" + 커밋/되돌리기. `commitSubstation`(2a) → 성공 시 **재로드(reconcile)** + 히스토리 클리어, 409 → `ConflictDialog`. 현황·연결 공유(2d에서 평면도도).
6. registerStore를 현황에서 분리(미사용화).

### 비목표 (후속)
- 평면도(에디터) 연결 — 2d.
- 사진·점검은 즉시(델타 아님) — 유지.
- registerStore 파일 삭제는 2d 정리(2c는 미사용화만).

## 3. 설계

### A. React 바인딩 훅 + 로더
`features/workingCopy/hooks.ts`:
- `useWorkingCopyDirty()` = `useSubstationWorkingCopy(s => /* dirtyCount 재계산 */)`. (스토어는 dirtyCount를 메서드로 가지므로, overlays 구독 후 계산.)
- `useEffectiveCables()` = overlays/saved.cables 구독 → `effectiveCables()`. `useEffectiveAssetsOverlay()` = assets overlay 구독(현황 머지용).
- 로더 훅 `useWorkingCopyLoader(substationId)`(SubstationWorkspacePage에서 호출): `useEffect`로 `load(substationId)`; cleanup/전환 시 리셋(혹은 다음 load가 덮음 + 히스토리 클리어 — 2b load가 이미 클리어).

### B. 연결 → 스토어
`SubstationConnectionsView`/`SubstationConnectionsTable`:
- 읽기: `useSubstationConnections`(즉시 fetch) 대신 `useEffectiveCables()`(스토어). (초기 데이터는 스토어 load가 채움.)
- 편집/삭제: `useCableMutations`(즉시) 대신 `stageCableUpdate(id, patch)` / `stageCableDelete(id)`(스토어). 인라인 라벨/종류 편집·삭제가 스테이징.
- 커밋은 워크스페이스 커밋 바(§E).

### C. 현황 리스트 머지 (라이브 effective + 표시 필드)
`useSubstationStatusRows(substationId)` 훅:
- `const list = useNodeAssets('substation', substationId)` (AssetListItem[], 설치장소/floorName/lastMaintenanceDate 포함).
- `const overlay = useEffectiveAssetsOverlay()` (스토어 assets 오버레이).
- 머지: list 행에 overlay.updates 적용(공유 필드 name/manager/installDate/status), overlay.deletes 제거, overlay.creates 추가(부분 AssetListItem — 신규는 표시 필드 제한, 커밋 후 refetch로 채워짐). 랙모듈 자식 제외(현황은 top-level).
- `NodeStatusView`에 `rows?: AssetListItem[]` prop 추가: 제공되면(변전소) 그 행 사용, 없으면(홈) 기존 useNodeAssets. `SubstationStatusView`가 `useSubstationStatusRows`로 머지 행 주입.

### D. 인스펙터 편집 → 스토어
`SubstationStatusView`(또는 인스펙터 호출부):
- 인스펙터 `onPatch(id, patch)` → `useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)`(registerStore.stageUpdate 대체).
- 선택 자산 데이터 = `effectiveAssets().find(id)`(스테이징 반영). 사진·점검 섹션은 그대로 즉시.

### E. 워크스페이스 커밋 바
`features/workingCopy/WorkingCopyCommitBar.tsx`(SubstationWorkspacePage 상단, status·connections 뷰에서 표시):
- `const dirty = useWorkingCopyDirty()`. dirty>0면 "N건 변경" + [커밋][되돌리기].
- 커밋: `commitSubstation(substationId, overlays, savedAssets, queryClient)`(2b) → 성공 시 `load(substationId)` 재로드(reconcile: saved 갱신·overlays 비움·히스토리 클리어). 409 `VersionConflictError` → `ConflictDialog`(message). 되돌리기 → `revert()`.
- 평면도(2d)도 같은 바 공유.

### F. registerStore 분리
`SubstationStatusView`가 registerStore·commitRegister·기존 커밋 바를 더는 안 씀. registerStore 파일은 잔존(2d 삭제) — 다른 사용처 없는지 확인.

## 4. 영향 받는 파일
**프론트 신규**: `features/workingCopy/hooks.ts`, `features/workingCopy/WorkingCopyCommitBar.tsx`, `features/assets/useSubstationStatusRows.ts`(머지 훅), 각 test.
**프론트 수정**: `pages/SubstationWorkspacePage.tsx`(로더 + 커밋 바), `features/assets/components/SubstationStatusView.tsx`(스토어 연결·registerStore 제거·머지 행), `features/assets/components/NodeStatusView.tsx`(`rows?` prop), `features/connections/components/SubstationConnectionsView.tsx`(+Table)(스토어 읽기·스테이징), `features/assets/components/AssetInspector.tsx`(호출부 onPatch 경로 — 변경 최소).
**미사용화**: `features/assets/registerStore.ts`, `commit.ts`(commitRegister), `useCableMutations`(즉시) — 현황/연결에서.

## 5. 테스트
- **단위(RTL/vitest)**: `useSubstationStatusRows` 머지(update 패치·delete 제거·create 추가·랙모듈 제외, mock useNodeAssets+스토어). `WorkingCopyCommitBar`(dirty 표시·커밋 호출·revert). `useEffectiveCables`/dirty 훅.
- **수동(dev, 브라우저)**: ① 변전소 현황에서 인스펙터로 이름 편집 → **리스트에 라이브 반영** + 커밋 바 "N건". ② 연결에서 케이블 라벨 편집/삭제 → 스테이징(커밋 전 미반영 DB) + 커밋 바 카운트 증가(현황과 합산). ③ 커밋 → 현황·연결·DB 반영, 카운트 0. ④ 되돌리기 → 스테이징 취소. ⑤ 409 충돌 → ConflictDialog. ⑥ 다른 변전소 전환 → 스토어 리셋(잔류 없음). ⑦ 평면도·홈 현황 회귀 없음.

## 6. 성공 기준
1. 현황·연결이 통합 스토어 effective 읽기 + 스테이징, 워크스페이스 단일 커밋 바로 한 번에 커밋.
2. 현황 리스트에 스테이징 편집 라이브 반영(설치장소·점검일 유지). 연결 git-like.
3. 커밋/되돌리기/409/변전소 전환 정상, registerStore·즉시 mutation 분리.
4. 평면도(에디터)·홈 현황 회귀 없음(2d 전까지 평면도는 기존 editorStore).

## 7. 이후
- 2d 에디터 이관(캔버스 effectiveEquipment·오버레이 쓰기, localEquipment/localCables·editorStore 퇴역, editorUiStore 분리, registerStore/구 엔드포인트 삭제) → 평면도까지 같은 워킹카피·커밋 바. 그 후 분전반 상세 → C4 계통도.
