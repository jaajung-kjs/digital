# P2b — 광슬롯 포트 GUI (포트 매트릭스 + 상태색 + 포트상세/하이라이트) Design

**작성일:** 2026-06-15
**상태:** 설계(사용자 결정 반영) → 사용자 spec 리뷰 대기 → 구현 플랜
**큰 그림:** OFD↔랙 통합 UI 2-b단계. 선행 P2a(OFD 경로 슬롯 GUI, 머지됨). 후속 P3(연결 피커 통일 — **빈 포트 클릭→연결**은 여기서).

## 배경 / 문제

광슬롯(OFD-SLOT = OFD 의 conduit 자식)은 N개(24/48) 광코어를 담는다. 현재 광슬롯을 클릭하면 상세 패널에 **스칼라 필드만** 나오고, "몇 포트짜리이며 어느 포트가 어떻게 연결됐는지" 시각 정보가 없다. 사용자는 광슬롯 정보에 **업계 표준 포트 매트릭스**(패치패널/ODF 식 정사각 포트 격자)를 원한다 — 포트 상태를 배경색으로, 포트 클릭 시 상세·하이라이트.

정찰 결론(2026-06-15):
- 포트 상태/설비 파생 데이터는 전역 cables + `useTraceGraph()` 로 **계산 가능**. 단, 기존 `buildSlotCoreRows`(`slotRegister.ts`)는 **자국(local) 점유만** 본다 — 대국(twin slot) OUT 점유 감지는 **갭**(신규 `buildSlotPorts` 필요).
- 하이라이트는 기존 `usePathHighlightStore.getState().startTrace(cableId)` 그대로 사용(코어 OUT 케이블 id 1개 → 트레이스 투영 → 캔버스/그리드 하이라이트).
- 상세 섹션 주입은 단일 레지스트리 `resolveSpatialSection(kind)` 에 **새 kind `'conduit-ports'`** 한 줄 추가로 끝.

## 결정 사항(사용자 확정)

1. **데이터 모델 = ① 파생(derived).** 슬롯 생성 시 빈 케이블을 만들지 **않는다**. 포트 1~N 은 OPGW 용량(`specParams.cores`)으로부터 파생하고, 점유는 실제 OUT 코어 케이블 유무로 판정. → 마이그레이션 0, 빈 행 0. (물질화 ② 기각.)
2. **연결 기능은 P3 분리.** P2b 는 **포트 그리드 + 상태색 + 포트상세 + 하이라이트**까지. **빈 포트 클릭→연결(피커)은 P3**.
3. **시각 = 포트 매트릭스(PortGrid).** SlotRailGrid(세로 슬롯, 랙용) 아님. 정사각 포트, 한 행 12개(24→2행, 48→4행).

## 목표

광슬롯(`connectionKind==='conduit'`) 상세에 "포트" 공간 섹션을 추가:
- **PortGrid** — 1~N 정사각 포트, **배경색 = 연결상태**(미연결/편도/양측), 클릭→선택(테두리).
- 선택 포트 → **아래 포트 상세**(자국 설비 / 대국 설비, 간단). 자세한 메타는 선번장뷰가 담당(중복 금지).
- 선택 포트 → 연결 코어 **하이라이트**(`startTrace`).

**비목표(YAGNI):** 빈 포트 연결/편집(P3). 코어 메타(용도·회선·접속종류) 편집(선번장뷰가 담당). 포트 드래그·재배열. 물질화 빈 케이블.

## 아키텍처

