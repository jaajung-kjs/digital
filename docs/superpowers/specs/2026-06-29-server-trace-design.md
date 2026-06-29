# 서버 트레이스 재구축 설계 (데이터 스코프 최적화 ①)

## 1. 배경 / 목표

데이터 스코프 아키텍처 로드맵의 첫 조각. 현재 cable trace 는 **클라이언트가 전역 그래프(전 변전소 자산+케이블)를 메모리에 통째로 들고** 계산한다(`useTraceGraph` → `cableTrace`/`projectTrace`). 이게 demand-paged 전환의 **유일한 차단막**이다 — 전역 피드를 떼어내려면 trace 가 전역 그래프에 의존하지 않아야 한다.

**목표:** trace 계산을 서버로 옮겨 **클라이언트의 전역 케이블 그래프 의존을 제거**한다. **규칙(역할/채널 순회 로직)은 바꾸지 않는다** — 현재 버그 없음. 바꾸는 것은 *실행 위치*(클라 → 서버)와 *데이터 공급*(전역 적재 → 서버가 경계 잡아 반환)뿐. 안정 계약 뒤에 두어 스케일 시 실행을 교체할 수 있게 한다.

**비목표:** 전역 *자산* 피드 제거·demand 로딩(Phase 3), 피커 서버검색(Phase 4), trace 규칙 변경, materialize. trace projection(ring/tree/internalTrees) 규칙은 클라 TS 에 유지(진화 자유).

## 2. 핵심 결정

- **D1. 서버가 "경계 잡힌 연결요소"를 반환, 클라가 projection.** 서버는 `cableTrace`(원시 도달 집합)만 계산해 *작은 component* 를 반환. `projectTrace`/`buildInternalPath`(ring·tree·internalTrees — 유동 규칙)는 **클라 TS 에서 그 작은 component 위에서** 실행. → 유동 규칙은 프론트에 유지(가장 고치기 쉬움), 전역 의존만 제거.
- **D2. 규칙 코드는 그대로 재사용.** `cableTrace`(+`roleAt`/`other`)를 백엔드로 **포팅(공유/복제)**. 알고리즘 무수정 → parity 테스트(서버 결과 == 기존 클라 `cableTrace`, 동일 시드)로 고정.
- **D3. 실행은 "그룹 케이블 fetch → cableTrace" (가장 단순).** 서버가 `WHERE groupId=G` (P0 인덱스) 케이블을 fetch ∪ overlay → 기존 `cableTrace` 실행. 현재 O(그룹)이나 85케이블엔 무의미. **안정 계약 뒤라 나중에 O(연결요소)/O(경로)/CTE/materialized 로 교체 가능**(스케일 시).
- **D4. committed ⊕ overlay (what-if).** 클라가 그룹의 staged 케이블(생성/수정/삭제) + staged 자산 역할을 동봉 → 서버가 committed 에 병합 후 순회 → 저장 전 편집 반영.
- **D5. 안정 계약.** 엔드포인트 입출력 고정 → 내부 실행 교체가 호출부에 무영향.

## 3. 엔드포인트 계약

```
POST /api/trace   (authenticate)
요청: {
  seedAssetId: string,
  groupId: string,
  overlay?: {                         // 저장 전 편집(없으면 committed만)
    cables:  { creates: TraceCable[], updates: {id, patch}[], deletes: string[] },
    assets:  { id: string, role: AssetRole | null }[]   // 역할 전이에 필요한 최소 자산
  }
}
응답: {
  nodeIds: string[],
  cableIds: string[],
  cables: TraceCable[],               // component 의 케이블(트레이스 필드만)
  nodes:  { id, name, role, substationId, substationName }[],  // projection 입력
  truncated: boolean
}
```
- 응답은 **경계 잡힌 component** 만(전역 ✗). 클라는 이걸로 작은 그래프를 만들어 `projectTrace`/`traceRemoteEndpoints` 실행.
- 페이로드 최소화: 트레이스가 실제로 읽는 필드만(코드조사 기준). 죽은 필드(steps/seedCableId 등) 미포함.

## 4. 서버 구현

- 새 `backend/src/services/trace.service.ts`: `trace({seedAssetId, groupId, overlay})`.
  - 그룹 케이블 fetch: `prisma.cable.findMany({ where: { categoryId: { in: <groupId의 카테고리들> } }, select: <트레이스 필드> })`. (cable 은 groupId 직접 없음 → category.groupId 경유; group→category id 목록 1회 조회 후 `categoryId in`.)
  - 끝점 자산 역할 fetch(role 전이용): 관련 자산 `select {id, assetType:{role}}`.
  - overlay 병합(committed − deletes ∪ creates, updates 적용) — TS 배열 연산.
  - 포팅된 `cableTrace(seed, groupId, assets, cables)` 실행 → {nodeIds, cableIds, truncated}.
  - 응답용 node 행(name/role/substation) 채워 반환.
