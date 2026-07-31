# UI 일관성 규칙 (사이드패널·상세 카드)

> **목적:** 매번 패널/카드를 새로 만들 때마다 폰트 크기·여백·테두리가 제각각이 되는 문제를
> 막는다. **새 UI를 짜기 전에 이 문서를 먼저 읽고, 아래 공용 컴포넌트를 재사용**한다.
> 여기 있는 컴포넌트로 표현되는 것은 직접 `<div className="...">` 로 다시 만들지 않는다.

## 0. 황금률

1. **공용 컴포넌트 먼저.** `src/components/ui` 에 이미 있는 것을 쓴다. 없으면 *여기에 추가*하고
   이 문서에 적는다 — 패널 안에서 일회용으로 만들지 않는다.
2. **타이포 스케일을 벗어나지 않는다(아래 §1).** `text-[11px]`, `text-[8px]` 같은 임의 초소형 폰트 금지.
3. **시맨틱 색 토큰만(아래 §2).** 하드코딩 hex(`#fff`)·원시 팔레트(`gray-500`) 금지.
4. **z-index 는 토큰만(아래 §2.5).** `z-50`·`z-[15]` 같은 raw/임의 z, 인라인 `style={{ zIndex }}` 금지.

## 1. 타이포 스케일 (이것만 사용)

| 용도 | 클래스 | 비고 |
| --- | --- | --- |
| 본문·값(value)·입력 | `text-sm` | 카드/필드의 기본 |
| 라벨·메타·배지·보조설명·카운트 | `text-xs` | 라벨과 부가정보 |
| 섹션 제목(h3) | `text-sm font-semibold` | |
| (장식용 초소형) | `text-xs` 까지만 | 그리드 타일 번호 등 *예외적*으로만 |

**`text-xs`(12px) 미만은 원칙적으로 쓰지 않는다.** 차단기/포트 그리드 타일처럼 칸이 작아
불가피한 경우에만 `text-xs` 까지 허용하고, 그 이하는 금지.

## 2. 색 토큰 (시맨틱만)

- 글자: `text-content`(본문) · `text-content-muted`(라벨) · `text-content-faint`(보조/빈상태)
- 면: `bg-surface`(카드) · `bg-surface-2`(보조/hover)
- 선: `border-line`
- 강조/상태: `text-primary` · `text-success`/`bg-success-bg` · `text-warning`/`bg-warning-bg` · `text-danger`/`bg-danger-bg` · `text-info`/`bg-info-bg`

## 2.5 z-index 스케일 (토큰만 — tailwind.config `zIndex`)

레이어는 의미 토큰으로만 쌓는다. raw 숫자(`z-50`)·임의값(`z-[15]`)·인라인 `style={{ zIndex }}` 금지.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `z-sticky` | 10 | 스크롤 콘텐츠 위 sticky 헤더(탭바 등) |
| `z-legend` | 15 | 캔버스 위 범례·힌트·인디케이터(패널 아래) |
| `z-panel` | 20 | 에디터 슬라이드 패널·캔버스 배너 |
| `z-backdrop` | 40 | 드롭다운/메뉴 백드롭·인라인 팝오버 |
| `z-modal` | 50 | 메뉴·팝오버·모달(최상위 상호작용) |
| `z-top` | 60 | 모달 위 라이트박스·토스트·중첩 다이얼로그 |
| `z-alert` | 70 | 충돌 다이얼로그 — 모든 레이어 위 |

**0~9 대역은 캔버스 내부 오버레이 전용**(연결선/경로/리사이즈 핸들 등 `style={{ zIndex: 10~14 }}` 의 세밀 레이어) — 이 스케일 밖이며 그대로 둔다.

## 3. 컴포넌트 카탈로그 — "이걸 쓰세요"

실제로 존재하는 공용 컴포넌트는 전부 `src/components/ui`(배럴 `index.ts`)에 있다:
`Badge`, `Button`, `IconButton`, `Card`, `DetailCard`/`DetailCardHeader`/`DetailRow`/`DetailNote`, `Input`, `Select`, `Modal`, `CommitBar`, `cn`.
아래 항목은 각 용도별로 그중 어떤 걸 쓸지 안내한다 — v2(`src/v2/`)와 레거시 잔존 화면 공통.

