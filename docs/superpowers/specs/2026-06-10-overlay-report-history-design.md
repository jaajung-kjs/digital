# 오버레이 기반 설계서 + 커밋 이력 재설계 (#3)

- 작성일: 2026-06-10
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 깨지고 묻혀 있던 변경이력/설계서(시계→버전→탭, `log.context.constructionReport` 서버 사전계산 의존)를 **현재 오버레이(활성 층의 staged 변경)에서 바로 산출하는 라이브 설계서** + **커밋별 아카이브 이력**으로 재구성. 단위 = **활성 층**.

---

## 1. 배경 / 문제
- **설계서**(공사 작업지시서) = `diff`(설치/철거/이설/변경) + `BOM`(자재 수량) + 부속자재(자동) + `노무량` + 할증, 편집 가능·CSV. 계산엔진 `backend/src/services/constructionReport.service.ts`(`calculateConstructionReport` + CONSTRUCTION_TEMPLATES + SURCHARGE_RULES) **존재하나 commit 시 호출 안 됨** → `ReportView`가 읽는 `log.context.constructionReport`가 비어 "설계서가 없습니다".
- **변경이력** = `commitSubstation`이 Floor 감사로그/스냅샷을 안 만들어 **고아**(빈 목록). 시계→ChangeHistoryPanel→버전선택→탭 흐름 전체가 깨짐.
- **오버레이** = 현재 staged diff(`overlays.{assets,cables,distributionCircuits,fiberPaths}` = creates/updates/deletes) = "곧 커밋될 변경". 설계서의 자연스러운 소스.

근거 맵: 탐색 보고(설계서/이력 내부구조). 사용자 결정: 활성 설계서 + 커밋별 아카이브, 백엔드 프리뷰 엔드포인트, 단위=활성 층.

## 2. 목표 / 비목표

### 목표
1. **백엔드 프리뷰 엔드포인트** `POST /substations/:id/report-preview` — 활성 **층의 staged diff**(또는 before/after)를 받아 `calculateConstructionReport`(+템플릿·할증) 재사용 → `ConstructionReport` 반환. **dry-run**(DB 미저장). 계산 규칙 단일 소스(프론트 중복 없음).
2. **라이브 설계서 패널** — 에디터 툴바 **"설계서" 버튼** → 사이드 패널이 **현재 활성 층 오버레이**를 프리뷰 엔드포인트로 보내 기존 `ReportView`(BOM·노무·부속·할증·편집·CSV) 렌더. 커밋 전 즉시 작업지시서. overrides는 워킹카피 옆 transient 스토어 보관(프리뷰 재요청 시 반영).
3. **커밋별 아카이브** — `commitSubstation` 성공 시(또는 커밋 직전 계산), 그 **활성 층의 설계서(+overrides·요약)**를 커밋 레코드(감사로그)로 저장. 각 커밋 = 작업배치 = 작업지시서 1건.
4. **이력 UI** — **"이력" 버튼** → 과거 커밋(작업지시서) 목록(일시·작성자·요약 N건) → 클릭 시 그 커밋의 아카이브 설계서(읽기). 시계→버전→탭 구 흐름 제거.
5. **구 깨진 흐름 제거** — `log.context.constructionReport` 의존 ReportView 경로, 고아 버전 스냅샷/탭, 클럭 아이콘 흐름 정리(version-restore 자체는 stageReplaceFloorFromSnapshot 유지).

### 비목표 (후속)
- 캔버스에 과거 버전 스냅샷 미리보기(버전 복원 프리뷰) — 별도(이미 stageReplaceFloorFromSnapshot 있음).
- 설계서 PDF/관급 양식 출력 — CSV 유지, 양식화는 후속.
- 변전소 다중 층 동시 커밋의 층별 분할 아카이브 — 활성 층 기준(에디터는 한 층 편집).

## 3. 설계

### A. 백엔드 프리뷰 엔드포인트
`POST /substations/:id/report-preview`
- 입력: `{ floorId, changes }` — `changes` = 활성 층 scope의 staged diff. 프론트가 오버레이에서 그 층 자산/케이블의 creates/updates/deletes를 추려 전송(설비·케이블의 자재코드·수량·길이 포함). 또는 commit 페이로드와 동일 모양의 floor-scoped 부분집합.
- 처리: 기존 `calculateConstructionReport`가 먹는 입력(PlanSnapshot before→after 또는 DiffItem[])에 맞춰 어댑트 — 구현이 엔진 시그니처 확인 후 결정(가능하면 DiffItem[] 직접, 아니면 saved+overlay 적용한 after를 서버에서 재구성). 템플릿/할증 적용 → `ConstructionReport`.
- 출력: `ConstructionReport`(diff/bom/labor/totalLaborHours). **DB 미저장**.
- 인증: 기존 floor/substation 권한.

