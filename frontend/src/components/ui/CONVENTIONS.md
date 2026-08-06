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
| 섹션 제목(h3) | `text-sm font-semibold` | `DetailCardHeader` 가 이미 이 크기다 |
| (장식용 초소형) | `text-xs` 까지만 | 그리드 타일 번호 등 *예외적*으로만 |

**`text-xs`(12px) 미만은 원칙적으로 쓰지 않는다.** 차단기/포트 그리드 타일처럼 칸이 작아
불가피한 경우에만 `text-xs` 까지 허용하고, 그 이하는 금지.

**입력에는 `text-xs` 를 쓰지 않는다.** 입력값은 본문이다 — 패널이 좁으면 글자를 줄이지 말고
`size="sm"`(§3 입력/선택)으로 여백만 줄인다.

## 1.5 크기·간격은 prop 으로, className 으로 덮어쓰지 않는다

공용 컴포넌트의 여백/글자를 `className` 으로 다시 지정하면 같은 컴포넌트가 화면마다 다른
크기로 나온다(실제로 `<Input className="py-0.5 text-sm">` 가 16곳에 흩어져 있었고, 그래서
같은 입력이 어떤 패널에서는 26px, 어떤 패널에서는 38px 이었다).

| 무엇 | 어떻게 |
| --- | --- |
| 버튼 크기 | `<Button size="sm" \| "md">` |
| 입력/선택 크기 | `<Input size="sm" \| "md">` · `<Select size="sm" \| "md">` (→ `controlSize.ts`) |
| 카드 안 항목 블록 | `<ItemCard>` (직접 `rounded border bg-surface-2 p-2` 를 쓰지 않는다) |
| 폼/상세 한 줄 | `<DetailRow>` (라벨 폭·오류 문구 위치가 여기서 고정된다) |

`className` 은 배치(`flex-1`·`w-full`·`mt-*`)에만 쓴다.

## 1.6 개수에 비례해 커지는 UI 를 만들지 않는다

카탈로그(자산 타입·케이블 종류)는 **사용자가 계속 늘리는 데이터**다. 항목마다 버튼을 하나씩
까는 도구바는 항목이 늘면 두 줄, 세 줄로 번져 정작 작업 영역을 잡아먹는다(평면도 배치
도구바가 시드 7개에서 이미 두 줄이었다).

목록에서 하나를 고르는 도구는 **`[도구 버튼] + [대상 Select]`** 형태로 만든다 — 항목이
몇 개든 한 줄이다. 평면도의 배치·케이블 도구가 이 형태다.

## 1.7 목록 행의 액션은 호버에서 드러낸다

행마다 ✏·🗑 를 항상 띄우면 목록이 아이콘으로 시끄러워지고, 무엇이 내용이고 무엇이
조작인지 흐려진다. 액션은 **자리를 항상 차지한 채 `opacity` 만 바꾼다**:

```tsx
<div className="group flex items-center ...">
  <span className="min-w-0 flex-1 truncate">{name}</span>
  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
    <IconButton size="sm" aria-label="이름 변경">…</IconButton>
  </span>
</div>
```

`hidden → group-hover:flex` 로 하면 **호버 순간 요소가 행에 끼어들어 폭·높이가 바뀌고**,
그 바람에 커서가 다른 요소 위로 가면서 호버가 껐다 켜졌다를 반복한다(목록이 떤다).
행 안의 아이콘 버튼은 `size="sm"` — 행 높이를 넘기면 같은 떨림이 생긴다.

## 1.8 "지금 어디에 무엇을 하는지" 를 화면에 남긴다

패널·모달은 그 자체로 맥락을 갖고 있어야 한다. 실제로 있었던 결함들:

- 상세 패널의 자산 이름이 '정보' 탭 **안**에만 있어, 점검·연결 탭으로 옮기면 무엇의
  기록인지 알 수 없었다 → 대상 이름은 `PanelHeader` 로 탭 **위**에 고정한다.
- 자산 추가 모달이 어느 층·어느 함체에 넣는지 안 보여줬다 → 첫 줄에 `위치` 를 밝힌다.
- 조직 추가/이름변경 모달의 제목이 그냥 "추가" 였다 → `본부 추가`·`층 이름 변경` 처럼
  **무엇을** 다루는지 제목에 넣는다.

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
`Badge`, `Button`, `IconButton`, `Card`, `DetailCard`/`DetailCardHeader`/`DetailRow`/`DetailNote`,
`ItemCard`, `PanelHeader`, `Tabs`, `Input`, `Select`, `Modal`, `ConfirmModal`, `PromptModal`,
`useConfirm`, `ErrorStrip`, `CommitBar`, `TableSearch`, `cn`, `controlSize`.
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