### 클릭하면 아래에 뜨는 "선택 상세 카드" → `DetailCard` 패밀리
`src/components/ui/DetailCard.tsx` — 광슬롯 포트, 피더 CB 등 **무언가 클릭 시 상세가 뜨는 카드는 전부 이것**.
```tsx
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from '../../components/ui';

<DetailCard>
  <DetailCardHeader title="포트 3" badge="양측" badgeStatus="success" />
  <DetailRow label="자국">{name}</DetailRow>
  <DetailRow label="대국">{/* 값 자리에 Input/Select 등 편집 노드도 그대로 넣을 수 있다 */}</DetailRow>
  <DetailNote>자세한 정보는 선번장에서.</DetailNote>
</DetailCard>
```
외형: `rounded-lg border border-line bg-surface p-3`.
수정/삭제가 필요하면 `DetailCardHeader` 에 `onEdit`/`onDelete` 를 주면 우측에 연필/휴지통 액션이 뜬다.

### 리스트 아이템 카드(점검·고장이력 등) → 역시 `DetailCard`
별도 "리스트 카드" 컴포넌트는 없다 — `RecordsTab.tsx` 가 실증하듯 점검/고장이력 리스트의 각 항목도 그대로 `DetailCard`(+`DetailCardHeader`) 를 재사용한다. 상세 카드와 리스트 카드를 구분해 별도로 만들지 않는다.

### 작성/편집 폼 한 줄 → `DetailRow`
`FormRow`/`EditableField` 라는 별도 컴포넌트는 없다. `DetailRow label="...">` 안에 `Input`/`Select` 를 직접 넣는 것이 v2 의 표준 패턴(`InfoTab.tsx` 참고) — 상세 표시 행과 편집 행을 같은 컴포넌트로 겸한다.

### 상태 배지(ON/OFF·연결상태 등) → `Badge`
`src/components/ui/Badge.tsx` (`status`: success·warning·danger·info·neutral). `DetailCardHeader` 의 `badgeStatus` 가 이걸 씀.

### 버튼 → `Button` / `IconButton`
`Button` 은 `variant`(`primary`/`secondary`/`ghost`/`danger`) + `size`(`sm`/`md`) props 로 톤을 결정한다 — 별도의 `PrimaryButton`/`GhostButton`/`IconAction` 컴포넌트는 없다. 아이콘 전용 버튼은 `IconButton`.

### 입력/선택 → `Input` / `Select`
별도의 `fieldClass` 유틸은 없다 — `Input`/`Select` 를 직접 쓴다.

### 대화상자 → `Modal`
Esc 닫기·백드롭 클릭 닫기·`size="sm"/"md"` 폭 고정을 내장. 자체 오버레이(`fixed inset-0` 직접 구현)를 새로 만들지 말고 이걸 재사용한다.

### 저장 대기 바(작업 중 변경사항) → `CommitBar`
`dirty`(대기 건수)·`onCommit`·`onRevert` 를 받는 고정 바. 워킹카피 편집 화면 상단에서 재사용.

### 슬롯/포트/차단기 그리드(장비 내부 GUI)
레거시의 `SlotRailGrid`/`SlotTile`/`BreakerRail`/`PortGrid` 공용 컴포넌트는 Stage 7 구코드 정리에서 삭제됐고, v2 재구축에서 아직 대체 공용 컴포넌트로 다시 만들어지지 않았다. 현재는 `InfoTab.tsx` 의 로컬 `SlotGrid` 처럼 **각 화면이 자체적으로** 슬롯 그리드를 렌더링한다. 슬롯형 GUI를 2곳 이상에서 반복 구현하게 되면 그때 `src/components/ui` 에 공용 컴포넌트로 승격하고 이 문서에 등록한다(§4).

## 4. 새 패턴이 필요하면

기존 컴포넌트로 안 되면 **`src/components/ui` 에 공용으로 추가**하고:
1. `src/components/ui/index.ts` 에 export 추가
2. 이 문서 §3 카탈로그에 한 줄 추가
3. 타이포는 §1, 색은 §2 안에서

그 패널 파일 안에서 일회용 스타일을 만들지 않는다 — 그게 비일관성의 원인이다.
