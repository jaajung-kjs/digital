# UI ②C — IA 정리 번들 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 진입점·정보 분산 정리 — 인스펙터 간소화(C3), 개요+표→"현황" 한 뷰(C2), 중앙 카드 제거+좌 트리 단일 네비(C1).

**Architecture:** `CollapsibleSection`으로 AssetInspector의 사진/유지보수/연결을 접이식(핵심 먼저). `SubstationStatusView`(요약 칩 + SubstationAssetGrid)가 워크스페이스 "현황" 뷰. 워크스페이스 VIEWS=[현황,평면도,연결]. TreePage에서 TreeVisualization 제거, 메인=OverviewView.

**Tech Stack:** React+Vite+react-router+Zustand+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-05-ui-ia-consolidation-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `components/CollapsibleSection.tsx`(+test), `features/assets/components/SubstationStatusView.tsx`(+test)
**수정**: `features/assets/components/AssetInspector.tsx`(접이식), `pages/SubstationWorkspacePage.tsx`(VIEWS·status·gotoRegister), `pages/TreePage.tsx`(TreeVisualization 제거)

---

## Task 1: CollapsibleSection + 인스펙터 간소화 (C3)

**Files:** Create `frontend/src/components/CollapsibleSection.tsx`, `CollapsibleSection.test.tsx`; Modify `frontend/src/features/assets/components/AssetInspector.tsx`

- [ ] **Step 1: 실패 테스트 (CollapsibleSection)**

Create `CollapsibleSection.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('기본 접힘 — 본문 숨김, 클릭하면 펼침', () => {
    render(<CollapsibleSection title="사진"><div>본문내용</div></CollapsibleSection>);
    expect(screen.queryByText('본문내용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('사진'));
    expect(screen.getByText('본문내용')).toBeInTheDocument();
  });
  it('defaultOpen=true 면 처음부터 보임', () => {
    render(<CollapsibleSection title="속성" defaultOpen><div>속성본문</div></CollapsibleSection>);
    expect(screen.getByText('속성본문')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/components/CollapsibleSection.test.tsx` → FAIL.

- [ ] **Step 3: CollapsibleSection 구현**

Create `CollapsibleSection.tsx`:
```tsx
import { useState, type ReactNode } from 'react';

interface Props { title: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode; }

export function CollapsibleSection({ title, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900">
        <span className="text-gray-400 w-3">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {badge != null && <span className="ml-auto text-gray-400 font-normal">{badge}</span>}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 4: AssetInspector 접이식 적용**

READ `AssetInspector.tsx`. KEEP 식별/속성/생애주기 always visible (핵심 현황). WRAP 사진·유지보수·연결 sections in `<CollapsibleSection title="..." defaultOpen={false}>`:
```tsx
import { CollapsibleSection } from '../../../components/CollapsibleSection';
// ...
<CollapsibleSection title="사진"><AssetPhotoSection assetId={asset.id} /></CollapsibleSection>
<CollapsibleSection title="유지보수"><AssetMaintenanceSection assetId={asset.id} /></CollapsibleSection>
<CollapsibleSection title="연결" badge={connections.length || undefined}>
  <AssetConnectionsSection assetId={asset.id} connections={connections} onDelete={...} onUpdate={...} onSelectAsset={onSelectAsset} />
</CollapsibleSection>
```
(연결 헤더에 개수 배지. 기존 `<h3>연결</h3>` 제거 — CollapsibleSection 헤더가 대체. 사진/유지보수 섹션 안의 기존 제목이 있으면 중복 제거.)

- [ ] **Step 5: 통과 + Commit**

`cd frontend && npx vitest run src/components/CollapsibleSection.test.tsx src/features/assets/components/AssetInspector.test.tsx` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/CollapsibleSection.tsx frontend/src/components/CollapsibleSection.test.tsx frontend/src/features/assets/components/AssetInspector.tsx
git commit -m "feat(ui): 인스펙터 간소화 — 핵심 먼저, 사진/유지보수/연결 접이식(CollapsibleSection)"
```

---

## Task 2: SubstationStatusView (요약 + 리스트) (C2-1)

**Files:** Create `frontend/src/features/assets/components/SubstationStatusView.tsx`, `SubstationStatusView.test.tsx`

> 확인: `src/hooks/useNodeStats.ts` 의 `useNodeStats(nodeType, nodeId)` → `{ self: { total, byCategory: CategoryCount[] } }`. `CategoryCount` 의 키/라벨/개수 필드명을 grep 으로 확인(예: `{ category, label, count }` 또는 `{ code, name, count }`).

- [ ] **Step 1: 실패 테스트 (요약 칩 — 순수 표시)**

`SubstationStatusView` 는 SubstationAssetGrid(무거움)를 임베드하므로, 테스트는 **요약 칩 부분만** 순수 컴포넌트로 분리해 검증한다. Create `SubstationStatusView.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusSummary } from './SubstationStatusView';

describe('StatusSummary', () => {
  it('총계 + 종류별 개수 칩', () => {
    render(<StatusSummary total={7} items={[{ key: 'RACK', label: '랙', count: 5 }, { key: 'OFD', label: 'OFD', count: 2 }]} />);
    expect(screen.getByText(/전체 7/)).toBeInTheDocument();
    expect(screen.getByText(/랙 5/)).toBeInTheDocument();
    expect(screen.getByText(/OFD 2/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

Create `SubstationStatusView.tsx` exporting a pure `StatusSummary` (test target) + the connected `SubstationStatusView`:
```tsx
import { useNodeStats } from '../../../hooks/useNodeStats';
import { SubstationAssetGrid } from './SubstationAssetGrid';

