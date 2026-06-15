# UI 일관성 규칙 (사이드패널·상세 카드)

> **목적:** 매번 패널/카드를 새로 만들 때마다 폰트 크기·여백·테두리가 제각각이 되는 문제를
> 막는다. **새 UI를 짜기 전에 이 문서를 먼저 읽고, 아래 공용 컴포넌트를 재사용**한다.
> 여기 있는 컴포넌트로 표현되는 것은 직접 `<div className="...">` 로 다시 만들지 않는다.

## 0. 황금률

1. **공용 컴포넌트 먼저.** `src/components/ui` 와 `src/features/assets/components/detail/SectionShell.tsx` 에
   이미 있는 것을 쓴다. 없으면 *여기에 추가*하고 이 문서에 적는다 — 패널 안에서 일회용으로 만들지 않는다.
2. **타이포 스케일을 벗어나지 않는다(아래 §1).** `text-[10px]`, `text-[8px]` 같은 임의 초소형 폰트 금지.
3. **시맨틱 색 토큰만(아래 §2).** 하드코딩 hex(`#fff`)·원시 팔레트(`gray-500`) 금지.

## 1. 타이포 스케일 (이것만 사용)

| 용도 | 클래스 | 비고 |
| --- | --- | --- |
| 본문·값(value)·입력 | `text-sm` | 카드/필드의 기본 |
| 라벨·메타·배지·보조설명·카운트 | `text-xs` | 라벨과 부가정보 |
| 섹션 제목(h3) | `text-sm font-semibold` | |
| (장식용 초소형) | `text-[11px]` 까지만 | 그리드 타일 번호 등 *예외적*으로만 |

**`text-xs`(12px) 미만은 원칙적으로 쓰지 않는다.** 차단기/포트 그리드 타일처럼 칸이 작아
불가피한 경우에만 `text-[11px]` 까지 허용하고, 그 이하는 금지.

## 2. 색 토큰 (시맨틱만)

- 글자: `text-content`(본문) · `text-content-muted`(라벨) · `text-content-faint`(보조/빈상태)
- 면: `bg-surface`(카드) · `bg-surface-2`(보조/hover)
- 선: `border-line`
- 강조/상태: `text-primary` · `text-success`/`bg-success-bg` · `text-warning`/`bg-warning-bg` · `text-danger`/`bg-danger-bg` · `text-info`/`bg-info-bg`

## 3. 컴포넌트 카탈로그 — "이걸 쓰세요"

### 클릭하면 아래에 뜨는 "선택 상세 카드" → `DetailCard` 패밀리
`src/components/ui/DetailCard.tsx` — 광슬롯 포트, 피더 CB 등 **무언가 클릭 시 상세가 뜨는 카드는 전부 이것**.
```tsx
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from '../../../components/ui';

<DetailCard>
  <DetailCardHeader title="포트 3" badge="양측" badgeStatus="success" />
  <DetailRow label="자국">{name}</DetailRow>
  <DetailRow label="대국"><EditableField .../></DetailRow>  {/* 값에 인라인 편집 노드도 가능 */}
  <DetailNote>자세한 정보는 선번장에서.</DetailNote>
</DetailCard>
```
외형: `rounded-lg border border-line bg-surface p-3` — 점검·고장이력 리스트 카드(`SectionItem`)와 **동일 톤**.

### 리스트 아이템 카드(점검·고장이력 등) → `SectionItem`
`src/features/assets/components/detail/SectionShell.tsx`

### 작성/편집 폼 한 줄 → `FormRow` + `fieldClass` / 인라인 편집은 `EditableField`
`SectionShell.tsx` / `src/features/assets/components/EditableField.tsx`

### 상태 배지(ON/OFF·연결상태 등) → `Badge`
`src/components/ui/Badge.tsx` (`status`: success·warning·danger·info·neutral). `DetailCardHeader` 의 `badgeStatus` 가 이걸 씀.

### 버튼 → `Button` / `IconButton`(`ui`) · 폼 푸터는 `PrimaryButton`/`GhostButton`(`SectionShell`) · 인라인 아이콘은 `IconAction`

### 입력/선택 → `Input` / `Select`(`ui`) 또는 `fieldClass`

### 빈 상태 → `SectionEmpty`(`SectionShell`)

## 4. 새 패턴이 필요하면

기존 컴포넌트로 안 되면 **`src/components/ui` 에 공용으로 추가**하고:
1. `src/components/ui/index.ts` 에 export 추가
2. 이 문서 §3 카탈로그에 한 줄 추가
3. 타이포는 §1, 색은 §2 안에서

그 패널 파일 안에서 일회용 스타일을 만들지 않는다 — 그게 비일관성의 원인이다.
