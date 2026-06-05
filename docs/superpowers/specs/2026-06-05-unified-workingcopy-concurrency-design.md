# Lv1 설계 — 통합 워킹카피 + 낙관적 동시성 커밋

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 범위: 대규모 리팩토링의 **토대 수직** — 모든 편집(도면 공간 + 대장 레지스터)을 워킹카피에 스테이징하고, 버전 대조로 동시 사용자 충돌을 막는 커밋 모델. (가) 패널 수렴·이후 모든 수직이 이 위에 올라간다.

---

## 1. 배경 / 문제

기존 git-like 워킹카피는 **단일 사용자 전제**다:
- **에디터**: 층 단위 워킹카피(saved=React Query + overlay=editorStore). Ctrl+S = `PUT /floors/:id/plan` 으로 "받은 상태=진실" reconcile. 머지·커밋 책임은 `features/workingCopy/` 로 중앙화됨(2026-06-02). **그러나 동시성 검사가 없다** — A·B 가 같은 층을 열어 편집 후 A 저장 → B 저장 시 B 의 reconcile 이 A 의 변경을 조용히 덮어쓴다(last-writer-wins).
- **레지스터(V1)**: 필드 편집마다 `PUT /assets/:id` **즉시 저장** — 워킹카피 밖, git-like 아님.

여러 사용자가 동시에 쓰는 시스템에서 이 둘 다 위험하다. 사용자가 택한 해법: **Lv1 — 모든 편집을 워킹카피에 스테이징 + 커밋 시 버전 대조로 충돌 거부.**

---

## 2. 목표 / 비목표

### 목표
1. **레지스터를 스테이징으로 전환** — 그리드/상세 패널 편집이 즉시 저장이 아니라 워킹카피에 쌓이고, "커밋" 한 번으로 원자 반영.
2. **커밋 시 낙관적 동시성 검사** — 내가 불러온 시점의 버전을 함께 보내고, 서버가 현재 버전과 대조. 하나라도 남이 바꿨으면 **커밋 거부(409) + 충돌 항목 반환**. 커밋은 원자적(전부 성공 또는 전부 거부).
3. **에디터 커밋에 동일 검사 추가** — 층 단위 버전 대조.
4. **충돌 UX** — 충돌 항목 표시 + "최신 불러오기" 후 재검토·재커밋.
5. 워킹카피 메커니즘을 도면·레지스터가 **같은 패턴**으로 공유.

### 비목표 (Lv2+/후속)
- 사용자별 명명 브랜치·세션 넘는 초안·타인 초안 열람(Lv2).
- 자동/수동 3-way 머지(Lv3).
- 실시간 협업(WebSocket 푸시·잠금).
- (가) 패널 컴포넌트 수렴 — 이 토대 위에서 별도 진행.
- 충돌 시 필드 단위 자동 머지 — Lv1 은 항목 단위 거부 + 수동 재검토.

---

## 3. 핵심 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 충돌 토큰 = **기존 `updatedAt`**(엔티티) / `Floor.updatedAt`(층) | 모든 모델에 Prisma `@updatedAt` 존재 → **스키마 추가 0**. 낙관적 동시성의 표준 토큰. |
| 충돌 검사 단위 = **커밋 단위를 따름** | 레지스터 커밋은 자산 단위 → **자산별 `updatedAt`**(거짓충돌 최소, 남이 다른 장비 건드려도 통과). 에디터 커밋은 층 원자 → **층 `updatedAt`**(층 전체가 워킹카피 단위라 자연스러움). |
| 커밋은 **원자적 all-or-nothing** | 부분 적용은 일관성 깨짐. 충돌 1건이라도 있으면 전체 거부 → 사용자가 최신 보고 재시도. |
| 레지스터를 즉시→스테이징으로 전환(V1 동작 변경) | 통합 git-like 모델의 필수. 동시 안전·"현황은 커밋 단위로" 일관성. |
| 충돌은 **거부+수동 재검토**(자동머지 아님) | Lv1 약속. 단순·안전. 머지는 Lv3. |

---

