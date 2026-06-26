# 데이터 스코프 아키텍처 로드맵 (A1+ 확정)

작성 2026-06-26. 전문 대규모 자산관리 시스템 전환의 데이터 아키텍처 방향과 점진 경로. 모델 = **A1+** (demand-paged 읽기 + 클라 로컬-퍼스트 overlay + 서버 what-if 트레이스).

## 1. 한 줄 목표

현재 **"전 변전소를 클라에 통째로 올리고 변전소별 뷰는 클라에서 필터"**(CAD/Figma식 — 문서=전국망이라 unbounded) 구조를, 업계 표준(ArcGIS Utility Network·통신 OSP)인 **"서버가 토폴로지/트레이스 compute, 클라는 접근 시 demand 로드, 편집은 로컬 overlay + OCC 커밋"** 으로 옮긴다. **변전소 scope 휴리스틱을 영구 제거**하고 세 surface(자산편집·현황·조직트리)가 **단일 저장·단일 캐시**를 공유하게 한다.

## 2. 핵심 불변식: `read = base ⊕ overlay`

모든 읽기는 "기준 데이터(base) + 내 미저장 변경(overlay)"이다. overlay는 **base가 사는 곳에서 적용**된다 — 이것이 행동별/​scope별 분기를 없애는 단일 규칙이다.

| base 위치 | overlay 적용 |
|---|---|
| 클라 캐시(resident: 평면도·로드된 자산) | 클라에서 머지 = 현재 `effective` |
| 서버(resident 밖: 트레이스 전체그래프·미로드 변전소 검색/현황) | **overlay 동봉 → 서버가 `committed ⊕ overlay` 머지** ("what-if") |

→ 트레이스가 overlay를 보내는 건 *특례가 아니라* 트레이스의 base(전체 그래프)가 서버에 살기 때문. overlay 적용 위치는 **데이터 로컬리티(resident인가)가 기계적으로 결정** — 개발자가 행동마다 정하지 않는다. **분기 0, scope 정의 0, 행동별 헬퍼 0.**

## 3. 목표 아키텍처

워킹카피 = **단일 demand-paged identity-map 캐시**(읽기) + **클라 overlay**(미저장 편집, 로컬-퍼스트). 모든 기능은 **프리미티브 2종**의 조합.

**프리미티브:**
1. **엔티티 resolver** — `get(id)`, miss면 서버 page-in. `substationId`는 엔티티의 *필드*일 뿐 로딩 칸막이가 아님 → "변전소 너머" 범주 소멸.
2. **쿼리/검색/트레이스** — `query/search/trace(params)`. resident면 클라가, 아니면 서버가 `effective(committed ⊕ overlay)` 위에서 계산해 캐시에 hydrate.

**저장 (전 surface 동일):** `stage(change) → 클라 overlay`(즉시) → `commit(overlay → main, OCC)`.

| scope (= 쿼리 결과, 선언 아님) | 무엇 | 방식 |
|---|---|---|
| CATALOG | 종류·카테고리 | 전역 캐시 |
| ORG TREE | 본부/지사/변전소/층 메타 | 전역, **단일 스토어**, 작아서 eager 로드 |
| WORKING SET | 건드린 엔티티(resident set) | demand page-in + cold evict |
| TRACE | seed 연결요소 | 서버 재귀 CTE, **overlay 동봉(what-if)**, P0 cables 인덱스 |
| 현황(register) | 노드 하위 자산 | 노드 scope 서버쿼리(overlay 동봉) + pagination |

**유지(이미 표준 부합):** OCC 커밋(=ArcGIS branch-versioning 동형), 클라 로컬-퍼스트 편집, 카탈로그 전역캐시, 노드 scope 쿼리, identity-map 뼈대(`reconcileRows`), P0 무결성.

**바꿀 핵심 둘:** ① 트레이스를 서버(재귀 CTE, what-if)로, ② 전역 lite preload를 접근-시 page-in으로.

## 4. 세 surface = 한 스토어 위의 세 쿼리/편집 세트 (통일)

| surface | 같은 저장·캐시 위에서 도는 것 |
|---|---|
| 자산편집 | 공간/연결 쿼리(평면도·trace) — 자산·케이블 |
| 현황관리 | 노드 scope 리스트/집계 쿼리 — 자산 |
| 조직트리 | 계층 쿼리 — 본부/지사/변전소/층 |