- 라우트 `POST /api/trace` (authenticate). zod 검증.
- **포팅**: `cableTrace`·`roleAt`·`other`·`AssetRole` 를 백엔드로. 프론트 원본과 **동일 로직**(공유 모듈이 이상적이나 monorepo 빌드 복잡 → 우선 복제 + parity 테스트로 동기 보장; 후속에 공유 패키지화 검토).

## 5. 클라이언트 변경

- 새 훅 `useServerTrace(seedAssetId, groupId)`: overlay(스토어에서) 동봉 → `POST /api/trace` → component 반환. React Query 캐시 키 `['trace', seed, group, overlayHash]`(편집 시 자동 무효화).
- `projectTrace`/`buildInternalPath`/`traceRemoteEndpoints`: 입력을 **전역 `useTraceGraph()` 그래프 → 서버가 반환한 작은 component 그래프**로 교체. 규칙 코드 자체는 불변(작은 그래프 위에서 동일 실행).
- 소비처 전환(전부 async + 캐시):
  - `selectionHighlight`(선택마다) → seed 별 캐시.
  - `pathHighlightStore`(토폴로지 모달) → async.
  - 선번장 fiber register(`traceRemoteEndpoints` 행마다) → **뷰당 1회 component fetch 후 행 파생**(행별 N호출 ✗). 한 변전소 OFD/슬롯의 fiber 연결을 한 번에 받아 모든 행 도출.
- **전역 그래프(`useTraceGraph`)는 Phase 2 후에도 남는다** — 이름해소·OFD/자산 피커가 아직 사용(Phase 3/4 에서 제거). 단 trace 는 더 이상 전역 케이블에 의존하지 않음 → Phase 3 가 전역 케이블 피드를 제거할 수 있게 됨.

## 6. 스케일 / 전제

- 단일 trace = O(경로)(규칙이 묶음). 서버 fetch 는 현 구현 O(그룹)이나 안정 계약 뒤 교체 가능: O(연결요소)(raw 도달 프론티어) → CTE(선형경로, path-array) → materialized 토폴로지(측정 시).
- **전제(비협상)**: 케이블 IN/OUT 역할 데이터 완전성(비면 규칙이 못 묶어 flood). 스케일 시 입력검증 강화.

## 7. 리스크
- **async per-click 지연**: 트레이스가 서버 왕복 → 캐시(seed+overlayHash)·디바운스로 완화. component 가 작아 1쿼리·수ms.
- **parity**: 포팅 `cableTrace` 가 원본과 동일해야 함 → 동일 시드 결과비교 테스트 필수.
- **two-engine**: `projectTrace` 내부가 `cableTrace`+`buildInternalPath` 둘 다 호출. 서버는 `cableTrace`만 담당; 클라 projection 은 반환된 component 위에서 둘 다 재실행(작아서 무해). 서버/클라가 같은 cableTrace 결과를 내는지 parity 로 보장.
- **O(그룹) 서버 비용**: 현재 무의미, 스케일 시 계약 뒤 교체.

## 8. 검증
- parity 테스트: 시드들에 대해 서버 trace 결과(nodeIds/cableIds) == 기존 프론트 `cableTrace`.
- tsc 양쪽 0, vitest 전수.
- 스모크: 선택 하이라이트·토폴로지 모달·선번장 대국이 동일하게 표시(회귀 없음).
- 전역 케이블 의존 제거 확인: trace 경로가 `useTraceGraph().cables` 대신 서버 component 사용(grep).

## 9. 구현 단계 (plan 에서 분할)
- **T1** 백엔드: `cableTrace`+helpers 포팅 + parity 단위테스트(프론트 픽스처 재사용).
- **T2** 백엔드: `trace.service` + `POST /api/trace`(zod·authenticate) + 그룹/역할 fetch + overlay 병합.
- **T3** 프론트: `useServerTrace` 훅 + projection 을 서버 component 입력으로 전환.
- **T4** 프론트: 소비처 전환(selectionHighlight·pathHighlightStore·fiber register 뷰당1회) + 캐시.
- **T5** 회귀 + parity + 스모크. (전역 그래프는 잔존 — Phase 3 대상.)
