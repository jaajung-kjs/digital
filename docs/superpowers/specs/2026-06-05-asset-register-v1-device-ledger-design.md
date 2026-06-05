# V1 설계 — 장비 대장 + 생애주기 + 사진 (Device Ledger)

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 선행: 1단계(Asset 레지스터)·2a(에디터 백엔드 Asset 통합) 완료·병합. Asset SSOT + 변전소 현황 표 + `EquipmentPhoto`/`MaintenanceLog`(Asset 연결) 존재.
- 범위: 대규모 리팩토링의 **첫 도메인 수직 V1**. 변전소 현황 표를 본격 **장비 대장**으로 확장 — 종류별 속성·전/후면 사진·생애주기 알림·유지보수 이력·대장 내보내기.

---

## 1. 배경 & 목표

원주는 장비 현황을 분산 엑셀(RTU현황 683행, PITR현황 4,545행, 광단국현황 89행 등)로 관리한다. 1단계로 Asset SSOT + 현황 표가 깔렸고, 이제 그 표를 **엑셀 대장을 실제로 대체하는 장비 대장**으로 키운다.

사용자 확정 사항:
- **메인 축 = 변전소 중심**(현 그리드 확장). 실장도/배치도와 자연스럽게 연결. (org-wide 종류별 뷰는 V1 비범위)
- **상세 뷰 = 우측 슬라이드 패널**, 한 흐름(탭 silo 아님): 식별 + 설치일·담당자·상태(자연스럽게) + 속성 + 사진 + 유지보수.
- **전/후면 사진 필요**. 설치일·담당자 등은 별도 "세부정보" 카테고리가 아니라 자산 본문에 자연 통합.
- V1에 **생애주기 알림 + 유지보수 이력 + 대장 내보내기** 모두 포함.

---

## 2. 목표 / 비목표

### 목표
1. 변전소 현황 표에서 행 클릭 → **우측 상세 패널**(식별·설치/담당/상태·속성·사진·유지보수).
2. **전/후면 사진** 업로드·갤러리·삭제 (기존 `EquipmentPhoto` 인프라 재활용).
3. **종류별 `fieldTemplate` 정비** — 엑셀 컬럼을 종류별로 큐레이션 + 누락 종류(통합단말/소형광/송변전광/PCM) 추가.
4. **생애주기 알림** — 하자보수기한·교체예정 임박 ⚠ 배지 + 현황 표 "임박만" 필터.
5. **유지보수 이력** — 상세 패널에서 점검·고장·수리 기록 추가·조회 (기존 `MaintenanceLog` 재활용).
6. **대장 내보내기** — 현재 표(변전소×종류 필터)를 Excel/CSV로.

### 비목표 (이후)
- org-wide 종류별 대장 뷰(여러 변전소 가로지르기) — V1은 변전소 중심.
- 점검·측정 시계열(광코어 dB 이력) = V3. 송전선로(T/L) 레이어 = V5. 선번장/회선 = V2. 전원계통도 = V4.
- 부품별 교체이력(RTU 공통제어부/I-O 단위) — V1은 자산 단위 생애주기까지.
- 2b(프론트 옛 타입 정리) — 무관, 별도.

---

## 3. 핵심 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 생애주기 날짜(`warrantyUntil`,`replaceDue`)를 Asset **1급 칼럼**으로 승격 | 알림이 깔끔한 DB 쿼리(`where warrantyUntil <= now()+6mo`). attributes JSONB 조회 회피(1단계 spec이 지적한 리스크). `installDate`는 이미 칼럼. |
| 그 외 속성은 attributes/fieldTemplate 유지 | 종류마다 다른 속성은 데이터 주도 템플릿이 맞음(스키마 폭증 방지). |
| 사진·유지보수는 기존 테이블·서비스 재활용 + asset 네임스페이스 라우트 추가 | `EquipmentPhoto`/`MaintenanceLog` 가 2a에서 이미 Asset(`equipmentId`=assetId)에 연결됨. `/assets/:id/photos`·`/assets/:id/maintenance-logs` 별칭으로 의미 정리, 서비스 재사용. |
| 상세 = 우측 슬라이드 패널, 단일 흐름 | 사용자 선택. 자산 간 빠른 이동·기존 에디터 우측패널 관용과 일관. 탭 silo 회피("세부정보" 요구 반영). |
| 내보내기 = 클라이언트(브라우저) 생성 | 서버 부하 0·즉시. 컬럼=현재 표시 컬럼. |

---

## 4. 데이터 모델 변경 (최소)

> Prisma 스케치는 모양 합의용. 정확한 칼럼·인덱스는 구현 계획에서.

