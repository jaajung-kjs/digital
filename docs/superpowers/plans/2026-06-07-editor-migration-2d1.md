# SSOT 2d-1 — 에디터 이관 토대 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 에디터 이관(2d) 토대 — `equipmentToAsset` 역매퍼 + `useKindToAssetTypeId` 해소 + 통합 스토어 에디터 액션(설비 create/update/cascade-delete, 배치 케이블) + 메모이즈 `useEffectiveEquipment`. 추가형·미연결(2d-2가 연결).

**Architecture:** 2b 통합 스토어(`useSubstationWorkingCopy`, 엔진 Overlay/mergeEffective/stage*, descriptors exported) 위에 에디터용 매핑·액션·훅을 추가. 복합/배치 액션은 단일 `set`(단일 undo 스텝).

**Tech Stack:** React+Zustand(+zundo)+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-07-editor-migration-2d1-design.md` §3.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `features/workingCopy/equipmentToAsset.ts`(+test), `features/assets/useKindToAssetTypeId.ts`(+test).
**수정**: `features/workingCopy/substationStore.ts`(에디터 액션), `features/workingCopy/hooks.ts`(useEffectiveEquipment) + 각 test.

---

## Task 1: equipmentToAsset 역매퍼 (RTL)

**Files:** Create `frontend/src/features/workingCopy/equipmentToAsset.ts`, `equipmentToAsset.test.ts`

- [ ] **Step 1: 현황 파악**

READ `features/workingCopy/assetToEquipment.ts`(정방향 매핑 — width2d→width 등 필드 대응), `types/floorPlan.ts` `FloorPlanEquipment`, `types/asset.ts` `Asset`(배치 필드는 2b에서 추가됨). 역방향 대응 확인.

- [ ] **Step 2: 실패 테스트**

Create `equipmentToAsset.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { equipmentToAssetCreate, equipmentToAssetPatch } from './equipmentToAsset';

const eq = { id:'tmp1', kind:'RACK', name:'랙1', positionX:10, positionY:20, width:100, height:200, rotation:0, totalU:42, manager:'홍', installDate:'2024-01-01', description:'d', properties:{x:1} } as any;
describe('equipmentToAssetCreate', () => {
  it('FloorPlanEquipment → Asset(create)', () => {
    const a = equipmentToAssetCreate(eq, { substationId:'s1', floorId:'f1', assetTypeId:'t1', tempId:'tmp1' });
    expect(a).toMatchObject({ id:'tmp1', substationId:'s1', assetTypeId:'t1', floorId:'f1', name:'랙1', positionX:10, positionY:20, width2d:100, height2d:200, rotation:0, totalU:42, attributes:{x:1} });
  });
});
describe('equipmentToAssetPatch', () => {
  it('존재하는 키만 매핑(width→width2d, properties→attributes)', () => {
    expect(equipmentToAssetPatch({ positionX:5, width:80, properties:{y:2} })).toEqual({ positionX:5, width2d:80, attributes:{y:2} });
  });
  it('빈 패치 → 빈 객체', () => expect(equipmentToAssetPatch({})).toEqual({}));
});
```

- [ ] **Step 3: 구현**

Create `equipmentToAsset.ts`:
```ts
import type { Asset } from '../../types/asset';
import type { FloorPlanEquipment } from '../../types/floorPlan';

export function equipmentToAssetCreate(
  eq: FloorPlanEquipment,
  ctx: { substationId: string; floorId: string | null; assetTypeId: string; tempId: string },
): Asset {
  return {
    id: ctx.tempId, substationId: ctx.substationId, assetTypeId: ctx.assetTypeId,
    name: eq.name, parentAssetId: null, floorId: ctx.floorId, roomText: null,
    positionX: eq.positionX, positionY: eq.positionY, width2d: eq.width, height2d: eq.height,
    rotation: eq.rotation ?? 0, totalU: eq.totalU ?? null, slotIndex: null, slotSpan: null,
    description: eq.description ?? null, manager: eq.manager ?? null, installDate: eq.installDate ?? null,
    status: null, warrantyUntil: null, replaceDue: null,
    attributes: (eq.properties ?? null) as Asset['attributes'],
    updatedAt: '',
  } as Asset;
}

export function equipmentToAssetPatch(patch: Partial<FloorPlanEquipment>): Partial<Asset> {
  const p: Partial<Asset> = {};
  if ('name' in patch) p.name = patch.name as string;
  if ('positionX' in patch) p.positionX = patch.positionX ?? null;
  if ('positionY' in patch) p.positionY = patch.positionY ?? null;
  if ('width' in patch) p.width2d = patch.width ?? null;
  if ('height' in patch) p.height2d = patch.height ?? null;
  if ('rotation' in patch) p.rotation = patch.rotation ?? null;
  if ('totalU' in patch) p.totalU = patch.totalU ?? null;
  if ('description' in patch) p.description = patch.description ?? null;
  if ('manager' in patch) p.manager = patch.manager ?? null;
  if ('installDate' in patch) p.installDate = patch.installDate ?? null;
  if ('properties' in patch) p.attributes = (patch.properties ?? null) as Asset['attributes'];
  return p;
}
```
- 실제 `Asset` 필수 필드에 맞춰 채움(타입체크 통과). FloorPlanEquipment 의 실제 필드명(`width`/`height`/`properties`)을 READ 로 확인.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/equipmentToAsset.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/equipmentToAsset.ts frontend/src/features/workingCopy/equipmentToAsset.test.ts
git commit -m "feat(workingcopy): equipmentToAsset 역매퍼(FloorPlanEquipment→Asset create/patch)"
```

