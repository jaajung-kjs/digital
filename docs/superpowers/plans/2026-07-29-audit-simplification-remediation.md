# §6 감사 시정(Audit Remediation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** §6 단순화 서약 감사(2026-07-29, `.git/sdd/audit-{heuristics,adapters,yagni}.md`)의 실위반 4건 + 구조 스멜 2건 + YAGNI 부스러기를 시정한다.

**Architecture:** ①선번장 meta 위치 휴리스틱은 메타모델 확장(PortTemplate.lineSide 선언)으로 대체 — 셀렉터는 선언을 읽기만 한다. ②③④는 기존 단일 구현(resolvePeer/mergeEffective/신설 PLACEMENT_FIELDS 코어 상수)으로 교체. 스멜은 commit.service가 실점유 집합을 코어 validateConnection에 전달하도록, 가드레일은 BE 타입키 동적 파생으로 보강.

**감사 판정 기각(작업 안 함):** D-2/D-3/S-3(AssetRef/CableRef의 미사용 필드 — 공유 도메인 참조 형상은 전체 필드 유지가 원칙, validateSlotPlacement가 placement 필드 사용), S-1(portCounts — 계획된 이월 기능의 배선).

## Global Constraints

- §6 서약 전체(휴리스틱 금지/헬퍼 금지/YAGNI/판정 한 곳/가드레일 강제). v2 격리. @twin/core 수정 후 `npm run build -w @twin/core` 필수. 커밋 한국어 + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 푸터. dev DB 마이그레이션은 `npm run db:next:migrate -w backend`.
- **거동 계약**: 선번장 meta 편집은 lineSide 선언 그룹의 케이블에만 기록. lineSide 미선언 타입은 meta 셀 비활성(휴리스틱 폴백 완전 삭제). 시드 OFD-SLOT은 B(선로) 그룹에 lineSide — 기존 사용자 가시 거동(선로측 기록)과 동일.

---

### Task R-1: @twin/core — PortTemplate.lineSide + PLACEMENT_FIELDS 상수 (TDD)

**Files:** Modify `packages/core/src/catalog/types.ts`, `catalog/specFromCatalog.ts`, `validation/typeSpec.ts`(+test), `seed/catalog.ts`(+test), `index.ts`.

- `PortTemplate.lineSide?: boolean` (선로측 — 선번장 meta 기록 대상 그룹 선언, 기본 false).
- `validateTypeSpec`: 타입당 lineSide=true 그룹 ≤1 (`ports[i].lineSide` 이슈, 2개째에 발화). 테스트 2케이스(1개 허용/2개 거절).
- `PLACEMENT_FIELDS` 상수 export: `['floorId','x','y','width','height','parentAssetId','containerKey','slotIndex','slotSpan'] as const` + 타입 `PlacementField`. jsdoc: "배치 판정 필드 목록의 유일 정의 — BE 재검증 트리거/FE 이설 판정이 공유".
- 시드: OFD-SLOT B 그룹에 `lineSide: true`. 시드 테스트 단언 추가.
- YAGNI 라이더: `COMMON_FIELDS` export 제거(module-private — seed/catalog.ts 내부 전용 확인 후).
- `specFromCatalog`: lineSide 매핑(DB행 → spec).
- 전체 core 테스트 + dist 빌드.

### Task R-2: 백엔드 — lineSide 왕복 + commit.service 판정 시정 + 가드레일 보강 (TDD)

**Files:** Modify `backend/prisma/next/schema.prisma`(+migration), `src/v2/schemas.ts`, `catalog.routes.ts`(+crud test), `commit.service.ts`(+통합테스트), 가드레일 테스트 파일.

