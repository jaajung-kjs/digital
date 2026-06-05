# (가) 통합 상세 패널 + 상호 네비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 도면 에디터와 대장 레지스터가 장비의 속성·생애주기를 **같은 공유 컴포넌트**로 보여주고(에디터는 읽기전용), 한 번에 서로 이동(상호 네비)하게 한다.

**Architecture:** 속성·생애주기 렌더를 읽기/편집 겸용 공유 컴포넌트(`AssetAttributesView`/`AssetLifecycleView`)로 추출 → 레지스터(editable)·에디터(readOnly, `useAsset` 로 fetch)가 함께 사용. 상호 네비는 순수 URL 빌더 + 기존 에디터 `?equipmentId=` 딥링크 + 그리드 신규 `?assetId=` 핸들러. 백엔드는 `AssetDetail` 에 `floorId` 노출(컬럼 기존).

**Tech Stack:** React+Vite+React Query+Zustand+vitest(+RTL) / Express+Prisma+Vitest. dev DB: `docker compose -f docker-compose.dev.yml up -d`.

> RTL/jsdom 확인됨: `@testing-library/react`+`jsdom` 설치, vitest `environment:'jsdom'`, `setupFiles: ./src/tests/setup.ts`. `toBeInTheDocument()` 매처가 동작하려면 setup.ts 에 `import '@testing-library/jest-dom'` 이 있어야 함 — 없으면 T2 에서 추가(그 파일도 커밋). 컴포넌트 `.test.tsx` 는 이 기능이 처음이라 첫 테스트 실행 시 환경을 확인할 것.

**설계 근거:** `docs/superpowers/specs/2026-06-05-unified-detail-panel-design.md`

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

**제약:** 에디터에선 속성·생애주기 **읽기전용**(편집은 "대장에서 편집" 점프). 식별(이름/담당자/설치/설명) 에디터 편집은 기존 그대로.

---

## 파일 구조
**신규**: `features/assets/components/AssetAttributesView.tsx`(+test), `AssetLifecycleView.tsx`(+test), `features/assets/navUrls.ts`(+test), `features/assets/hooks/useAsset.ts`
**수정**: `AssetDetailPanel.tsx`(공유뷰+도면버튼), `SubstationAssetGrid.tsx`(?assetId), `equipment/components/detail/InfoTab.tsx`(useAsset+공유뷰+대장버튼), `backend/src/services/asset.service.ts`(floorId), `frontend/src/types/asset.ts`(floorId)

---

## Task 1: 백엔드 — AssetDetail.floorId + 프론트 타입

**Files:** Modify `backend/src/services/asset.service.ts`, `frontend/src/types/asset.ts`

- [ ] **Step 1: 서비스**

In `backend/src/services/asset.service.ts`:
- `AssetDetail` 인터페이스에 추가: `floorId: string | null;`
- `mapToDetail` 에 추가: `floorId: a.floorId ?? null,`
- (`a` 는 prisma asset 행 — `floorId` 스칼라는 findMany/findUnique 기본 포함. 별도 select 제한 있으면 floorId 포함 확인.)

- [ ] **Step 2: 프론트 타입**

In `frontend/src/types/asset.ts`, `Asset` 인터페이스에 추가: `floorId: string | null;`

- [ ] **Step 3: 회귀 + 빌드**

Run: `cd backend && npx vitest run tests/asset.service.test.ts tests/asset.integration.test.ts` → PASS (floorId 는 additive; 만약 asset.service.test 의 mock 행이 엄격해 `mapToDetail` 가 floorId 를 읽다 깨지면 mock 에 `floorId: null` 추가하고 그 파일도 커밋). `npm run build` → 0. `cd frontend && npx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**
```bash
git add backend/src/services/asset.service.ts frontend/src/types/asset.ts
git commit -m "feat(asset): AssetDetail/Asset 에 floorId 노출(상호 네비용)"
```
(만약 mock 보강했으면 `backend/tests/asset.service.test.ts` 도 add.)

---

## Task 2: AssetAttributesView (공유, TDD)

**Files:** Create `frontend/src/features/assets/components/AssetAttributesView.tsx`, `frontend/src/features/assets/components/AssetAttributesView.test.tsx`

> 먼저 `frontend/src/types/asset.ts`(또는 assetType 타입)에서 `fieldTemplate` 항목 타입을 확인: 보통 `{ key: string; label: string; type: 'text'|'number'|'date'|'month'|'select'; options?: string[] }`. 실제 export 명을 import 하고, 아래 로컬 `FieldDef` 와 호환되게 사용.

- [ ] **Step 1: 실패 테스트**

Create `AssetAttributesView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetAttributesView } from './AssetAttributesView';