## 4. 충돌 모델 (낙관적 동시성)

### 4.1 토큰
- 엔티티(Asset/Cable/FiberPath/DistributionCircuit): `updatedAt`(ISO 문자열) = 버전 토큰.
- 층(에디터): `Floor.updatedAt`(plan 커밋 시 항상 `tx.floor.update` 로 갱신되므로 어떤 변경이든 바뀜).

### 4.2 워킹카피가 기억하는 것
워킹카피 로드 시, 각 엔티티의 **base 버전(`updatedAt`)** 을 스냅샷한다(`baseVersions: Map<id, updatedAt>`). 신규(tempId)는 base 없음.

### 4.3 커밋 검사
커밋 요청은 변경/삭제 대상마다 **base 버전**을 동봉. 서버(트랜잭션 내):
- 각 update/delete 대상: 현재 `updatedAt` == base? 아니면 **충돌**.
- 충돌이 1건이라도 있으면 **롤백 + 409** `{ conflicts: [{ id, name, kind }] }`.
- 충돌 0건이면 전부 적용 + 응답(새 버전·idMap).
- 신규(create): base 없음 → 검사 없이 생성.
- delete 대상이 이미 서버에서 삭제됨(없음) → 충돌로 처리("남이 삭제함").

---

## 5. 레지스터 워킹카피 + 커밋 (가장 큰 신규)

### 5.1 프론트 — registerStore (변전소 단위 overlay)
`frontend/src/features/assets/store.ts`(신규, Zustand):
```
staged: {
  creates: Map<tempId, NewAsset>,
  updates: Map<assetId, Partial<AssetPatch>>,   // 누적 필드 패치
  deletes: Set<assetId>,
}
baseVersions: Map<assetId, updatedAt>           // 로드 시 스냅샷
```
- 그리드/상세 패널 편집 → `staged` 갱신(서버 호출 없음). 사진·점검은 예외(아래 5.4).
- **effective 상태** = merge(saved[React Query `['substation-assets', subId]`], staged). 그리드·패널은 effective 를 렌더.
- "미커밋" 표시: staged 비어있지 않으면 상단에 "N건 미커밋 · [커밋] [되돌리기]".

### 5.2 커밋 엔드포인트
`POST /api/substations/:substationId/assets/commit`:
```
{ creates: [{ tempId, assetTypeId, name, ... }],
  updates: [{ id, baseVersion, patch: {...} }],
  deletes: [{ id, baseVersion }] }
```
- 트랜잭션: §4.3 검사 → 충돌 시 409 `{conflicts}` → 없으면 create/update/delete 적용 → `{ idMap, updated: [{id, updatedAt}] }` 반환.
- 어드민 권한.

### 5.3 커밋 후처리
- 성공: idMap 으로 tempId 해석 → `setQueryData(['substation-assets'], merged)` 로 effective 미리 박기 → staged 비우기 → invalidate → baseVersions 갱신.
- 409: 충돌 UX(§7) 발동. staged 보존.

### 5.4 사진·유지보수는 스테이징에서 제외(즉시 유지)
사진 업로드(바이너리)·유지보수 이력은 git-like staging 에 넣지 않고 **즉시 저장 유지**(현행). 이유: 바이너리·append-only 기록이라 충돌·롤백 의미가 약하고, 도면 워킹카피도 사진을 `pendingUploads` 큐로 별도 처리. 패널에서 이 두 섹션만 즉시, 나머지(이름·속성·생애주기·설치/담당/상태)는 staged.

---

## 6. 에디터 커밋 버전 검사

`PUT /floors/:id/plan` 에 `baseFloorVersion`(로드 시 `Floor.updatedAt`) 동봉. 서버 reconcile 시작 시 현재 `Floor.updatedAt` == base? 아니면 **롤백 + 409** `{ conflict: 'floor', floorUpdatedAt }`.
- 프론트(`useFloorPlanData`/`commitWorkingCopy`): 로드 시 floor updatedAt 보관, 저장 payload 에 포함, 409 시 충돌 UX.
- `Floor.updatedAt` 은 plan 커밋마다 갱신되므로(현행 `tx.floor.update`) 별도 버전 칼럼 불필요.

