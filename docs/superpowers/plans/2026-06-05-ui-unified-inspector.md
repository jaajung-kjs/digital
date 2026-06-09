# UI ②A — 통합 인스펙터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 장비 상세를 보는 두 우측 패널(에디터 `EquipmentDetailPanel`, 레지스터 `AssetDetailPanel`)을 하나의 `AssetInspector`로 수렴해 사진·점검·연결·속성·생애주기 중복을 제거한다.

**Architecture:** `AssetInspector`(mode edit/view)가 식별/속성/생애주기/사진/유지보수/연결 섹션을 (가)·B 공유 컴포넌트로 렌더. 레지스터 패널 = AssetInspector(edit, register 워킹카피). 에디터 패널 = AssetInspector(view, useAsset) + 공간 섹션(랙뷰·OFD·분전반)만 고유. 연결 = 저장 연결(API) 통일, 캔버스 케이블 드로잉/추적은 공간 도구에 잔존.

**Tech Stack:** React+Vite+React Query+Zustand+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-05-ui-unified-inspector-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `features/assets/components/AssetInspector.tsx`(+test)
**수정**: `features/assets/components/AssetDetailPanel.tsx`(→ AssetInspector edit), 에디터 패널 트리(`EquipmentDetailPanel.tsx` + `equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx`)(→ AssetInspector view + 공간 탭)

---

## Task 1: AssetInspector (공유, RTL TDD)

**Files:** Create `frontend/src/features/assets/components/AssetInspector.tsx`, `AssetInspector.test.tsx`

> READ `AssetDetailPanel.tsx` 먼저 — 그 본문(식별 Field들/AssetAttributesView/AssetLifecycleView/AssetPhotoSection/AssetMaintenanceSection/AssetConnectionsSection + today/onPatch/연결 뮤테이션)이 거의 AssetInspector edit 모드다. 이를 추출 + `mode` 분기 추가.

- [ ] **Step 1: 실패 테스트**

Create `AssetInspector.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetInspector } from './AssetInspector';

const asset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '장비1', attributes: { model: 'X' }, installDate: null, manager: null, status: null,
  warrantyUntil: null, replaceDue: null, floorId: null, updatedAt: '2026-06-05T00:00:00.000Z',
} as any;
const today = new Date('2026-06-05T00:00:00Z');
const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('AssetInspector', () => {
  it('edit 모드: 속성 변경 → onPatch', () => {
    const onPatch = vi.fn();
    wrap(<AssetInspector asset={asset} mode="edit" onPatch={onPatch} onSelectAsset={vi.fn()} today={today} />);
    fireEvent.change(screen.getByLabelText('모델'), { target: { value: 'Y' } });
    fireEvent.blur(screen.getByLabelText('모델'));
    expect(onPatch).toHaveBeenCalledWith('a1', { attributes: { model: 'Y' } });
  });
  it('view 모드: 읽기 + "대장에서 편집" → onGotoRegister', () => {
    const onGotoRegister = vi.fn();
    wrap(<AssetInspector asset={asset} mode="view" onSelectAsset={vi.fn()} onGotoRegister={onGotoRegister} today={today} />);
    fireEvent.click(screen.getByText('대장에서 편집'));
    expect(onGotoRegister).toHaveBeenCalledWith('a1');
  });
});
```
(연결/사진/유지보수 섹션은 React Query 훅을 쓰므로 QueryClientProvider 로 감쌈 — 빈 데이터로 렌더만 확인.)

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/assets/components/AssetInspector.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