### 작성/편집 폼 한 줄 → `DetailRow` (모달 안에서도 동일)
**모달이라고 라벨을 입력 위로 올리지 않는다.** 예전에는 패널은 라벨이 좌측, 모달은 라벨이
위여서 같은 앱 안에서 폼이 두 가지로 보였다. 어디서든 `DetailRow` 를 쓴다.

`FormRow`/`EditableField` 라는 별도 컴포넌트는 없다 — `DetailRow` 하나가 상세 표시 행과 편집 행을 겸한다.
라벨 폭(`w-16`)·검증 문구 위치가 여기서 고정되므로, 라벨+입력 조합을 직접 `<div className="flex">` 로 짜지 않는다.
```tsx
<DetailRow label="슬롯 수" issue={slotIssue} hint={isFree ? '자유형' : undefined}>
  <Input size="sm" value={...} onChange={...} />
</DetailRow>
<DetailRow label="수용 대상" align="start">{/* 세로로 긴 값이면 align="start" */}</DetailRow>
```

### 목록 안에서 되풀이되는 항목(컨테이너 1·포트 2·필드 3…) → `ItemCard`
`DetailCard` *안*에 들어가는 회색 항목 블록. 제목 + (선택)삭제 버튼을 내장한다.
```tsx
<ItemCard title={`포트 ${i + 1}`} onDelete={locked ? undefined : () => remove(i)}>
  <DetailRow label="그룹">…</DetailRow>
</ItemCard>
```

### 패널 상단 바(사이드바 제목·본문 헤더) → `PanelHeader`
좌우 패널의 첫 구분선이 어긋나지 않도록 높이(`h-10`)를 고정한다. `variant="sidebar"`(작은 라벨) / `"content"`(대상 이름).
우측 액션은 `actions`, 제목 옆에 붙는 것(뷰 탭 등)은 children.

### 밑줄형 탭(뷰 전환·상세 탭·카탈로그 탭) → `Tabs`
```tsx
<Tabs items={VIEW_TABS} value={viewMode} onChange={setViewMode} />
```
비활성 탭도 테두리 자리를 차지하므로 탭을 골라도 줄이 밀리지 않는다 — 직접 만들면 이 실수를 반복한다.

### 카드 안 섹션 제목 → `DetailCardHeader`
`<p className="text-xs font-semibold text-content-muted">속성</p>` 처럼 직접 쓰지 않는다 — 같은 패널 안에서 제목 크기가 갈린다.
우측 버튼(업로드·추가·지우기)은 `actions`, 수정/삭제는 `onEdit`/`onDelete`.
```tsx
<DetailCardHeader title="사진" actions={<Button variant="secondary" size="sm">업로드</Button>} />
```
카드 머리줄 액션은 `variant="secondary" size="sm"` 로 통일한다(행 안쪽 인라인 액션만 `ghost`).

### 상태 배지(ON/OFF·연결상태 등) → `Badge`
`src/components/ui/Badge.tsx` (`status`: success·warning·danger·info·neutral). `DetailCardHeader` 의 `badgeStatus` 가 이걸 씀.

**표의 한 열로 되풀이되는 상태는 `Badge` 가 아니라 `StatusDot`.** 색 채운 알약은 하나일 때는 좋지만 17행이 전부 초록 알약이 되면 색이 아무것도 말해 주지 않고, 정작 고장 한 줄이 묻힌다. `StatusDot` 은 평상시(정상·예비)를 조용히 두고 눈길을 끌 톤(경고·고장)만 글자까지 색을 준다. 무엇이 "눈길을 끌 상태" 인지는 **상태 어휘가 선언한 톤**에서 나온다 — 화면 코드가 `normal`·`fault` 같은 상태 값 이름을 알지 않는다. 단독 강조(패널 머리말·안내 띠)는 그대로 `Badge`.

### 버튼 → `Button` / `IconButton`
`Button` 은 `variant`(`primary`/`secondary`/`ghost`/`danger`) + `size`(`sm`/`md`) props 로 톤을 결정한다 — 별도의 `PrimaryButton`/`GhostButton`/`IconAction` 컴포넌트는 없다. 아이콘 전용 버튼은 `IconButton`(`size` `sm`/`md` + `tone` `default`/`danger`).

