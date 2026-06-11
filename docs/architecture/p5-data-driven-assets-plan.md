# P5 — 자산 DB 중심 / 데이터-드리븐 확장 (설계 + 계획)

> 목표: **자산이 코드가 아니라 데이터로 확장**된다. DB에 스칼라 컬럼 추가 = (거의) 한 줄, 새 레코드 종류(점검/사진/측정…) 추가 = 레지스트리 한 줄. 함수/컴포넌트 더미 찍어내기 종식.

## 감사 — 아직 데이터-드리븐이 아닌 곳 (근거)
**스칼라 필드** (`assets` 컬럼 추가 시):
- ✅ 백엔드 LOAD(`substationWorkingCopy.service.ts` `findMany`, select 없음) — 새 컬럼 자동 반환.
- ✅ 프론트 오버레이(`overlay.ts`/`effective.ts`/descriptor `applyPatch` shallow merge) — 새 필드 자동 staging.
- ❌ 백엔드 COMMIT — `substationCommit.schema.ts` `assetCommonFields`(41-50) + `substationCommit.service.ts` `assetCommonCreate`(52-61)/`assetCommonUpdate`(62-71) **하드코딩 화이트리스트** → 새 필드 드롭.
- ❌ 프론트 렌더 — `AssetInspector.tsx`(186-223) name/manager/installDate/status/description **하드코딩**, `fieldTemplate` 미사용.
- ❌ 타입 — `types/asset.ts` `Asset`/`UpdateAssetInput` 필드 열거.
→ 현재 컬럼 추가 = **7곳 수정**.

**레코드 타입**: 점검/로그/사진 3개가 store(Row+descriptor+COLLECTIONS+MEDIA_FLUSHERS+useEffectiveX) + UI(InspectionSection/LogsTab/AssetPhotoSection/PhotosTab) + 백엔드(routes/controller/service/Prisma) **각각 bespoke**. UI 모드는 **2개**(form-list=점검·로그, gallery=사진)로 충분. 진짜 per-type = `{key,label,parentKey,fields,uiMode,endpoints,queryKey}`.

**죽은 평행모델**: 🔴 스냅샷 오버레이 — `snapshotStore.enter()` 어디서도 미호출 → `snapshot.active` 항상 false. ~15파일 죽은 `snapshotActive` 분기 + `SnapshotEquipment` 타입 + `SnapshotRackView`·`BaseEquipmentTabsPanel`(스냅샷 전용). FloorPlanEquipment 제거를 막던 마지막 평행모델.

## 설계
### A. 스칼라 필드 데이터-드리븐
- **필드 스키마 = `BASE_ASSET_FIELDS`(코어: name/status/lifecycle, 전 자산 공통) + `assetType.fieldTemplate`(종류별, DB 데이터)**. 각 = `{key,label,type}`.
- **제네릭 필드 렌더러**: `type→입력컴포넌트` 맵(text/date/select/status/textarea). 상세패널이 `[...BASE, ...fieldTemplate]` 순회 렌더 → 필드 추가 = 스키마 한 줄(또는 fieldTemplate DB row = 코드 0).
- **스키마-검증 passthrough 커밋**: 손 화이트리스트 폐기, "실제 Prisma 컬럼이면 통과". (임의 필드 X → 안전. 순수 EAV 아님.)
- **타입**: `Asset` 코어 타입 유지 + `[key:string]: unknown` 확장.

### B. 레코드 타입 레지스트리
```
ASSET_RECORD_TYPES = [
  { key:'inspections', label:'점검', parentKey:'assetId', fields:[…], ui:'form-list', endpoints:{…}, queryKey:['inspection-logs'] },
  { key:'logs',  label:'고장이력', parentKey:'equipmentId', fields:[…], ui:'form-list', endpoints:{…}, queryKey:['maintenance-logs'] },
  { key:'photos', label:'사진', parentKey:'equipmentId', fields:[file,side], ui:'gallery', endpoints:{…}, queryKey:['equipment-photos'] },
]
```
- 제네릭 UI 모드 2개(form-list / gallery)가 fields+ui로 구동.
- store `COLLECTIONS`·`MEDIA_FLUSHERS`·`useEffective`를 레지스트리에서 파생.
- (선택 ④) 백엔드 `/assets/:id/records?type=X` 제네릭 엔드포인트.
- → 새 종류 추가 = 레지스트리 한 줄.