---

## Task 2: useKindToAssetTypeId 해소 (RTL)

**Files:** Create `frontend/src/features/assets/useKindToAssetTypeId.ts`, `useKindToAssetTypeId.test.ts`

- [ ] **Step 1: 현황 파악**

READ `useAssetTypes`(훅 경로·반환 — AssetType[] with `placementKind`/`code`/`id`), `types/equipmentKind.ts`(EquipmentKind values), `assetToEquipment.ts`의 placementKind 정규화('DIST'→'DISTRIBUTION'). 역(kind→placement): DISTRIBUTION→DIST.

- [ ] **Step 2: 실패 테스트**

Create `useKindToAssetTypeId.test.ts`(vitest+renderHook; useAssetTypes mock):
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('<useAssetTypes 실제 경로>', () => ({ useAssetTypes: () => ({ data: [
  { id:'tRACK', placementKind:'RACK' }, { id:'tDIST', placementKind:'DIST' }, { id:'tOFD', placementKind:'OFD' },
] }) }));
import { useKindToAssetTypeId } from './useKindToAssetTypeId';
describe('useKindToAssetTypeId', () => {
  it('kind→assetTypeId (DISTRIBUTION→DIST)', () => {
    const { result } = renderHook(() => useKindToAssetTypeId());
    expect(result.current('RACK')).toBe('tRACK');
    expect(result.current('DISTRIBUTION')).toBe('tDIST');
    expect(result.current('HVAC')).toBeUndefined(); // 맵에 없음
  });
});
```

- [ ] **Step 3: 구현**

Create `useKindToAssetTypeId.ts`:
```ts
import { useMemo } from 'react';
import { useAssetTypes } from '<실제 경로>';
import type { EquipmentKind } from '../../types/equipmentKind';

const KIND_TO_PLACEMENT: Record<EquipmentKind, string> = {
  RACK: 'RACK', OFD: 'OFD', DISTRIBUTION: 'DIST', GROUNDING: 'GROUNDING', HVAC: 'HVAC',
};

export function useKindToAssetTypeId(): (kind: EquipmentKind) => string | undefined {
  const { data: types = [] } = useAssetTypes();
  return useMemo(() => {
    const byPlacement = new Map<string, string>();
    for (const t of types) if (t.placementKind) byPlacement.set(t.placementKind, t.id);
    return (kind: EquipmentKind) => byPlacement.get(KIND_TO_PLACEMENT[kind]);
  }, [types]);
}
```
- `KIND_TO_PLACEMENT` 값은 백엔드 `kindToPlacementCode`(RACK/OFD/DIST/GROUNDING/HVAC)와 일치하게. AssetType 의 실제 필드(`placementKind` vs `code`)를 READ 로 확인해 맞춤.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/assets/useKindToAssetTypeId.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/useKindToAssetTypeId.ts frontend/src/features/assets/useKindToAssetTypeId.test.ts
git commit -m "feat(assets): useKindToAssetTypeId — kind→assetTypeId 프론트 해소(DISTRIBUTION↔DIST)"
```

---

## Task 3: 통합 스토어 에디터 액션 (cascade/batch, 단위)

**Files:** Modify `frontend/src/features/workingCopy/substationStore.ts`, `substationStore.test.ts`

- [ ] **Step 1: 현황 파악**

READ `substationStore.ts`: state/액션 패턴(`set`, overlays 구조), exported descriptors(assetDescriptor/cableDescriptor), 기존 stage 액션(stageAssetCreate/Update/Delete, stageCableUpdate/Delete). `overlay.ts`(stageCreate/Update/Delete/isTemp), `effective.ts mergeEffective`, `utils idHelpers isTempId`. 케이블 끝점 모양(`source`/`target` {equipmentId,moduleId,circuitId}).

- [ ] **Step 2: 실패 테스트 (substationStore.test.ts 에 추가)**

```ts
// load mock: rack r1, 슬롯자식 m1(parentAssetId r1, slotIndex 3), ofd o1, cable c1(source.equipmentId r1, target.equipmentId o1)
it('stageEquipmentCreate → effective 신규 설비', async () => { ...load; getState().stageEquipmentCreate(eq, 't1'); expect(effectiveAssets().some(a=>a.id===eq.id)) });
it('stageEquipmentUpdate → 위치 반영', () => { ... stageEquipmentUpdate('o1',{positionX:99}); expect(effectiveAssets().find(o1).positionX===99) });
it('stageEquipmentDeleteCascade → 설비+랙모듈자식+케이블 delete, undo 1스텝', async () => {
  // stageEquipmentDeleteCascade('r1') → effectiveAssets에 r1·m1 없음, effectiveCables에 c1 없음
  // temporal.undo() 한 번 → 모두 복원(단일 스텝)
});
it('stageCableUpdates 다건 한 번에', () => { stageCableUpdates({ c1:{label:'L'} }); expect(effectiveCables().find(c1).label==='L') });
```

