# P1 — 부모 자산 eyebrow 보편화 + OFD 경로목록 정리 Design

**작성일:** 2026-06-15
**상태:** 설계 확정(사용자 승인) → 구현 플랜 대기
**큰 그림:** 이건 OFD↔랙 통합 UI의 1단계. P2(슬롯 포트 GUI + OFD 슬롯 GUI), P3(연결 피커 통일=슬롯선택은 랙 피커 재사용+포트선택 단계 추가)는 후속.

## 배경 / 문제

**문제 1 — 부모 자산 eyebrow가 평면도에서 일부 자식만 보인다.** 사용자 의도: *부모가 있는 자식 자산은 어디서 열든 항상 "부모로 가는" eyebrow가 보여야 한다.* 공유 패널 `AssetDetailPanel` + eyebrow `AssetBreadcrumb`(asset.parentAssetId 있으면 조상 체인 렌더, 클릭→해당 조상 선택)는 이미 보편 구현돼 있다. 그러나 **평면도 어댑터 `EquipmentDetailPanel` 이 `asset` 으로 랙 모듈만 해소**한다:
```ts
// EquipmentDetailPanel.tsx:37-43, 65
const moduleAsset = !localEq ? effectiveAssets.find(a => a.id===equipmentId && isRackModuleAsset(a)) : null;
asset={moduleAsset}   // 피더/OFD-슬롯은 isRackModuleAsset=false → null → eyebrow 안 뜸
```
- 랙 모듈: `isRackModuleAsset`=true → asset=모듈(parentAssetId 있음) → eyebrow ✓
- 피더·OFD-슬롯: `isRackModuleAsset`=false(slotIndex 없음) → asset=null → `AssetBreadcrumb` 안 뜸 ✗
- 배치 최상위 자산(localEq): asset=null이지만 parentAssetId도 없어 eyebrow 불필요(정상).
현황 경로(`StagedAssetDetailPanel`)는 asset을 제대로 넘겨 eyebrow가 잘 뜬다 — 그래서 "현황은 되고 평면도는 안 되는" 불일치.

**문제 2 — OFD 정보탭의 경로목록이 빈약/비클릭.** `FiberRouteManager`(OFD 상세 "경로" 섹션): 행이 **클릭 불가**(자식 슬롯으로 이동 안 됨), 라벨은 **맥락 없는 변전소 이름 하나**(대국명 또는 'OFD'), **"광 경로"** 소제목이 있음. 사용자 요구: 행 클릭→해당 슬롯 자산으로 이동, 라벨="출발변전소 - 대국변전소"(맥락), "광 경로" 삭제, 경로 추가 시 코어수 24/48 빠른 선택.

## 목표

(A) **eyebrow 보편화**: `EquipmentDetailPanel` 이 선택된 자산을 *제네릭하게* 해소해 넘기면, 부모 있는 자식(모듈·피더·슬롯)은 평면도에서도 어디서 열든 eyebrow가 뜬다(현황과 동일). (B) **OFD 경로목록 정리**: 클릭 가능(슬롯 이동)·"출발-대국" 라벨·"광 경로" 삭제·코어수 24/48 빠른 선택.

**비목표:** 슬롯 포트 GUI(P2). 연결 피커 통일(P3). 라벨에 단일 "#포트번호"(슬롯은 다포트 경로라 포트번호는 P2 포트 GUI에서; 경로 행은 출발-대국 + 코어수 맥락).

## 아키텍처 / 변경

### A. EquipmentDetailPanel — 제네릭 자산 해소 (eyebrow 보편화)
`moduleAsset`(랙모듈 한정) → **선택 자산을 id로 제네릭 해소**:
```ts
const asset = useMemo(() => effectiveAssets.find((a) => a.id === equipmentId) ?? null, [effectiveAssets, equipmentId]);
```
- `asset={asset}` 로 넘김 → `AssetDetailPanel` → `AssetBreadcrumb(asset)` 가 parentAssetId 있으면 eyebrow 렌더(모듈·피더·슬롯 전부). 최상위 배치 자산은 parentAssetId 없어 자연히 eyebrow 없음.
- **detailKind(공간 섹션) 로직은 유지**: 배치 설비(localEq)면 `kindOf` 기반, 미배치 자식(모듈/피더/슬롯)이면 null(P1엔 공간 섹션 없음 — 모듈은 원래 없고, 슬롯 포트 GUI는 P2). `isRackModuleAsset` 은 detailKind 판정(모듈=공간섹션 없음)에만 필요하면 유지, asset 해소엔 불필요.
- title: 미배치 자식이면 `asset.name`, 아니면 기존(로딩/equipment.name).

