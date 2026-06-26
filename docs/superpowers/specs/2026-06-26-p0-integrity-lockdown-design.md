# P0 — 무결성 잠금(Integrity Lockdown) 설계

## 1. 배경 / 목표

전문 자산관리 시스템 전환의 1단계(기반). 심층 분석에서 드러난 **데이터 무결성 결손**을 데이터 입력 단계인 **지금** 잠근다 — 막을 수 있는 중복·오염 데이터가 더 쌓이기 전에. 기능 추가가 아니라 *제약·정합성*만 다룬다.

**현 DB 실측(dev, 2026-06-26):** assets 66 / cables 85 / asset_types 27. AssetType·CableCategory·Substation 실중복 0. Headquarters의 `__na_hq__`×4·`__conn_hq__`×4는 **통합테스트가 고정명으로 무정리 생성한 쓰레기**(실데이터 아님). status 전부 null, maintenance/photo/audit 테이블 비어있음, cable role = IN/OUT/null뿐, laborType = 통신내선공/통신외선공/null. → enum 전환·unique 추가 모두 **마이그레이션 위험 최소**.

## 2. 범위 (In scope)

### A. Unique 제약 (실중복 0 — dedup-merge 불필요)
- `AssetType.name @unique`
- `CableCategory @@unique([name, groupId])`
- `Substation.name @unique` (**전역**) — `branchId` nullable이라 `[branchId,name]`은 직할(branch=null) 변전소 간 미적용. KEPCO 변전소명은 전국 유일이므로 전역 unique가 더 강하고 단순. (사용자 승인)
- `Headquarters.name @unique` — 단 §C 테스트 fixture 수정 + dev DB 쓰레기 삭제 선행.
- 시드: 위 4개 테이블 `findFirst(...)→upsert(...)` 로 전환(멱등 키 = 새 unique).

### B. Enum 전환 (Prisma enum — DB+TS 양쪽 강제)
| enum | 값 | 적용 컬럼 | 비고 |
|---|---|---|---|
| `CableRole` | `IN`, `OUT` | `Cable.sourceRole`/`targetRole` | nullable 유지. 현 값 IN/OUT/null 전부 호환 |
| `FailureSeverity` | `LOW`,`MEDIUM`,`HIGH`,`CRITICAL` | `MaintenanceLog.severity` | nullable. 테이블 빈 상태 |
| `FailureLogType` | `FAILURE`,`REPAIR` | `MaintenanceLog.logType` | 구 `MAINTENANCE`는 deprecated → enum에서 제외(기존 행 0이라 안전) |
| `FailureStatus` | `OPEN`,`IN_PROGRESS`,`RESOLVED`,`CLOSED` | `MaintenanceLog.status` | default `OPEN` |
| `PhotoSide` | `front`,`rear` | `AssetPhoto.side` | |
| `AuditAction` | `CREATE`,`UPDATE`,`DELETE`,`MOVE` | `AuditLog.action` | |

- enum명은 의미대로 `Failure*`(이 로그는 사실상 고장로그 — P2의 `MaintenanceLog→FailureLog` 개명과 정합). P0에서는 **모델명은 그대로 `MaintenanceLog`**, enum만 `Failure*`로 둔다(P2가 모델까지 개명).
- 마이그레이션: `ALTER COLUMN ... TYPE <enum> USING <col>::text::<enum>`. 모든 현존 값이 enum 멤버라 캐스팅 무손실.

### C. FK 추가 / 강화
- `Asset.sourcePresetId → RackPreset` 관계 신설, `onDelete: SetNull`. (현재 FK 없는 dangling 문자열)
- `AssetType.categoryId → AssetCategory` 및 `CableCategory.groupId → CableGroup` 의 `onDelete` 를 **`SetNull → Restrict`**. 삭제 시 조용한 NULL화 방지(서비스 가드와 정합; catalogCommit이 이미 in-use 삭제를 막음 → 방어심화).

### D. 주석/문서 정정 (코드 동작 무관)
- `Cable` 모델 주석(schema:221-222): "각 side 한쪽만 NOT NULL — CHECK 강제"는 **거짓**(통합노드 모델, 둘 다 NOT NULL, CHECK 없음). "RACK kind"의 `kind`는 죽은 용어 → `role`. 정확한 주석으로 교체.
- `CableCategory` 주석 "16종 시드"(schema:185) → 실제 **18종**.

### E. 인덱스 (P1에서 당겨옴 — 무위험·무설계, 공짜)
- `Cable @@index([sourceAssetId])`, `@@index([targetAssetId])`, `@@index([categoryId])` (현재 cables에 보조 인덱스 0)
- `MaintenanceLog @@index([assetId])` (현재 InspectionLog만 있음)
- `AssetPhoto @@index([assetId])`

