# (가) 통합 상세 패널 + 상호 네비 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 범위: 도면 에디터와 대장 레지스터가 **같은 장비 정보를 같은 컴포넌트로 보여주고**, 한 번에 서로 이동(상호 네비)하게 한다. UI 수렴의 1단계. 이후 (나) 통합 워크스페이스의 토대.

---

## 1. 배경 / 문제

같은 장비(=Asset, 장비id=assetid)를 보는 화면이 둘로 갈라져 있다:
- **도면 에디터** `EquipmentDetailPanel`(탭: 사진/정보/점검/연결/+공간탭). `InfoTab` 은 **이름·담당자·설치일·설명** 만 편집(`useMergedEquipmentDetail`, editorStore 지연저장). **속성(fieldTemplate)·생애주기·상태는 아예 안 보임.**
- **대장 레지스터** `AssetDetailPanel`(슬라이드). 식별 + **속성 + 생애주기** + 사진 + 유지보수 전부 편집(registerStore staged).

두 패널은 같은 장비인데 **다른 화면**이고 **상호 이동도 없다.** 사용자 요구: "한 장비를 어디서 보든 같은 정보 + 한 번에 이동."

### 결정된 제약 (브레인스토밍에서 확정)
- **에디터에선 대장 깊은 필드(속성·생애주기)를 *편집*하지 않는다 — 보기 + "대장에서 편집"으로 점프.** 이유: 에디터 워킹카피(editorStore + plan 저장)는 그 필드를 싣지 않음. 편집까지 하려면 엔진 마이그레이션(5b)이 선행돼야 하나 이번 범위 아님.
- 식별(이름/담당자/설치/설명)은 에디터에서 기존대로 편집(editorStore 지연).

## 2. 목표 / 비목표

### 목표
1. **공유 뷰 컴포넌트** — 속성·생애주기 렌더를 읽기/편집 겸용 컴포넌트로 추출, 레지스터·에디터가 함께 사용.
2. **에디터 정보 탭에 속성·생애주기 표시**(readOnly) — 지금 에디터에 없는 대장 정보를 보여줌.
3. **상호 네비 양방향** — 레지스터→"도면에서 보기"(배치 시), 에디터→"대장에서 보기".
4. 같은 장비를 어느 화면에서 보든 **같은 정보 컴포넌트**로 본다.

### 비목표 (후속/다른 범위)
- 에디터에서 속성·생애주기 *편집*(→ 5b 후).
- 사진·유지보수 컴포넌트의 완전 공유(에디터=editorStore 큐, 레지스터=registerStore 큐로 워킹카피가 달라 주입 필요 — 이번엔 각자 기존 것 유지).
- (나) 변전소 단위 도면|현황 통합 워크스페이스(별도).
- 단일 편집 컴포넌트(접근 2) — 채택 안 함.

## 3. 설계

### A. 공유 뷰 컴포넌트 (읽기/편집 겸용)
`frontend/src/features/assets/components/` 에 신규:

```tsx
// AssetAttributesView.tsx — fieldTemplate 기반 속성
interface Props {
  fields: AssetTypeField[];          // assetType.fieldTemplate
  attributes: Record<string, unknown> | null;
  readOnly: boolean;
  onChange?: (key: string, value: string) => void;  // readOnly=false 일 때만
}
// readOnly: label + 값(텍스트). 편집: 기존 AssetDetailPanel 의 입력/셀렉트 로직 이전.
```
```tsx
// AssetLifecycleView.tsx — 생애주기 + 알림
interface Props {
  asset: Pick<Asset, 'warrantyUntil' | 'replaceDue'>;
  today: Date;
  readOnly: boolean;
  onChange?: (patch: { warrantyUntil?: string | null; replaceDue?: string | null }) => void;
}
// 교체예정·하자보수기한 + assetAlert() 배지. readOnly: 값+배지. 편집: 날짜 입력.
```

레지스터 `AssetDetailPanel` 을 이 둘로 리팩토링(현재 인라인 속성·생애주기 Field 들을 컴포넌트로 이동), `readOnly={false}` + `onChange→onPatch`. **동작·저장 경로 불변**(registerStore staged), 단지 렌더를 공유 컴포넌트로.

### B. 에디터 정보 탭에 Asset 정보
- 신규 훅 `frontend/src/features/assets/hooks/useAsset.ts`:
  ```ts
  export function useAsset(assetId: string | undefined) // GET /assets/:id, enabled: !!assetId && !isTempId
  ```
  (장비id = assetid. temp(미저장 신규)면 skip.)
- 에디터 `InfoTab`(`features/equipment/components/detail/InfoTab.tsx`) 하단에 추가:
  - `const { data: asset } = useAsset(equipment.id);`
  - `asset` 있으면 `<AssetAttributesView fields={asset.assetType.fieldTemplate} attributes={asset.attributes} readOnly />` + `<AssetLifecycleView asset={asset} today={today} readOnly />`.
  - **"대장에서 편집" 버튼** → 상호 네비(C).
  - 식별 편집(이름/담당자/설치/설명)은 **기존 그대로**(editorStore). 속성·생애주기는 readOnly 표시만.
- snapshot 모드(과거 버전 미리보기)에선 useAsset skip(현재 상태와 다름) — `readOnly` 이미 snapshot 처리됨.