const fields = [
  { key: 'model', label: '모델', type: 'text' as const },
  { key: 'op', label: '운용', type: 'select' as const, options: ['운영', '예비'] },
];

describe('AssetAttributesView', () => {
  it('readOnly: 라벨+값 표시', () => {
    render(<AssetAttributesView fields={fields} attributes={{ model: 'X100', op: '운영' }} readOnly />);
    expect(screen.getByText('모델')).toBeInTheDocument();
    expect(screen.getByText('X100')).toBeInTheDocument();
    expect(screen.getByText('운영')).toBeInTheDocument();
  });
  it('readOnly: 빈 값은 - 표시', () => {
    render(<AssetAttributesView fields={fields} attributes={null} readOnly />);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
  it('editable: 텍스트 변경 시 onChange(key,value)', () => {
    const onChange = vi.fn();
    render(<AssetAttributesView fields={fields} attributes={{}} readOnly={false} onChange={onChange} />);
    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y200' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('model', 'Y200');
  });
  it('editable: select 변경 시 onChange', () => {
    const onChange = vi.fn();
    render(<AssetAttributesView fields={fields} attributes={{}} readOnly={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('운용'), { target: { value: '예비' } });
    expect(onChange).toHaveBeenCalledWith('op', '예비');
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/assets/components/AssetAttributesView.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

Create `AssetAttributesView.tsx`:
```tsx
export interface FieldDef { key: string; label: string; type: string; options?: string[] }

interface Props {
  fields: FieldDef[];
  attributes: Record<string, unknown> | null;
  readOnly: boolean;
  onChange?: (key: string, value: string) => void;
}

const inputType = (t: string) => (t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'month' ? 'month' : 'text');

export function AssetAttributesView({ fields, attributes, readOnly, onChange }: Props) {
  if (!fields?.length) return null;
  return (
    <div className="space-y-0.5">
      {fields.map((f) => {
        const val = attributes?.[f.key] != null ? String(attributes[f.key]) : '';
        if (readOnly) {
          return (
            <div key={f.key} className="flex items-center gap-2 text-sm py-0.5">
              <span className="w-24 shrink-0 text-gray-500 text-xs">{f.label}</span>
              <span className="flex-1">{val || '-'}</span>
            </div>
          );
        }
        return (
          <label key={f.key} className="flex items-center gap-2 text-sm py-0.5">
            <span className="w-24 shrink-0 text-gray-500 text-xs">{f.label}</span>
            {f.type === 'select' && f.options ? (
              <select
                aria-label={f.label}
                value={val}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm">
                <option value=""></option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                aria-label={f.label}
                type={inputType(f.type)}
                defaultValue={val}
                onBlur={(e) => { if (e.target.value !== val) onChange?.(f.key, e.target.value); }}
                className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 + Commit** — `npx vitest run src/features/assets/components/AssetAttributesView.test.tsx` PASS, `npx tsc --noEmit` 0.
```bash
git add frontend/src/features/assets/components/AssetAttributesView.tsx frontend/src/features/assets/components/AssetAttributesView.test.tsx
git commit -m "feat(asset): AssetAttributesView 공유 컴포넌트(읽기/편집 겸용) + 테스트"
```

---

## Task 3: AssetLifecycleView (공유, TDD)

**Files:** Create `frontend/src/features/assets/components/AssetLifecycleView.tsx`, `AssetLifecycleView.test.tsx`

> 기존 `frontend/src/features/assets/alerts.ts` 의 `assetAlert(asset, today)` 재사용(만료/임박 구분 라벨), `frontend/src/utils/date.ts` 의 `toDateInputValue`.

- [ ] **Step 1: 실패 테스트**

Create `AssetLifecycleView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetLifecycleView } from './AssetLifecycleView';

const today = new Date('2026-06-05T00:00:00Z');

describe('AssetLifecycleView', () => {
  it('readOnly: 만료된 하자보수는 만료 배지', () => {
    render(<AssetLifecycleView asset={{ warrantyUntil: '2020-01-01', replaceDue: null }} today={today} readOnly />);
    expect(screen.getByText(/하자보수 만료/)).toBeInTheDocument();
  });
  it('editable: 교체예정 변경 시 onChange', () => {
    const onChange = vi.fn();
    render(<AssetLifecycleView asset={{ warrantyUntil: null, replaceDue: null }} today={today} readOnly={false} onChange={onChange} />);
    const input = screen.getByLabelText('교체예정') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2027-01-01' } });
    expect(onChange).toHaveBeenCalledWith({ replaceDue: '2027-01-01' });
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

Create `AssetLifecycleView.tsx`:
```tsx
import { assetAlert } from '../alerts';
import { toDateInputValue } from '../../../utils/date';

interface Props {
  asset: { warrantyUntil: string | null; replaceDue: string | null };
  today: Date;
  readOnly: boolean;
  onChange?: (patch: { warrantyUntil?: string | null; replaceDue?: string | null }) => void;
}

export function AssetLifecycleView({ asset, today, readOnly, onChange }: Props) {
  // assetAlert 는 Asset 형태를 받으므로 필요한 필드만 캐스팅해 전달
  const alert = assetAlert({ warrantyUntil: asset.warrantyUntil, replaceDue: asset.replaceDue } as Parameters<typeof assetAlert>[0], today);
  return (
    <div className="space-y-0.5">
      {alert && (
        <div className="text-xs text-amber-700">⚠ {alert.label}</div>
      )}
      <Row label="교체예정" value={asset.replaceDue} readOnly={readOnly} onChange={(v) => onChange?.({ replaceDue: v })} />
      <Row label="하자보수기한" value={asset.warrantyUntil} readOnly={readOnly} onChange={(v) => onChange?.({ warrantyUntil: v })} />
    </div>
  );
}

function Row({ label, value, readOnly, onChange }: { label: string; value: string | null; readOnly: boolean; onChange: (v: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-gray-500 text-xs">{label}</span>
      {readOnly ? (
        <span className="flex-1">{value ? toDateInputValue(value) : '-'}</span>
      ) : (
        <input aria-label={label} type="date" defaultValue={toDateInputValue(value)}
          onBlur={(e) => onChange(e.target.value || null)}
          className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm" />
      )}
    </label>
  );
}
```
> 만약 `assetAlert` 의 인자 타입이 더 많은 필드를 강제하면, 테스트와 구현에서 `as` 캐스팅 범위를 맞춘다(런타임은 warrantyUntil/replaceDue 만 읽음). 편집 input 은 `defaultValue`(uncontrolled) — 부모가 `key={asset.id}` 로 remount(레지스터 패널은 이미 그렇게 함).

- [ ] **Step 4: 통과 + Commit**
```bash
git add frontend/src/features/assets/components/AssetLifecycleView.tsx frontend/src/features/assets/components/AssetLifecycleView.test.tsx
git commit -m "feat(asset): AssetLifecycleView 공유 컴포넌트(생애주기+알림, 읽기/편집) + 테스트"
```

---

## Task 4: 상호 네비 URL 빌더 (순수, TDD)

**Files:** Create `frontend/src/features/assets/navUrls.ts`, `navUrls.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `navUrls.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { floorPlanUrl, registerUrl } from './navUrls';

describe('navUrls', () => {
  it('floorPlanUrl: 층+장비 딥링크', () => {
    expect(floorPlanUrl('f1', 'a1')).toBe('/floors/f1/plan?equipmentId=a1');
  });
  it('registerUrl: 변전소+자산 딥링크', () => {
    expect(registerUrl('s1', 'a1')).toBe('/substations/s1/assets?assetId=a1');
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

Create `navUrls.ts`:
```typescript
export const floorPlanUrl = (floorId: string, assetId: string) =>
  `/floors/${floorId}/plan?equipmentId=${assetId}`;
export const registerUrl = (substationId: string, assetId: string) =>
  `/substations/${substationId}/assets?assetId=${assetId}`;
```

- [ ] **Step 4: 통과 + Commit**
```bash
git add frontend/src/features/assets/navUrls.ts frontend/src/features/assets/navUrls.test.ts
git commit -m "feat(asset): 상호 네비 URL 빌더(floorPlanUrl/registerUrl) + 테스트"
```

---

## Task 5: 레지스터 AssetDetailPanel — 공유 뷰 사용 + "도면에서 보기"

**Files:** Modify `frontend/src/features/assets/components/AssetDetailPanel.tsx`

- [ ] **Step 1: 공유 뷰로 교체**

READ the file. It currently renders the 속성 section (per fieldTemplate, with inline select/Field) and the 생애주기 section (교체예정/하자보수 date Fields + alert). Replace those two sections:
- 속성 section → `<AssetAttributesView fields={asset.assetType.fieldTemplate} attributes={asset.attributes} readOnly={false} onChange={(key, v) => onPatch(asset.id, { attributes: { ...(asset.attributes ?? {}), [key]: v } })} />`
- 생애주기 section → `<AssetLifecycleView asset={asset} today={today} readOnly={false} onChange={(patch) => onPatch(asset.id, patch)} />` (the panel already has a `today` via useMemo from the V1 fixes; if not, add `const today = useMemo(() => new Date(), []);`).
- Imports: `import { AssetAttributesView } from './AssetAttributesView'; import { AssetLifecycleView } from './AssetLifecycleView';`
- Remove the now-unused inline attribute/lifecycle Field/select code and any now-unused helpers (keep the identity Fields 이름/설치일/담당자/상태). Keep `attrPatch` only if still used elsewhere; otherwise inline as above.
> 동작 불변: onPatch 경로는 그대로(registerStore stage). 단지 렌더가 공유 컴포넌트로.

- [ ] **Step 2: "도면에서 보기" 버튼**

Add a button in the panel header/footer:
```tsx
import { useNavigate } from 'react-router-dom';
import { floorPlanUrl } from '../navUrls';
// ...
const navigate = useNavigate();
// ...
{asset.floorId ? (
  <button onClick={() => navigate(floorPlanUrl(asset.floorId!, asset.id))}
    className="text-xs px-2 py-1 rounded bg-gray-100">도면에서 보기</button>
) : (
  <button disabled title="도면에 배치되지 않음" className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-300">도면에서 보기</button>
)}
```

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx vitest run src/features/assets/components/AssetAttributesView.test.tsx src/features/assets/components/AssetLifecycleView.test.tsx` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
git add frontend/src/features/assets/components/AssetDetailPanel.tsx
git commit -m "feat(asset): 레지스터 패널을 공유 뷰로 + 도면에서 보기"
```

---

## Task 6: 그리드 `?assetId=` 핸들러

**Files:** Modify `frontend/src/features/assets/components/SubstationAssetGrid.tsx`

- [ ] **Step 1: 마운트 시 ?assetId 처리**

READ the file. It has `selectedId`/`setSelectedId` state + a detail panel opened on selection. Add:
```tsx
import { useSearchParams } from 'react-router-dom';
// ...
const [searchParams, setSearchParams] = useSearchParams();
useEffect(() => {
  const assetId = searchParams.get('assetId');
  if (assetId) {
    setSelectedId(assetId);
    setSearchParams((p) => { p.delete('assetId'); return p; }, { replace: true });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```
(Selecting opens the existing detail panel. Optional: `scrollIntoView` on the selected row via a ref — only if trivial; not required.)

- [ ] **Step 2: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
git add frontend/src/features/assets/components/SubstationAssetGrid.tsx
git commit -m "feat(asset): 그리드 ?assetId= 딥링크 핸들러(자동 선택)"
```

---

## Task 7: 에디터 InfoTab — useAsset + 공유 뷰(readOnly) + "대장에서 보기"

**Files:** Create `frontend/src/features/assets/hooks/useAsset.ts`; Modify `frontend/src/features/equipment/components/detail/InfoTab.tsx`

- [ ] **Step 1: useAsset 훅**

Create `frontend/src/features/assets/hooks/useAsset.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import { isTempId } from '../../../utils/idHelpers';
import type { Asset } from '../../../types/asset';

export function useAsset(assetId: string | undefined) {
  return useQuery<Asset>({
    queryKey: ['asset', assetId],
    queryFn: () => assetApi.getById(assetId!),
    enabled: !!assetId && !isTempId(assetId),
    staleTime: 30_000,
  });
}
```
> `assetApi.getById` 가 없으면 `frontend/src/services/assetApi.ts` 에 추가: `getById: async (id: string): Promise<Asset> => (await api.get<{ data: Asset }>(\`/assets/${id}\`)).data.data,` (응답 래핑은 다른 assetApi 메서드와 일치시킴). 추가했으면 그 파일도 이 Task 에서 커밋.

- [ ] **Step 2: InfoTab 에 공유 뷰 + 대장 버튼**

In `frontend/src/features/equipment/components/detail/InfoTab.tsx`:
- imports:
```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsset } from '../../../assets/hooks/useAsset';
import { AssetAttributesView } from '../../../assets/components/AssetAttributesView';
import { AssetLifecycleView } from '../../../assets/components/AssetLifecycleView';
import { registerUrl } from '../../../assets/navUrls';
```
- in the component (it receives `equipment` + `readOnly`):
```tsx
  const { data: asset } = useAsset(equipment.id);
  const today = useMemo(() => new Date(), []);
  const navigate = useNavigate();
```
- render BELOW the existing identity display/edit (and only when `asset` exists; snapshot/temp → asset undefined → nothing extra):
```tsx
  {asset && (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      <AssetAttributesView fields={asset.assetType.fieldTemplate} attributes={asset.attributes} readOnly />
      <AssetLifecycleView asset={asset} today={today} readOnly />
      <button
        onClick={() => navigate(registerUrl(asset.substationId, asset.id))}
        className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">대장에서 편집</button>
    </div>
  )}
```
> `asset.assetType.fieldTemplate` 의 타입이 `AssetAttributesView` 의 `FieldDef[]` 와 호환되는지 확인(키/라벨/타입). `asset.substationId` 는 Asset 에 존재. 식별 편집(이름/담당자/설치/설명)은 **건드리지 않는다** — 이 블록은 추가 표시일 뿐.

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
git add frontend/src/features/assets/hooks/useAsset.ts frontend/src/features/equipment/components/detail/InfoTab.tsx frontend/src/services/assetApi.ts
git commit -m "feat(editor): InfoTab 에 속성·생애주기(readOnly) + 대장에서 편집 — useAsset"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features/assets` → 모두 PASS(신규 뷰·navUrls + 기존 alerts/exportCsv/columns/workingCopy 회귀). `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] `cd backend && npx vitest run tests/asset.service.test.ts tests/asset.integration.test.ts` → PASS. `npm run build` → 0.
- [ ] 수동(dev): ① 대장에서 **배치된** 장비 선택 → "도면에서 보기" → 에디터가 그 장비 선택·센터. ② 도면에서 장비 더블클릭 → 정보 탭에 **속성·생애주기·알림** 보임 + "대장에서 편집" → 그리드가 그 행 선택·패널 오픈. ③ **미배치** 장비 → "도면에서 보기" 비활성.

## 완료 기준 (spec §7)
- [ ] 에디터 정보 탭에서 속성·생애주기·알림 표시(읽기전용)
- [ ] 같은 렌더가 레지스터·에디터 동일 컴포넌트
- [ ] 레지스터→도면(배치 시), 에디터→대장 상호 네비
- [ ] 기존 편집·저장 회귀 없음

## 이후
- 5b 엔진 마이그레이션 → 에디터 속성·생애주기도 편집(공유 뷰 editable 승격).
- (나) 통합 워크스페이스 → V2~V5.