### A. 포트 파생 — `features/fiber/slotPorts.ts` (신규)
```ts
export type PortState = 'empty' | 'half' | 'full';  // 미연결 / 편도 / 양측

export interface SlotPort {
  coreNumber: number;           // 1..N
  localCableId: string | null;  // 자국 OUT 코어 케이블 id
  remoteCableId: string | null; // 대국(twin) OUT 코어 케이블 id
  localAssetId: string | null;  // 자국 설비(슬롯 아닌 endpoint)
  remoteAssetId: string | null; // 대국 설비
  state: PortState;
}

export function buildSlotPorts(
  slot: { id: string },
  cables: CableLike[],          // 전역 effective cables(staged 포함)
  graph: TraceGraph | null,
): SlotPort[];
```
로직:
- 용량 N = 이 슬롯의 OPGW(`cableType==='FIBER' && sourceRole==='IN' && targetRole==='IN'` 이고 endpoint 에 slot.id 포함)의 `specParams.cores`. 없으면 빈 배열(설정 누락).
- `twinSlotId` = 그 OPGW 의 반대편 endpoint.
- i=1..N:
  - `localOut = cables.find(FIBER && roleAt(c, slot.id)==='OUT' && c.number===i)`
  - `remoteOut = twinSlotId ? cables.find(FIBER && roleAt(c, twinSlotId)==='OUT' && c.number===i) : null`
  - `localAssetId = localOut ? other(localOut, slot.id) : null`
  - `remoteAssetId = remoteOut ? other(remoteOut, twinSlotId) : null`
  - `state = localOut && remoteOut ? 'full' : (localOut || remoteOut ? 'half' : 'empty')`
- `roleAt`, `other` 는 `slotRegister.ts` 에서 **export 해 재사용**(중복 정의 금지). twin 추출도 `slotRegister`/`traceGraph` 에 헬퍼가 없으면 `slotPorts.ts` 내부 1곳에만.

> 메모: `buildSlotCoreRows`(선번장)는 자국 점유 + far trace 만 본다. 포트 상태(편도/양측)는 대국 OUT 직접 조회가 필요하므로 별도 `buildSlotPorts` 로 둔다. 둘 다 같은 `roleAt/other` 를 공유.

### B. `components/PortGrid.tsx` (신규, 프레젠테이션)
```tsx
interface PortGridProps {
  ports: SlotPort[];
  selectedCore: number | null;
  onSelect: (coreNumber: number) => void;
  perRow?: number;  // 기본 12
}
```
- CSS grid `grid-template-columns: repeat(perRow, minmax(0,1fr))`, `gap-1`. 각 포트 `aspect-square`(정사각), 중앙에 코어번호(`text-[11px] tabular-nums`).
- **상태색(시맨틱 토큰만, 하드코딩 hex 금지):**
  - `empty` → `bg-surface-2 text-content-faint`
  - `half` → 경고색 토큰(`bg-warning-bg text-warning` — 없으면 토큰 추가, 노랑/앰버 계열)
  - `full` → 성공색 토큰(`bg-success-bg text-success` — 없으면 토큰 추가, 초록 계열)
  - `selected` → `ring-2 ring-primary`(상태색 위에 덧입힘)
- 범례(legend) 한 줄: ■미연결 ■편도 ■양측.
- 순수 표시 + onSelect. 키보드 접근(role=button, Enter/Space). 디자인 토큰 변경 시 dev 재시작 필요(메모 참조).

### C. `features/fiber/components/SlotPortsPanel.tsx` (신규, 공간 섹션 본체)
- 데이터: `useEffectiveAssets`(slot 조회), `useEffectiveCables`, `useTraceGraph` → `buildSlotPorts(slot, cables, graph)`.
- 로컬 상태 `const [selectedCore, setSelectedCore] = useState<number|null>(null)`.
- 렌더: `<PortGrid ports onSelect={setSelectedCore} selectedCore />` + 선택 시 **포트 상세 카드**:
  - `포트 {n}` · 상태 배지(미연결/편도/양측)
  - `자국: {nameById.get(localAssetId)} ({subNameById})` 또는 `—`
  - `대국: {nameById.get(remoteAssetId)} ({subNameById})` 또는 `—`
  - (보조 문구) "자세한 코어 정보는 선번장에서".
- **하이라이트**: `selectedCore` 변경 시 — 그 포트의 `localCableId ?? remoteCableId` 가 있으면 `usePathHighlightStore.getState().startTrace(cableId)`, 없으면(빈 포트) `clearHighlight()`. 패널 unmount 시 `clearHighlight()`(useEffect cleanup).
- 설정 누락(OPGW 없음/카테고리 로딩) 시 안내문구.

