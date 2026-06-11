# 자산 상세패널 오버홀 — 설계 (9개 항목)

- 작성일: 2026-06-11
- 상태: 설계 (승인됨, 구현 진행)
- 범위: 자산 상세패널(AssetDetailBody/AssetInspector + 탭들) 프론트 + 백엔드 + DB.

## 확정 결정
- **#3 상태 ON/OFF**: `status` 문자열 컬럼 재사용, 값 `'ON'`/`'OFF'`. 기존 free-text 무시(토글 기본 ON). NodeStatusView 뱃지 ON=success/OFF=neutral.
- **#7 속성 삭제**: `Asset.attributes` 컬럼 + UI(AssetAttributesView/속성 섹션) 완전 삭제. 거기 있던 `sourcePresetId`는 **Asset 전용 컬럼 `source_preset_id`로 이전**.
- **#5·#6 점검/고장**: **`inspection_logs` 신규 테이블**(점검 전용: date+inspector+content) → `lastMaintenanceDate` 연동. 기존 `MaintenanceLog`는 **고장이력 전용**(FAILURE/REPAIR), 점검(MAINTENANCE) logType·드롭박스 제거.

## 항목별 설계
1. **삭제 버튼**: 상세패널(AssetDetailPanel/EquipmentDetailPanel) 하단(또는 헤더 오버플로)에 `삭제` — 확인 후 설비=`stageEquipmentDeleteCascade`, 모듈/분기=`stageAssetDelete`, 패널 닫기.
2. **내부설비 회색 div**: `PresetActionsBar:92` `bg-surface-2` → `bg-surface`(또는 무배경) + 정돈.
3. **상태 ON/OFF**: AssetInspector status 필드를 토글(ON/OFF). 저장 `status:'ON'|'OFF'`. 뱃지 갱신.
4. **즉시 반영**: Field 컴포넌트에 `onKeyDown Enter→commit`, 날짜/select 는 `onChange→commit`(blur 대기 X).
5. **점검 탭**: 상세패널에 `점검` 탭 — 날짜 선택 + 점검자 + 내용 작성, 목록. `inspection_logs` CRUD. 가장 최근 점검일이 현황 `마지막 점검일`로 자동 표시.
6. **유지보수→고장이력**: 탭명 변경, logType MAINTENANCE 제거(FAILURE/REPAIR만), 점검 드롭박스 제거. **사진/고장이력/연결 탭 일관 재디자인**: 공유 탭 셸(헤더·여백·버튼·토큰 통일), PhotosTab 다크배경 등 제각각 정리.
7. **속성 완전 삭제**: 프론트(AssetAttributesView 삭제, AssetInspector/InfoTab 속성 섹션 제거) + 백엔드(asset.service create/update/duplicate·AssetDetail 에서 attributes 제거, sourcePresetId 전용 컬럼 사용) + DB(attributes 드롭, source_preset_id 추가·백필).
8. **편집 직관화**: 각 필드 우측 `수정(연필) 아이콘` 또는 항상 보이는 편집 affordance. 패널 전반 UX(여백·정렬·상태 표시·빈 상태) 개선.
9. **제목 이름만**: 헤더에서 종류 뱃지 제거, 이름만(EquipmentDetailPanel·AssetDetailPanel 헤더).

## 구현 단계 (각 단계 빌드·테스트·커밋)
- **S1 프론트 quick wins** (#2·#9·#4·#1): 독립적, 즉시. 
- **S2 상태 ON/OFF** (#3): 토글 + 뱃지.
- **S3 백엔드/DB**: `source_preset_id` 추가·백필 → `attributes` 드롭(#7 DB) / `inspection_logs` 신설 + lastMaintenanceDate 연동(#5) / MaintenanceLog 고장전용(#6 백엔드). 백엔드 서비스·스키마·라우트.
- **S4 프론트 속성 제거** (#7 FE): AssetAttributesView 등 삭제, properties↔attributes 매핑 정리(sourcePresetId 전용 경로).
- **S5 점검 탭** (#5 FE): 점검 CRUD UI + 마지막점검일 연동.
- **S6 고장이력 + 탭 재디자인** (#6): 유지보수→고장이력, 공유 탭 셸로 사진/고장/연결 일관화.
- **S7 편집 affordance + 패널 UX** (#8): 수정 아이콘, 전반 정돈.

## 위험
- **DB(#7 attributes 드롭)**: 사용자 정의 필드 데이터 소실(승인됨). sourcePresetId 백필 필수(소실 시 프리셋 추적 끊김) → 드롭 전 백필 검증.
- **상태 의미 변경(#3)**: 기존 free-text 무시 → 과거 '고장/이상' 표기 사라짐(승인됨).
- 각 DB 단계 백업 + 가역 마이그레이션.

## 비범위
- 케이블/연결 데이터 모델, 평면도 캔버스 로직.
