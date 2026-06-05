# V1 장비 대장 구현 계획 (생애주기·사진·유지보수·내보내기)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 변전소 현황 표를 본격 장비 대장으로 확장 — 행 클릭 시 우측 상세 패널(식별·설치/담당/상태·속성·사진·유지보수), 생애주기 임박 알림, 대장 CSV 내보내기.

**Architecture:** 가산. 백엔드는 Asset에 생애주기 날짜 칼럼 2개(`warrantyUntil`/`replaceDue`) 추가 + 종류별 `fieldTemplate` 시드 정비뿐. 사진·유지보수는 기존 `EquipmentPhoto`/`MaintenanceLog`(2a에서 Asset 연결됨)와 기존 `/equipment/:id/photos`·`/equipment/:id/maintenance-logs` 엔드포인트를 그대로 재사용(=assetId). 프론트는 우측 상세 패널 + 알림(순수)·CSV 내보내기(순수)를 신규로.

**Tech Stack:** Express+Prisma+Zod+Vitest(+supertest) / React+Vite+React Query+Tailwind+Vitest. dev DB: `docker compose -f docker-compose.dev.yml up -d`.

**설계 근거:** `docs/superpowers/specs/2026-06-05-asset-register-v1-device-ledger-design.md`

**spec 대비 경미한 결정:** spec §4.3은 `/assets/:id/photos`·`/assets/:id/maintenance-logs` 별칭 추가를 제안했으나, 기존 `/equipment/:id/*` 엔드포인트가 이미 Asset에 동작하므로 **백엔드 신규 라우트 없이 그 엔드포인트를 프론트에서 재사용**한다(`:id`=assetId). 의미상 네임스페이스 정리는 2b로 미룬다. 내보내기는 xlsx 라이브러리 도입 없이 **CSV(UTF-8 BOM, Excel 한글 호환)**.

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경 존재. 각 commit 스텝은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조

**Backend**
- 수정: `backend/prisma/schema.prisma` (Asset.warrantyUntil/replaceDue) + 마이그레이션
- 수정: `backend/src/services/asset.service.ts` (UpdateAssetInput/CreateAssetInput/AssetDetail/mapToDetail/create/update)
- 수정: `backend/src/routes/assets.routes.ts` (create/update zod 스키마)
- 수정: `backend/prisma/seed/assetTypes.ts` (fieldTemplate 정비 + 신규 종류)
- 수정: `backend/tests/asset.service.test.ts` (생애주기 필드 단위테스트 추가)

**Frontend**
- 수정: `frontend/src/types/asset.ts` (warrantyUntil/replaceDue)
- 수정: `frontend/src/services/assetApi.ts` (update 필드)
- 생성: `frontend/src/features/assets/alerts.ts` + `alerts.test.ts` (임박 계산, 순수 TDD)
- 생성: `frontend/src/features/assets/exportCsv.ts` + `exportCsv.test.ts` (행→CSV, 순수 TDD)
- 생성: `frontend/src/features/assets/hooks/useAssetPhotos.ts`, `useAssetMaintenanceLogs.ts`
- 생성: `frontend/src/features/assets/components/AssetDetailPanel.tsx`, `AssetPhotoSection.tsx`, `AssetMaintenanceSection.tsx`
- 수정: `frontend/src/features/assets/components/SubstationAssetGrid.tsx` (행 선택→패널, ⚠ 배지, 임박 필터, 내보내기 버튼), `AssetGridRow.tsx` (⚠ 배지)
- 수정: `frontend/src/features/assets/hooks/useSubstationAssets.ts` (update 패치에 새 필드)

---

# Backend

## Task 1: Asset 생애주기 칼럼 + 서비스/스키마 확장

**Files:** Modify `backend/prisma/schema.prisma`, `backend/src/services/asset.service.ts`, `backend/src/routes/assets.routes.ts`, `backend/tests/asset.service.test.ts`

- [ ] **Step 1: 단위테스트 추가 (update 가 생애주기 필드를 저장)**

`backend/tests/asset.service.test.ts` 의 `describe('AssetService', ...)` 안에 테스트 추가(기존 mock 패턴 사용 — 파일 상단 `vi.mock('../src/config/prisma.js', ...)` 의 `asset` 에 `update`/`findUnique` 가 이미 mock 돼 있음):
```typescript
  it('update 는 warrantyUntil/replaceDue 를 Date 로 저장한다', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({ id: 'a1' } as any);
    vi.mocked(prisma.asset.update).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'X',
      parentAssetId: null, roomText: null, attributes: null, installDate: null,
      manager: null, description: null, status: null, sortOrder: 0,
      warrantyUntil: new Date('2026-12-31'), replaceDue: new Date('2027-06-30'),
      assetType: { id: 't1', code: 'RTU', name: 'RTU', group: '통신', displayColor: '#000', fieldTemplate: [] },
    } as any);
    await assetService.update('a1', { warrantyUntil: '2026-12-31', replaceDue: '2027-06-30' }, 'u1');
    const arg = vi.mocked(prisma.asset.update).mock.calls[0][0] as any;
    expect(arg.data.warrantyUntil).toBeInstanceOf(Date);
    expect(arg.data.replaceDue).toBeInstanceOf(Date);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && npx vitest run tests/asset.service.test.ts`
