# UI 리팩토링 ②A — 통합 인스펙터 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: UI 리팩토링의 ②A. 장비 상세를 보는 **두 개의 우측 패널**(에디터 `EquipmentDetailPanel`, 레지스터 `AssetDetailPanel`)을 **하나의 `AssetInspector`** 로 수렴해 사진·점검·연결·속성·생애주기 중복을 제거한다. (가) 패널 수렴의 완성.

---

## 1. 배경 / 문제

한 장비의 상세가 **뷰마다 다른 컴포넌트**로 나온다:
- **배치도 뷰**(장비 더블클릭) → `EquipmentDetailPanel`: 탭 사진/정보/점검/연결 + 공간탭(랙뷰·OFD 포트·분전반 회로).
- **표 뷰**(행 선택) → `AssetDetailPanel`: 식별·속성·생애주기·사진·유지보수·연결.

→ 뷰를 바꾸면 우측 패널이 **다른 컴포넌트**로 바뀌고, **사진·점검·연결·속성/생애주기가 양쪽에 중복**(약 80% 겹침). 에디터 전용은 *공간 편집*(랙뷰·포트·회로·캔버스 케이블)뿐.

업계 표준: **우측 = 하나의 일관된 인스펙터.** 어느 뷰에서 선택하든 같은 패널이 선택 자산의 전체 현황을 보여주고, 편집 맥락(배치도)에선 *공간 편집*만 덧붙는다.

### 결정 (브레인스토밍 확정)
배치도 인스펙터는 **보기 + "대장에서 편집" 점프** — 대장 필드(식별·속성·생애주기) 편집은 현황(표) 뷰의 register 워킹카피에서. 도면 저장은 *공간(위치·케이블)만*. 저장모델 단순.

## 2. 목표 / 비목표

### 목표
1. **`AssetInspector` 하나** — 섹션: 식별 / 속성 / 생애주기 / 사진 / 유지보수 / 연결. 전부 (가)·B에서 만든 공유 컴포넌트(`AssetAttributesView`/`AssetLifecycleView`/`AssetPhotoSection`/`AssetMaintenanceSection`/`AssetConnectionsSection`) 재사용. 데이터 = `GET /assets/:id`.
2. **레지스터 패널 = AssetInspector(편집)**, **에디터 패널 = AssetInspector(보기) + 공간 섹션**.
3. **중복 제거** — 사진·점검·연결·속성·생애주기가 한 컴포넌트로 양쪽에. 어느 뷰에서 선택하든 같은 인스펙터.

### 비목표 (후속)
- ②B 통계→개요/대시보드(우측 레일 해방) — 별도.
- 배치도에서 대장 필드 *편집*(보기+점프 유지; 어디서든 전체편집은 채택 안 함).
- 인스펙터 연결 섹션에서 캔버스 추적(trace) 트리거 — 후속(아래 §3.D).
- 5b 에디터 워킹카피→엔진(별개).

## 3. 설계

### A. AssetInspector — `frontend/src/features/assets/components/AssetInspector.tsx`
```tsx
interface Props {
  asset: Asset;              // GET /assets/:id 결과(useAsset)
  mode: 'edit' | 'view';     // edit=레지스터(register 워킹카피), view=에디터(읽기+점프)
  onPatch?: (id: string, patch: Partial<UpdateAssetInput>) => void;  // edit 모드
  onSelectAsset: (id: string) => void;   // 연결 상대 → 공유 선택
  onGotoRegister?: (id: string) => void; // view 모드 "대장에서 편집"
  today: Date;
  onClose?: () => void;
}
```
섹션(위→아래, 스크롤):
- **식별**(이름/설치일/담당자/상태): edit → 기존 Field(onPatch); view → 읽기 + 상단에 **"대장에서 편집"** 버튼(onGotoRegister).
- **속성** `<AssetAttributesView readOnly={mode==='view'} .../>`.
- **생애주기** `<AssetLifecycleView readOnly={mode==='view'} .../>`.
- **사진** `<AssetPhotoSection assetId .../>` (양쪽 동일 — `/equipment/:id/photos` 즉시).
- **유지보수** `<AssetMaintenanceSection assetId .../>` (양쪽 동일 — `/equipment/:id/maintenance-logs`).
- **연결** `<AssetConnectionsSection .../>` (양쪽 동일 — `GET /assets/:id/connections` + `/cables` 편집·삭제).

### B. 레지스터 적용
`AssetDetailPanel` → 본문을 `<AssetInspector mode="edit" asset={effectiveAsset} onPatch={(id,p)=>register stageUpdate} onSelectAsset={sel} today=.../>` 로. (현재 AssetDetailPanel 내용이 거의 이 구성 — 추출/일반화.) "도면에서 보기" 버튼은 패널 헤더에 유지.