## 3. 범위 밖 (명시적 보류)
- `Asset.status` enum/생애주기 → **P3 생애주기**(현 all-null, lifecycle 상태는 P3에서 정의. 지금 임시 enum 후 재정의는 낭비).
- `laborType` → string 유지(상태가 아닌 참조 분류, BOM 확장 여지).
- cascade 삭제 → retire/이력보존(C안) → **P3, 사용자 지시로 보류**.
- 커밋 경로 감사로그·전역 피드 스코핑·deleteAuditLog 스코핑·catalog 검증 → **P1**.
- 모델/네이밍 개명(MaintenanceLog→FailureLog 등)·RackPresetModule 테이블화 → **P2**.

## 4. 마이그레이션 전략

단일 신규 마이그레이션 디렉토리(스키마 변경 동반)로 묶되, 순서 주의:
1. **테스트 쓰레기 정리 선행**: `DELETE FROM headquarters WHERE name IN ('__na_hq__','__conn_hq__')` (실데이터 아님; FK로 매달린 게 있으면 cascade로 함께 제거됨 — 테스트 산출물이라 무해). 그 후 `Headquarters.name` unique 생성.
2. enum 타입 생성 + 컬럼 `ALTER TYPE ... USING` 캐스팅.
3. unique 인덱스 + 보조 인덱스 생성.
4. `Asset.sourcePresetId` FK 추가, category/group FK를 Restrict로 재정의.
- `prisma migrate dev` 로 생성하되, enum 캐스팅 `USING` 절은 Prisma가 누락할 수 있으므로 **생성된 SQL을 검수·보정**(특히 `source_role`/`target_role`/`severity` 등 기존값 있는 컬럼).
- DB 스키마 변경이므로 P0는 "마이그레이션 금지" 제약의 예외(이 작업의 본질이 스키마 제약 추가).

## 5. 코드 영향 (스키마 외)
- **시드**(`seed/assetTypes.ts`·`cableCategories.ts`·`seed.ts`의 HQ/Substation): `findFirst→upsert`.
- **enum 소비처**: 백엔드/프론트에서 해당 문자열을 다루던 곳이 Prisma enum 타입으로 바뀜 — `MaintenanceLog`·`AssetPhoto`·`AuditLog`·`Cable` role 관련 서비스/DTO/zod 스키마. `CableRole`은 `substationCommit.schema`·`cable.service`·`planApply`/trace가 'IN'/'OUT' 문자열을 쓰는지 점검 후 enum 정합.
- **통합테스트 fixture 수정**: `cableConnections.integration.test.ts`·`nodeAssets.integration.test.ts` — 고정명 HQ 생성을 (a) 테스트 후 cleanup 하거나 (b) 유니크명(예: 접미사)으로. unique 추가 후 2회 실행 시 충돌 방지.

## 6. 리스크 / 결정
- **enum 캐스팅**: 기존값이 enum 멤버가 아니면 마이그레이션 실패. 실측상 전부 호환이나, 운영 DB(K-Cloud/twin.local)에 dev와 다른 값이 있을 수 있으니 **배포 전 운영 DB에 동일 probe 실행** 권고.
- **Substation 전역 unique**: 만약 실제로 동명 변전소가 서로 다른 지사에 존재하면 실패 — 실측상 중복 0이나 운영 DB 확인 권장.
- **Restrict 전환**: 카테고리/그룹 삭제가 이제 in-use면 DB레벨에서 거부 → 서비스가 이미 막으므로 사용자 경험 변화 없음(이중 안전).
- **enum 확장 비용**: 값 추가 시 마이그레이션 필요 — 대상 집합이 안정적이라 수용(사용자 승인).

## 7. 검증 게이트
- `npx tsc --noEmit` 양쪽 0
- 백엔드/프론트 vitest 전수 통과(통합테스트 fixture 수정 포함)
- `prisma migrate reset --force` + seed: 멱등(upsert), 재실행 무중복
- enum 거부 확인: 잘못된 값 insert가 DB에서 거부되는지 1건 테스트
- `prisma migrate status` = up to date, 드리프트 없음

## 8. 구현 단계 (plan에서 분할 예정)
- **T1** Prisma enum 6종 정의 + 컬럼 전환 마이그레이션(USING 캐스팅 검수) + enum 소비처 정합(서비스/DTO/zod) + 단위테스트.
- **T2** Unique 제약(AssetType·CableCategory·Substation·Headquarters) + 시드 upsert 전환 + 통합테스트 fixture 수정 + 쓰레기 정리.
- **T3** FK: sourcePresetId 신설 + category/group Restrict + 마이그레이션.
- **T4** 인덱스(E) + 주석/문서 정정(D).
- **T5** 최종 회귀: tsc·vitest·migrate reset+seed·enum 거부 확인.