Expected: FAIL (update 가 warrantyUntil/replaceDue 를 무시 → arg.data.warrantyUntil undefined).

- [ ] **Step 3: 스키마에 칼럼 추가 + 마이그레이션**

`backend/prisma/schema.prisma` 의 `model Asset` 메타 영역(installDate 근처)에 추가:
```prisma
  warrantyUntil DateTime? @map("warranty_until") @db.Date
  replaceDue    DateTime? @map("replace_due")    @db.Date
```
그리고 인덱스 영역에 추가:
```prisma
  @@index([warrantyUntil])
  @@index([replaceDue])
```
Run: `cd backend && npx prisma migrate dev --name asset_lifecycle_dates`
Expected: `ALTER TABLE assets ADD COLUMN warranty_until/replace_due` + 인덱스. 적용 성공. (DB에 자산 데이터 있어 비파괴 ALTER 라 `migrate dev` 가 비대화형으로 적용 가능.)

- [ ] **Step 4: asset.service 확장**

`backend/src/services/asset.service.ts`:
- `CreateAssetInput`·`UpdateAssetInput` 인터페이스에 `warrantyUntil?: string | null;` `replaceDue?: string | null;` 추가.
- `AssetDetail` 인터페이스에 `warrantyUntil: Date | null;` `replaceDue: Date | null;` 추가.
- `mapToDetail` 의 반환에 `warrantyUntil: a.warrantyUntil, replaceDue: a.replaceDue,` 추가.
- `create` 의 data 에 추가: `warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null, replaceDue: input.replaceDue ? new Date(input.replaceDue) : null,`
- `update` 의 data 에 추가(installDate 와 동일한 undefined/null 처리):
```typescript
        warrantyUntil: input.warrantyUntil === undefined ? undefined : input.warrantyUntil ? new Date(input.warrantyUntil) : null,
        replaceDue: input.replaceDue === undefined ? undefined : input.replaceDue ? new Date(input.replaceDue) : null,
```

- [ ] **Step 5: assets.routes zod 스키마 확장**

`backend/src/routes/assets.routes.ts` 의 `createAssetSchema` 와 `updateAssetSchema` 둘 다에 추가:
```typescript
  warrantyUntil: z.string().date().optional().nullable(),
  replaceDue: z.string().date().optional().nullable(),
```

- [ ] **Step 6: 통과 확인 + 빌드**