---

## 7. 충돌 UX

409 수신 시 모달/배너:
- "이 항목을 다른 사용자가 먼저 변경했습니다: ○○, △△"
- 버튼: **[최신 불러오기]** — saved 를 refetch(`invalidate`), staged 는 보존하되 충돌 항목을 하이라이트 → 사용자가 보고 결정(유지=재커밋 / 폐기=staged 에서 제거) → 재커밋.
- 에디터(층 단위): "도면이 다른 사용자에 의해 변경됨 — 최신 불러오기" → refetch 후 내 미커밋 변경 재적용 여부 안내(현행 DraftRecovery 와 유사 톤).
- Lv1 은 **항목 단위 수동 결정**, 자동 머지 없음.

---

## 8. 영향 받는 파일 (개요)

**Backend**
- 생성: `backend/src/services/assetCommit.service.ts`(자산 배치 커밋 + 충돌검사), 라우트 `POST /substations/:id/assets/commit` + 컨트롤러
- 수정: `floor.service.bulkUpdatePlan`(baseFloorVersion 검사) + `floors.routes`(zod)
- 공통: 충돌 검사 헬퍼(`assertNoConflict(tx, entity, id, baseUpdatedAt)`) 한 곳

**Frontend**
- 생성: `features/assets/store.ts`(registerStore overlay), `features/assets/merge.ts`(saved+staged 머지, 순수 TDD), 커밋 훅·충돌 UX 컴포넌트
- 수정: `SubstationAssetGrid.tsx`/`AssetDetailPanel.tsx`(즉시 mutate → staged), 미커밋 바·커밋 버튼; `useFloorPlanData.ts`/`commit.ts`(baseFloorVersion·409 처리)
- 충돌 모달 공통 컴포넌트

---

## 9. 테스트

- **백엔드 단위/통합**: 충돌검사(base 일치→적용, 불일치→409 롤백), 자산 배치 커밋(create/update/delete 원자), 에디터 plan 409. 기존 자산·계약(2a 라운드트립)·V1 테스트 회귀 없음.
- **프론트 순수 TDD**: `assets/merge.ts`(saved+staged effective), 충돌 응답→UI 상태 매핑.
- **수동 동시성 시나리오**: 두 탭으로 같은 자산 편집 → A 커밋 → B 커밋 → B 가 409 + 충돌 표시 → 최신 불러오기 → 재커밋 성공. 도면도 동일.

---

## 10. 성공 기준 (검증 가능)

1. 레지스터에서 이름·속성·생애주기·설치/담당/상태 편집이 **즉시 저장 안 되고** "미커밋"으로 쌓이며, [커밋]으로 원자 반영된다.
2. 두 사용자가 같은 자산을 동시에 편집·커밋하면 **나중 커밋이 409로 거부**되고 충돌 항목이 표시된다(덮어쓰기 없음).
3. "최신 불러오기" 후 재검토·재커밋이 가능하다.
4. 에디터 plan 커밋도 층이 그새 바뀌었으면 409로 막힌다.
5. 사진·유지보수는 즉시 저장 유지(스테이징 제외).
6. 충돌 0건일 때 커밋은 기존처럼 원활히 반영된다. 2a·V1 테스트 회귀 없음.

---

## 11. 구현 단계(plan 에서 분해)
1. 백엔드 충돌검사 헬퍼 + 자산 배치 커밋 엔드포인트(+테스트).
2. 프론트 registerStore + merge(순수 TDD) — 그리드/패널을 staged 로 전환, 미커밋 바·커밋.
3. 충돌 UX(409 모달 + 최신 불러오기).
4. 에디터 baseFloorVersion 검사(백+프론트) + 충돌 UX 재사용.
5. 검증·회귀.

## 12. 이후
이 토대 위에서 (가) 패널 수렴(도면·레지스터가 같은 패널, onPatch→공유 워킹카피 stage), 그다음 (나) 통합 워크스페이스, V2~V5 수직.