### C. 상호 네비 (양방향)
- **레지스터 → 도면** ("도면에서 보기"):
  - `AssetDetailPanel` (그리고 선택적으로 그리드 행)에 버튼. `asset.floorId` 있으면 활성 → `navigate('/floors/' + asset.floorId + '/plan?equipmentId=' + asset.id)`. 에디터의 기존 `?equipmentId=` 딥링크가 패널 자동 오픈 + 뷰포트 센터.
  - `floorId` 없음(미배치) → 버튼 비활성 + "미배치" 툴팁.
- **에디터 → 레지스터** ("대장에서 보기" / "대장에서 편집"):
  - `InfoTab` 버튼 → `navigate('/substations/' + asset.substationId + '/assets?assetId=' + equipment.id)`.
  - `substationId` 출처: **`useAsset` 결과의 `asset.substationId`**(Asset 에 이미 존재). FloorDetail 의존 없음. 따라서 이 버튼은 `asset`(useAsset 로드 완료) 이 있을 때만 표시 — temp 신규는 대장 정보가 없으므로 버튼 숨김.
- **그리드 `?assetId=` 핸들러**: `SubstationAssetGrid` 에 `useSearchParams` 추가 — 마운트 시 `assetId` 있으면 `setSelectedId(assetId)` + 상세 패널 오픈 + 해당 행 `scrollIntoView`, 그 후 쿼리파라미터 제거(`replace`). (에디터의 기존 패턴과 동일.)

### D. 백엔드 — AssetDetail 에 floorId 노출
- `asset.service.ts`: `AssetDetail` 인터페이스에 `floorId: string | null;` 추가, `mapToDetail` 에 `floorId: a.floorId ?? null,`. (컬럼 `Asset.floorId` 이미 존재.)
- `frontend/src/types/asset.ts` `Asset` 에 `floorId: string | null;` 추가.
- (substationId 는 Asset 에 이미 있음 — 에디터→대장 네비에 그대로 사용 가능. 즉 substationId 출처를 `useAsset` 결과의 `asset.substationId` 로 단순화 가능 → C 의 FloorDetail 의존 제거.)

## 4. 데이터 흐름

- **에디터**: 장비 클릭(detailPanelEquipmentId) → `EquipmentDetailPanel`/`InfoTab` → `useAsset(id)`(GET /assets/:id) → 공유 뷰 readOnly + "대장에서 보기"(`asset.substationId`). 식별 편집 → editorStore(지연). 미저장 신규(temp) → useAsset skip(아직 대장 정보 없음, 식별만).
- **레지스터**: effective asset(registerStore 머지) → `AssetDetailPanel` → 공유 뷰 editable(onChange→stageUpdate) + "도면에서 보기"(`asset.floorId`).

## 5. 영향 받는 파일

**신규**
- `frontend/src/features/assets/components/AssetAttributesView.tsx` (+test)
- `frontend/src/features/assets/components/AssetLifecycleView.tsx` (+test)
- `frontend/src/features/assets/hooks/useAsset.ts`

**수정**
- `frontend/src/features/assets/components/AssetDetailPanel.tsx` (공유 뷰 사용 + "도면에서 보기")
- `frontend/src/features/assets/components/SubstationAssetGrid.tsx` (`?assetId=` 핸들러; 행 "도면에서 보기"는 선택)
- `frontend/src/features/equipment/components/detail/InfoTab.tsx` (useAsset + 공유 뷰 readOnly + "대장에서 보기")
- `backend/src/services/asset.service.ts` (AssetDetail.floorId)
- `frontend/src/types/asset.ts` (Asset.floorId)

## 6. 테스트

- **순수/렌더(프론트, vitest + RTL)**:
  - `AssetAttributesView`: readOnly → label/값; editable → onChange 호출(셀렉트 포함).
  - `AssetLifecycleView`: readOnly → 값+알림 배지(만료/임박 구분 재사용); editable → 날짜 onChange.
  - 크로스네비 URL 빌더(순수 함수로 추출 가능: `floorPlanUrl(floorId, assetId)`, `registerUrl(substationId, assetId)`) 단위 테스트.
- **백엔드**: `asset.integration` 회귀 — `floorId` 가 응답에 포함(배치 자산은 값, 미배치는 null). 기존 자산 테스트 회귀 없음.
- **수동(dev)**: ① 대장에서 배치된 장비 → "도면에서 보기" → 에디터가 그 장비 선택·센터. ② 도면에서 장비 → 정보 탭에 속성·생애주기 보임 + "대장에서 보기" → 그리드가 그 행 선택·패널 오픈. ③ 미배치 장비 → "도면에서 보기" 비활성.

## 7. 성공 기준

1. 도면 에디터 정보 탭에서 장비의 **속성·생애주기·알림**이 보인다(읽기전용).
2. 같은 속성·생애주기 렌더가 **레지스터·에디터에서 동일 컴포넌트**로 나온다.
3. 레지스터 → "도면에서 보기" → 배치된 층에서 그 장비가 선택·센터된다(미배치는 비활성).
4. 에디터 → "대장에서 보기" → 현황 표에서 그 장비가 선택·패널 오픈된다.
5. 에디터의 식별 편집·저장(editorStore)과 레지스터의 staged 편집은 **기존대로** 동작(회귀 없음).

## 8. 이후
- 5b 엔진 마이그레이션 → 에디터에서도 속성·생애주기 편집(이 패널을 editable 로 승격).
- (나) 변전소 단위 도면|현황 통합 워크스페이스.
- V2~V5 수직.