### 4.1 Asset 생애주기 칼럼 (신규)
```prisma
model Asset {
  // ... 기존 ...
  warrantyUntil DateTime? @map("warranty_until") @db.Date  // 하자보수기한
  replaceDue    DateTime? @map("replace_due")    @db.Date  // 교체예정(년/월을 날짜로 정규화)
}
```
- `installDate`(설치일)는 기존 칼럼 그대로 활용.
- 마이그레이션은 가산(nullable). 알림 쿼리용 인덱스(`warrantyUntil`, `replaceDue`) 추가.

### 4.2 AssetType.fieldTemplate 정비 (시드, 스키마 변경 없음)
종류별로 엑셀 컬럼을 큐레이션해 `fieldTemplate`에 반영. 공통 생애주기 중 **fieldTemplate에 남기는 것 = `model`(모델명)·`vendor`(제작사)·`mfgYm`(제작년월)·`serialNo`(S/N)**. **칼럼으로 이동(중복 제거): 설치일=`installDate`, 하자보수기한=`warrantyUntil`, 교체예정=`replaceDue`** — 즉 기존 시드의 `installYm`·`replacePlan`·`warrantyUntil`(fieldTemplate)을 제거하고 1급 칼럼이 대체한다.

대표 큐레이션(전부 아니라 의미있는 것):
- **RTU**: hostOffice(급전소), voltage(전압), substationType(변전소형태), operation(유무인 select), kind(종류), category(구분), timeSync(시각동기장치), protocol(프로토콜), hostCircuits(상위Host회선수 number), scadaLink(SCADA연계), ipAddr(IP) + 공통생애주기.
- **PITR(계통보호전송장치)**: tlName(T/L명), tlVoltage(T/L전압), typeCode(TYPE), model, vendor, mfgYm, ipCot(IP COT), ipRt(IP RT), routePrimary(회선경로 주), routeBackup(회선경로 예).
- **광전송(OPT-XPONDER) 및 신규 통합단말/소형광/송변전광/PCM**: topology(구성형태 select 링/P-TO-P), kind(종류), model, vendor, introYear(도입년도 number), serialNo(S/N), ringName(링명칭), spec(규격), remote(대국), ipMain(IP주), ipExt(IP확장).
- **충전기**: spec(규격), formType(형식), control(제어), inputV(입력), outputV(출력V) + 공통생애주기.
- **UPS / 축전지**: 모델·제작사·제조년도·세부내역 + 공통생애주기.

신규 AssetType 코드 추가: 통합단말/소형광/송변전광/PCM (광전송 하위 종류; placementKind=null 모듈로도 쓰일 수 있으나 V1은 top-level 장비 종류로). 코드 충돌 없게.

### 4.3 사진/유지보수 — 기존 재활용 + asset 라우트
- 사진: `EquipmentPhoto`(side 'front'|'rear', imageUrl, description, takenAt; `equipmentId`=assetId). 신규 라우트 `GET/POST /api/assets/:id/photos`, `DELETE /api/asset-photos/:id` — 기존 `uploadEquipmentImage` 미들웨어(`uploads/equipment/` 저장, `/uploads` 서빙)·`equipmentPhoto.service` 재사용.
- 유지보수: `MaintenanceLog`(logType, title, description, logDate, severity, status; `equipmentId`=assetId). 신규 라우트 `GET/POST /api/assets/:id/maintenance-logs`, `PUT/DELETE /api/asset-maintenance-logs/:id` — `maintenanceLog.service` 재사용.
> 테이블/서비스 이름(equipment_photos 등)은 유지(개명은 2b 정리 대상). asset 네임스페이스 라우트만 추가해 의미를 정리.

---

## 5. 상세 패널 (우측 슬라이드)

`frontend/src/features/assets/components/AssetDetailPanel.tsx` (신규). 현황 표 행 클릭 → 우측 슬라이드. 한 흐름(탭 없음), 섹션 스크롤:
1. **헤더**: 이름(편집)·종류 배지 + **설치일·담당자·상태**(인라인 편집, 자연스럽게).
2. **속성**: `assetType.fieldTemplate` 필드 자동 폼(타입별 입력: text/number/date/month/select). 값=Asset.attributes.
3. **생애주기**: 교체예정(`replaceDue`)·하자보수기한(`warrantyUntil`) 날짜 입력 + 임박 시 ⚠ 배지.
4. **사진**: 전/후면 토글 갤러리 — 업로드(compressImage→multipart)·썸네일·라이트박스·삭제 (기존 PhotosTab/PhotoLightbox 패턴 재활용, 자산용 훅 `useAssetPhotos`/`useUploadAssetPhoto`).
5. **유지보수**: 이력 리스트(타입·날짜·심각도·제목) + 추가 폼.