- [ ] **Step 3: 구현 (substationStore.ts 에 액션 추가)**

```ts
import { equipmentToAssetCreate, equipmentToAssetPatch } from './equipmentToAsset';
// ...
stageEquipmentCreate: (eq, assetTypeId) => set((s) => {
  const asset = equipmentToAssetCreate(eq, { substationId: s.substationId!, floorId: eq.floorId ?? null, assetTypeId, tempId: eq.id });
  return { overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } };
}),
stageEquipmentUpdate: (id, eqPatch) => set((s) => ({
  overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, equipmentToAssetPatch(eqPatch)) },
})),
stageEquipmentDeleteCascade: (id) => set((s) => {
  const effA = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor);
  const effC = mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor);
  const childIds = effA.filter((a) => a.parentAssetId === id).map((a) => a.id);
  const targets = new Set([id, ...childIds]);
  let assets = s.overlays.assets;
  for (const tid of [id, ...childIds]) assets = stageDelete(assets, tid, isTempId(tid));
  let cables = s.overlays.cables;
  for (const c of effC) {
    const ep = [c.source?.equipmentId, c.source?.moduleId, c.target?.equipmentId, c.target?.moduleId];
    if (ep.some((x) => x && targets.has(x))) cables = stageDelete(cables, c.id, isTempId(c.id));
  }
  return { overlays: { ...s.overlays, assets, cables } };
}),
stageCableUpdates: (updates) => set((s) => {
  let cables = s.overlays.cables;
  for (const [id, patch] of Object.entries(updates)) cables = stageUpdate(cables, id, patch);
  return { overlays: { ...s.overlays, cables } };
}),
```
- 단일 `set` → zundo 단일 undo 스텝(partialize=overlays). 케이블 끝점 필드명은 READ 한 실제 모양에 맞춤.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/substationStore.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/substationStore.test.ts
git commit -m "feat(workingcopy): 통합 스토어 에디터 액션 — 설비 create/update/cascade-delete·배치 케이블(단일 undo)"
```

---

## Task 4: useEffectiveEquipment 훅 (RTL)

**Files:** Modify `frontend/src/features/workingCopy/hooks.ts`, `hooks.test.ts`

- [ ] **Step 1: 실패 테스트 (hooks.test.ts 에 추가)**

```ts
// load mock: floor f1 의 rack r1, ofd o1 (둘 다 floorId f1, 배치 있음), 슬롯자식 m1(parentAssetId r1, slotIndex 3), floor f2 의 x1
it('useEffectiveEquipment(f1) → f1 placement-level 설비만 FloorPlanEquipment 로', async () => {
  await act(async () => { await useSubstationWorkingCopy.getState().load('s1'); });
  const { result, rerender } = renderHook(() => useEffectiveEquipment('f1'));
  expect(result.current.map(e=>e.id).sort()).toEqual(['o1','r1']); // m1(랙모듈)·x1(다른 층) 제외
  const ref1 = result.current; rerender();
  expect(result.current).toBe(ref1); // 참조 안정(같은 입력→같은 ref)
});
```

- [ ] **Step 2: 구현 (hooks.ts 에 추가)**

```ts
import { assetToEquipment } from './assetToEquipment';
import { assetDescriptor } from './substationStore'; // exported (2c)

export function useEffectiveEquipment(floorId: string) {
  const saved = useSubstationWorkingCopy((s) => s.saved.assets);
  const overlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  return useMemo(() => {
    const eff = mergeEffective(saved, overlay, assetDescriptor);
    return eff
      .filter((a) => a.floorId === floorId && !(a.parentAssetId && a.slotIndex != null))
      .map(assetToEquipment);
  }, [saved, overlay, floorId]);
}
```
(saved/overlay slice 가 stage 시에만 ref 변경 → useMemo 안정. 랙모듈 자식·타 층 제외.)

- [ ] **Step 3: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/hooks.test.ts` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/hooks.ts frontend/src/features/workingCopy/hooks.test.ts
git commit -m "feat(workingcopy): useEffectiveEquipment(floorId) — 층 설비 effective(FloorPlanEquipment, 참조 안정)"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features/workingCopy src/features/assets` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 토대 단위 검증(미연결): 역매퍼·resolver·cascade/batch 액션·effective 훅. 기존 editorStore·에디터·2b/2c 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 역매퍼·resolver·에디터 스토어 액션·effective 훅 단위 테스트 통과
- [ ] cascade-delete·batch-cable 단일 undo 스텝
- [ ] 기존 회귀 없음(추가형·미연결)

## 이후
- 2d-2 캔버스 데이터 이관(소비처 재배선·undo 통합·editorUiStore) → 2d-3 저장+정리.
