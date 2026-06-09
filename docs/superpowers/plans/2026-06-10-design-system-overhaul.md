# 프론트엔드 디자인 전면 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> ⚠️ **외형 변경 작업** — 각 화면 태스크는 빌드/타입체크 + **브라우저 확인**으로 검증(동작 회귀 없음 + 외형). 점진 롤아웃(big-bang 금지).

**Goal:** "대학생 프로젝트" UI를 업계표준(방향 C/ISA-101)으로 개편 — 디자인 토큰+컴포넌트+lucide 아이콘+서체 도입, 보라 설비색 제거(설비 무채색·색=상태), 로그인~메인 전 화면 적용.

**Architecture:** CSS변수 토큰 → Tailwind 시맨틱 매핑 → `components/ui/` 프리미티브 → 화면이 프리미티브+토큰 사용. 설비 색 = 무채색, 색 = 상태.

**Tech Stack:** React+Tailwind+vitest. 신규: `lucide-react`, Pretendard 폰트. dev 서버(5173). 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-10-design-system-overhaul-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: 디자인 토큰 + Tailwind + 서체 + lucide

**Files:** Modify `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/index.html`(폰트), `frontend/package.json`(lucide)

- [ ] **Step 1: lucide + 폰트 설치/추가**
- `cd frontend && npm i lucide-react`.
- Pretendard: `index.html` `<head>`에 CDN `<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.css" rel="stylesheet">` (또는 self-host). `index.css` body font-family 에 `Pretendard, -apple-system, ...` 선두.

- [ ] **Step 2: 토큰(CSS 변수) — index.css**
`:root` 에 spec §3 값 추가:
```css
:root{
  --bg:#f5f5f4; --surface:#fff; --surface-2:#fafaf9; --sidebar:#f5f5f4;
  --border:#e7e5e4; --border-2:#d6d3d1;
  --text:#1c1917; --text-2:#57534e; --text-muted:#a8a29e;
  --primary:#15406b; --primary-hover:#1a4e85;
  --success:#15803d; --warning:#b45309; --danger:#b91c1c; --info:#1e40af;
  --success-bg:#dcfce7; --warning-bg:#fef3c7; --danger-bg:#fee2e2; --info-bg:#dbeafe;
  --eq-1:#44403c; --eq-2:#78716c; --eq-3:#a8a29e; --eq-4:#d6d3d1;
  --radius:8px;
}
body{ background:var(--bg); color:var(--text); }
```

- [ ] **Step 3: Tailwind 시맨틱 매핑 — tailwind.config.js**
`theme.extend.colors` 에 토큰 매핑(CSS변수 참조):
```js
colors:{
  surface:'var(--surface)', 'surface-2':'var(--surface-2)', bg:'var(--bg)', sidebar:'var(--sidebar)',
  border:{ DEFAULT:'var(--border)', strong:'var(--border-2)' },
  content:{ DEFAULT:'var(--text)', muted:'var(--text-2)', faint:'var(--text-muted)' },
  primary:{ DEFAULT:'var(--primary)', hover:'var(--primary-hover)' },
  success:'var(--success)', warning:'var(--warning)', danger:'var(--danger)', info:'var(--info)',
  'success-bg':'var(--success-bg)', 'warning-bg':'var(--warning-bg)', 'danger-bg':'var(--danger-bg)', 'info-bg':'var(--info-bg)',
  eq:{ 1:'var(--eq-1)',2:'var(--eq-2)',3:'var(--eq-3)',4:'var(--eq-4)' },
},
borderRadius:{ DEFAULT:'var(--radius)' }
```
- 기존 `cable`/`equipment` 커스텀 색은 Task 3 에서 정리 — 여기선 유지.

- [ ] **Step 4: 빌드 + Commit**
`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. (외형은 폰트만 바뀜.)
```bash
cd /Users/jsk/1210/digital
git add frontend/src/index.css frontend/tailwind.config.js frontend/index.html frontend/package.json frontend/package-lock.json
git commit -m "feat(design): 디자인 토큰(CSS변수)+Tailwind 시맨틱 매핑+Pretendard+lucide 도입"
```

---

## Task 2: 컴포넌트 프리미티브 (`components/ui/`)

**Files:** Create `frontend/src/components/ui/Button.tsx`, `Badge.tsx`, `Card.tsx`, `Input.tsx`, `Select.tsx`, `Modal.tsx`, `IconButton.tsx`, `index.ts`(+tests)

- [ ] **Step 1: 프리미티브 작성(토큰 기반)**
- `Button`: `variant`(primary=bg-primary text-white hover:bg-primary-hover / secondary=bg-surface border border-border / ghost / danger), `size`(sm/md), disabled. lucide 아이콘 슬롯.
- `Badge`: `status`(success/warning/danger/info/neutral) → `bg-*-bg text-* ` (예 success=bg-success-bg text-success).
- `Card`: surface + border + radius + 옅은 그림자.
- `Input`/`Select`: border-border focus:border-primary focus:ring-1 ring-primary, radius.
- `Modal`: 오버레이 + Card, 닫기 IconButton(lucide X).
- `IconButton`: 정사각 hover:bg-surface-2.
- 작은 단위 테스트(variant/status 클래스 렌더, RTL).

- [ ] **Step 2: 통과 + Commit**
`cd frontend && npx vitest run src/components/ui` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/ui
git commit -m "feat(design): UI 프리미티브(Button·Badge·Card·Input·Modal·IconButton)"
```