Run: `cd backend && npx vitest run tests/asset.service.test.ts` → PASS.
Run: `cd backend && npm run build` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/services/asset.service.ts backend/src/routes/assets.routes.ts backend/tests/asset.service.test.ts
git commit -m "feat(asset): 생애주기 칼럼(warrantyUntil/replaceDue) + 서비스·스키마"
```

---

## Task 2: 종류별 fieldTemplate 정비 + 신규 종류 시드

**Files:** Modify `backend/prisma/seed/assetTypes.ts`

- [ ] **Step 1: ASSET_LIFECYCLE 에서 칼럼 이동분 제거**

`backend/prisma/seed/assetTypes.ts` 의 `ASSET_LIFECYCLE` 배열에서 `installYm`·`replacePlan`·`warrantyUntil` 항목을 **삭제**(이제 installDate/replaceDue/warrantyUntil 칼럼이 대체). 남는 것:
```typescript
const ASSET_LIFECYCLE: FieldDef[] = [
  { key: 'model', label: '모델명', type: 'text' },
  { key: 'vendor', label: '제작사', type: 'text' },
  { key: 'mfgYm', label: '제작년월', type: 'month' },
  { key: 'serialNo', label: 'S/N', type: 'text' },
];
```

- [ ] **Step 2: 배치형 외 device 종류의 fieldTemplate 정비**

`ASSET_TYPE_SEEDS` 에서 RTU/PITR/OPT-XPONDER/CHARGER/UPS/BATTERY 항목의 `fieldTemplate` 을 아래로 교체(엑셀 핵심 컬럼 반영):
```typescript
  // RTU
  fieldTemplate: [
    { key: 'hostOffice', label: '급전(분)소', type: 'text' },
    { key: 'voltage', label: '전압', type: 'text' },
    { key: 'substationType', label: '변전소형태', type: 'text' },
    { key: 'operation', label: '운영', type: 'select', options: ['유인', '무인'] },
    { key: 'kind', label: '종류', type: 'text' },
    { key: 'category', label: '구분', type: 'text' },
    { key: 'timeSync', label: '시각동기장치', type: 'text' },
    { key: 'protocol', label: '프로토콜', type: 'text' },
    { key: 'hostCircuits', label: '상위Host회선수', type: 'number' },
    { key: 'scadaLink', label: 'SCADA연계', type: 'text' },
    { key: 'ipAddr', label: 'IP', type: 'text' },
    ...ASSET_LIFECYCLE,
  ],
  // PITR
  fieldTemplate: [
    { key: 'tlName', label: 'T/L명', type: 'text' },
    { key: 'tlVoltage', label: 'T/L전압', type: 'text' },
    { key: 'typeCode', label: 'TYPE', type: 'text' },
    { key: 'ipCot', label: 'IP(COT)', type: 'text' },
    { key: 'ipRt', label: 'IP(RT)', type: 'text' },
    { key: 'routePrimary', label: '회선경로(주)', type: 'text' },
    { key: 'routeBackup', label: '회선경로(예)', type: 'text' },
    ...ASSET_LIFECYCLE,
  ],
  // OPT-XPONDER (광전송장치)
  fieldTemplate: [
    { key: 'remote', label: '대국', type: 'text' },
    { key: 'topology', label: '구성형태', type: 'select', options: ['링', 'P-TO-P'] },
    { key: 'ringName', label: '링 명칭', type: 'text' },
    { key: 'spec', label: '규격', type: 'text' },
    { key: 'introYear', label: '도입년도', type: 'number' },
    { key: 'ipMain', label: 'IP(주)', type: 'text' },
    { key: 'ipExt', label: 'IP(확장)', type: 'text' },
    ...ASSET_LIFECYCLE,
  ],
  // CHARGER (충전기)
  fieldTemplate: [
    { key: 'spec', label: '규격', type: 'text' },
    { key: 'formType', label: '형식', type: 'text' },
    { key: 'control', label: '제어', type: 'text' },
    { key: 'inputV', label: '입력', type: 'text' },
    { key: 'outputV', label: '출력V', type: 'text' },
    ...ASSET_LIFECYCLE,
  ],
  // UPS / BATTERY 는 ...ASSET_LIFECYCLE + { key:'spec', label:'규격', type:'text' }
```
(UPS/BATTERY 는 `fieldTemplate: [{ key: 'spec', label: '규격', type: 'text' }, ...ASSET_LIFECYCLE]`.)

- [ ] **Step 3: 신규 광전송 하위 종류 추가**

`ASSET_TYPE_SEEDS` 에 4종 추가(OPT-XPONDER 와 같은 fieldTemplate, group '통신', placementKind=null, sortOrder 61~64, 코드 충돌 없게):
```typescript
  { code: 'OPT-COT', name: '통합단말', group: '통신', isContainer: false, displayColor: '#06b6d4', sortOrder: 61, fieldTemplate: OPT_FIELDS },
  { code: 'OPT-SMALL', name: '소형광', group: '통신', isContainer: false, displayColor: '#22d3ee', sortOrder: 62, fieldTemplate: OPT_FIELDS },
  { code: 'OPT-TRANS', name: '송변전광', group: '통신', isContainer: false, displayColor: '#0891b2', sortOrder: 63, fieldTemplate: OPT_FIELDS },
  { code: 'PCM', name: 'PCM', group: '통신', isContainer: false, displayColor: '#67e8f9', sortOrder: 64, fieldTemplate: OPT_FIELDS },