### C. 에디터 적용 (패널 재구성)
에디터 `EquipmentDetailPanel`(현재 `BaseEquipmentTabsPanel` + kind 패널, 탭 사진/정보/점검/연결/+공간):
- **사진/정보/점검/연결 탭 → `AssetInspector mode="view"`** 하나로 대체. 데이터 = `useAsset(equipmentId)`(장비id=assetid; 이미 (가)에서 InfoTab이 useAsset 사용). "대장에서 편집" = `onGotoRegister`(WorkspaceNav `gotoRegister` 또는 navigate).
- **공간 섹션 유지**: 랙뷰(RackView)·OFD 포트(OfdPathsView)·분전반 회로(DistributionCircuits)는 에디터 고유로 남김 — kind별로 인스펙터 아래 섹션 또는 탭으로.
- 결과 에디터 패널 구조: `[AssetInspector(view)]` + `[공간 섹션(kind별)]`.
- snapshot(과거 버전) 모드: useAsset skip(현재 상태와 다름) — 기존 snapshot 처리 유지.

### D. 연결 섹션 — 데이터 소스 명시
- 인스펙터의 연결 섹션 = **`AssetConnectionsSection`(저장된 연결, API)** — 양쪽 동일. 에디터에서도 *저장된* 연결을 본다.
- 에디터의 **작업중(미저장) 케이블 드로잉·waypoint·캔버스 추적(trace/highlight)** 은 인스펙터가 아니라 **캔버스/공간 도구**에 남는다(기존 ConnectionOverlay·cable 도구). 즉 인스펙터 연결 = 조회·메타편집·삭제(저장분), 그리기 = 캔버스.
- (옛 에디터 `ConnectionsTab`/`ConnectionDiagram`은 패널에서 제거 — 기능은 인스펙터 연결 + 캔버스로 흡수. 캔버스 trace를 인스펙터에서 트리거하는 건 후속.)

## 4. 영향 받는 파일
**신규**: `features/assets/components/AssetInspector.tsx`(+test)
**수정**:
- `features/assets/components/AssetDetailPanel.tsx`(→ AssetInspector edit 사용)
- 에디터 패널 트리: `features/editor/components/EquipmentDetailPanel.tsx` 및 `features/equipment/components/detail/panels/`(BaseEquipmentTabsPanel + RackEquipmentPanel/OfdEquipmentPanel/DistributionPanel) — 사진/정보/점검/연결 탭 → AssetInspector(view), 공간 탭 유지.
**미사용화(제거 또는 잔존)**: 에디터 `detail/InfoTab`·`PhotosTab`·`LogsTab`·`ConnectionsTab`·`ConnectionDiagram`(패널에서 — 기능 인스펙터로 흡수). 파일은 잔존 가능(미import).

## 5. 테스트
- **RTL**: `AssetInspector` — edit 모드(식별/속성/생애주기 편집 onPatch 호출), view 모드(읽기 + "대장에서 편집" onGotoRegister 호출). 사진/점검/연결 섹션은 기존 컴포넌트 재사용이라 mock.
- **수동(dev)**: ① 표에서 장비 선택 → 인스펙터(편집). ② 배치도에서 장비 더블클릭 → **같은 인스펙터**(읽기) + 공간 섹션(랙이면 랙뷰). ③ 배치도 인스펙터 "대장에서 편집" → 표 뷰 그 장비. ④ 사진·유지보수·연결이 양쪽에서 같은 UI·동작. ⑤ 에디터 케이블 드로잉/캔버스 trace 회귀 없음(인스펙터 밖). ⑥ 랙뷰·OFD·분전반 공간 편집 회귀 없음.

## 6. 성공 기준
1. 어느 뷰에서 장비를 선택하든 우측에 **같은 AssetInspector**.
2. 사진·점검·연결·속성·생애주기가 *한 컴포넌트* — 중복 제거.
3. 에디터는 인스펙터(보기) + 공간 편집(랙뷰·포트·회로)만 고유.
4. 배치도 "대장에서 편집" 점프, 레지스터 편집 정상.
5. 에디터 케이블/공간 편집·캔버스 회귀 없음.

## 7. 이후
- ②B: StatsSidePanel 통계 → 메인 "개요/대시보드" 뷰(우측 레일 해방).
- ③: 글로벌 검색, 브레드크럼 보강. 그 후 단계 C 계통도 자동생성.
- 후속: 인스펙터 연결에서 캔버스 trace 트리거(에디터 맥락), 5b 엔진 마이그레이션.