셋 다 **동일 저장(stage→overlay→commit/OCC) + 동일 캐시(`effective` identity-map)**. 차이는 *쿼리·엔티티*뿐. "세 서브시스템"이 아니라 **하나의 엔티티 스토어 위의 세 뷰.**

**완전 통일을 위한 잔여 2건:**
- **카탈로그 커밋 통합** — 현재 `catalogCommit`이 `substationCommit`과 분리. 같은 overlay/OCC 경로로 접거나, 참조데이터라 의도적 분리 유지할지 결정.
- **조직트리 단일 스토어** — 현재 `organizationStore`(이름해석) ↔ `substationStore.saved`(편집) 중복 → 하나로(Phase 1).

## 5. 현 구조의 3 단층선 (진단)

1. **스케일** — 전역 피드(`/assets` slim + `/cables` **full**) + `useTraceGraph`가 ≥10 컴포넌트에서 각자 전역 그래프 빌드, `cableTrace`가 매번 전체 케이블 필터 → 수백~수천 케이블에서 붕괴.
2. **lite/full 이중 레이어** — `saved`가 전역-lite 스텁과 변전소-full을 `updatedAt`로만 구분 → "미로드 null vs 진짜 null" 혼동, 콜드엔트리 fallback 춤.
3. **백엔드/스토어 중복** — 같은 Asset 5경로 3shape, `/connections`–`/workingcopy` 케이블 이중, floor 케이블 로직 복붙, org tree 2스토어, auth 불일치.

## 6. A1+ vs A2 결정 (왜 A1+)

A2 = 서버 draft(미저장 편집을 서버에 즉시 영속). A1+ = 미저장 편집을 클라 overlay에 두고 서버 읽기 시 동봉.

**사용자 입장 차이는 "저장 전 트레이스 반영"이 아니다 — A1+·A2 둘 다 즉시 반영(what-if).** 진짜 차이:
- **A1+**: 편집 즉시 반응(로컬, 네트워크 0) ↔ 크래시 시 미저장 유실(IndexedDB로 보강 가능).
- **A2**: 미저장 작업 서버 안전/이어하기/협업 ↔ 편집마다 서버 지연 위험 + 버전관리 계층(최다 코드).

**대규모 데이터 ≠ A2 필요.** 스케일은 demand-paging + 서버 트레이스로 해결(A1+가 가짐). A2는 *데이터 규모가 아니라* **편집 세션 요구**(다중사용자 동시편집 + 미저장본 공유/복원, 또는 수천건 대량편집)가 하드 요구가 될 때만.

**결정: A1+.** 드래그 많은 인터랙티브 에디터엔 로컬-퍼스트가 가치 크고, A1+가 균일성(불변식 §2)은 거의 같이 얻으면서 버전관리 계층을 피한다. **A2는 다중사용자 동시편집·미저장공유가 필수가 되면 재검토**(A1+ 위에 얹는 증분 — base⊕overlay 불변식 유지되므로 전환 비파괴적).

## 7. 정직한 트레이드오프 (현재 vs A1+)

**개선:** ① 스케일 천장 제거(resident set bounded + 서버 트레이스) ② scope 휴리스틱 영구 제거(불변식 1개) ③ lite/full 레이어 삭제(콜드엔트리 fallback 소멸) ④ 단일 저장/캐시로 세 surface 통일.

**비용(정직히):**
- 서버 복잡도 ↑ — 재귀 CTE 트레이스 + projection 이식(현 클라 도메인로직), 검색/리스트 엔드포인트, 중앙 `effective(committed,overlay)` 머지 헬퍼.
- 트레이스/원거리 읽기가 네트워크 왕복(인메모리보다 느림 — 캐시/디바운스로 완화).
- **순 코드는 줄지 않음** — lite/full·전역피드 삭제분 vs demand-paging·서버트레이스·overlay머지 추가분이 ≈상쇄. **②의 이득은 LOC 감소가 아니라 스케일+균일성.** (A2였다면 코드 순증; A1+는 ≈중립.)
- 현 규모(66자산·85케이블)에선 스케일 실익 0 → **②는 스케일 트리거**, 지금 착수는 과투자.

**별개로 ① 정리(Phase 1)는 순수 이득·코드 감소·저위험 → 지금.**

## 8. 점진 로드맵 (non-breaking, 단계별 독립 출하)

