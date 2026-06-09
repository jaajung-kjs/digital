# 오버레이 기반 설계서 + 커밋 이력 구현 계획 (#3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 현재 오버레이(활성 층 staged 변경)에서 바로 설계서(작업지시서)를 산출하는 라이브 패널 + 커밋별 아카이브 이력. 깨진 시계→버전→탭·서버 사전계산 의존 제거.

**Architecture:** 백엔드 계산엔진(`calculateConstructionReport`) 단일 소스를 프리뷰 엔드포인트로 노출 → 프론트가 활성 층 오버레이를 dry-run으로 보내 라이브 산출. 커밋 시 그 설계서를 감사로그에 아카이브 → 이력 조회.

**Tech Stack:** Express+Prisma+Zod+vitest(백) / React+Zustand+React Query+vitest(프론트). dev DB 떠 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`).

**설계 근거:** `docs/superpowers/specs/2026-06-10-overlay-report-history-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: 백엔드 report-preview 엔드포인트 (dry-run)

**Files:** Modify `backend/src/services/constructionReport.service.ts`(또는 신규 preview 래퍼), `backend/src/controllers/`(신규/기존 컨트롤러), `backend/src/routes/`(라우트), `backend/src/schemas/`(Zod); Test `backend/tests/` 또는 service test

- [ ] **Step 1: 현황 파악**

READ `backend/src/services/constructionReport.service.ts` — `calculateConstructionReport`의 **정확한 시그니처**: 입력이 PlanSnapshot(before/after equipment·cables) 인지 DiffItem[] 인지, CONSTRUCTION_TEMPLATES·SURCHARGE_RULES 적용 위치, 반환 `ConstructionReport` 모양. `frontend/src/types/constructionReport.ts`(공유 모양). `substationCommit.service`의 commit 입력(assets/cables creates/updates/deletes)과 saved 조회 방법. 이 입력 형태가 endpoint 입력 설계를 결정 — 보고.

- [ ] **Step 2: 실패 테스트**

`constructionReport.service.test.ts`(또는 통합): `reportPreview(substationId, floorId, changes)` →
- 설비 신규 1 + 케이블 신규(길이 L) → diff 2건, BOM에 자재·수량, 노무 시간 계산.
- dry-run: DB 미변경(앞뒤 row count 동일).

- [ ] **Step 3: 구현**

- `constructionReport.service`에 `reportPreview(substationId, floorId, changes)` 추가: changes(활성 층 scope staged diff)로 `calculateConstructionReport`가 먹는 입력 구성 — 엔진이 before/after 면 saved 층 상태 로드 + changes 적용해 after 구성; DiffItem[] 면 changes→DiffItem 직접. 엔진 호출 → ConstructionReport 반환. **DB 미저장.**
- 컨트롤러 + `POST /substations/:id/report-preview`(authenticate) + Zod 스키마(floorId + changes). substation/floor 권한 검증(기존 패턴).

- [ ] **Step 4: 통과 + Commit**