Create `AssetInspector.tsx` by extracting `AssetDetailPanel`'s body + adding `mode` branching:
```tsx
import { useAssetConnections } from '../../connections/hooks/useAssetConnections';
import { useCableMutations } from '../../connections/hooks/useCableMutations';
import { AssetConnectionsSection } from '../../connections/components/AssetConnectionsSection';
import { AssetAttributesView } from './AssetAttributesView';
import { AssetLifecycleView } from './AssetLifecycleView';
import { AssetPhotoSection } from './AssetPhotoSection';
import { AssetMaintenanceSection } from './AssetMaintenanceSection';
import { toDateInputValue } from '../../../utils/date';
import type { Asset, UpdateAssetInput } from '../../../types/asset';
// (식별 Field 컴포넌트는 AssetDetailPanel 의 inline Field 를 그대로 가져온다.)

interface Props {
  asset: Asset;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<UpdateAssetInput>) => void;
  onSelectAsset: (id: string) => void;
  onGotoRegister?: (id: string) => void;
  today: Date;
}

export function AssetInspector({ asset, mode, onPatch, onSelectAsset, onGotoRegister, today }: Props) {
  const ro = mode === 'view';
  const patch = (p: Partial<UpdateAssetInput>) => onPatch?.(asset.id, p);
  const { data: connections = [] } = useAssetConnections(asset.id);
  const { deleteCable, updateCable } = useCableMutations();
  const fields = asset.assetType?.fieldTemplate ?? [];
  return (
    <div className="space-y-3">
      {/* 식별 */}
      <section>
        {ro && onGotoRegister && (
          <button onClick={() => onGotoRegister(asset.id)}
            className="mb-2 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">대장에서 편집</button>
        )}
        {/* edit: AssetDetailPanel 의 이름/설치일/담당자/상태 Field 들(onCommit→patch).
            view: 같은 값 읽기전용 표시. (AssetDetailPanel 의 Field 컴포넌트를 가져와 readOnly prop 또는 분기.) */}
      </section>
      <section>
        <AssetAttributesView fields={fields} attributes={asset.attributes} readOnly={ro}
          onChange={(k, v) => patch({ attributes: { ...(asset.attributes ?? {}), [k]: v } })} />
      </section>
      <section>
        <AssetLifecycleView asset={asset} today={today} readOnly={ro} onChange={(p) => patch(p)} />
      </section>
      <AssetPhotoSection assetId={asset.id} />
      <AssetMaintenanceSection assetId={asset.id} />
      <section>
        <h3 className="text-xs font-semibold text-gray-500 mb-1">연결</h3>
        <AssetConnectionsSection assetId={asset.id} connections={connections}
          onDelete={(id) => { if (window.confirm('이 연결을 삭제할까요?')) deleteCable.mutate(id); }}
          onUpdate={(id, p) => updateCable.mutate({ id, patch: p })}
          onSelectAsset={onSelectAsset} />
      </section>
    </div>
  );
}
```
> 식별 섹션: `AssetDetailPanel` 의 이름/설치일/담당자/상태 `Field` 들을 그대로 가져오되, `ro` 일 때 읽기전용(값만 표시). `Field` 컴포넌트에 `readOnly` 분기를 추가하거나 ro 분기로 `<span>{value}</span>` 렌더. `AssetPhotoSection`/`AssetMaintenanceSection`/`AssetConnectionsSection` 은 양쪽 동일(즉시) — ro 무관. 테스트의 '모델' 라벨이 AssetAttributesView 로 렌더되는지 확인.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets/components/AssetInspector.test.tsx` → PASS(2). `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/AssetInspector.tsx frontend/src/features/assets/components/AssetInspector.test.tsx
git commit -m "feat(asset): AssetInspector 통합 인스펙터(식별/속성/생애주기/사진/점검/연결, edit·view)"
```

---

## Task 2: 레지스터 AssetDetailPanel → AssetInspector(edit)

**Files:** Modify `frontend/src/features/assets/components/AssetDetailPanel.tsx`

- [ ] **Step 1: 본문을 AssetInspector 로 교체**

READ the file. Replace its inner sections (식별 Field/속성/생애주기/사진/유지보수/연결 — now in AssetInspector) with a single:
```tsx
<AssetInspector
  asset={asset}
  mode="edit"
  onPatch={onPatch}
  onSelectAsset={(id) => sel?.setSelectedAssetId(id)}  // 기존 onSelectAsset 경로 유지
  today={today}