## 단계 (각 tsc/test/build + 브라우저 스모크 + 단계 커밋)
- **P5a — 스냅샷 dead code 제거** *(저위험·선행)*: ~15파일 죽은 분기 + `SnapshotEquipment` + `SnapshotRackView`/`BaseEquipmentTabsPanel`(스냅샷 전용 한정) 삭제. 평행모델 0. 각 제거가 *스냅샷 전용*인지(라이브 미사용) 확인 후 삭제.
- **P5b — 스칼라 필드 데이터-드리븐**: BASE_ASSET_FIELDS + 제네릭 렌더러 + passthrough 커밋(스키마 검증). "필드 추가 = 한 줄".
- **P5c — 레코드 레지스트리 + UI모드 2개**: 점검·로그·사진을 config 3줄로 흡수.
- **P5d (선택) — 백엔드 제네릭 레코드 엔드포인트(④)**.

## 트레이드오프
- passthrough = 실제 컬럼만 통과(스키마 검증) → 안전. 타입 컬럼 유지(EAV 회피).
- 제네릭 UI 2모드가 현재+대부분 미래 커버. 별난 UI만 새 모드(드묾).

---

## 검사 — 자산DB 중심 미전환 부분 감사 (2026-06-12, 자율 실행)

병렬 감사(백엔드/프론트) 결과. **현재 자산-중심도: 프론트 ~85% / 백엔드 ~60%.**

### ✅ 완료(안전·검증됨)
- **P5a** 스냅샷 오버레이 dead code 제거(마지막 평행모델 SnapshotEquipment 소멸).
- **P5b** 스칼라 필드 단일소스(`ASSET_SCALAR_FIELDS`) + `Asset` index signature → 컬럼 추가가 로드/staging/커밋 자동 통과(3곳→1곳).
- **죽은 마이그레이션 잔여 제거**: `useSubstationConnections`+중복 `CableDetailDTO`(프론트), 제거된 모델 테스트 5개(백엔드) → 백엔드 테스트 5 failed→68 all pass.

### ⚠ 남은 미전환 (브라우저 검증/DB 마이그레이션 필요 — 블라인드 위험으로 보류)
**백엔드 (HIGH):** 통합커밋(`/substations/:id/assets/commit`)을 우회하는 **레거시 write 경로**가 잔존 — `POST/PUT/DELETE /assets`, `PUT/DELETE /equipment/:id`, `POST /floors/:id/equipment`, `/rack-modules` CRUD. *프론트가 실제 호출하는지 확인 후 제거 또는 commit 흡수 필요.* OCC/감사 우회 위험.
**백엔드 (MEDIUM):** `Port`/`EquipmentPhoto`/`MaintenanceLog`의 `equipmentId` 컬럼 = 실제 assetId → `assetId`로 rename(DB 마이그레이션). `/equipment/:id/*` 라우트 → `/assets/:id/*`.
**프론트 (HIGH):** 상세패널이 워킹카피에 이미 있는데 **재-fetch** — `useAsset`(`/assets/:id`)·`useMergedEquipmentDetail`+`EquipmentDetail`(`/equipment/:id`). effective Asset만으로 충분(이미지URL만 별도). → `EquipmentDetail` 평행shape 제거 후보.
**프론트 (MEDIUM):** `AssetInspector`·CSV export의 **하드코딩 필드 리스트**(P5b-render) → 필드 스키마+제네릭 렌더러. *UX 민감(사용자가 매우 신경쓴 패널) → 브라우저 검증 필수.*
**프론트 (MEDIUM):** media row `LogRow/PhotoRow.equipmentId` = assetId → rename(클라리티, 코스메틱).

### ⏭ 다음(브라우저 켜고)
1. 레거시 write 경로 프론트 호출 확인 → dead면 제거 / live면 commit 흡수.
2. 상세패널 재-fetch 제거(effective Asset 직접) + `EquipmentDetail` 폐기.
3. P5b-render(상세패널 데이터-드리븐) + P5c(레코드 UI 제네릭) — UX 검증하며.
4. equipmentId→assetId rename(DB 마이그레이션 동반).
