# 프론트엔드 디자인 일관성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트엔드 전역의 hover/press/focus/transition·타이포 위계·현황 정렬 헤더 UX를 단일 토큰/헬퍼로 통일한다.

**Architecture:** `index.css`에 press용 토큰(`--surface-3`)과 `@layer components` 인터랙션 헬퍼(`.focus-ring` `.press-btn` `.row-interactive`)를 정의하고, `tailwind.config.js`에 `surface-3` 색을 매핑한다. 이후 UI 프리미티브와 feature 컴포넌트들이 이 헬퍼/토큰을 inline Tailwind와 함께 사용하도록 className을 통일한다.

**Tech Stack:** React + TypeScript + Tailwind CSS v3.4 + lucide-react. 자체 UI 프리미티브(`components/ui/`).

**Spec:** `docs/superpowers/specs/2026-06-12-frontend-design-consistency-design.md`

**개발 환경:** DB는 `docker compose -f docker-compose.dev.yml up -d`, 서버는 `npm run dev`(프론트는 `frontend/`에서 Vite HMR). 빌드 검증은 `frontend/`에서 `npm run build`. Docker 빌드 금지.

**검증 원칙:** 순수 스타일 변경이라 단위 테스트가 의미 없으므로, 각 태스크는 `npm run build`(타입체크/빌드) 통과 + 마지막 E2E 태스크(Playwright)로 두 핵심 인터랙션을 확인한다. 커밋은 태스크 단위.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `frontend/src/index.css` | 토큰 + 인터랙션 헬퍼 | `--surface-3` 추가, `@layer components` 헬퍼 3종 |
| `frontend/tailwind.config.js` | 토큰→Tailwind 매핑 | `surface-3` 색 |
| `frontend/src/components/ui/Button.tsx` | 버튼 프리미티브 | press + focus-ring |
| `frontend/src/components/ui/IconButton.tsx` | 아이콘 버튼 | press(+ 기존 focus 유지) |
| `frontend/src/components/ui/Input.tsx` | 인풋 | focus-ring 표준 |
| `frontend/src/components/ui/Select.tsx` | 셀렉트 | focus-ring 표준 |
| `frontend/src/components/ui/Card.tsx` | 카드 | onClick 있을 때 interactive |
| `frontend/src/components/DetailPanelHeader.tsx` | 패널 헤더 | delete/close 버튼 통일 |
| `frontend/src/features/assets/components/detail/DetailTabs.tsx` | 상세 탭 | hover 강화 + press + focus-ring |
| `frontend/src/features/assets/components/StatusSummary.tsx` | 현황 칩 | press |
| `frontend/src/components/tree/TreePanel.tsx` | 트리 노드 | press(+ 기존 hover/transition 유지) |
| `frontend/src/components/CollapsibleSection.tsx` | 접이 섹션 | transition 보강 + press(bg) |
| `frontend/src/features/assets/components/NodeStatusView.tsx` | 현황 표 | 정렬 헤더 재설계 + 헤더 13px + 행 press |

---

## Task 1: 토큰 + 인터랙션 헬퍼 기반

**Files:**
- Modify: `frontend/src/index.css:6-15` (토큰), `frontend/src/index.css:24-29` (헬퍼 추가)
- Modify: `frontend/tailwind.config.js:28-29` (surface-3 매핑)

- [ ] **Step 1: `--surface-3` 토큰 추가**

`index.css`의 `:root` 첫 줄을 다음으로 교체(끝에 `--surface-3` 추가):

```css
  --bg:#eef0f3; --surface:#ffffff; --surface-2:#f4f6f8; --surface-3:#e7eaee; --sidebar:#f8f9fb;
```

- [ ] **Step 2: 인터랙션 헬퍼 정의**

`index.css`의 `@layer utilities { ... }` 블록 **앞에** `@layer components` 블록을 추가:

```css
/* 인터랙션 표준 헬퍼 — 동일 조합 반복을 한 곳에서 보장(spec §7) */
@layer components {
  /* 포커스 링 — 모든 포커스 가능 요소 공통(위험 동작은 inline ring-danger/40 사용) */
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40;
  }
  /* 버튼 눌림 — transition(all)로 색+transform 동시 전환, 눌림 시 살짝 축소 */
  .press-btn {
    @apply transition active:scale-[0.97];
  }
  /* 면 기반 인터랙티브(행·노드·탭) — hover/active 배경 표준 */
  .row-interactive {
    @apply transition-colors hover:bg-surface-2 active:bg-surface-3;
  }
}
```

- [ ] **Step 3: `surface-3` 색 매핑**

`tailwind.config.js`의 `colors` 안 `'surface-2': 'var(--surface-2)',` 다음 줄에 추가:

```js
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
```

- [ ] **Step 4: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: 타입체크/빌드 PASS. (`surface-3`/헬퍼 클래스가 인식되어 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/index.css frontend/tailwind.config.js
git commit -m "feat(ui): 인터랙션 표준 토큰·헬퍼 추가 (surface-3, focus-ring/press-btn/row-interactive)"
```

---

## Task 2: Button + IconButton — press / focus 표준

**Files:**
- Modify: `frontend/src/components/ui/Button.tsx:36`
- Modify: `frontend/src/components/ui/IconButton.tsx:23-24`

- [ ] **Step 1: Button에 press + focus-ring 적용**

`Button.tsx`의 base className 문자열(현재 `'inline-flex items-center gap-1.5 rounded font-medium transition-colors'`)을 교체:

```ts
        'press-btn focus-ring inline-flex items-center gap-1.5 rounded font-medium',
```

(`transition-colors` → `press-btn`이 `transition`(all)을 포함하므로 제거. `danger` variant의 `hover:opacity-90`도 transition으로 함께 부드럽게 전환됨.)

- [ ] **Step 2: IconButton에 press 적용**

`IconButton.tsx:23`의 첫 클래스 문자열을 교체(기존 focus-visible 라인 24는 그대로 유지):

```ts
        'press-btn p-2 rounded text-content-muted hover:bg-surface-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
```

(`transition-colors duration-150` → `press-btn`이 transition 포함하므로 제거.)

- [ ] **Step 3: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/IconButton.tsx
git commit -m "feat(ui): Button·IconButton press(active:scale)·focus 표준화"
```

---

## Task 3: Input + Select — focus ring 표준

**Files:**
- Modify: `frontend/src/components/ui/Input.tsx:17`
- Modify: `frontend/src/components/ui/Select.tsx:18`

- [ ] **Step 1: Input focus 통일**

`Input.tsx:17`의 `'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',`를 교체:

```ts
        'transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
```

(`ring-1`→`ring-2`, 단색 ring→`primary/20`(은은하게), transition 추가로 border/ring 전환 부드럽게. 입력 요소는 `focus`(non-visible) 유지 — 타이핑 진입 시에도 보여야 함.)

- [ ] **Step 2: Select focus 통일**

`Select.tsx:18`의 동일 문자열을 같은 값으로 교체:

```ts
        'transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
```

- [ ] **Step 3: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/ui/Input.tsx frontend/src/components/ui/Select.tsx
git commit -m "feat(ui): Input·Select focus 링 표준화(ring-2 primary/20 + transition)"
```

---

## Task 4: DetailPanelHeader — delete/close 버튼 통일

**Files:**
- Modify: `frontend/src/components/DetailPanelHeader.tsx:33,43`

- [ ] **Step 1: delete 버튼 통일**

`DetailPanelHeader.tsx:33`의 className을 교체(press-btn 추가, focus ring은 위험 동작이라 danger 유지):

```tsx
            className="press-btn p-1 rounded text-content-faint hover:text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
```

- [ ] **Step 2: close 버튼 통일**

`DetailPanelHeader.tsx:43`의 className을 교체(`transition-colors duration-150`→`press-btn`, focus는 `.focus-ring` 헬퍼):

```tsx
          className="press-btn focus-ring p-1 rounded text-content-muted hover:bg-surface-2"
```

- [ ] **Step 3: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/DetailPanelHeader.tsx
git commit -m "feat(ui): DetailPanelHeader 삭제·닫기 버튼 press·focus 통일"
```

---

## Task 5: DetailTabs — hover 강화 + press + focus

**Files:**
- Modify: `frontend/src/features/assets/components/detail/DetailTabs.tsx:43-47`

- [ ] **Step 1: 탭 버튼 className 교체**

문제: 비활성 hover가 `hover:bg-surface-2/50`(50% 투명)이라 거의 안 보이고 press 없음. `DetailTabs.tsx:43`의 className 템플릿과 분기(43-47)를 교체:

```tsx
              className={`relative -mb-px flex flex-1 items-center justify-center gap-1 px-1 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors focus-ring active:bg-surface-3 ${
                on
                  ? 'text-content font-medium border-primary'
                  : 'text-content-muted hover:text-content hover:bg-surface-2 border-transparent'
              }`}
```

(변경점: `hover:bg-surface-2/50`→`hover:bg-surface-2`(불투명), `active:bg-surface-3` press 추가, `focus-visible:outline-none`→`.focus-ring`. 면 기반이라 scale press 대신 bg press.)

- [ ] **Step 2: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/assets/components/detail/DetailTabs.tsx
git commit -m "feat(ui): 상세 탭 hover 가시성 강화 + press·focus 통일"
```

---

## Task 6: StatusSummary — 칩 press

**Files:**
- Modify: `frontend/src/features/assets/components/StatusSummary.tsx:24-28`

- [ ] **Step 1: 칩 base/분기 교체**

`StatusSummary.tsx:24`의 `base`와 25-28의 `chipClass`를 교체(인터랙티브 칩에 press-btn, hover는 기존 의미색 유지):

```ts
  const base = 'text-xs px-2 py-1 rounded font-medium transition-colors';
  const chipClass = (selected: boolean) =>
    selected
      ? `${base} bg-primary text-white`
      : `${base} bg-surface-2 text-content-muted ${interactive ? 'press-btn hover:bg-info-bg hover:text-primary cursor-pointer' : ''}`;
```

(추가: 비활성·인터랙티브 칩에 `press-btn`. 활성 칩은 토글 해제만 하므로 press 생략 가능하나 일관성 위해 두지 않음 — 선택칩은 강조 자체가 상태표시.)

- [ ] **Step 2: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/assets/components/StatusSummary.tsx
git commit -m "feat(ui): 현황 요약 칩 press 통일"
```

---

## Task 7: TreePanel — 노드 press

**Files:**
- Modify: `frontend/src/components/tree/TreePanel.tsx:188,206`

- [ ] **Step 1: 노드 행에 press(bg) 추가**

`TreePanel.tsx:188`의 className 템플릿 첫 부분을 교체(기존 `hover:bg-surface-2 ... transition-colors` 유지 + `active:bg-surface-3`):

```tsx
          className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-surface-2 active:bg-surface-3 rounded-md text-sm transition-colors ${
```

- [ ] **Step 2: 펼침 chevron 전환 명시**

`TreePanel.tsx:206`의 `className={`transition-transform ${node.expanded ? 'rotate-90' : ''}`}`를 교체(전환 시간 명시로 부드럽게):

```tsx
                className={`transition-transform duration-150 ${node.expanded ? 'rotate-90' : ''}`}
```

- [ ] **Step 3: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/tree/TreePanel.tsx
git commit -m "feat(ui): 트리 노드 press + chevron 전환 통일"
```

---

## Task 8: CollapsibleSection — transition 보강 + press

**Files:**
- Modify: `frontend/src/components/CollapsibleSection.tsx:12`

- [ ] **Step 1: 헤더 버튼에 transition + press**

문제: hover 클래스만 있고 transition 없어 즉시 전환. `CollapsibleSection.tsx:12`의 className을 교체:

```tsx
        className="w-full flex items-center gap-2 py-2 text-xs font-semibold text-content-muted transition-colors hover:text-content active:text-content-muted focus-ring rounded"
```

(추가: `transition-colors`(부드러운 전환), `focus-ring`, `rounded`(focus ring 모양). 텍스트 기반이라 scale 대신 색 press.)

- [ ] **Step 2: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/CollapsibleSection.tsx
git commit -m "feat(ui): CollapsibleSection 헤더 transition·focus 보강"
```

---

## Task 9: Card — 클릭형일 때 interactive

**Files:**
- Modify: `frontend/src/components/ui/Card.tsx:9-26`

- [ ] **Step 1: onClick 감지해 interactive 클래스 적용**

`Card.tsx`의 컴포넌트 본문을 교체(rest에 onClick 있으면 `.row-interactive` + cursor):

```tsx
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = true, className, children, ...rest },
  ref,
) {
  const interactive = typeof rest.onClick === 'function';
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface border border-line rounded shadow-sm',
        padding && 'p-4',
        interactive && 'row-interactive cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
```

(주의: Modal이 Card에 `onClick={stopPropagation}`을 주지만 그 Card는 `className`에 별도 배경이 없으므로 hover 배경이 다이얼로그 패널에 생길 수 있음 → Modal에서 Card에 명시적으로 무력화. Step 2 참고.)

- [ ] **Step 2: Modal의 Card는 interactive 무력화**

`Modal.tsx:37`의 Card className에 hover/press 무력화 클래스를 추가(다이얼로그 패널은 hover 배경이 없어야 함):

```tsx
        className={cn('mx-4 w-full max-w-md hover:!bg-surface active:!bg-surface cursor-default', className)}
```

- [ ] **Step 3: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/ui/Card.tsx frontend/src/components/ui/Modal.tsx
git commit -m "feat(ui): 클릭형 Card interactive 표준 + Modal 패널 무력화"
```

---

## Task 10: NodeStatusView — 정렬 헤더 재설계 + 폰트 + 행 press

**Files:**
- Modify: `frontend/src/features/assets/components/NodeStatusView.tsx:79-80` (행), `:317-340` (헤더)

정렬 3-state 로직(`:220-227`)은 이미 존재 — 로직 변경 없음. UX/스타일만.

- [ ] **Step 1: 행 hover/press 통일**

`NodeStatusView.tsx:79-81`의 `<tr>` className 템플릿을 교체(`hover:bg-surface-2` 유지 + `active:bg-surface-3`):

```tsx
      className={`h-12 cursor-pointer border-b border-line transition-colors ${
        selected ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2 active:bg-surface-3'
      }`}
```

- [ ] **Step 2: 헤더 셀 전체 클릭 + 항상 보이는 아이콘 + 활성 강조 + 13px**

`NodeStatusView.tsx:318-339`의 `COLUMNS.map(...)` 블록 전체를 교체:

```tsx
                  {COLUMNS.map((c, i) => {
                    const active = sort?.col === c;
                    const pad = i === 0 ? 'pl-4 pr-2' : i === COLUMNS.length - 1 ? 'px-2 pr-4' : 'px-2';
                    return (
                      <th
                        key={c}
                        aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`p-0 text-[13px] font-medium tracking-wide ${active ? 'bg-surface-2' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => cycleSort(c)}
                          aria-label={`${c} 정렬`}
                          className={`group w-full h-full inline-flex items-center gap-1 ${pad} py-2.5 cursor-pointer select-none transition-colors hover:bg-surface-2 active:bg-surface-3 focus-ring ${
                            active ? 'text-content font-semibold' : 'text-content-muted'
                          }`}
                        >
                          {c}
                          {active && sort?.dir === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-content shrink-0" />
                          ) : active && sort?.dir === 'desc' ? (
                            <ChevronDown className="w-3.5 h-3.5 text-content shrink-0" />
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 text-content-faint shrink-0" />
                          )}
                        </button>
                      </th>
                    );
                  })}
```

변경점:
- `<th>`: padding 제거(`p-0`) → 버튼이 셀 전체를 채우도록(`w-full h-full` + padding은 버튼으로 이동). `uppercase` 제거(13px 한글/영문 라벨 가독성), `text-xs`→`text-[13px]`. 활성 컬럼 셀 배경 `bg-surface-2`.
- 버튼: 전체 셀 클릭 영역, `hover:bg-surface-2 active:bg-surface-3`(hover 배경 추가), `.focus-ring`, 활성 시 `text-content font-semibold`.
- 비활성 아이콘: `opacity-0 group-hover:opacity-100 transition-opacity` 제거 → 항상 `text-content-faint`로 흐리게 표시. `shrink-0` 추가.

- [ ] **Step 3: 헤더 행 배경 정리(선택 컬럼 bg와 충돌 방지)**

`NodeStatusView.tsx:317`의 `<tr>`에서 행 전체 `bg-surface-2`를 유지하되, 활성 셀은 동일 `bg-surface-2`라 시각 차가 약함 → 활성 셀 강조를 위해 헤더 행 배경을 `bg-surface`로 바꾸고 비활성 셀은 투명, 활성 셀만 `bg-surface-2`로 대비. `:317` 교체:

```tsx
                <tr className="text-left bg-surface border-b border-line sticky top-0">
```

(Step 2에서 활성 `<th>`만 `bg-surface-2`, 버튼 hover도 `bg-surface-2` → 흰 헤더 위에서 활성/hover가 또렷이 구분됨.)

- [ ] **Step 4: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: PASS (imports `ChevronUp/ChevronDown/ChevronsUpDown`는 이미 존재)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/assets/components/NodeStatusView.tsx
git commit -m "feat(assets): 현황 정렬 헤더 표준 테이블 패턴 재설계 + 헤더 13px + 행 press"
```

---

## Task 11: 전역 E2E 검증 (Frontend→E2E 파이프라인)

**Files:** 없음(검증 전용)

- [ ] **Step 1: dev 환경 기동**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d
cd frontend && npm run dev
```
Expected: Vite dev 서버 기동(HMR). 백엔드 watch 정상.

- [ ] **Step 2: 사이드패널 탭 인터랙션 확인 (Playwright)**

자산을 선택해 상세 패널(SidePanel) 열기 → DetailTabs 확인:
- 비활성 탭에 hover 시 **배경(bg-surface-2)이 또렷이** 보인다(기존엔 거의 안 보였음).
- 탭 클릭 시 press(배경 진해짐) 피드백.
- 키보드 Tab 이동 시 focus ring(primary/40)이 보인다.
- 활성 탭 하단 밑줄(border-primary) 유지.

- [ ] **Step 3: 현황 정렬 헤더 확인 (Playwright)**

현황 페이지(NodeStatusView) 표에서:
- 모든 컬럼 헤더에 정렬 아이콘(`⇅`)이 **항상 흐리게 보인다**(hover 전에도).
- 헤더 셀 **어느 위치를 클릭해도**(글자 밖 포함) 정렬된다.
- 클릭 1회 오름차순(▲, 진하게) → 2회 내림차순(▼) → 3회 해제(원래 순서, 아이콘 다시 흐림).
- 활성 컬럼은 텍스트가 진하고(font-semibold) 셀 배경(surface-2)이 강조된다.
- 헤더 hover 시 배경 변화 + 커서 pointer.
- 헤더 글자 크기 13px로 본문(14px)과 위계가 구분된다.

- [ ] **Step 4: 회귀 확인**

- 정렬 결과가 기존과 동일(asc/desc 값 순서).
- 행 선택(좌측 accent line), 칩 필터, 검색, 패널 전환 정상.
- 버튼/모달/트리 등에서 press(active) 피드백이 일관되게 보이고 레이아웃 깨짐 없음.

- [ ] **Step 5: 최종 빌드**

Run: `cd frontend && npm run build`
Expected: PASS

---

## Self-Review 결과

- **Spec 커버리지**: §3 토큰(T1,2,4,5,6,7,10) / §4 타이포(T10 헤더13px; 본문·제목·캡션 유지) / §5 정렬헤더(T10) / §6 적용맵(T2–T10 전 컴포넌트 매핑) / §7 인코딩(T1 헬퍼) / §9 검증(T11). Badge는 비인터랙티브로 변경 없음(spec §6 명시) — 의도된 무변경.
- **Placeholder**: 없음(모든 step에 실제 className/코드 포함).
- **타입 일관성**: `--surface-3`→`surface-3`(T1) 매핑을 T5,6,7,10에서 동일 사용. 헬퍼명 `.focus-ring/.press-btn/.row-interactive` 전 태스크 일치.