---

## Task 3: 설비/상태 색 시스템 — 보라 제거 (핵심)

**Files:** Modify `backend/prisma/seed/assetTypes.ts`, `backend/prisma/seed/cableCategories.ts`, `frontend/src/types/connection.ts`, `frontend/src/features/equipment/types/equipment.ts`, 캔버스 렌더러(`features/.../renderers/*equipment*`·rack), 현황 색점 사용처

- [ ] **Step 1: seed 색 — 무채색/표준색 (READ 후)**
- `assetTypes.ts`: 보라(#a855f7·#8b5cf6·#7c3aed) + 형광 색 → **무채색**: 랙=#44403c, OFD=#78716c, 분전반(DIST)=#78716c, PITR/RTU/SW 등=#78716c~#a8a29e(종류는 회색 톤 차등+아이콘/라벨). 모듈=#a8a29e.
- `cableCategories.ts`: 제어케이블(CVV-S/CPEV-S/PCM/CHAMP) 보라#a855f7 → **청회색 #64748b**. 전력=빨강·통신=파랑·광=초록·접지=노랑 유지.
- seed 재적용은 dev DB 에 반영 필요 — 기존 데이터 displayColor 는 마이그레이션/재seed 또는 프론트 폴백으로 무채색 강제(아래).

- [ ] **Step 2: 프론트 색 — 상태 우선 + 폴백**
- 캔버스 설비 렌더러: fill = **무채색**(assetType.displayColor 가 보라여도 무채색 폴백; 또는 종류→eq-* 매핑), **테두리/상태점 = 상태색**(정상=success·점검=warning·이상=danger; 상태는 alerts/asset 상태에서). 랙 모듈 fill=eq-3, 카테고리는 라벨.
- `types/connection.ts CABLE_COLORS`: 제어/기타 보라 → #64748b, 나머지 표준 유지.
- `equipment/types/equipment.ts`: work order IN_PROGRESS `bg-purple-100 text-purple-800` → info(`bg-info-bg text-info`).
- 현황 색점(`AssetGridRow`/NodeStatusView): 종류 색점은 무채색, **상태 배지(색)** 추가.

- [ ] **Step 3: 빌드 + Commit**
`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `cd ../backend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/prisma/seed/assetTypes.ts backend/prisma/seed/cableCategories.ts frontend/src/types/connection.ts frontend/src/features/equipment/types/equipment.ts <캔버스 렌더러·현황 색점 파일>
git commit -m "feat(design): 설비 무채색+색=상태(ISA-101) — 보라 설비/제어케이블색 제거"
```
- [ ] **Step 4: 브라우저 — 평면도/현황에서 보라 없는지, 설비 회색+상태색 확인.**

---

## Task 4: 로그인 화면

**Files:** Modify `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: 재디자인**
좌측 다크 브랜드 패널(`bg-[#1c1917]` 그라데이션, 로고+"변전소 설비 현황관리 시스템" 카피) + 우측 라이트 폼(라벨·Input·primary Button). 기존 중앙 카드 탈피. 토큰/프리미티브 사용. lucide 아이콘.

- [ ] **Step 2: 빌드 + Commit + 브라우저**
`npx tsc --noEmit`·`vite build`·`vitest run src/features` → PASS. 브라우저 로그인 확인.
```bash
git add frontend/src/pages/LoginPage.tsx && git commit -m "feat(design): 로그인 — 브랜드 패널+라이트 폼"
```

---

## Task 5: 앱 셸 + 사이드바 + 트리 아이콘

**Files:** Modify `frontend/src/components/AppShell.tsx`, `frontend/src/features/workspace/TreePanel.tsx`(실경로 확인), 헤더 컴포넌트

- [ ] **Step 1: 셸/사이드바/헤더**
- AppShell: 라이트 회색 사이드바(`bg-sidebar border-border`), 상단 헤더(브랜드+lucide 로고, 브레드크럼, 사용자/로그아웃). 토글 ☰→`PanelLeft`.

- [ ] **Step 2: 트리 노드 아이콘(사용자 지적)**
TreePanel 노드: 본부=`Building2`, 사업소=`MapPin`(또는 `Network`), 변전소=`Zap`, 층=`Layers`, 설비종류=`Server`/`Router`/`HardDrive`. 접기 `ChevronRight`(회전), 활성 노드 `bg-border text-primary`. 이모지/수제SVG 제거. 크기·색 토큰 통일.

- [ ] **Step 3: 빌드 + Commit + 브라우저**
검증 후:
```bash
git add frontend/src/components/AppShell.tsx frontend/src/features/workspace/TreePanel.tsx <헤더>
git commit -m "feat(design): 앱 셸+라이트 사이드바+트리 lucide 아이콘"
```

---

## Task 6: 워크스페이스 탭 + 현황 테이블

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`(탭), `features/assets/components/NodeStatusView.tsx`·`AssetGridRow.tsx`·테이블, 커밋 바

- [ ] **Step 1: 탭 + 테이블 + 배지**
- 탭(현황/평면도/연결): 선택=primary, 일관 높이. 
- 현황 테이블: 행 간격/타이포 위계, 종류 색점(무채색)+**상태 Badge**, lucide 액션 아이콘(복제=`Copy`·삭제=`Trash2`). Table 프리미티브 적용 가능 시.
- 위치 라벨/정렬 가독. 커밋 바 토큰 정합.

- [ ] **Step 2: 빌드 + Commit + 브라우저**
```bash
git add <탭·현황 테이블 파일> && git commit -m "feat(design): 워크스페이스 탭+현황 테이블(상태 배지·lucide)"
```

---

## Task 7: 에디터 툴바 + 모달 + 패널

**Files:** Modify `features/editor/components/Toolbar.tsx`, 에디터 모달들, 설계서/이력 패널, 기타 이모지/수제SVG 사용처

- [ ] **Step 1: 아이콘/모달/패널**
- Toolbar: lucide 아이콘 통일(undo=`Undo2`·redo=`Redo2`·설정=`Settings`·도면=`Image`·설계서=`FileText`·이력=`History`·레이어=`Layers`). 토글 상태 토큰.
- 모달(CableSpec/EquipmentPaste 등) → Modal/Input/Button 프리미티브.
- 설계서/이력 패널 Card/Badge 정합.

- [ ] **Step 2: 빌드 + Commit + 브라우저**
```bash
git add <툴바·모달·패널 파일> && git commit -m "feat(design): 에디터 툴바 lucide+모달/패널 프리미티브"
```

---

## Task 8: 잔여 이모지/수제SVG 스윕 + 최종 검증 + 스모크

- [ ] **Step 1: 스윕**
`grep -rnE "☰|✕|✓|⧉|⚠|⬡|×" frontend/src/features frontend/src/components frontend/src/pages | grep -v test` 잔여 이모지 아이콘 → lucide. 인라인 `bg-blue-600`/`text-gray-500` 산재 → 시맨틱 토큰(가능 범위, 과도한 리팩토링은 지양).

- [ ] **Step 2: 최종 검증**
`cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓. `cd ../backend && npx tsc --noEmit` → 0.

- [ ] **Step 3: 브라우저 스모크 (필수)**
로그인 → 셸/사이드바/트리 아이콘 → 현황(상태 배지·무채색 설비) → 평면도(설비 회색+상태색, **보라 없음**, 랙 모듈 회색) → 연결/토폴로지 → 설계서/이력. **일관된 업계표준 외형 + 동작 회귀 없음**(저장·undo·OFD·뷰포트 등).

```bash
git add <스윕 파일> && git commit -m "feat(design): 잔여 이모지/수제SVG lucide 스윕 + 토큰 정리"
```

---

## 최종 검증
- [ ] 프론트+백 tsc 0, 테스트 PASS, 빌드 ✓.
- [ ] grep: 설비 보라색(#a855f7/#8b5cf6/#7c3aed)·이모지 아이콘 잔여 최소.
- [ ] 브라우저 스모크 — 로그인~메인 전 화면 업계표준 외형, 보라 설비 없음, 동작 회귀 없음.

## 완료 기준 (spec §9)
- [ ] 토큰+프리미티브+lucide(트리 포함)+서체 도입
- [ ] 설비 무채색+색=상태(보라 제거), 케이블 표준색
- [ ] 로그인~메인 일관 외형, 동작 회귀 없음

## 이후
- 다크 모드, 반응형/모바일, 차트 스타일, 정식 로고.
