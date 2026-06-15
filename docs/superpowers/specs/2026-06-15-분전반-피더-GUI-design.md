# 분전반 · 피더 GUI (정보탭) Design

**작성일:** 2026-06-15
**상태:** 설계(사용자 시각 검토·승인: 분기=A DIN레일 / 피더=B 3열카드) → 사용자 spec 리뷰 → 구현 플랜
**큰 그림:** 랙→모듈, OFD→슬롯→포트와 동형의 **2단계 드릴다운** GUI. 분전반 정보탭에서 피더를 보고, 클릭하면 그 피더 정보탭에서 분기(CB)를 본다.

## 배경 / 데이터 모델(확정)

현재 모델: **분전반(DIST, placementKind='DIST', 배치설비) → 피더(FEEDER, connectionKind='distributor', 미배치 자식) → CB 케이블**(Cable, `number`=CB번호, `sourceAssetId`=피더·`sourceRole`='OUT', 반대편=부하). **별도 "브랜치" 자산은 없다** — 분기(branch)=피더 아래 CB 회로(=케이블). (계통뷰의 CB 행이 바로 이것.)

- 피더 목록: `distributionSubtree.feedersOfPanel(assets, panelId)` = `parentAssetId===panelId && code==='FEEDER'`.
- 피더의 CB 행: 계통 `powerRegisterDescriptor.buildSection` = 피더에 닿는 케이블(`roleAt(c, feeder.id)==='OUT'`)을 번호별로. 컬럼: 번호(`cable.number`), 부하(반대편 자산명), 용량(`specParams.capacity`), 규격(`categoryName`), 개폐(`specParams.switchState` ON/OFF/—).
- 현재 분전반 정보탭(`distribution` 공간섹션 → `DistributionPanel`)은 **이미 3열 피더 그리드**가 있으나 분기 미리보기·드릴다운 일관성이 약하고, **피더 자체엔 공간섹션이 없다**.

## 결정 사항(사용자 승인)

1. **구조 = A안.** 분기는 새 자산이 아니라 **피더 아래 CB 회로(케이블)**. 2단계 드릴다운(분전반→피더→분기).
2. **분기 배치 = A(DIN 레일 가로배열).** 차단기 모듈이 가로로 붙은 실물 분전반 스타일, 토글/색=개폐상태.
3. **피더 배치 = B(3열 피더 카드).** 피더를 3열 타일로, 각 타일에 분기 미리보기 점.

## 목표

분전반·피더 정보탭에 실물 분전반에 가까운 공간 GUI 추가:
- **분전반 정보탭**: 3열 피더 카드(피더명 + CB 사용/총 + 분기 미리보기 점 + "피더 추가"). 카드 클릭 → 그 피더로 이동.
- **피더 정보탭**: 분기(CB) DIN 레일(차단기 모듈 1..N, 색=개폐). 차단기 클릭 → 상세(부하/용량/규격/개폐) + 부하 하이라이트. 개폐 토글·용량·규격 인라인 편집.

## 아키텍처

### A. 분전반 정보탭 — 피더 3열 카드 (`DistributionPanel` 강화, `distribution` 섹션)
- 기존 3열 그리드 유지·정리. 피더 카드 = `피더명` + `CB n/N` + **분기 미리보기**(작은 점 N개, 색=개폐: 초록 ON / 회색 OFF / 빈 미연결) + 선택 강조(selectedAssetId===feeder.id).
- 카드 클릭 → `useSelectionStore.getState().setSelectedAssetId(feeder.id)` (그 피더 패널로 이동 — P1 eyebrow=분전반).
- "피더 추가"(기존 인라인 추가 유지)·삭제(cascade) 그대로.
- 미리보기 점 데이터는 아래 `buildFeederCircuits(feeder)`의 점유/개폐로 파생.

### B. `buildFeederCircuits` (신규, `features/power/feederCircuits.ts`)
피더의 CB(분기) 파생 — 계통 `powerRegisterDescriptor.buildSection` 의 행 생성 로직을 **공유 함수로 추출**(중복 제거).
```ts
export type SwitchState = 'on' | 'off' | null;
export interface FeederCircuit {
  cbNumber: number;
  cableId: string | null;
  occupied: boolean;
  loadAssetId: string | null;     // 반대편(부하) 자산
  capacity: string | null;        // specParams.capacity (예: '20A')
  spec: string | null;            // categoryName
  switchState: SwitchState;       // specParams.switchState
}
export function buildFeederCircuits(feeder: {id:string}, cables: CableLike[], graph): FeederCircuit[];
```
- 점유 = `roleAt(c, feeder.id)==='OUT'` 인 케이블을 `number` 별로. `other(c, feeder.id)`=부하.
- 표시 위치 = 1..N, **N = max(점유 최대 번호 + 2, 6)** — 빈 번호는 빈 차단기, 그 뒤 여유 위치. (capacity 필드 없이 파생; 추후 피더 극수 속성 생기면 그걸로.)
- 계통 그리드도 이 함수를 쓰도록 정리(SSOT 단일 파생).

### C. `BreakerRail` (신규, `components/BreakerRail.tsx`, 프레젠테이션)
차단기 DIN 레일 — 가로 배열의 차단기 모듈.
```tsx
<BreakerRail circuits={FeederCircuit[]} selectedCb={number|null} onSelect={(n)=>void} onToggle={(n)=>void} />
```
- 레일 컨테이너(어두운 레일 바) + 차단기 셀들(가로). 각 셀 = 흰 페이스플레이트, 상단 번호, 가운데 토글(위=ON 초록/아래=OFF 회색/빈=점선), 하단 용량.
- 색=개폐: ON 초록, OFF 회색, 미연결 점선. 선택 셀 ring. 클릭→onSelect, 토글 클릭→onToggle(개폐 반전).
- 시맨틱 토큰 사용(하드코딩 hex 금지 — 차단기 흰 바디는 surface 계열, 토글 색은 success/neutral 토큰).
- N 많으면 가로 스크롤/줄바꿈(레일 여러 줄) — perRow 또는 wrap.

