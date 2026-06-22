# 유효상태(effective) 단일 SSOT 통합 — 설계

**목표:** 저장/미저장(커밋/스테이징) 갭에서 반복되는 버그를 구조적으로 제거한다. "화면에 보이는 자산·케이블"을 **단 하나의 effective selector**가 만들고, 모든 뷰가 그것만 읽는다. 서버 피드는 그 selector의 입력(hydration)일 뿐 뷰가 직접 읽지 않는다.

**아키텍처 한 줄:** *committed feed → 워킹카피 saved(전역 캐시) → effective = saved ∪ overlays − deletes → 모든 뷰.* 단방향.

---

## 문제 (현재 구조)

같은 진실이 4곳에 존재한다:

| # | 표현 | 범위 | 출처 |
|---|---|---|---|
| 1 | React Query 커밋 피드 (`['assets-slim']`/`['cables']`) | 전역(모든 변전소), 경량 9필드 | `/assets`,`/cables` |
| 2 | 워킹카피 `saved` | 전역(방문한 변전소만), 상세 | `/substations/:id/workingcopy` |
| 3 | 워킹카피 `overlays`(스테이징) | 전역 | 사용자 편집 |
| 4 | `useNodeAssets` (`['nodeAssets',...]`) | 노드(HQ/지사/변전소) 하위, 상태 포함 | `/nodes/:id/assets` |

→ #4(현황뷰가 사용)도 또 다른 커밋 소스. 피드가 4개로 산재해 소비처마다 다른 걸 읽음.

**결함:** "effective(커밋 ∪ 스테이징 − 삭제)"를 만드는 단일 지점이 없다. 소비처마다 부분집합을 골라 직접 머지한다:
- `useSlimAssets`/slimQ = #1만 → **스테이징(#3) 누락** = "저장해야 보임"
- `useEffectiveAssets` = #2∪#3 → 안 둘러본 변전소 누락
- `useTraceGraph` = #1 ∪ (#2∪#3) 즉석 머지 → 유일하게 "대충 맞음"

→ 새 기능마다 머지를 재구현, 대개 한 소스만 읽어 갭 발생 → 헬퍼로 수습 → 다음 기능 또 갭. **악순환.** (방금 OfdSlotRail·EquipmentSelectCell·이름해소도 소비처 단위 패치였다.)

## 목표 구조

**워킹카피를 유일한 클라이언트 SSOT로.** 피드 #1은 saved를 채우는 hydration 입력이 되고, 뷰에서 직접 사라진다.

1. **saved = 전역 커밋 캐시.** 두 소스로 hydrate:
   - 앱/작업공간 진입 시 **전역 slim 피드**로 *경량 행*(모든 변전소) 시드.
   - 변전소 열람 시 `/workingcopy`로 그 변전소 행을 *상세*로 승급(merge by id).
   - 즉 saved 행은 **경량(미방문)** 또는 **상세(방문)** — id·substationId·name·code·connectionKind·parentAssetId·slotIndex는 항상 존재(slim 보장), 상세 필드는 방문 후 채워짐.
2. **effective = saved ∪ overlays − deletes**, 전역. `useEffectiveAssets()`/`useEffectiveCables()`가 **유일한 읽기 API**.
3. **buildTraceGraph(effectiveAssets, effectiveCables)** — slim+staged 이중 머지 제거, 단일 입력. 이름은 이미 effective 행의 substationName(slim 보장) + org 트리 맵(Fix A)으로 해소.
4. **피드는 hydration 전용.** `useSlimAssets`·`useTraceGraph` 내부 slimQ/cableQ 직접 읽기 제거 → 워킹카피 hydration으로 대체. 커밋 후엔 피드 invalidate → saved 재-hydrate(기존 흐름 유지).
5. **가드레일.** ESLint `no-restricted-imports`로 `useSlimAssets`/피드 queryKey 직접 사용을 hydration 모듈 밖에서 **차단**. 새 기능이 구조적으로 갭을 못 만든다.

## 단위/경계

- **hydration 레이어** (신규, 단일 책임): 전역 slim + 변전소 상세를 saved에 병합. 피드를 읽는 **유일한** 곳.
- **effective selector** (`workingCopy/hooks.ts` 확장): saved∪overlay−deletes, 전역. 입력=saved/overlay 슬라이스, 출력=메모이즈 배열. 인터페이스 불변(기존 25 소비처 그대로).
- **traceGraph**: `buildTraceGraph`가 effective 단일 입력. `useTraceGraph`는 effective + org이름맵만 사용(피드 직접 읽기 삭제).
- **경량/상세 혼재 안전성**: effective를 쓰는 상세 소비처(상세패널·랙뷰 등)는 *방문한 변전소*만 다루므로 상세 필드 보장. 크로스-변전소 뷰(토폴로지·피커)는 경량 필드만 사용 → 안전. 이 불변식을 타입(예: `EffectiveAsset` = 필수 경량 + optional 상세)으로 명시.

## 마이그레이션 (각 단계 테스트 그린 유지 — 494 테스트가 안전망)

1. **saved 전역 시드**: 작업공간 진입 시 slim 피드로 saved 경량 행 시드(기존 per-substation load는 상세 승급으로 유지). effective가 전역으로 완성됨. *기존 동작 불변, 커버리지만 확대.*
2. **traceGraph 단일 입력화**: `buildTraceGraph`를 effective 단일 입력으로. `useTraceGraph` slimQ 제거. (Fix A/B로 이미 effective-친화적.)
3. **잔여 피드 직접 소비처 이전**: `useSlimAssets` 쓰는 곳(이미 2곳→0 목표) effective로. `pathHighlightStore`도.
4. **가드레일 추가**: ESLint 규칙. 위반 0 확인.
5. **죽은 피드 훅 제거**: `useSlimAssets` 등 hydration 외 미사용 확인 후 삭제.

## 에러/리스크

- **상세 필드 누락**(미방문 변전소 행을 상세 소비처가 읽음): 타입으로 상세=optional 명시 + 상세패널은 진입 시 해당 변전소 load 보장(기존 로직). 회귀 테스트로 커버.
- **메모이제이션/렌더 루프**: effective는 saved/overlay 슬라이스 ref에만 구독(기존 패턴 유지) — 전역화로 saved ref 변경 빈도↑ 가능 → 단계1에서 렌더 측정.
- **커밋 후 동기화**: 기존 invalidate→재load 경로 유지. 단계2에서 slimQ 제거 시 hydration이 invalidate를 구독하는지 검증.
- **롤백 용이성**: 단계별 커밋. 단계1만으로도 effective가 전역이 되어 Bug2류 재발 방지(가장 큰 효과).

## 테스트 전략

- buildTraceGraph 단일 입력 단위테스트(effective 한 배열로 동일 그래프 산출).
- effective 전역성: 미방문 변전소 자산이 effective에 경량으로 존재.
- 가드레일: ESLint 규칙 위반 시 빌드 실패(샘플 위반으로 검증).
- 회귀: 기존 494 + 크로스-변전소 staged(토폴로지·피커·라벨) 시나리오.

## 비목표(YAGNI)

- 서버 API 변경 없음(기존 `/assets`,`/cables`,`/workingcopy` 그대로).
- 워킹카피 commit/OCC/undo 로직 변경 없음.
- 상세 필드를 slim 피드에 추가하지 않음(경량 유지).
