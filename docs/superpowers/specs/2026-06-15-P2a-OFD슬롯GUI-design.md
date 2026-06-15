# P2a — OFD 슬롯 GUI (랙 동형 경로슬롯 타일) Design

**작성일:** 2026-06-15
**상태:** 설계 확정(사용자 승인) → 구현 플랜 대기
**큰 그림:** OFD↔랙 통합 UI 2-a단계. 후속: P2b(슬롯 포트 GUI), P3(연결 피커 통일).

## 배경 / 문제

OFD 상세의 "경로" 섹션(`OfdPathsView`→`FiberRouteManager`)이 빈약하다: **"광 경로" 소제목 + 비클릭 테이블 행 + 맥락 없는 라벨**(대국명 또는 'OFD'). 사용자는 OFD를 **랙처럼**(랙이 모듈을 타일 그리드로 보여주고 클릭하면 그 자산으로 이동하듯) 경로슬롯을 시각 관리하길 원한다. 정찰 결론: 랙 슬롯그리드는 slotIndex(12 U-위치) 기반이라 *그대로*는 못 쓰지만, **타일 + 클릭→선택 + "+추가 피커" 패턴은 공유 가능**. OFD 경로슬롯은 번호 위치가 없는 "경로 집합"이라 **타일 세트**(그리드 아님)로 표현한다.

기존 자산(P6): OFD-SLOT = conduit 자식(경로당 1개), OPGW(IN-IN, `specParams.cores`=용량). 경로 생성/삭제 순수 로직(`buildRouteCreate`/`routeDeleteIds`, `fiberWrite.ts`)·피어 OFD 목록(전역 slim)은 `FiberRouteManager`에 이미 있다 — P2a는 이를 **타일 GUI로 재구성** + P1에서 미룬 정리(클릭 이동·"출발-대국" 라벨·"광 경로" 삭제·코어수 24/48 흡수).

## 목표

OFD 상세 "경로" 섹션을 **경로슬롯 타일 GUI**(`OfdSlotGrid`)로 재작성: 슬롯 타일(출발-대국 + N코어, 클릭→슬롯 자산 이동[P1 eyebrow 동작]), "+ 슬롯 추가"(대국 OFD + 코어수 24/48), 슬롯 삭제. 공유 프레젠테이션 `SlotTile`(P2b 포트 타일도 사용). 경로 생성/삭제 순수 로직 재사용(무변경).

**비목표:** 슬롯 포트 GUI(P2b). 연결 피커 통일(P3). 랙 ModuleCell을 SlotTile로 리팩토링(랙은 이번엔 그대로 — 위험 격리). slotIndex 기반 위치 배치(경로슬롯은 위치 없음).

## 아키텍처

### A. 공유 `SlotTile` (프레젠테이션, 신규)
`features/connections/registerGrid/` 또는 `components/` 에 `SlotTile.tsx`. ModuleCell의 룩(페이스플레이트 타일) 차용하되 **순수 표시 + onClick**(드래그/슬롯 없음).
```tsx
interface SlotTileProps {
  title: string;            // "원주S/S - 홍천S/S" (또는 포트번호 P2b)
  subtitle?: string;        // "24코어" (또는 점유자명 P2b)
  state?: 'occupied' | 'empty';   // 빈 타일은 점선/faint
  selected?: boolean;       // selectedAssetId 일치 시 강조(그리드 선택행과 동일 토큰)
  onClick?: () => void;
  onDelete?: () => void;    // 있으면 호버 시 삭제 버튼(stopPropagation)
}
```
- 선택 강조 = 기존 선택 토큰(`bg-info-bg`/ring). 호버 삭제 = 랙 모듈 삭제 패턴(opacity-0 group-hover, stopPropagation).

### B. `OfdSlotGrid` (신규, `FiberRouteManager` 대체)
`features/fiber/components/OfdSlotGrid.tsx`. OFD의 conduit 자식(경로슬롯)을 타일 그리드로.
- **데이터:** `assets.filter(parentAssetId===ofdId && connectionKind==='conduit')`(슬롯), `useTraceGraph`(라벨), `useEffectiveCables`(OPGW cores·삭제), `useSelectionStore`(선택), 피어 OFD = 전역 slim(`['assets-slim']`), `useAssetTypeIdByCode('OFD-SLOT')`·`useCableCategories`(CBL-OPGW).
- **슬롯 타일:** 각 슬롯 = `<SlotTile title={출발-대국} subtitle={`${cores}코어`} selected={selectedAssetId===slot.id} onClick={()=>setSelectedAssetId(slot.id)} onDelete={()=>deleteRoute(slot)} />`.
  - 출발 = `graph.subNameById.get(ofdId)`, 대국 = `remoteSlotSubstation(slot.id, graph)`. `${local ?? ''} - ${remote ?? slot.name}`.
  - cores = 슬롯의 OPGW `specParams.cores`.