```
(위 OPT-XPONDER 의 fieldTemplate 배열을 `const OPT_FIELDS: FieldDef[] = [ ... ]` 로 추출해 OPT-XPONDER 와 4종이 공유. 코드 중복 제거.)
> 주의: 기존 시드에 이미 `EQP-OPT-TERM`(통합단말, 모듈 카테고리)이 있다. 코드가 다르므로(`OPT-COT` vs `EQP-OPT-TERM`) 충돌은 없으나, 같은 개념이 둘 존재함을 주석으로 남긴다(통합/정리는 추후).

- [ ] **Step 4: 시드 실행 + 확인**

Run: `cd backend && npm run db:seed`
Expected: 성공.
Run: `cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.assetType.findUnique({where:{code:'RTU'}}).then(r=>console.log('RTU fields:',r.fieldTemplate.map(f=>f.key).join(','))).then(()=>p.\$disconnect())"`
Expected: `hostOffice,voltage,...,model,vendor,mfgYm,serialNo` (installYm/replacePlan/warrantyUntil 없음).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seed/assetTypes.ts
git commit -m "feat(asset): 종류별 fieldTemplate 정비 + 광전송 하위종류 시드"
```

---

# Frontend

## Task 3: 프론트 타입 + API 필드 확장

**Files:** Modify `frontend/src/types/asset.ts`, `frontend/src/services/assetApi.ts`, `frontend/src/features/assets/hooks/useSubstationAssets.ts`

- [ ] **Step 1: 타입 확장**

`frontend/src/types/asset.ts`:
- `Asset` 인터페이스에 추가: `warrantyUntil: string | null;` `replaceDue: string | null;` (installDate 근처).
- `UpdateAssetInput` 에 추가: `installDate?: string | null;` `manager?: string | null;` `status?: string | null;` `warrantyUntil?: string | null;` `replaceDue?: string | null;` (기존에 일부 없으면 같이 추가).

- [ ] **Step 2: 낙관적 업데이트 패치에 새 필드 반영**

`frontend/src/features/assets/hooks/useSubstationAssets.ts` 의 `useUpdateAsset` `onMutate` 에서 캐시 패치 시 새 필드도 반영하도록, 매핑 객체에 추가:
```typescript
              installDate: payload.installDate !== undefined ? payload.installDate : a.installDate,
              manager: payload.manager !== undefined ? payload.manager : a.manager,
              status: payload.status !== undefined ? payload.status : a.status,
              warrantyUntil: payload.warrantyUntil !== undefined ? payload.warrantyUntil : a.warrantyUntil,
              replaceDue: payload.replaceDue !== undefined ? payload.replaceDue : a.replaceDue,
```
(`assetApi.update` 는 이미 payload 를 그대로 PUT 하므로 변경 불필요 — 단 `UpdateAssetInput` 타입만 위에서 확장.)

- [ ] **Step 3: 타입체크 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0.
```bash
git add frontend/src/types/asset.ts frontend/src/features/assets/hooks/useSubstationAssets.ts
git commit -m "feat(asset): 프론트 생애주기 필드 타입·낙관적 패치"
```

---

## Task 4: 생애주기 임박 계산 (순수, TDD)

**Files:** Create `frontend/src/features/assets/alerts.ts`, `frontend/src/features/assets/alerts.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `frontend/src/features/assets/alerts.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { assetAlert } from './alerts';
import type { Asset } from '../../types/asset';

const base = { warrantyUntil: null, replaceDue: null } as unknown as Asset;
const today = new Date('2026-06-05');

describe('assetAlert', () => {
  it('둘 다 없으면 null', () => {
    expect(assetAlert(base, today)).toBeNull();
  });
  it('하자보수기한이 6개월 이내면 warranty 경고', () => {
    const a = { ...base, warrantyUntil: '2026-09-01' } as Asset;
    expect(assetAlert(a, today)?.kind).toBe('warranty');
  });
  it('하자보수기한이 6개월보다 멀면 null', () => {
    const a = { ...base, warrantyUntil: '2027-06-01' } as Asset;
    expect(assetAlert(a, today)).toBeNull();
  });
  it('교체예정이 오늘 이전/당일이면 replace 경고', () => {
    const a = { ...base, replaceDue: '2026-06-05' } as Asset;
    expect(assetAlert(a, today)?.kind).toBe('replace');
  });
  it('교체예정이 미래면 null', () => {
    const a = { ...base, replaceDue: '2027-01-01' } as Asset;
    expect(assetAlert(a, today)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/assets/alerts.test.ts` → FAIL (cannot resolve './alerts').

- [ ] **Step 3: 구현**

Create `frontend/src/features/assets/alerts.ts`:
```typescript
import type { Asset } from '../../types/asset';

export interface AssetAlert {
  kind: 'warranty' | 'replace';
  label: string;
  date: string;
}

const WARRANTY_MONTHS_AHEAD = 6;

/** 하자보수기한 임박(N개월 이내) 또는 교체예정 도래/경과 시 경고 반환. 둘 다면 warranty 우선. */
export function assetAlert(asset: Asset, today: Date): AssetAlert | null {
  if (asset.warrantyUntil) {
    const w = new Date(asset.warrantyUntil);
    const threshold = new Date(today);
    threshold.setMonth(threshold.getMonth() + WARRANTY_MONTHS_AHEAD);
    if (w <= threshold) return { kind: 'warranty', label: '하자보수 임박', date: asset.warrantyUntil };
  }
  if (asset.replaceDue) {
    const r = new Date(asset.replaceDue);
    if (r <= today) return { kind: 'replace', label: '교체 도래', date: asset.replaceDue };
  }
  return null;
}
```

- [ ] **Step 4: 통과 + Commit**

Run: `cd frontend && npx vitest run src/features/assets/alerts.test.ts` → PASS (5).
```bash
git add frontend/src/features/assets/alerts.ts frontend/src/features/assets/alerts.test.ts
git commit -m "feat(asset): 생애주기 임박 계산(순수) + 테스트"
```