- 스키마: `AssetPortTemplate.lineSide Boolean @default(false)` + `npm run db:next:migrate -w backend` (마이그레이션명 `add_port_template_line_side`).
- catalog CRUD: zod `portTemplateBodySchema.lineSide: z.boolean().optional()`, 저장 시 기본 false, GET 포함, `structuralKey`에 lineSide 포함(구조 필드 — 인스턴스 가드 대상). 왕복 통합테스트.
- `typeRowToSpec`/`specFromCatalog` 경로에 lineSide 전달 확인.
- **commit.service 판정 시정**: (a) 배치 변경 감지 필드 목록을 `PLACEMENT_FIELDS` import로 교체(로컬 목록 삭제). (b) 케이블 연결 검증 시 자체 점유 검사로 판정하지 말고 대상 포트들의 실점유 집합(DB 케이블 조회)을 만들어 코어 `validateConnection(a,b,occupied,medium)`에 전달 — 코어가 점유 판정(P2002는 레이스 백스톱으로 유지, 자체 선판정 분기는 제거). 점유 충돌 통합테스트가 코어 에러코드로 발화하는지 확인(기존 테스트 기대값 조정 허용 — 에러코드 계약 변화가 있으면 보고서에 명시).
- **가드레일 보강**: BE 가드레일의 시드 타입키 목록을 `SEED_ASSET_TYPES`에서 동적 파생(FE 방식과 동일). + 신규 정적 검사: `PLACEMENT_FIELDS` 리터럴 목록(9필드 나열)이 core 밖(backend/src/v2, frontend/src/v2)에 재정의되지 않는다(grep 기반, 기존 가드레일 테스트 파일 관례).
- 전체 backend 테스트 + build.

### Task R-3: 프론트 — 휴리스틱 제거 + 판정 단일화 + lineSide UI + YAGNI 라이더 (TDD)

**Files:** Modify `frontend/src/v2/fiberSelectors.ts`(+test), `components/ConnectionsTab.tsx`, `reportSelectors.ts`(+test), `components/admin/PortsEditor.tsx`(+test), `types.ts`, `catalogDraft.ts`, `components/FiberRegisterView.tsx`(필요시), `components/admin/adminUtils.tsx`, `TypeBasicsForm.tsx`, `FieldDefsEditor.tsx`.

- **①** `fiberSelectors`: meta 케이블 선정을 "lineSide=true 그룹의 케이블"로 교체 — 위치 역순 폴백 **완전 삭제**. lineSide 그룹이 없거나 그 그룹에 케이블이 없으면 `meta.cableId=null`(FiberRegisterView의 MetaInput은 cableId null이면 이미 비활성 — 확인 후 필요시 보강). 테스트: lineSide 그룹 케이블 선정 / lineSide 미선언 시 null / **다른 그룹에만 케이블 있어도 null(폴백 부재 단언)**.
- **②** `ConnectionsTab`: 인라인 aRef/bRef peer 해소를 `peerResolve.resolvePeer`(+`buildPortIndex`) 사용으로 교체 — remote 판정·포맷이 선번장/계통과 동일해짐. 기존 표시 스냅샷 차이는 공유 구현 기준으로 통일(드리프트 해소가 목적).
- **③** `reportSelectors`: 수제 effective-merge를 `overlay.mergeEffective` 사용으로 교체. `assetPlacementChanged`(이설 판정)를 `PLACEMENT_FIELDS` import 기반으로 교체. 기존 테스트 유지 통과.
- lineSide UI: `V2PortTemplate.lineSide: boolean`, `typeToDraft`/`TypeDraft` 반영, PortsEditor에 '선로측' 체크박스(잠금 시 disabled, 이슈 path `ports[i].lineSide` 매핑). 테스트 1케이스.
- YAGNI 라이더: adminUtils의 죽은 `FieldError` export 제거·TypeBasicsForm 로컬 FieldError를 adminUtils로 이동해 단일화(둘 중 한 방향 — 사용처가 TypeBasicsForm뿐이면 로컬 유지+export 삭제가 최소), TypeBasicsForm `locked` prop 제거, FieldDefsEditor `catalog` prop 제거.
- 전체 frontend 테스트 + build.

### Task R-4: 종합 검증 + 최종 리뷰 (컨트롤러)

- 전 스위트(core/be/fe/build) 그린.
- 브라우저: (a) 카탈로그에서 광슬롯 타입의 B 그룹 '선로측' 체크 표시 확인(시드 반영), (b) OFD+광슬롯 셋업 → B그룹 케이블 연결 → meta 편집 기록 → **A그룹만 연결 시 meta 비활성**(폴백 부재 실증) → DB 확인, (c) 연결 탭 peer 표시 정상(대국 포함 가능하면), (d) 설계서 이설/신설 무회귀 스팟, (e) 정리.
- 최종 whole-branch 리뷰(fable) → 픽스 → main 머지.