검증: 평면도에서 피더/슬롯/모듈 패널 열면 eyebrow 표시(부모 클릭→이동), 최상위 배치 자산은 없음. 현황 경로 무변경(이미 동작).

### B. FiberRouteManager — 경로목록 정리
1. **"광 경로" h4 소제목 삭제.** "+ 경로 추가" 버튼은 유지(우측 상단 또는 목록 위).
2. **행 클릭 → 슬롯 자산 이동**: 각 경로 행 `onClick={() => useSelectionStore.getState().setSelectedAssetId(slot.id)}` → 통합 패널이 그 슬롯으로(평면도/현황 공통, selectionStore). 삭제 버튼은 `onClick` stopPropagation 유지.
3. **라벨 "출발변전소 - 대국변전소"**: 출발 = OFD의 변전소(`graph.subNameById.get(ofdId)`), 대국 = `remoteSlotSubstation(slot.id, graph)`. `${local ?? ''} - ${remote ?? slot.name}` (없으면 slot.name 폴백). + 코어수 맥락(예: 우측에 `N코어` — OPGW specParams.cores). (단일 "#포트번호"는 경로 행엔 부적합 — 포트별은 P2 포트 GUI.)
4. **코어수 24/48 빠른 선택**: 경로 추가 폼의 코어수 입력 옆에 `[24][48]` 빠른 버튼(클릭 시 cores 설정) + 기존 자유 입력 유지.

(FiberRouteManager 는 OFD 상세 "경로" 섹션 = 현황·평면도 공유 컴포넌트라, 클릭 이동이 두 컨텍스트 모두에서 동작.)

## 데이터 흐름
```
[eyebrow] 자식 자산 선택(어디서든) → EquipmentDetailPanel(제네릭 asset 해소) | StagedAssetDetailPanel
   → AssetDetailPanel → AssetBreadcrumb(asset.parentAssetId) → 조상 체인 클릭 가능
[경로목록] FiberRouteManager 행 클릭 → setSelectedAssetId(slot) → 통합 패널이 슬롯으로(eyebrow=OFD)
```

## 엣지/에러 처리
- **최상위 자산**: parentAssetId 없음 → eyebrow 자연 없음(정상).
- **부모가 effectiveAssets에 없을 때**(전역 lazy 캐시): AssetBreadcrumb 가 조상 못 찾으면 빈 체인→null(현 동작). 보통 같은 변전소라 존재.
- **경로 행 클릭 vs 삭제 버튼**: 삭제 stopPropagation.
- **코어수**: 24/48 버튼은 입력값 설정만(검증 동일). 자유 입력도 유지.
- **detailKind 회귀 주의**: 제네릭 asset 해소로 바꿔도 배치 설비의 공간 섹션(랙 내부/OFD 경로/분전반 회로)이 그대로 떠야 함 — detailKind 는 localEq 기반 유지.

## 테스트 전략
- **EquipmentDetailPanel**: 단위/컴포넌트 — 피더/슬롯/모듈 선택 시 `asset` 이 해소돼 `AssetDetailPanel` 에 parentAssetId 있는 asset 전달(→ breadcrumb 렌더). 배치 최상위는 asset(parentAssetId null) 또는 null. 기존 `EquipmentDetailPanel`/에디터 테스트 회귀 0(공간 섹션 유지).
- **FiberRouteManager**: 행 클릭 → setSelectedAssetId(slot) 호출, 라벨 "출발-대국" 렌더, "광 경로" 텍스트 없음, 24/48 버튼 → cores 설정.
- **빌드/타입**: 프론트 tsc + build + 전체 vitest green.
- **수동 스모크**: 평면도에서 피더/슬롯 열기 → eyebrow(부모 클릭 이동). OFD 경로목록 행 클릭 → 슬롯 패널(eyebrow=OFD). 24/48 빠른선택.

## 비목표 (YAGNI)
- 슬롯 포트 GUI(P2). 연결 피커 통일(P3). 경로 행 per-포트 전개. 라벨 단일 포트번호.

## 단계 분해(플랜 예고)
1. EquipmentDetailPanel 제네릭 asset 해소(eyebrow 보편화) + 테스트.
2. FiberRouteManager 정리(클릭 이동·라벨·"광 경로" 삭제·24/48) + 테스트.
3. 검증 + 최종 리뷰.