### D. 주입 — 단일 레지스트리에 kind 추가
1. `types/equipmentKind.ts`: `DetailPanelKind` 에 `'conduit-ports'` 추가(`EquipmentDetailPanelKind` 와 분리된 자산-레벨 kind 이므로 `DetailPanelKind = EquipmentDetailPanelKind | 'conduit-ports'`).
2. `resolveSpatialSection.tsx`: `case 'conduit-ports': return { label: '포트', node: <SlotPortsPanel slotId={equipmentId} /> }`.
3. **detailKind 해석을 자산 기반으로** — 공유 헬퍼 `resolveAssetDetailKind(asset, placedEquipment?)`:
   - `asset?.assetType?.connectionKind === 'conduit'` → `'conduit-ports'`
   - else placed equipment 면 `EQUIPMENT_KIND_INFO[kind].detailPanelKind`
   - else `null`
   `EquipmentDetailPanel`(평면도) 및 현황/대장 진입점의 detailKind 계산을 이 헬퍼로 통일(SSOT — 진입점마다 분기 복제 금지). 광슬롯은 배치설비가 아니어도(localEq 없음) conduit 분기로 '포트' 섹션을 받는다.

## 데이터 흐름
```
광슬롯 상세 → AssetDetailBody(kind='conduit-ports') → resolveSpatialSection
  → SlotPortsPanel(slotId)
      buildSlotPorts(slot, cables, graph) → [1..N] {state, local/remoteAssetId, cableId}
      PortGrid 색칠/클릭 → setSelectedCore(n)
        → 포트 상세(자국/대국 설비) + startTrace(localCableId ?? remoteCableId)
```

## 엣지/에러 처리
- **OPGW 없음(용량 미상):** ports=[] → "광경로(용량) 설정 누락" 안내, 그리드 숨김.
- **빈 포트 클릭:** 상세는 "미연결" + 자국/대국 모두 `—`, `clearHighlight()`. (연결 액션은 P3.)
- **편도(한쪽만):** 있는 쪽 설비 표시, 없는 쪽 `—`, 있는 쪽 케이블로 하이라이트.
- **staged(커밋 전) 코어:** 이름은 slim/graph 기반이라 커밋 전 폴백 가능(P6 알려진 한계) — 상태색·점유는 effective cables 로 즉시 정확.
- **48포트 높이:** 4행×정사각이라 세로 부담 적음(랙 세로스택과 달리 행당 다수). 섹션은 자연 높이, 부모 스크롤에 맡김.
- **하이라이트 정리:** 패널 전환/닫힘 시 cleanup 으로 `clearHighlight()` — 잔상 방지.

## 테스트 전략
- **buildSlotPorts(단위):** 자국만→half, 대국만→half, 양쪽→full, 둘다없음→empty, 용량초과/누락, local/remoteAssetId 해소. (대국 OUT 감지가 핵심 — 명시 케이스.)
- **PortGrid(단위):** N개 렌더, 상태별 색 클래스, 선택 ring, onSelect 호출, perRow 줄바꿈.
- **SlotPortsPanel(컴포넌트):** 포트 클릭→상세(자국/대국 설비명)·startTrace(cableId) 호출, 빈 포트→clearHighlight, unmount→clearHighlight.
- **주입(통합):** conduit 자산 → detailKind='conduit-ports' → '포트' 섹션 렌더(resolveAssetDetailKind 단위 포함).
- **빌드/타입:** 프론트 tsc + build + 전체 vitest green.
- **수동 스모크:** 광슬롯 상세 → 포트 매트릭스(24/48), 색(미연결/편도/양측), 포트 클릭→상세+캔버스 하이라이트.

## 단계 분해(플랜 예고)
1. `slotPorts.ts`(`buildSlotPorts` + `roleAt/other` export 재사용) + 단위테스트.
2. `PortGrid.tsx`(정사각 매트릭스·상태색·선택·범례) + 단위테스트.
3. `SlotPortsPanel.tsx`(PortGrid + 포트상세 + startTrace/clear) + 테스트.
4. 주입: `DetailPanelKind += 'conduit-ports'`, `resolveSpatialSection` case, `resolveAssetDetailKind` 헬퍼 + 진입점 통일 + 통합테스트.
5. 검증 + 최종 리뷰.
