# 통합 가닥(strand) 트레이스 — 케이블-시드 단일 추적 설계

## 1. 배경 / 목표

토폴로지가 깨진 근본 원인(커밋·DB로 확인):
- `b2d8936`(서버트레이스 ①)에서 토폴로지를 **전역 그래프 → 서버 component** 로 옮겼는데, 그 component 를 **자산(선택 케이블의 슬롯)에 시드**한다. cableTrace 는 자산에서 **모든 코어로 fan-out** 하고, 슬롯 시드는 코어번호를 잃어 OPGW 건너편(대국) 패치가 채널매칭에서 잘려나간다 → 빈 경로.
- 더해서 추적이 **3겹**(`cableTrace` 도달집합 / `buildInternalPath` 별도 경로엔진 / `projectTrace` 토폴로지)이라 복잡하고, fan-out 이 하이라이트·토폴로지에 공통 전염.

**목표:** 추적을 **선택한 케이블 한 가닥(strand)** 에서 출발해 **물리적으로** 따라가는 **단일·케이블-시드** 추적으로 통합한다. 채널매칭(코어 N↔N)=물리 진실은 유지. **서버 권위**(서버가 가닥 전체를 cross-substation 까지 계산해 반환)로 두어 demand-paging(전역 그래프 없음)과 일치.

**핵심 결과:** 포트 17 → 가닥 17 → 양구(연결). 포트 1 → 가닥 1 → 양구에 패치#1 없음 → dead → 빈 경로(정상). 1,2 와 17,18 안 섞임. 하이라이트·연결상세·토폴로지가 항상 같은 가닥(일치).

**비목표:** 케이블/코어 스키마 변경(현 `number`=물리 코어로 충분), 그래프 레이아웃(SPQR/ring) 알고리즘 자체.

## 2. 핵심 결정

- **D1. cableTrace 를 케이블-시드 + 채널 격리로.** 시드 = 자산이 아니라 **케이블**. 스택을 시드 케이블의 두 끝점으로 초기화하되 `via=seedCable, ch=seedCable.number` 로 — 첫 홉부터 코어번호 제약. 결과: 형제 코어로 fan-out 안 함, OPGW 건너편은 같은 코어만(물리 가닥). 이게 **유일한 추적 엔진**.
  - passive 끝(설비): `via.number` 제약 → 같은 번호/번호없는 패치만 → 형제 코어 차단(자연 격리).
  - slot 끝: 기존 규칙(OUT→IN OPGW, ch 전달; IN→OUT 같은 코어) — 시드가 ch 를 주므로 슬롯-시드 채널-null 문제 소멸.
- **D2. 서버 권위 strand 트레이스.** `POST /api/trace { seedCableId, overlay? }`. 서버가 시드 케이블의 group 으로 후보 케이블 fetch ⊕ overlay → `cableTrace(seedCable)` → **가닥 전체**(cross-substation 포함) 반환: nodes(id·name·role·substationId/Name·floorId·parentAssetId·slotIndex) + cables. 클라는 전역 그래프 불필요.
- **D3. 클라는 한 가닥을 세 가지로 렌더(엔진 추가 0).** 같은 strand 결과에서:
  - **하이라이트** = 현재 층의 strand nodes/cables(배치자산 칠).
  - **연결상세** = strand 의 순서 경로(도면 안쪽 구간).
  - **토폴로지** = strand 의 도면 밖 구간(변전소별 그래프).
- **D4. 중복 제거.** `buildInternalPath`(2번째 엔진) 삭제, `projectTrace` 의 자산 fan-out 제거. strand 가 곧 경로이므로 경로 트리는 strand 에서 파생. 레이아웃(collapse/ring)은 strand-격리된 결과 위에서 동작(단일 가닥은 사실상 직선이라 ring 희소).
- **D5. resolveCableSeed 단순화.** 클라는 `seedCableId` 만 보냄(자산+group 해소 불필요 — 서버가 케이블에서 group 도출). staged 시드 케이블(temp)도 overlay 로 서버에 전달돼 해소.

## 3. 데이터 흐름

```
선택 케이블(포트 17) → POST /api/trace { seedCableId: 패치#17, overlay }
  서버: 시드 케이블 group "광" 후보 fetch ⊕ overlay → cableTrace(패치#17, ch=17)
       → 가닥17: 인제설비—패치17—인제슬롯—OPGW(17)—양구슬롯—패치17—양구설비
  ← { nodes:[...floor/sub/name...], cables:[...] }   // 가닥 전체, cross-sub
클라 렌더:
  하이라이트 = 가닥 노드 중 현재 층 배치자산
  연결상세   = 가닥 순서 경로(현재 변전소 구간)
  토폴로지   = 가닥의 도면 밖(타 변전소) 구간 그래프
```
모든 뷰가 같은 strand 하나에서 파생 → 항상 일치. 포트 1 = 가닥1(양구 패치 없음→dead→빈경로).

## 4. 단계 분해 (phased — 각 독립 출하·검증)

- **U1 — 케이블-시드 strand 트레이스(정정).** cableTrace 케이블-시드+채널격리(BE/FE parity) + 서버 `POST /api/trace { seedCableId }` strand 반환 + 클라 호출부(selectionHighlight·pathHighlightStore·useCableComponentGraph) 가 seedCableId 전달. **이것만으로 버그 해소** — component 가 strand-격리되므로 기존 projectTrace/buildInternalPath/하이라이트가 그 위에서 자동으로 가닥만 산출(형제 코어가 component 에 없어 fan-out 무효).
- **U2 — 클라 렌더 통합.** 하이라이트·연결상세·토폴로지를 strand 결과에서 직접 파생하는 단일 렌더로.
- **U3 — 중복 제거.** `buildInternalPath` 삭제 + `projectTrace` fan-out/자산-시드 잔재 제거 + 자산-시드 cableTrace 경로 제거.

순서 필수(U1 정정 먼저). U1 후 시스템은 올바르게 동작(버그 fix); U2·U3 는 사용자가 원한 단순화(복잡도 제거).

## 5. 리스크
- **cableTrace 시드 시그니처 변경**: 자산-시드 → 케이블-시드. 모든 호출처(서버 trace.service, 클라 projectTrace 내부)를 일관 변경 + parity 테스트. 자산-시드 잔여 사용처 grep 확인.
- **서버 API 변경**(seedAssetId+groupId → seedCableId): 통합테스트 갱신, 클라 3 호출부 동시 전환.
- **staged 시드 케이블**: temp id 시드는 overlay 에서 서버가 찾아야 함(merge 후 seed 조회).
- **레이아웃**: 단일 가닥은 직선 → ring/SPQR 거의 안 쓰임. 레이아웃 엔진은 유지(직선도 처리), 입력만 strand.
- **U1 후 U2/U3 전까지 과도기**: projectTrace/buildInternalPath 가 strand 격리 component 위에서 도므로 정상(중복은 남아있되 동작 정확). 비파괴.

## 6. 검증
- BE/FE cableTrace parity(케이블-시드, 채널격리) — 인제/양구 패턴(포트17 연결, 포트1 dead) 포함.
- 서버 `POST /api/trace { seedCableId }` 통합: 가닥17 nodes 에 양구 설비 포함; 가닥1 은 양구 미포함(dead).
- 클라: 같은 seedCableId 로 하이라이트/연결상세/토폴로지가 동일 strand 반영. 포트 1≠포트 17.
- grep: 자산-시드 cableTrace 잔재 0(U3), `buildInternalPath` 0(U3).
- tsc·vitest 양쪽 전수. 스모크: 인제 17/18 토폴로지에 양구 표시, 1/2 빈경로.