`cd backend && npx vitest run <test>` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/constructionReport.service.ts backend/src/controllers/<file> backend/src/routes/<file> backend/src/schemas/<file> backend/tests/<test>
git commit -m "feat(report): POST /substations/:id/report-preview — 오버레이 staged diff dry-run 설계서"
```

---

## Task 2: 라이브 설계서 패널 (프론트, 오버레이 소스)

**Files:** Create `frontend/src/features/report/useReportPreview.ts`(API 훅), `frontend/src/features/report/ReportPanel.tsx`(ReportView 래퍼), `frontend/src/features/report/overlayToChanges.ts`(활성 층 오버레이→changes); Modify `frontend/src/features/editor/components/Toolbar.tsx`("설계서" 버튼), `FloorPlanEditor.tsx`(패널 렌더)

- [ ] **Step 1: 현황 파악**

READ `editor/components/history/ReportView.tsx`(props·overrides·CSV — 재사용), `workingCopy/substationStore.ts`(overlays 구조·effective), `editor/stores/editorStore.ts`(activeFloorId), 기존 ReportView 데이터 진입점(현재 log.context).

- [ ] **Step 2: 오버레이→changes + 프리뷰 훅 + 패널**

- `overlayToChanges(overlays, activeFloorId, saved)`: 활성 층 자산(floorId===active)·그 끝점 케이블·랙모듈·dist·fiber의 creates/updates/deletes를 백엔드 changes 형태로 추림(자재코드·길이 포함). 단위 테스트.
- `useReportPreview(floorId, changes)`: `POST /substations/:id/report-preview` 호출(React Query mutation 또는 query), ConstructionReport 반환.
- `ReportPanel`: 활성 층 오버레이 구독 → overlayToChanges → useReportPreview → `ReportView`(읽기+편집+CSV) 렌더. 변경 0이면 "변경 없음". overrides 편집은 ReportView 기존 머지 사용(transient state).
- `Toolbar.tsx`: "설계서" 버튼 → ReportPanel 토글. (시계/history 버튼은 T4에서 정리 — 지금은 공존 가능.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/report src/features/workingCopy` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/report/useReportPreview.ts frontend/src/features/report/ReportPanel.tsx frontend/src/features/report/overlayToChanges.ts frontend/src/features/report/overlayToChanges.test.ts frontend/src/features/editor/components/Toolbar.tsx frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "feat(report): 라이브 설계서 패널 — 활성 층 오버레이→프리뷰(툴바 설계서 버튼)"
```

---

## Task 3: 커밋 아카이브 + 이력 UI

**Files:** Modify backend commit/archive(`substationCommit.service.ts` 또는 신규 work-order 저장 + 조회 엔드포인트), `frontend/src/features/workingCopy/useCommitWorkingCopy.ts`(아카이브 호출), Create `frontend/src/features/report/WorkOrderHistoryPanel.tsx` + `useWorkOrders.ts`; Modify `Toolbar.tsx`("이력" 버튼)

- [ ] **Step 1: 현황 파악**

READ `backend` AuditLog 모델(entityType='Floor', context, actionDetail) + `floor.service` getAuditLogs/patchContext(재사용 가능?), `useCommitWorkingCopy.ts`(commit 흐름 — 아카이브 삽입 지점), `ChangeHistoryPanel.tsx`(이력 목록 패턴 참고).

- [ ] **Step 2: 아카이브 저장 + 조회**

- 백엔드: 커밋 시(또는 `POST /floors/:floorId/work-orders` 별도) 활성 층 설계서(+overrides·요약·작성자·시각)를 감사로그/경량 레코드로 저장. 조회 `GET /floors/:floorId/work-orders` → 목록 + 상세(ConstructionReport). (AuditLog 재사용 시 entityType='Floor' + context.constructionReport.)
- `useCommitWorkingCopy`: commit 성공 후 활성 층 설계서 계산(report-preview 재사용) + overrides → 아카이브 저장 호출. (변경 0이면 생략.)

- [ ] **Step 3: 이력 UI**

- `useWorkOrders(floorId)`: 목록 조회. `WorkOrderHistoryPanel`: 일시·작성자·요약(N건) 목록 → 클릭 시 아카이브 ConstructionReport를 `ReportView`(읽기 모드).
- `Toolbar.tsx`: "이력" 버튼 → WorkOrderHistoryPanel 토글.

- [ ] **Step 4: 빌드 + Commit**

백 `npx tsc --noEmit`+`vitest run` / 프론트 `npx tsc --noEmit`+`vite build`+`vitest run src/features` → PASS.
```bash
cd /Users/jsk/1210/digital
git add backend/<commit/archive+조회 파일> frontend/src/features/workingCopy/useCommitWorkingCopy.ts frontend/src/features/report/WorkOrderHistoryPanel.tsx frontend/src/features/report/useWorkOrders.ts frontend/src/features/editor/components/Toolbar.tsx
git commit -m "feat(report): 커밋 시 설계서 아카이브 + 이력 패널(과거 작업지시서 조회)"
```

---

## Task 4: 구 흐름 제거 + 검증 + 스모크

**Files:** Remove/modify `editor/components/ChangeHistoryPanel.tsx` + `history/ReportView`의 log.context 의존 경로 + 시계 버튼 잔여, `useFloorAuditLogs`(이력 전용분 정리 — version-restore 유지)

- [ ] **Step 1: 구 흐름 정리**

- `ChangeHistoryPanel`(시계→버전→탭) 제거 또는 WorkOrderHistoryPanel로 대체. 시계 아이콘 버튼 제거(설계서/이력 버튼으로 대체됨).
- `ReportView`의 `log.context.constructionReport` 의존 진입 제거(이제 프리뷰/아카이브 소스). ReportView 컴포넌트 자체는 재사용(소스만 교체).
- `useFloorAuditLogs`: version-restore(stageReplaceFloorFromSnapshot)용 부분은 유지, 깨진 이력/설계서 진입만 정리. grep `log.context.constructionReport\|ChangeHistoryPanel\|시계` 잔여 0.

- [ ] **Step 2: 검증**

`cd frontend && npx vitest run src/features src/components` + `npx tsc --noEmit` + `npx vite build`. `cd backend && npx tsc --noEmit` + `npx vitest run`. 모두 PASS.

- [ ] **Step 3: 브라우저 스모크 (필수)**

dev 5173. ① 평면도 설비/케이블 수정 → 툴바 **"설계서"** → 라이브 작업지시서(BOM·노무) 표시·수량편집·CSV. ② **저장** → 그 설계서 아카이브. ③ **"이력"** → 과거 작업지시서 목록·조회. ④ 변경 0 → "변경 없음". ⑤ 구 시계 흐름·"설계서 없음" 없음. ⑥ 회귀: 저장·undo·현황·연결·토폴로지.

---

## 최종 검증
- [ ] 백+프론트 tsc 0, 테스트 PASS, 빌드 ✓.
- [ ] grep: log.context.constructionReport·ChangeHistoryPanel 잔여 0.
- [ ] 브라우저 스모크 통과 — 도면 안 설계서 즉시 산출 + 이력 조회.

## 완료 기준 (spec §6)
- [ ] "설계서" 버튼 → 현재 변경 기반 작업지시서 즉시(서버 사전계산 의존 없음)
- [ ] 계산 백엔드 단일 소스(프리뷰=아카이브 동일)
- [ ] 커밋마다 아카이브 → 이력 조회, 구 흐름 제거, 단위=활성 층
- [ ] 회귀 없음

## 이후
- 과거 버전 캔버스 프리뷰, PDF/관급 양식, 다층 분할.