### D. `FeederCircuitsPanel` (신규, `features/power/components/FeederCircuitsPanel.tsx`, `feeder-circuits` 섹션 본체)
SlotPortsPanel 패턴.
- 데이터: `useEffectiveAssets`(피더), `useEffectiveCables`→글로벌(graph.cables, SSOT — 선번장 수정과 동일하게 전역 케이블), `useTraceGraph` → `buildFeederCircuits`.
- 로컬 선택은 selectionStore `selectedCore`(번호) 재사용 또는 로컬 상태 — 단일 선택.
- 렌더: `<BreakerRail circuits selectedCb onSelect onToggle />` + 선택 시 **CB 상세 카드**:
  - `CB {n}` · 개폐 배지, `부하: {nameById}` 또는 `—`, `용량`(EditableField), `규격`(select), `개폐`(select ON/OFF).
  - 용량/규격/개폐 편집 = 계통 그리드와 동일한 `patch('cables', id, {specParams})`(공유). 토글도 동일.
- **하이라이트**: 선택 CB의 cableId → `usePathHighlightStore.getState().startTrace(cableId)`, 빈 CB → clearHighlight. unmount 시 clear.
- 점유 케이블 없으면(피더에 CB 0) 빈 레일 + 안내.

### E. 주입 — 단일 레지스트리에 kind 추가
1. `types/equipmentKind.ts`: `DetailPanelKind += 'feeder-circuits'`.
2. `resolveAssetDetailKind.ts`: `asset.assetType.connectionKind === 'distributor'` → `'feeder-circuits'` (conduit→'conduit-ports'와 동형으로 분기 추가).
3. `resolveSpatialSection.tsx`: `case 'feeder-circuits' → { label:'분기', node:<FeederCircuitsPanel feederId={equipmentId} /> }`.

## 데이터 흐름
```
분전반 상세 "회로" → DistributionPanel(피더 3열 카드 + buildFeederCircuits 미리보기)
  피더 카드 클릭 → setSelectedAssetId(feeder) → 피더 패널(eyebrow=분전반)
피더 상세 "분기" → FeederCircuitsPanel(feederId)
  buildFeederCircuits(feeder, graph.cables, graph) → CB[1..N] {개폐/부하/용량/규격}
  BreakerRail 색칠/클릭 → selectedCb → 상세 카드 + startTrace(cableId)
  토글/용량/규격 편집 → patch('cables', id, {specParams}) → overlay → 계통·미리보기 자동 일치
```

## 엣지/에러 처리
- **CB 0개 피더:** 빈 레일(여유 위치만) + 안내.
- **빈 차단기 클릭:** 상세 "미연결"(부하/용량 —), clearHighlight. 새 부하 연결은 비목표(에디터 케이블 그리기).
- **개폐 토글:** specParams.switchState 패치. 미연결 CB는 토글 비활성.
- **전역 케이블 소스:** 선번장 수정과 동일하게 `graph.cables`(전역+오버레이)에서 파생 — 저장/cross 일관, 계통뷰와 동일 결과.
- **하이라이트 정리:** 패널 전환/닫힘 시 clearHighlight.

## 테스트 전략
- **buildFeederCircuits(단위):** 점유/빈/개폐상태/부하 해소, 표시 위치 N 파생(점유 최대+2, 최소 6). 계통 그리드와 동일 행 산출(공유 확인).
- **BreakerRail(단위):** N개 렌더, 개폐별 색, 선택 ring, onSelect/onToggle, 빈 차단기.
- **FeederCircuitsPanel(컴포넌트):** CB 클릭→상세(부하/용량)·startTrace, 토글→patch(specParams.switchState), 빈→clearHighlight.
- **DistributionPanel:** 피더 카드 미리보기 점(개폐 색), 클릭→setSelectedAssetId(feeder).
- **주입(통합):** distributor 자산 → detailKind='feeder-circuits' → '분기' 섹션.
- **빌드/타입:** 프론트 tsc + build + 전체 vitest green.
- **수동 스모크:** 분전반 상세→피더 3열(미리보기), 피더 클릭→분기 DIN 레일, 차단기 클릭→상세+하이라이트, 토글→개폐, 계통뷰와 일치.

## 비목표 (YAGNI)
빈 CB에 **새 부하 연결**(엔드포인트 생성) — 기존 에디터 케이블 그리기로(피더→부하). 피더 "극수(capacity)" 자산 속성 신설. 분기를 별도 자산 레벨로(현 케이블 유지). 3D/물리 배치.

## 단계 분해(플랜 예고)
1. `buildFeederCircuits`(피더 CB 파생) + 계통 descriptor 가 이걸 쓰도록 정리(SSOT) + 단위테스트.
2. `BreakerRail`(DIN 레일 차단기, 색·선택·토글) + 단위테스트.
3. `FeederCircuitsPanel`(BreakerRail + 상세 + startTrace + specParams 편집) + 테스트.
4. 주입: `DetailPanelKind += 'feeder-circuits'` + `resolveAssetDetailKind`(distributor) + `resolveSpatialSection` case + 통합테스트.
5. `DistributionPanel` 피더 카드 미리보기 점 + 클릭 일관 + 테스트.
6. 검증 + 최종 리뷰 + 수동 스모크.