### B. 라이브 설계서 패널 (프론트)
- 툴바 "설계서" 버튼 → `ReportPanel`(기존 `ReportView` 재사용, 데이터 소스만 교체).
- 패널 mount/오버레이 변경 시: 활성 층 오버레이 → `report-preview` 호출 → ReportView 표시. 변경이 0이면 "변경 없음" 안내.
- overrides 편집 → transient 스토어(`reportOverridesStore` 또는 워킹카피 슬라이스) 보관 → 프리뷰 재요청에 포함(서버가 overrides 반영하거나, 프론트가 ReportView 기존 override 머지 로직 사용 — 현 ReportView가 이미 overrides 머지하므로 재사용).
- floorId = 에디터 활성 층(editorStore.activeFloorId).

### C. 커밋 아카이브
- `useCommitWorkingCopy`(단일 저장) 흐름에 추가: commit 직전/직후 활성 층 설계서를 계산(프리뷰 엔드포인트 재사용) + overrides → 커밋 레코드 저장.
- 백엔드: commit 시 또는 별도 `POST /floors/:floorId/work-orders`(커밋 결과 + report 저장)로 작업지시서 레코드 생성. 모델 = 기존 AuditLog(entityType='Floor', context.constructionReport+overrides, 작성자, 시각, 요약 N건) 재사용 또는 경량 WorkOrder 레코드. (구현이 AuditLog 재사용 가능성 확인 — 가장 적은 변경.)
- 커밋이 그 층 변경을 비우므로, 아카이브는 "그 커밋 시점의 작업지시서" 스냅샷.

### D. 이력 UI
- 툴바 "이력" 버튼 → `WorkOrderHistoryPanel`: `GET /floors/:floorId/work-orders`(또는 기존 versions 엔드포인트) → 목록(일시·작성자·요약·N건). 클릭 → 아카이브 `ConstructionReport`를 ReportView(읽기 모드)로.
- 구 ChangeHistoryPanel의 버전-스냅샷-탭 복잡 흐름 제거. (canvas 미리보기 필요 시 후속.)

## 4. 영향 받는 파일
**백엔드 신규/수정**: `routes`/`controllers`/`constructionReport.service.ts`(프리뷰 엔드포인트), `substationCommit.service.ts` 또는 floor work-order 저장(아카이브), 작업지시서 목록/상세 조회.
**프론트 신규/수정**: `editor/components/Toolbar.tsx`("설계서"·"이력" 버튼, 시계 흐름 대체), `ReportPanel`(ReportView 재사용·소스 교체), `WorkOrderHistoryPanel`, `report-preview` API 훅, overrides transient 스토어. **제거/정리**: `ChangeHistoryPanel`(구 흐름)·`log.context.constructionReport` 의존부.

## 5. 테스트
- **백엔드 단위/통합**: `report-preview`(diff→BOM/노무/할증 정확, dry-run 미저장), 아카이브 저장/조회. `calculateConstructionReport` 기존 테스트 유지.
- **프론트 단위**: 오버레이→diff 추출(활성 층 scope), ReportPanel 프리뷰 호출, overrides 머지.
- **수동(브라우저)**: ① 평면도에서 설비/케이블 수정 → "설계서" → 라이브 작업지시서(BOM·노무) 표시·편집·CSV. ② 저장 → 그 설계서 아카이브. ③ "이력" → 과거 작업지시서 목록·조회. ④ 변경 0이면 빈 안내. ⑤ 구 시계 흐름·"설계서 없음" 없음. ⑥ 회귀: 저장·undo·현황·연결.

## 6. 성공 기준
1. 도면 안 "설계서" 버튼 한 번 → **현재 변경 기반** 작업지시서 즉시 산출(서버 사전계산 의존 없음).
2. 계산은 백엔드 엔진 단일 소스(프리뷰=커밋 아카이브 동일 결과).
3. 커밋마다 작업지시서 아카이브 → "이력"에서 조회. 구 깨진 흐름 제거.
4. 단위=활성 층. 회귀 없음.

## 7. 이후
- 과거 버전 캔버스 프리뷰, PDF/관급 양식, 다층 분할.