저장: 헤더/속성/생애주기는 기존 `updateAsset`(낙관적 업데이트) 확장 — `installDate`/`manager`/`status`/`warrantyUntil`/`replaceDue`/`attributes` 패치. 사진·유지보수는 각자 뮤테이션(즉시 서버).

---

## 6. 생애주기 알림

- **계산(순수 함수, TDD)**: `assetAlertLevel(asset, today, monthsAhead=6)` →
  - `warrantyUntil` ≤ today+monthsAhead → '하자보수 임박'
  - `replaceDue` ≤ today → '교체 도래/경과'
  - 둘 중 하나라도 → ⚠. 없으면 정상.
- **표시**: 그리드 행 + 상세 패널에 ⚠ 배지(툴팁=사유·날짜).
- **필터**: 현황 표 상단에 "임박만" 토글 → 알림 있는 자산만.
- 임계값(6개월)은 상수(추후 설정값화 가능, V1은 상수).

---

## 7. 대장 내보내기

- 현재 표(변전소×종류 필터 적용 상태)를 **브라우저에서 Excel(xlsx)/CSV 생성**.
- 컬럼 = 현재 표시 컬럼(이름 + fieldTemplate 필드) + 설치일·담당자·상태·교체예정·하자보수기한.
- 라이브러리: 경량 클라이언트 xlsx 생성(없으면 CSV 우선). 파일명 = `{변전소}_장비대장_{날짜}.xlsx`.
- 서버 변경 없음.

---

## 8. 컴포넌트 / 파일 (신규·수정)

**Backend**
- 수정: `schema.prisma`(Asset 생애주기 칼럼) + 마이그레이션
- 수정: `seed/assetTypes.ts`(fieldTemplate 정비 + 신규 종류)
- 수정: `asset.service.ts`/`assets.routes.ts`(update 입력에 installDate/manager/status/warrantyUntil/replaceDue; 생애주기 알림용 list 옵션 또는 클라계산)
- 생성: `routes/assetPhotos.routes.ts`·`routes/assetMaintenanceLogs.routes.ts`(기존 서비스 위임) + index.ts 등록

**Frontend**
- 생성: `features/assets/components/AssetDetailPanel.tsx`(+ 하위 섹션 컴포넌트), `features/assets/alerts.ts`(+ 테스트), `features/assets/export.ts`, `features/assets/hooks/useAssetPhotos.ts`·`useAssetMaintenanceLogs.ts`
- 수정: `SubstationAssetGrid.tsx`(행 선택→패널, 임박 필터, 내보내기 버튼, ⚠ 배지), `AssetGridRow.tsx`(⚠ 배지), `types/asset.ts`(생애주기 필드), `services/assetApi.ts`(update 필드·사진·이력)

---

## 9. 테스트 / 검증

- **백엔드**: asset photo·maintenance 라우트 통합테스트(supertest, 실DB); asset update가 생애주기 칼럼을 저장하는지; 알림 쿼리(있다면) 단위테스트. 1단계 자산 테스트·2a 라운드트립 계약테스트 회귀 없음.
- **프론트**: `alerts.ts`(임박 계산) 순수 TDD; `export.ts`(행→Excel 매핑) 단위; `npx tsc --noEmit` + `vite build`.
- **스모크**: 변전소 현황 표 → 행 클릭 → 상세 패널: 설치일/담당자 편집·속성 편집·전/후면 사진 업로드·유지보수 추가·⚠ 배지·"임박만" 필터·대장 내보내기 다운로드.

---

## 10. 성공 기준 (검증 가능)

1. 현황 표 행 클릭 → 우측 패널에 식별·**설치일·담당자·상태**·속성·사진·유지보수가 한 흐름으로 보이고 편집된다.
2. 자산에 **전/후면 사진**을 올리고 보고 지운다(EquipmentPhoto 재활용).
3. RTU/PITR/광전송 등 종류별 `fieldTemplate`에 엑셀 핵심 컬럼이 반영돼 대장으로서 의미를 갖는다.
4. 하자보수기한/교체예정 임박 자산에 ⚠ 배지가 뜨고 "임박만" 필터로 추린다.
5. 상세 패널에서 유지보수 이력을 추가·조회한다.
6. 현재 표를 Excel/CSV로 내보낸다.
7. 1단계·2a 테스트 회귀 없음.

---

## 11. 이후
- V2 선번장/회선(중계경로 자동), V3 점검·측정 시계열, V4 전원계통도, V5 송전선로(T/L). 실장도 모듈 카탈로그에 구조요소(판넬·팬·케이블선반·DC분배) 추가(소).