/>
```
- KEEP the panel chrome: 우측 슬라이드 컨테이너(`<aside w-96>`), 헤더(이름 타이틀 + "도면에서 보기" 버튼 + 닫기), `key={asset.id}` (call site). 즉 AssetDetailPanel = chrome + `<AssetInspector mode="edit"/>`.
- `onPatch` 는 기존 그대로(그리드가 registerStore.stageUpdate 로 넘기는 것). 식별/속성/생애주기 편집이 AssetInspector 안에서 onPatch 로 흐름.
- 기존 import 중 AssetInspector 로 이동한 것(AssetAttributesView/LifecycleView/PhotoSection/MaintenanceSection/ConnectionsSection/연결 훅)은 AssetDetailPanel 에서 미사용 시 제거.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx vitest run src/features/assets src/features/connections` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/AssetDetailPanel.tsx
git commit -m "feat(asset): 레지스터 패널을 AssetInspector(edit) 로 — 중복 섹션 제거"
```

---

## Task 3: 에디터 패널 → AssetInspector(view) + 공간 섹션

**Files:** Modify `frontend/src/features/editor/components/EquipmentDetailPanel.tsx`, `frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx`

- [ ] **Step 1: 현황 파악**

READ: `EquipmentDetailPanel.tsx`(슬라이드 wrapper, useMergedEquipmentDetail, snapshot 분기, registry 로 kind 패널 렌더), `BaseEquipmentTabsPanel.tsx`(탭 사진/정보/점검/연결/+공간), kind 패널(`RackEquipmentPanel`/`OfdEquipmentPanel`/`DistributionPanel`/`GroundingPanel`/`HvacPanel`)와 registry. 공간 뷰 컴포넌트(`RackView`, OFD `OfdPathsView`/FiberPathManager, `DistributionCircuits`)의 위치·props 확인.

- [ ] **Step 2: 재구성 — AssetInspector(view) + 공간 섹션**

목표 구조(비-snapshot): `EquipmentDetailPanel` 본문 =
```tsx
const { data: asset } = useAsset(equipmentId);  // 장비id=assetid, isTemp/undefined 가드
// ...
{asset && (
  <AssetInspector
    asset={asset}
    mode="view"
    onSelectAsset={(id) => /* 공유 선택: useSelection()?.setSelectedAssetId(id) */}
    onGotoRegister={(id) => /* WorkspaceNav gotoRegister(id) 있으면, 없으면 navigate(registerUrl(asset.substationId, id)) */}
    today={today}
  />
)}
{/* 공간 섹션: kind 에 따라 */}
{kind === 'RACK' && <RackView .../>}
{kind === 'OFD' && <OfdPathsView .../>}
{kind === 'DISTRIBUTION' && <DistributionCircuits .../>}
```
- **사진/정보/점검/연결 탭 제거** → AssetInspector(view) 가 그 내용을 모두 가짐. `BaseEquipmentTabsPanel` 의 사진/정보/점검/연결 탭 렌더를 AssetInspector 로 대체하거나, `EquipmentDetailPanel` 이 BaseEquipmentTabsPanel 을 우회하고 직접 AssetInspector + 공간 섹션을 렌더(둘 중 덜 침습적인 쪽 선택, 보고).
- **공간 섹션 유지**: RackView/OfdPathsView/DistributionCircuits 는 그대로(에디터 editorStore 기반). kind 매핑은 기존 registry(`EQUIPMENT_KIND_INFO[kind].detailPanelKind`) 활용 또는 단순 switch.
- **snapshot 모드**: useAsset skip(현재 자산 없음). snapshot 에선 기존 동작 보존 — 공간 snapshot 뷰(SnapshotRackView 등) + 간단한 스냅샷 정보. AssetInspector 는 비-snapshot 에서만. (snapshot 처리는 기존 코드를 최대한 보존.)
- **temp(미저장 신규)**: useAsset skip → AssetInspector 없음(아직 대장 자산 없음). 식별만 필요 시 최소 표시 또는 공간 섹션만.
- `onGotoRegister`: 워크스페이스 안이면 `useWorkspaceNav()?.gotoRegister(id)`(탭 전환), 밖이면 `navigate(registerUrl(asset.substationId, id))`. `onSelectAsset`: `useSelection()?.setSelectedAssetId(id)`.

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/assets src/features/connections src/features/workspace` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/components/EquipmentDetailPanel.tsx frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx
git commit -m "feat(editor): 장비 상세 패널을 AssetInspector(view)+공간 섹션으로 — 사진/점검/연결/속성 중복 제거"
```
(kind 패널/registry 도 수정했으면 함께 add.)

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features/assets src/features/connections src/features/workspace src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 표에서 장비 선택 → 인스펙터(편집: 속성·생애주기·식별 편집). ② 배치도에서 장비 더블클릭 → **같은 인스펙터**(읽기) + 공간 섹션(랙→랙뷰, OFD→포트, 분전반→회로). ③ 배치도 인스펙터 "대장에서 편집" → 표 뷰 그 장비. ④ 사진·유지보수·연결이 양쪽 동일 UI·동작. ⑤ 에디터 케이블 드로잉/캔버스 trace·랙뷰·OFD·분전반 공간 편집 회귀 없음. ⑥ snapshot(과거 버전) 모드 정상.

## 완료 기준 (spec §6)
- [ ] 어느 뷰에서 선택하든 우측 같은 AssetInspector
- [ ] 사진·점검·연결·속성·생애주기 한 컴포넌트(중복 제거)
- [ ] 에디터=인스펙터(보기)+공간 편집만 고유, "대장에서 편집" 점프
- [ ] 에디터 케이블/공간/캔버스·snapshot 회귀 없음

## 이후
- ②B 통계→메인 "개요/대시보드"(우측 레일 해방). ③ 글로벌 검색·브레드크럼 보강. 그 후 단계 C 계통도 자동생성.