---

## Task 5: 대장 CSV 내보내기 (순수, TDD)

**Files:** Create `frontend/src/features/assets/exportCsv.ts`, `frontend/src/features/assets/exportCsv.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `frontend/src/features/assets/exportCsv.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildCsv } from './exportCsv';
import type { GridColumn } from './columns';
import type { Asset } from '../../types/asset';

const cols: GridColumn[] = [
  { key: 'name', label: '이름', kind: 'name' },
  { key: 'model', label: '모델명', kind: 'attr' },
];
const assets = [
  { id: 'a1', name: '원주RTU', attributes: { model: 'CT-1000' }, installDate: '2023-12-01', manager: '김OO', status: '운영', warrantyUntil: null, replaceDue: null, assetType: { name: 'RTU' } } as unknown as Asset,
];

describe('buildCsv', () => {
  it('헤더에 종류·표시컬럼·설치일·담당자·상태·교체예정·하자보수기한', () => {
    const csv = buildCsv(assets, cols);
    const header = csv.split('\n')[0];
    expect(header).toContain('종류');
    expect(header).toContain('이름');
    expect(header).toContain('모델명');
    expect(header).toContain('설치일');
    expect(header).toContain('하자보수기한');
  });
  it('값 행에 자산 데이터', () => {
    const csv = buildCsv(assets, cols);
    const row = csv.split('\n')[1];
    expect(row).toContain('원주RTU');
    expect(row).toContain('CT-1000');
    expect(row).toContain('김OO');
  });
  it('쉼표/따옴표는 이스케이프', () => {
    const a = [{ ...assets[0], name: '랙,3"호' } as Asset];
    const row = buildCsv(a, cols).split('\n')[1];
    expect(row).toContain('"랙,3""호"');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/assets/exportCsv.test.ts` → FAIL.

- [ ] **Step 3: 구현**

Create `frontend/src/features/assets/exportCsv.ts`:
```typescript
import type { Asset } from '../../types/asset';
import type { GridColumn } from './columns';
import { attrValue } from './columns';

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const cell = (a: Asset, col: GridColumn): string =>
  col.kind === 'name' ? a.name : attrValue(a.attributes, col.key);

/** 현재 표(컬럼) + 생애주기/메타를 CSV 문자열로. */
export function buildCsv(assets: Asset[], columns: GridColumn[]): string {
  const meta = ['설치일', '담당자', '상태', '교체예정', '하자보수기한'];
  const header = ['종류', ...columns.map((c) => c.label), ...meta].map(esc).join(',');
  const rows = assets.map((a) =>
    [
      a.assetType?.name ?? '',
      ...columns.map((c) => cell(a, c)),
      a.installDate ?? '', a.manager ?? '', a.status ?? '', a.replaceDue ?? '', a.warrantyUntil ?? '',
    ].map((v) => esc(String(v ?? ''))).join(','),
  );
  return [header, ...rows].join('\n');
}

/** CSV 를 UTF-8 BOM 파일로 다운로드(브라우저). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 통과 + Commit**

Run: `cd frontend && npx vitest run src/features/assets/exportCsv.test.ts` → PASS (3).
```bash
git add frontend/src/features/assets/exportCsv.ts frontend/src/features/assets/exportCsv.test.ts
git commit -m "feat(asset): 대장 CSV 내보내기(순수) + 테스트"
```

---

## Task 6: 자산 사진·유지보수 훅 (기존 엔드포인트 재사용)

**Files:** Create `frontend/src/features/assets/hooks/useAssetPhotos.ts`, `frontend/src/features/assets/hooks/useAssetMaintenanceLogs.ts`

> 기존 `/equipment/:id/photos`·`/equipment/:id/maintenance-logs` 가 Asset(=id)에 동작하므로 그대로 호출.

- [ ] **Step 1: 사진 훅**

먼저 사진 타입을 확인: `frontend/src/types/maintenance.ts` 또는 equipment 타입에 `EquipmentPhoto`/`MaintenanceLog` 가 있다 — `grep -rn "interface EquipmentPhoto\|interface MaintenanceLog" frontend/src/types` 로 경로 확인 후 import.
Create `frontend/src/features/assets/hooks/useAssetPhotos.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { EquipmentPhoto } from '../../../types/maintenance';

const KEYS = { list: (assetId: string) => ['asset-photos', assetId] as const };

export function useAssetPhotos(assetId: string) {
  return useQuery({
    queryKey: KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentPhoto[] }>(`/equipment/${assetId}/photos`);
      return data.data;
    },
    enabled: !!assetId,
  });
}

export function useUploadAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const { data } = await api.post<{ data: EquipmentPhoto }>(`/equipment/${assetId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}

export function useDeleteAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.delete(`/equipment-photos/${photoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}
```
> `EquipmentPhoto` 타입 경로/필드(`id, side, imageUrl, description, takenAt, createdAt`)와 삭제 라우트(`/equipment-photos/:id`)를 실제와 대조해 맞춘다(`grep -rn "equipment-photos" frontend/src backend/src/index.ts`).

- [ ] **Step 2: 유지보수 훅**

Create `frontend/src/features/assets/hooks/useAssetMaintenanceLogs.ts` — 기존 `frontend/src/features/equipment/hooks/useMaintenanceLogs.ts` 를 참고하되 엔드포인트는 동일(`/equipment/:assetId/maintenance-logs`), queryKey 만 `['asset-maintenance-logs', assetId]`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { MaintenanceLog } from '../../../types/maintenance';

const KEYS = { list: (assetId: string) => ['asset-maintenance-logs', assetId] as const };

export function useAssetMaintenanceLogs(assetId: string) {
  return useQuery({
    queryKey: KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: MaintenanceLog[] }>(`/equipment/${assetId}/maintenance-logs`);
      return data.data;
    },
    enabled: !!assetId,
  });
}

export function useCreateAssetMaintenanceLog(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { logType: string; title: string; description?: string; logDate?: string; severity?: string; status?: string }) => {
      const { data } = await api.post<{ data: MaintenanceLog }>(`/equipment/${assetId}/maintenance-logs`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}
```
> `MaintenanceLog` 타입 경로·필드와 create payload 필드(logType/title/description/logDate/severity/status)를 기존 `useMaintenanceLogs.ts`·백엔드 `maintenanceLog.service` 와 대조해 맞춘다.

- [ ] **Step 3: 타입체크 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0 (타입/경로 안 맞으면 위 grep 으로 교정).
```bash
git add frontend/src/features/assets/hooks/useAssetPhotos.ts frontend/src/features/assets/hooks/useAssetMaintenanceLogs.ts
git commit -m "feat(asset): 자산 사진·유지보수 훅(기존 엔드포인트 재사용)"
```

---

## Task 7: 사진·유지보수 섹션 컴포넌트

**Files:** Create `frontend/src/features/assets/components/AssetPhotoSection.tsx`, `frontend/src/features/assets/components/AssetMaintenanceSection.tsx`

- [ ] **Step 1: 사진 섹션**

Create `frontend/src/features/assets/components/AssetPhotoSection.tsx`:
```typescript
import { useState, useRef } from 'react';
import { useAssetPhotos, useUploadAssetPhoto, useDeleteAssetPhoto } from '../hooks/useAssetPhotos';

export function AssetPhotoSection({ assetId }: { assetId: string }) {
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: photos = [] } = useAssetPhotos(assetId);
  const upload = useUploadAssetPhoto(assetId);
  const del = useDeleteAssetPhoto(assetId);
  const shown = photos.filter((p) => p.side === side);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('side', side);
    upload.mutate(form);
    e.target.value = '';
  };

  return (
    <section className="px-4 py-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">사진</h3>
        <div className="flex gap-1">
          {(['front', 'rear'] as const).map((s) => (
            <button key={s} onClick={() => setSide(s)}
              className={`text-xs px-2 py-0.5 rounded ${side === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {s === 'front' ? '전면' : '후면'}
            </button>
          ))}
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">+ 업로드</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-xs text-gray-400">{side === 'front' ? '전면' : '후면'} 사진 없음</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.imageUrl} alt="" className="w-full h-20 object-cover rounded border border-gray-200" />
              <button onClick={() => { if (confirm('사진을 삭제할까요?')) del.mutate(p.id); }}
                className="absolute top-0.5 right-0.5 text-xs bg-white/80 rounded px-1 opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 유지보수 섹션**

Create `frontend/src/features/assets/components/AssetMaintenanceSection.tsx`:
```typescript
import { useState } from 'react';
import { useAssetMaintenanceLogs, useCreateAssetMaintenanceLog } from '../hooks/useAssetMaintenanceLogs';

export function AssetMaintenanceSection({ assetId }: { assetId: string }) {
  const { data: logs = [] } = useAssetMaintenanceLogs(assetId);
  const create = useCreateAssetMaintenanceLog(assetId);
  const [title, setTitle] = useState('');
  const [logType, setLogType] = useState('MAINTENANCE');

  const add = () => {
    if (!title.trim()) return;
    create.mutate({ logType, title: title.trim() }, { onSuccess: () => setTitle('') });
  };

  return (
    <section className="px-4 py-3 border-t border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">유지보수 이력</h3>
      <div className="flex gap-1 mb-2">
        <select value={logType} onChange={(e) => setLogType(e.target.value)} className="text-xs border border-gray-200 rounded px-1">
          <option value="MAINTENANCE">점검</option>
          <option value="FAILURE">고장</option>
          <option value="REPAIR">수리</option>
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="내용"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" />
        <button onClick={add} disabled={!title.trim() || create.isPending}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">추가</button>
      </div>
      {logs.length === 0 ? (
        <p className="text-xs text-gray-400">이력 없음</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((l) => (
            <li key={l.id} className="text-xs text-gray-600 flex justify-between">
              <span>[{l.logType}] {l.title}</span>
              <span className="text-gray-400">{l.logDate ? new Date(l.logDate).toLocaleDateString('ko-KR') : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```
> `MaintenanceLog` 필드(`logType/title/logDate`)를 실제 타입과 대조해 맞춘다.

- [ ] **Step 3: 타입체크 + Commit**

Run: `cd frontend && npx tsc --noEmit` → 0.
```bash
git add frontend/src/features/assets/components/AssetPhotoSection.tsx frontend/src/features/assets/components/AssetMaintenanceSection.tsx
git commit -m "feat(asset): 사진·유지보수 섹션 컴포넌트"
```

---

## Task 8: 상세 패널 + 그리드 통합(배지·필터·내보내기)

**Files:** Create `frontend/src/features/assets/components/AssetDetailPanel.tsx`; Modify `frontend/src/features/assets/components/SubstationAssetGrid.tsx`, `frontend/src/features/assets/components/AssetGridRow.tsx`

- [ ] **Step 1: 상세 패널**

Create `frontend/src/features/assets/components/AssetDetailPanel.tsx`:
```typescript
import type { Asset, AssetFieldDef, UpdateAssetInput } from '../../../types/asset';
import { assetAlert } from '../alerts';
import { AssetPhotoSection } from './AssetPhotoSection';
import { AssetMaintenanceSection } from './AssetMaintenanceSection';

interface Props {
  asset: Asset;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<UpdateAssetInput>) => void;
}

function Field({ label, value, onCommit, type = 'text' }: { label: string; value: string; onCommit: (v: string) => void; type?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-gray-500 text-xs">{label}</span>
      <input type={type} defaultValue={value} onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
        className="flex-1 px-1 py-0.5 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded text-sm" />
    </label>
  );
}

export function AssetDetailPanel({ asset, onClose, onPatch }: Props) {
  const fields: AssetFieldDef[] = asset.assetType.fieldTemplate ?? [];
  const alert = assetAlert(asset, new Date());
  const attrPatch = (key: string, v: string) => onPatch(asset.id, { attributes: { ...(asset.attributes ?? {}), [key]: v } });

  return (
    <aside className="w-96 shrink-0 border-l border-gray-200 bg-white h-full overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 sticky top-0 bg-white">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: asset.assetType.displayColor ?? '#94a3b8' }} />
          <span className="text-sm font-semibold">{asset.name}</span>
          <span className="text-xs text-gray-400">{asset.assetType.name}</span>
          {alert && <span className="text-xs px-1.5 rounded bg-amber-100 text-amber-700" title={`${alert.label} (${alert.date})`}>⚠ {alert.label}</span>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
      </header>

      <section className="px-4 py-3">
        <Field label="이름" value={asset.name} onCommit={(v) => v.trim() && onPatch(asset.id, { name: v.trim() })} />
        <Field label="설치일" type="date" value={asset.installDate ?? ''} onCommit={(v) => onPatch(asset.id, { installDate: v || null })} />
        <Field label="담당자" value={asset.manager ?? ''} onCommit={(v) => onPatch(asset.id, { manager: v || null })} />
        <Field label="상태" value={asset.status ?? ''} onCommit={(v) => onPatch(asset.id, { status: v || null })} />
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">속성</h3>
        {fields.length === 0 ? <p className="text-xs text-gray-400">이 종류엔 속성 없음</p> :
          fields.map((f) => (
            <Field key={f.key} label={f.label} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={asset.attributes?.[f.key] != null ? String(asset.attributes[f.key]) : ''}
              onCommit={(v) => attrPatch(f.key, v)} />
          ))}
      </section>

      <section className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">생애주기</h3>
        <Field label="교체예정" type="date" value={asset.replaceDue ?? ''} onCommit={(v) => onPatch(asset.id, { replaceDue: v || null })} />
        <Field label="하자보수기한" type="date" value={asset.warrantyUntil ?? ''} onCommit={(v) => onPatch(asset.id, { warrantyUntil: v || null })} />
      </section>

      <AssetPhotoSection assetId={asset.id} />
      <AssetMaintenanceSection assetId={asset.id} />
    </aside>
  );
}
```

- [ ] **Step 2: 그리드 통합**

`frontend/src/features/assets/components/SubstationAssetGrid.tsx`:
- import: `import { AssetDetailPanel } from './AssetDetailPanel';` `import { assetAlert } from '../alerts';` `import { buildCsv, downloadCsv } from '../exportCsv';`
- 상태 추가: `const [selectedId, setSelectedId] = useState<string | null>(null);` `const [alertOnly, setAlertOnly] = useState(false);`
- `visible` 계산에 임박 필터 적용: `const today = useMemo(() => new Date(), []);` 그리고 `visible` 를 `alertOnly ? base.filter((a) => assetAlert(a, today)) : base` 로 감싼다(기존 type 필터 뒤에).
- 상단 바에 버튼 추가: "임박만" 토글(`onClick={() => setAlertOnly(v => !v)}`), "내보내기"(`onClick={() => downloadCsv(\`장비대장_${new Date().toISOString().slice(0,10)}.csv\`, buildCsv(visible, columns))}`).
- `AssetGridRow` 에 `selected`/`alert` 전달 + `onSelect={() => setSelectedId(a.id)}`.
- 레이아웃을 `flex` 로 감싸 우측에 패널: 선택된 자산이 있으면 `<AssetDetailPanel asset={selectedAsset} onClose={() => setSelectedId(null)} onPatch={(id, patch) => updateAsset.mutate({ id, ...patch })} />` (selectedAsset = visible/assets 에서 selectedId 로 찾기).
> `updateAsset.mutate` 의 인자 타입(UpdateAssetInput & {id}) 에 맞게 patch 키가 들어가야 함(Task 3에서 타입 확장 완료). `Partial<Asset>` 패치 중 attributes/name/installDate/manager/status/warrantyUntil/replaceDue 만 전달.

`frontend/src/features/assets/components/AssetGridRow.tsx`:
- props 에 `alert?: { label: string } | null` 와 `onSelect?: () => void` 추가.
- 종류 셀 옆에 `{alert && <span title={alert.label} className="text-amber-600">⚠</span>}` 표시.
- 행 클릭(이름 셀 또는 전체 `<tr onClick={onSelect}>`)으로 `onSelect` 호출(단, input 클릭과 충돌 않게 종류 셀/전용 버튼에 둔다).

- [ ] **Step 3: 빌드 + Commit**

Run: `cd frontend && npx tsc --noEmit && npx vite build` → 성공.
```bash
git add frontend/src/features/assets/components/AssetDetailPanel.tsx frontend/src/features/assets/components/SubstationAssetGrid.tsx frontend/src/features/assets/components/AssetGridRow.tsx
git commit -m "feat(asset): 상세 패널 + 그리드 통합(배지·임박필터·내보내기)"
```

---

## Task 9: 백엔드 통합 검증 + 회귀

**Files:** (검증)

- [ ] **Step 1: 자산 사진·유지보수 엔드포인트가 Asset 에 동작하는지 통합 스모크**

Run(실 DB, dev): admin 로그인 → 임의 자산 id 로 사진 목록·유지보수 목록 GET 이 200 인지 curl 또는 기존 `asset.integration.test.ts` 패턴으로 1케이스 추가(선택). 최소: `cd backend && npx vitest run tests/asset.service.test.ts tests/asset.integration.test.ts tests/floorPlan.roundtrip.integration.test.ts` → 전부 PASS(회귀 없음).

- [ ] **Step 2: 빌드**

Run: `cd backend && npm run build` → 0. `cd frontend && npx tsc --noEmit && npx vite build` → 성공.

- [ ] **Step 3: 수동 스모크(dev 서버)**

`npm run dev` → http://localhost:5173 → 변전소 현황 표 → 행 클릭 → 우측 패널: 설치일/담당자/상태 편집·속성 편집·전/후면 사진 업로드·유지보수 추가·⚠ 배지(생애주기 날짜 입력 후)·"임박만" 필터·"내보내기" 다운로드. 모두 동작 확인.

---

## 완료 기준 (스펙 §10 대응)
- [ ] 행 클릭 → 우측 패널(식별·설치/담당/상태·속성·사진·유지보수) (T7·T8)
- [ ] 전/후면 사진 업로드·조회·삭제 (T6·T7)
- [ ] 종류별 fieldTemplate 엑셀 컬럼 반영 (T2)
- [ ] 임박 ⚠ 배지 + "임박만" 필터 (T4·T8)
- [ ] 유지보수 이력 추가·조회 (T6·T7)
- [ ] CSV 내보내기 (T5·T8)
- [ ] 1단계·2a 테스트 회귀 없음 (T9)

## 이후
V2 선번장/회선, V3 점검 시계열, V4 전원계통도, V5 송전선로. `/assets/:id/*` 라우트 네임스페이스 정리·테이블 개명은 2b.