### Phase 0 — 무결성 (완료, main 머지)
unique·enum·FK·인덱스. cables 인덱스 = Phase 2 서버 트레이스 토대.

### Phase 1 — 정리 (지금, 저위험·아키텍처 변경 없음·코드 감소)
- 같은-scope 중복 엔드포인트 통합(`/substations/:id/assets` vs `/nodes/:id/assets`), `/connections`–`/workingcopy` 케이블 이중 제거.
- floor 케이블 6-way OR 로직 공유(`getByFloorId` ↔ `getPlan` 복붙 제거).
- **org tree 단일 스토어화**(split-brain 해소).
- auth 일관화.
- **slim cable DTO**(`cableService.listAllSlim`) — Phase 2 전 페이로드 완화 + 트레이스 응답 shape 선행.

### Phase 2 — 서버 트레이스 (linchpin, 스케일-트리거)
- `POST /api/trace { seedId, group, overlay }` — Postgres **재귀 CTE**로 `committed ⊕ overlay` 연결요소 계산(P0 인덱스). node/cable id + 최소필드.
- overlay는 작은 미저장 변경(staged 케이블/자산 최소필드) → CTE에 `VALUES`로 주입. 저장 전 편집 반영.
- 클라 projection(ring/tree/steps) 단계적 서버 이전 또는 서버 subgraph 입력. **병행 검증 후 전환(플래그).**

### Phase 3 — demand 로딩 (전역 preload 제거, Phase 2 의존)
- `useHydrateGlobal`(전역 lite preload) → 접근-시 page-in(변전소 열기/트레이스결과/검색이 캐시 hydrate).
- **lite/full 레이어 삭제**(단층선 ② 해소).
- resident set = 건드린 변전소(+연결한 대국). **cold evict** → 메모리 bounded.
- 서버 읽기(현황·검색)도 overlay 동봉 + 중앙 머지(페이지네이션 서버 처리).

### Phase 4 — 검색 프리미티브 (피커, Phase 3 의존)
- `searchAssets({ substationId?, role?, q })` 서버 엔드포인트. 자국/대국/케이블끝점 피커가 전부 *하나*를 scope 인자만 달리해 사용 → 케이스별 헬퍼 소멸.
- 대국 변전소 특정(OPGW twin 유도/사용자 선택)은 도메인 규칙으로 선번장 기능에 위치(스코프 헬퍼 아님).

### (병행·독립)
- 카탈로그 커밋 통합 / 조직트리 단일화(일부 Phase 1).
- P2 네이밍 정리, P3 기능(명판·생애주기·WorkOrder·문서·RBAC). **이력보존(retire/C안)은 데이터 입력 종료 후**(사용자 지시).

## 9. 트리거 (지금 vs 나중)

| 단계 | 시점 | 근거 |
|---|---|---|
| Phase 1 정리 | **지금** | 저위험·코드감소·혼란 제거 |
| Phase 2→4 아키텍처 | 케이블 수백~수천 근접 / 트레이스 체감 저하 | 현 규모엔 불급. Phase 1·P0가 토대 |
| 카탈로그·org 통일 | Phase 1 동반 | 단일 저장/캐시 완성 |
| P2/P3 | 독립, 우선순위대로 | 이력보존만 보류 |

## 10. 비목표 / 결정

- 별도 그래프DB 도입 안 함 — Postgres 재귀 CTE로 충분.
- 세 surface UX(조직트리·현황·자산관리)는 최종 구조 유지 — 바뀌는 건 뒤의 데이터 로딩뿐.
- **A2(서버 draft)는 보류** — 다중사용자 동시편집·미저장공유·크래시복원이 하드 요구가 될 때만, A1+ 위 증분으로(불변식 유지 → 비파괴).
- big-bang 금지 — 각 Phase 독립 출하·검증.

---

**요약:** 모델 = **A1+** (단일 불변식 `read = base ⊕ overlay`, demand-paged 읽기, 클라 로컬-퍼스트 편집, 서버 what-if 트레이스). 세 surface가 단일 저장·캐시 공유, 변전소 scope 휴리스틱 소멸. 잘 된 부분(OCC·카탈로그·노드쿼리·identity-map·P0)은 유지. 지금은 Phase 1(정리, 순수 이득)부터, 스케일이 다가오면 Phase 2(서버 트레이스)→3(demand)→4(검색) 순. ②는 코드를 줄이는 게 아니라 *스케일+균일성*을 얻는 교환임을 명시.