export function StatusSummary({ total, items }: { total: number; items: { key: string; label: string; count: number }[] }) {
  return (
    <div className="shrink-0 flex flex-wrap gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span className="text-xs px-2 py-1 rounded bg-gray-100 font-medium">전체 {total}</span>
      {items.map((c) => (
        <span key={c.key} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{c.label} {c.count}</span>
      ))}
    </div>
  );
}

export function SubstationStatusView({ substationId }: { substationId: string }) {
  const { data: stats } = useNodeStats('substation', substationId);
  const items = (stats?.self.byCategory ?? []).map((c) => ({
    key: /* CategoryCount 의 키 필드 */ c.category ?? c.code ?? c.label,
    label: c.label ?? c.name,
    count: c.count,
  }));
  return (
    <div className="h-full flex flex-col">
      <StatusSummary total={stats?.self.total ?? 0} items={items} />
      <div className="flex-1 min-h-0">
        <SubstationAssetGrid substationId={substationId} />
      </div>
    </div>
  );
}
```
> `CategoryCount` 의 실제 필드명(category/code/label/name/count)을 grep 으로 확인해 `items` 매핑을 맞춘다. `SubstationAssetGrid` 는 자기 높이(h-full flex flex-col)라 `flex-1 min-h-0` 안에서 채워짐.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets/components/SubstationStatusView.test.tsx` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/SubstationStatusView.tsx frontend/src/features/assets/components/SubstationStatusView.test.tsx
git commit -m "feat(assets): SubstationStatusView — 요약 칩 + 자산 리스트(개요+표 통합)"
```

---

## Task 3: 워크스페이스 VIEWS 재편 (C2-2)

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`

- [ ] **Step 1: VIEWS=[현황,평면도,연결], 기본 status, gotoRegister→status**

READ the file. Changes:
- import: `import { SubstationStatusView } from '../features/assets/components/SubstationStatusView';` (remove `OverviewView` import if it was added in ②B and is now unused; also `SubstationAssetGrid` import is now only via StatusView — remove direct import if unused here).
- `VIEWS` → `[{ key: 'status', label: '현황' }, { key: 'plan', label: '평면도' }, { key: 'connections', label: '연결' }] as const;` (remove overview/register).
- 뷰 해석: `const view: ViewKey = rawView === 'plan' ? 'plan' : rawView === 'connections' ? 'connections' : 'status';` (legacy register/overview/tab → status 흡수).
- `gotoRegister(assetId)`: `p.set('view', 'status')` (was 'register'); keep `?assetId=` set. `gotoFloor` 그대로.
- 본문 분기:
  ```tsx
  {view === 'plan' ? (
    selectedFloorId ? <FloorPlanEditor key={selectedFloorId} floorId={selectedFloorId} /> : <div className="p-6 text-sm text-gray-500">등록된 층이 없습니다.</div>
  ) : view === 'connections' ? (
    <SubstationConnectionsView substationId={substationId} />
  ) : (
    <SubstationStatusView substationId={substationId} />
  )}
  ```
- 탭 버튼 onClick: status/connections 는 `switchView`, plan 은 기존(`selectedFloorId ? gotoFloor : switchView`). 확인.
- 선택 브리지 `active = view === 'plan'` 유지.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/workspace src/features/assets src/components` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx
git commit -m "feat(ui): 워크스페이스 VIEWS=[현황,평면도,연결] — 개요+표 통합(현황 기본)"
```

---

## Task 4: 홈 중앙 카드 제거 (C1)

**Files:** Modify `frontend/src/pages/TreePage.tsx`

- [ ] **Step 1: TreeVisualization 제거, 메인=OverviewView**

READ `TreePage.tsx`(②B 후: `<TreeVisualization/>` + `<OverviewView/>`). 변경:
- `TreeVisualization` **제거**(import도). 메인 = `viewingNode`(컨테이너)면 `<OverviewView/>`, 없거나 floor면 안내:
```tsx
import { useMemo } from 'react';
import { OverviewView } from '../components/OverviewView';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
  return (
    <div className="h-full overflow-auto bg-gray-50">
      {viewingNode && viewingNode.type !== 'floor' ? (
        <OverviewView nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'} nodeId={viewingNode.id} />
      ) : (
        <div className="p-8 text-sm text-gray-500">좌측 트리에서 본부·지사·변전소를 선택하세요.</div>
      )}
    </div>
  );
}
```
- `TreeVisualization.tsx` 파일은 잔존(미import). store 셀렉터 이름은 grep 으로 확인(`viewingNodeId`/`findNode`).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/TreePage.tsx
git commit -m "feat(ui): 홈 중앙 카드(TreeVisualization) 제거 → 좌 트리 단일 네비 + 메인 개요"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/components src/features` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 홈 `/` 중앙 카드 사라짐 — 좌 트리로 탐색, 컨테이너 선택 시 메인 개요. ② 변전소 워크스페이스 = `[현황][평면도][연결]`, 현황 기본(요약 칩 + 자산 리스트). ③ 현황 그리드 편집·커밋·필터·내보내기·우 인스펙터 정상. ④ 인스펙터 핵심 먼저 + 사진·유지보수·연결 접힘(펼치면 동작). ⑤ "대장에서 편집"→현황, 평면도·연결·공유선택 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 중앙 카드 제거, 좌 트리 단일 네비, 홈 메인 개요
- [ ] 워크스페이스 [현황][평면도][연결], 현황=요약+리스트
- [ ] 인스펙터 핵심 먼저 + 접이식
- [ ] 그리드·평면도·연결·공유선택 회귀 없음

## 이후
- C4 연결→계통도(전원·접지 SLD + 토폴로지 자동생성). ③ 글로벌 검색·브레드크럼.