- **"+ 슬롯 추가" 타일:** 클릭 → 추가 폼(피어 OFD 선택 + 코어수). 코어수 = `[24][48]` 빠른 버튼 + 자유 입력. 대국 선택 시 `buildRouteCreate({localOfd, remoteOfd, cores, slotTypeId, opgwCategory, ids})` → `put('assets', 슬롯A/B)`·`put('cables', OPGW)`. (P6 로직 그대로.)
- **삭제:** `routeDeleteIds(slot.id, twinId, cables)` → 확인 후 `remove`. (P6 로직 그대로.)
- **"광 경로" h4 없음.** 섹션 제목은 spatial section 라벨 "경로"(resolveSpatialSection)가 담당.

### C. 마운트
`OfdEquipmentPanel.tsx`의 `OfdPathsView`: `<FiberRouteManager>` → `<OfdSlotGrid ofdId={equipmentId} />` 교체. `<PathTraceDetail />` 유지. 구 `FiberRouteManager.tsx` 삭제(로직은 OfdSlotGrid로 이전, 순수 함수는 fiberWrite 그대로).

## 데이터 흐름
```
OFD 상세 "경로" 섹션 → OfdSlotGrid(ofdId)
  슬롯 타일 클릭 → setSelectedAssetId(slot) → 통합 패널이 슬롯으로(eyebrow=OFD, P1)
  "+슬롯추가" → 대국+코어수(24/48) → buildRouteCreate → put 슬롯2+OPGW → overlay → 커밋
  타일 삭제 → routeDeleteIds → remove
```

## 엣지/에러 처리
- **클릭 vs 삭제:** SlotTile 삭제 버튼 stopPropagation(타일 클릭=이동 안 트리거).
- **staged 슬롯(커밋 전):** 라벨 대국명은 slim 피드 기반이라 커밋 전엔 폴백(slot.name) — P6 알려진 한계(여기서도 동일, 커밋 후 정확). cores는 staged OPGW specParams에서 즉시.
- **slotTypeId/opgwCategory 로딩:** 추가 버튼 disabled + 안내(기존 FiberRouteManager 패턴).
- **선택 강조:** selectedAssetId===slot.id 인 타일만 강조(그리드 선택행과 동일 UX).
- **삭제 확인:** 코어 연결 N개도 함께 삭제 경고(기존).

## 테스트 전략
- **SlotTile:** 단위 — title/subtitle/selected/empty 렌더, onClick·onDelete(stopPropagation) 호출.
- **OfdSlotGrid:** 컴포넌트 — 슬롯 타일 렌더(출발-대국·N코어), 타일 클릭→setSelectedAssetId, "+추가"→대국 선택→buildRouteCreate put(슬롯2+OPGW), 24/48 버튼→cores, 삭제→remove. (FiberRouteManager 기존 테스트 있으면 이전/대체.)
- **빌드/타입:** 프론트 tsc + build + 전체 vitest green.
- **수동 스모크:** OFD 상세 "경로" → 타일 그리드, "출발-대국/N코어", 타일 클릭→슬롯 패널(eyebrow=OFD), "+슬롯추가"(24/48), 삭제. "광 경로" 없음.

## 비목표 (YAGNI)
- 슬롯 포트 GUI(P2b). 연결 피커 통일(P3). 랙 ModuleCell 리팩토링. 경로슬롯 위치 배치/드래그.

## 단계 분해(플랜 예고)
1. 공유 `SlotTile`(프레젠테이션) + 단위테스트.
2. `OfdSlotGrid`(슬롯 타일·추가 24/48·삭제·클릭 이동, fiberWrite 재사용) + OfdPathsView 재배선 + 구 FiberRouteManager 삭제 + 테스트.
3. 검증 + 최종 리뷰.