**되돌리기 어려운 동작(삭제)은 붉은 덩어리 버튼으로 상시 노출하지 않는다.** 도구바에 `Button variant="danger"` 가 늘 떠 있으면 시선을 붙들고 잘못 누르기도 쉽다. `IconButton tone="danger"` + 확인 대화상자로 하고, 키보드 단축키가 있으면 `aria-label`·`title` 에 함께 적는다(`자산 삭제 (Delete)`). 붉은 덩어리 버튼은 확인 대화상자 안의 최종 확인처럼 **그 화면의 주 동작일 때만** 쓴다.

### 표 위 검색 상자 → `TableSearch`
`src/components/ui/TableSearch.tsx` — 현황·선번장·계통이 같은 검색 헤더를 쓴다. 상자와 `N / M건` 표시를 맡고, **무엇으로 거를지는 호출부**가 정한다(열 구성이 표마다 다르다). 검색 중 결과가 비면 빈 상태 문구도 검색어를 되짚어 준다 — "검색이 잘못됐나" 와 "원래 없다" 가 구분되지 않으면 같은 검색을 반복하게 된다.

### 입력/선택 → `Input` / `Select`
별도의 `fieldClass` 유틸은 없다. 크기는 `size` prop(`sm`/`md`) 으로만 정한다(§1.5) — `className` 으로 여백·글자를 덮어쓰지 않는다.

**폭은 감싸는 칸으로 정한다** — `<Select className="max-w-xs">` 처럼 컨트롤에 직접 걸면 안 된다. `Select` 의 화살표는 래퍼 기준 절대배치라 `<select>` 만 좁아지고 화살표는 원래 자리에 남아 따로 논다(선번장·계통이 실제로 그랬다). `<div className="w-64"><Select …/></div>` 로 감싼다.

### 표 셀 인라인 편집(blur/Enter 커밋) → `InlineEditCell`
`src/v2/components/InlineEditCell.tsx` — 선번장·계통 뷰처럼 표 셀 안에서 값을 직접 편집하는 경우 전용. `Input`/`Select` 위에 blur/Enter 커밋 셸(uncontrolled `defaultValue` + `key={value}` 리마운트-리셋 + `onBlur`에서 `e.currentTarget.value` 동기 캡처 + Enter → blur)을 얹은 v2 전용 공용 컴포넌트다 — 무엇을 비교/파싱해 커밋할지는 호출부의 `onCommit`이 맡는다. `value`/`onCommit`/`type`/`options`(주면 Select) 외 props는 없다. `DetailRow` 안의 폼 편집(`Input`/`Select` 직접)과는 용도가 다르다 — 이건 표 본문 셀 전용.

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

### 오류 한 줄 표시 → `ErrorStrip`
`{error && <span className="text-xs text-danger">…` 을 직접 쓰지 않는다. 닫기가 필요하면 `onDismiss` 를 준다.
```tsx
<ErrorStrip message={error} onDismiss={() => setError(null)} />
```
**주의:** 필드 하나에 붙는 검증 메시지는 이것이 아니다 — `<DetailRow issue={...}>` 로 넘긴다(입력 바로 아래에 뜬다).
`ErrorStrip` 은 카드/폼 전체에 대한 오류(서버 응답 등) 전용.

### 확인 대화상자 → `useConfirm` (`window.confirm` 금지)
네이티브 `confirm`/`prompt`/`alert` 는 쓰지 않는다. 앱과 생김새가 다르고, 브라우저를 막고, **검증 실패를 그 자리에서 보여줄 수 없다.**
```tsx
const { confirm, confirmDialog } = useConfirm();
// ...
if (!(await confirm({ title: '자산 삭제', message: `${n}개 하위 자산이 함께 삭제됩니다.`, confirmLabel: '삭제', danger: true }))) return;
// 렌더 어딘가에
{confirmDialog}
```
`confirmLabel` 은 **동사**로 쓴다(`삭제`·`이동`) — `확인` 보다 결과가 분명하다. 되돌릴 수 없으면 `danger` 를 준다.

### 한 줄 입력 대화상자 → `PromptModal` (`window.prompt` 금지)
`hint` 로 입력 규칙을 알리고, 실패하면 `error` 로 **모달을 닫지 않고** 그 자리에 이유를 보여준다.
```tsx
<PromptModal open={open} title="분류 추가" hint="이름이 곧 키가 되어 나중에 바꿀 수 없습니다."
  label="분류 이름" busy={mut.isPending} error={err} onConfirm={handleAdd} onClose={() => setOpen(false)} />
```
