# Stage 5B: 전원 계통 + 설계서 (+5A 하드닝) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전원 계통 뷰를 capability 질의로 복원하고, 설계서(공량 산출)를 워킹카피 overlay = before/after diff 원리로 클라이언트 즉시 미리보기로 구현한다. 5A 이월 하드닝을 선행 정리한다.

**Architecture:** 계통은 선번장과 동형 — "전원 매체(POWER_MEDIUM='power') IN/OUT 포트 자식(피더)을 실보유한 컨테이너" 질의 + 피더별 행(차단기 번호·상태는 자산 fieldValues, 전압은 IN 케이블 specParams — 편집은 기존 stage 액션 재사용). 설계서는 **서버 API 없이** 순수 계산: overlay가 곧 diff이므로 프론트 셀렉터가 overlay를 신설/철거/이설 항목으로 해석하고, **공량 계산은 @twin/core `computeReport`** (판정 단일 지점 §6-4 — 5B의 코어 승격분). 구의 report-preview 서버 API는 대체 (결정 문서화).

**Tech Stack:** 기존 스택. 신규 의존성 0, 신규 서버 엔드포인트 0, 백엔드 변경 0.

## 확정 설계 결정

- **설계서 = 미저장 변경 기준 클라이언트 미리보기**: before=saved, after=effective. 저장하면 diff가 소멸(구 시스템도 커밋 시 계산과 동일 철학). 서버 왕복 없음.
- **이설(relocate) 판정**: asset update 중 배치 필드(floorId/x/y/width/height/parentAssetId/containerKey/slotIndex/slotSpan) 변경 포함 시 이설 1건. 이름·상태·커스텀 필드만의 변경은 공량 0(설계서 미포함).
- **케이블 공량**: 그룹의 installHoursPerM/removeHoursPerM × `specParams.lengthM`(수동 입력— 5A 관례 키). lengthM 없으면 **길이 0으로 계산하되 행에 '길이 미입력' 표시** (침묵 누락 방지 — no silent caps).
- **전압 관례 키**: IN측 케이블 `specParams.voltage` (문자열, 예 "AC 220V"). 계통에서 인라인 편집.
- **POWER_MEDIUM = 'power'** — 뷰 파라미터 상수 1곳 (FIBER_MEDIUM과 동형).

## Global Constraints

- v2 자립 격리·구 소스 무접촉(수정 허용: packages/core, frontend/src/v2/**, V2WorkspacePage). 백엔드 무접촉(이번 스테이지 서버 변경 0).
- 타입키/역할 분기 금지(가드레일). 판정·공량 계산은 @twin/core만. 반응형 슬라이스 + getState 패턴.
- core 수정 후 `npm run build -w @twin/core` 필수. 전 스위트 그린 유지(core 43·backend 189·fe 69 시작점).
- CONVENTIONS 준수. 커밋 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: 5A 이월 하드닝 묶음

**Files:**
- Modify: `frontend/src/v2/store/useCommit.ts`, `frontend/src/v2/fiberSelectors.ts`, `frontend/src/v2/components/ConnectionsTab.tsx`, `frontend/src/v2/components/PortPickerPopover.tsx`, `frontend/src/v2/components/RemoteEndpointModal.tsx`
- Test: `frontend/src/v2/__tests__/fiberSelectors.test.ts` (추가)

**Interfaces:**
- Produces:
  1. **CABLE_ATTACHED 소유명 UI 노출**: useCommit의 비배열 409 details 처리에서 `details?.ownerSubstationNames`가 있으면 에러 메시지에 포함 — `"연결된 케이블이 있습니다. {names.join(', ')} 변전소에서 케이블을 먼저 삭제하세요."`
  2. **fiberSelectors portId 맵 호이스트**: `buildFiberRows` 진입 시 `portIndex: Map<portId, { port, asset }>` 1회 구성 — 셀별 `assets.flatMap(...)` 제거 (동작 무변경 — 기존 테스트가 가드).
  3. **슬롯별 core max**: 행 범위를 전 슬롯 공통 max가 아니라 **슬롯별** 그룹 max로 (4코어 슬롯은 4행). 테스트 추가:
     ```ts
     it('슬롯별 core max — 작은 슬롯은 빈 필러 행 없음', () => {
       const small = asset('slot2', '슬롯2', { parentAssetId: 'ofd', ports: [port('s2a1', 'slot2', 'A', 1), port('s2b1', 'slot2', 'B', 1)] });
       const { rows } = buildFiberRows(ofd as never, [ofd, slot, small] as never, [] as never);
       expect(rows.filter((r) => r.slotId === 'slot2')).toHaveLength(1);
       expect(rows.filter((r) => r.slotId === 'slot')).toHaveLength(2);
     });
     ```
  4. **hopText 원격 refs**: ConnectionsTab의 hop 텍스트에서 로컬 미해소 포트는 해당 케이블 refs로 "자산명 · 포트명 (변전소명)" 표기 (UUID 노출 제거).
  5. **팝오버 flip 실측 클램프**: PortPickerPopover top을 `Math.min(top, viewportH - 실측/추정 높이)`로 클램프 (320 고정 추정 대신 `Math.min(추정, 0.7 * innerHeight)` 사용).
  6. **fetchAssetPorts 레이스 토큰**: RemoteEndpointModal에서 요청 시퀀스 ref — 응답 도착 시 현재 선택 자산과 불일치하면 무시.

- [ ] **Step 1: 슬롯별 core max 테스트 RED → 전체 구현 → GREEN** — `npm test -w frontend -- run src/v2` (70 expected), `npm run build -w frontend` EXIT 0.
- [ ] **Step 2: Commit** — `fix(v2-fe): 5A 하드닝 — 소유명 노출·portId맵 호이스트·슬롯별 core max·hop refs·flip 클램프·레이스 토큰`

---

### Task 2: 코어 설계서 계산 (computeReport)

**Files:**
- Create: `packages/core/src/report/computeReport.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/report/computeReport.test.ts`

**Interfaces:**
- Produces (@twin/core export):
  ```ts
  export type ReportKind = 'asset-install' | 'asset-remove' | 'asset-relocate' | 'cable-install' | 'cable-remove';
  export interface ReportItem {
    kind: ReportKind;
    name: string;            // 자산명 or 케이블 파생 표시
    typeName: string;        // 타입명 or 케이블 그룹명
    laborType: string | null;
    qty: number;             // 자산 1, 케이블 lengthM
    unit: '대' | 'm';
    hours: number;           // 계산된 공량
    note?: string;           // '길이 미입력' 등
  }
  export interface ReportSummary {
    items: ReportItem[];
    byLaborType: { laborType: string; totalHours: number }[]; // laborType null 제외, 이름순
    totalHours: number;
  }
  export function assetReportItem(kind: 'asset-install' | 'asset-remove' | 'asset-relocate', name: string, typeName: string, labor: LaborRules): ReportItem;
  export function cableReportItem(kind: 'cable-install' | 'cable-remove', name: string, group: { name: string; laborType: string | null; installHoursPerM: number; removeHoursPerM: number }, lengthM: number | null): ReportItem;
  export function computeReport(items: ReportItem[]): ReportSummary;
  ```
  - assetReportItem: hours = labor의 kind별 시간(install/remove/relocate), qty 1, unit '대'.
  - cableReportItem: lengthM null → qty 0·hours 0·note '길이 미입력'; 아니면 qty=lengthM, hours = perM × lengthM (kind별).
  - computeReport: 합산 + laborType별 그룹(null 제외).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { assetReportItem, cableReportItem, computeReport } from './computeReport.js';

const labor = { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3 };
const fiberGroup = { name: '광', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02 };

describe('assetReportItem', () => {
  it('kind별 공량', () => {
    expect(assetReportItem('asset-install', '랙1', '랙', labor)).toMatchObject({ qty: 1, unit: '대', hours: 2, laborType: '통신내선공' });
    expect(assetReportItem('asset-relocate', '랙1', '랙', labor).hours).toBe(3);
  });
});

describe('cableReportItem', () => {
  it('lengthM × perM', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, 50)).toMatchObject({ qty: 50, unit: 'm', hours: 2, laborType: '통신외선공' });
    expect(cableReportItem('cable-remove', 'A↔B', fiberGroup, 50).hours).toBe(1);
  });
  it('길이 미입력 → 0 + note', () => {
    expect(cableReportItem('cable-install', 'A↔B', fiberGroup, null)).toMatchObject({ qty: 0, hours: 0, note: '길이 미입력' });
  });
});

describe('computeReport', () => {
  it('노무유형별 합계 + 총합', () => {
    const s = computeReport([
      assetReportItem('asset-install', '랙1', '랙', labor),
      assetReportItem('asset-remove', 'UPS1', 'UPS', { ...labor, laborType: '통신내선공', removeHours: 0.5 }),
      cableReportItem('cable-install', 'A↔B', fiberGroup, 50),
      assetReportItem('asset-install', '접지1', '접지함체', { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 }),
    ]);
    expect(s.totalHours).toBeCloseTo(2 + 0.5 + 2);
    expect(s.byLaborType).toEqual([
      { laborType: '통신내선공', totalHours: 2.5 },
      { laborType: '통신외선공', totalHours: 2 },
    ]);
    expect(s.items).toHaveLength(4);
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** — `npm test -w @twin/core`(43+5), `npm run build -w @twin/core`, backend/fe 스위트 무변 확인.
- [ ] **Step 3: Commit** — `feat(core): 설계서 공량 계산 computeReport — 자산 신설/철거/이설·케이블 미터 공량`

---

### Task 3: 프론트 설계서 셀렉터 (overlay → ReportItem[])

**Files:**
- Create: `frontend/src/v2/reportSelectors.ts`
- Test: `frontend/src/v2/__tests__/reportSelectors.test.ts`

**Interfaces:**
- Consumes: `@twin/core` assetReportItem/cableReportItem/computeReport, 스토어 형상(saved/overlays), `V2Catalog`
- Produces:
  ```ts
  export function buildReportItems(args: {
    saved: { assets: V2Asset[]; cables: V2Cable[] };
    overlays: Overlays;                 // store의 Overlays (assets/cables만 사용)
    types: V2AssetType[];               // catalog
    cableGroups: V2CableGroup[];        // catalog (categoryId → group 해소)
  }): ReportItem[];
  ```
  규칙:
  - assets.creates → asset-install (타입 labor는 typesById에서 LaborRules 구성)
  - assets.deletes → asset-remove (saved에서 자산·타입 해소; saved에 없으면 스킵 — temp 소거는 오버레이에 안 남음)
  - assets.updates → 배치 필드(floorId/x/y/width/height/parentAssetId/containerKey/slotIndex/slotSpan) 중 하나라도 patch에 존재하면 asset-relocate 1건 (그 외 무시)
  - cables.creates → cable-install (categoryId→group; lengthM = specParams.lengthM ?? null; 이름 = 로컬 해소 "자산A↔자산B" — effective assets에서 포트 소유 해소, 실패 시 '케이블')
  - cables.deletes → cable-remove (saved 케이블에서 group·lengthM·refs 이름 해소)
  - categoryId 없는 케이블 → note '종류 미지정', 공량 0 (그룹 없이는 계산 불가 — 침묵 방지)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { emptyOverlay } from '../store/overlay';
import { buildReportItems } from '../reportSelectors';

const labor = { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3 };
const rackType = { id: 't-rack', key: 'RACK', name: '랙', categoryId: 'c', sortOrder: 1, isActive: true, placeable: true, defaultWidth: null, defaultHeight: null, ...labor, fieldDefs: [], containerSpecs: [], portTemplates: [], linkRules: [] };
const fiberCat = 'cat-f';
const groups = [{ id: 'g-f', key: 'fiber', name: '광', color: '#0f0', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02, sortOrder: 1, categories: [{ id: fiberCat, name: '광케이블', sortOrder: 1 }] }];

const mkAsset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't-rack', substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const mkCable = (id: string, extra: object = {}) => ({
  id, name: null, substationId: 's', aPortId: 'pa', bPortId: 'pb', categoryId: fiberCat,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});
const overlays = (o: object) => ({
  assets: emptyOverlay(), cables: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), ...o,
});

describe('buildReportItems', () => {
  it('신설/철거/이설 + 케이블 공량', () => {
    const savedAsset = mkAsset('a1', '기존랙');
    const savedCable = mkCable('c1', { specParams: { lengthM: 50 } });
    const items = buildReportItems({
      saved: { assets: [savedAsset] as never, cables: [savedCable] as never },
      overlays: overlays({
        assets: { creates: { n1: mkAsset('n1', '신규랙') }, updates: { a1: { floorId: 'f2', x: 1, y: 2 } }, deletes: [] },
        cables: { creates: {}, updates: {}, deletes: ['c1'] },
      }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toEqual(['asset-install', 'asset-relocate', 'cable-remove']);
    expect(items.find((i) => i.kind === 'asset-install')).toMatchObject({ name: '신규랙', hours: 2 });
    expect(items.find((i) => i.kind === 'asset-relocate')).toMatchObject({ name: '기존랙', hours: 3 });
    expect(items.find((i) => i.kind === 'cable-remove')).toMatchObject({ qty: 50, hours: 1, typeName: '광' });
  });

  it('이름만 변경 update는 미포함, 종류 미지정 케이블은 note', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '랙')] as never, cables: [] as never },
      overlays: overlays({
        assets: { creates: {}, updates: { a1: { name: '개명' } }, deletes: [] },
        cables: { creates: { nc: mkCable('nc', { categoryId: null }) }, updates: {}, deletes: [] },
      }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    expect(items.some((i) => i.kind === 'asset-relocate')).toBe(false);
    expect(items.find((i) => i.kind === 'cable-install')).toMatchObject({ hours: 0, note: '종류 미지정' });
  });

  it('철거: saved에서 타입·labor 해소', () => {
    const items = buildReportItems({
      saved: { assets: [mkAsset('a1', '철거랙')] as never, cables: [] as never },
      overlays: overlays({ assets: { creates: {}, updates: {}, deletes: ['a1'] } }) as never,
      types: [rackType] as never,
      cableGroups: groups as never,
    });
    expect(items[0]).toMatchObject({ kind: 'asset-remove', name: '철거랙', hours: 1 });
  });
});
```

(주: rackType에 `...labor` 스프레드는 laborType/installHours/removeHours/relocateHours 평탄 필드 — V2AssetType 형상. mkCable의 categoryId null 케이스는 extra로 명시 오버라이드.)

- [ ] **Step 2: RED → 구현 → GREEN → Commit** — `feat(v2-fe): 설계서 셀렉터 — overlay diff를 공량 항목으로`

---

### Task 4: 설계서 패널 UI

**Files:**
- Create: `frontend/src/v2/components/ReportPanel.tsx`
- Modify: `frontend/src/v2/components/SaveBar.tsx`(설계서 버튼), `frontend/src/v2/pages/V2WorkspacePage.tsx`(패널 상태 배선)

**Interfaces:**
- Produces: SaveBar에 `설계서` 버튼(dirty>0일 때만 — SaveBar 자체가 dirty>0에서만 렌더되므로 항상 표시) → `ReportPanel` 모달(공용 Modal, `z-modal`):
  - 항목 테이블: `구분(신설/철거/이설 — Badge: install=success, remove=danger, relocate=info) | 이름 | 타입/그룹 | 수량(qty+unit) | 노무 | 공량(h)` + note는 이름 옆 `text-warning text-xs`
  - 하단 합계: 노무유형별 totalHours + 총합 (소수 2자리)
  - 데이터: `useMemo(() => computeReport(buildReportItems({...})), [saved, overlays, catalog])` — 반응형 슬라이스.
  - 항목 0건이면 "산출할 변경이 없습니다".
  - 인쇄/내보내기 없음(비목표).

- [ ] **Step 1: 구현 → 검증** — fe 스위트 그린 + 빌드 EXIT 0. 브라우저 스팟: 자산 하나 스테이지 → 설계서 버튼 → 항목·합계.
- [ ] **Step 2: Commit** — `feat(v2-fe): 설계서 패널 — overlay 기반 공량 미리보기`

---

### Task 5: 계통 행 파생 (powerSelectors)

**Files:**
- Create: `frontend/src/v2/powerSelectors.ts`
- Test: `frontend/src/v2/__tests__/powerSelectors.test.ts`

**Interfaces:**
- Produces:
  - `POWER_MEDIUM = 'power'` (뷰 파라미터 1곳)
  - `powerContainers(assets: V2Asset[]): V2Asset[]` — 전원 매체 포트를 가진 자식을 실보유한 컨테이너 (이름순)
  - `PowerRow = { feederId; feederName; breakerNo: string | null; switchState: string | null; inCell: { portId: string|null; cableId: string|null; peer: PeerInfo|null; voltage: string|null }; outCell: { portId: string|null; cableId: string|null; peer: PeerInfo|null } }` — `PeerInfo = { assetName; portName; substationName: string|null; remote: boolean }` (fiber와 동형)
  - `buildPowerRows(container: V2Asset, assets: V2Asset[], cables: V2Cable[]): PowerRow[]` —
    - 피더 = 컨테이너 자식 중 전원 매체 포트 보유 자산(이름순)
    - inCell/outCell: 피더 포트 중 direction 'IN' 첫 포트 / 'OUT' 첫 포트 각각의 연결(3단 peer 해소 — fiber와 동일 규칙: 로컬→refs→null)
    - breakerNo/switchState = fieldValues에서 (문자열화, 없으면 null)
    - voltage = IN 케이블 specParams.voltage ?? null
  - **주의**: direction으로 IN/OUT 셀을 나누는 것은 포트 **데이터**의 direction 필드 사용 — 역할 분기 아님(가드레일 통과).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { buildPowerRows, powerContainers } from '../powerSelectors';

const port = (id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT' | 'BI', medium = 'power', name?: string) =>
  ({ id, assetId, group, index, name: name ?? `${group}${index}`, direction, medium });
const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: object = {}) => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const panel = asset('panel', '분전반1');
const feeder = asset('f1', '피더1', {
  parentAssetId: 'panel',
  fieldValues: { breakerNo: 'NFB-3', switchState: 'ON' },
  ports: [port('f1in', 'f1', 'IN', 1, 'IN', 'power', 'IN'), port('f1out', 'f1', 'OUT', 1, 'OUT', 'power', 'OUT')],
});
const ups = asset('ups', 'UPS-1', { ports: [port('upsOut', 'ups', 'P', 1, 'OUT')] });
const load = asset('load', '부하장비', { ports: [port('loadIn', 'load', 'P', 1, 'IN')] });

describe('powerContainers', () => {
  it('전원 포트 자식 보유 컨테이너만', () => {
    expect(powerContainers([panel, feeder, ups] as never).map((a) => a.id)).toEqual(['panel']);
  });
});

describe('buildPowerRows', () => {
  it('피더 행 — IN/OUT 연결·차단기·전압', () => {
    const cables = [
      cable('cin', 'upsOut', 'f1in', { specParams: { voltage: 'AC 220V' } }),
      cable('cout', 'f1out', 'loadIn'),
    ];
    const rows = buildPowerRows(panel as never, [panel, feeder, ups, load] as never, cables as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feederName: '피더1', breakerNo: 'NFB-3', switchState: 'ON',
      inCell: { cableId: 'cin', voltage: 'AC 220V', peer: { assetName: 'UPS-1', remote: false } },
      outCell: { cableId: 'cout', peer: { assetName: '부하장비' } },
    });
  });

  it('연결 없는 피더 — 셀 null, 필드만', () => {
    const rows = buildPowerRows(panel as never, [panel, feeder] as never, [] as never);
    expect(rows[0]!.inCell).toMatchObject({ cableId: null, peer: null, voltage: null });
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN → Commit** — `feat(v2-fe): 계통 행 파생 — 전원 capability 질의·IN/OUT 셀·차단기/전압`

---

### Task 6: PowerRegisterView + 토글 + 편집

**Files:**
- Create: `frontend/src/v2/components/PowerRegisterView.tsx`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx`(뷰 토글에 '계통')

**Interfaces:**
- Produces: `PowerRegisterView({ substationId, selectedAssetId, onSelectAsset })` —
  - 상단 컨테이너 선택(powerContainers; 0개면 "전원 포트를 가진 자산이 없습니다")
  - 테이블 컬럼: `피더 | 차단기 번호 | 상태 | 전원 입력(peer + 전압) | 부하 출력(peer) `
    - 차단기 번호: 인라인 Input(blur/Enter 무변경 가드) → `stageAssetUpdate(feederId, { fieldValues: {...현재, breakerNo} })` (getState 병합 — AssetDetailPanel.handleFieldCommit 패턴)
    - 상태: Select(옵션 데이터: FEEDER 타입 fieldDefs의 switchState options — catalog에서 해당 피더 타입의 fieldDef 조회; 없으면 텍스트 Input) → fieldValues 병합
    - 전압: 인라인 Input → `stageCableUpdate(inCell.cableId, { specParams: {...현재, voltage} })` (IN 케이블 없으면 '—' 비편집)
    - peer 표기는 선번장과 동일(원격 Badge)
  - 행 클릭 → `onSelectAsset(feederId)`. 반응형 슬라이스 + useMemo.
  - 뷰 토글: `현황 | 평면도 | 선번장 | 계통`.

- [ ] **Step 1: 구현 → 검증** — fe 스위트 그린 + 빌드 EXIT 0.
- [ ] **Step 2: Commit** — `feat(v2-fe): 계통 뷰 — 피더 테이블·차단기/상태/전압 인라인 편집`

---

### Task 7: 종합 검증 + 브라우저 시나리오

- [ ] **Step 1: 전체 검증**

```bash
npm test -w @twin/core && npm test -w backend && npm test -w frontend -- run src/v2 && npm run build
```

- [ ] **Step 2: 브라우저 종합 시나리오 (컨트롤러 — DB 확인 포함)**
1. 변전소에 분전반 배치 + 피더 2개 추가(수용 섹션), UPS 배치 → 저장
2. 케이블 도구(전원 종류: F-CV) — UPS 포트 ↔ 피더1 IN, 피더1 OUT ↔ (부하 장비 또는 다른 피더 — 전원 매체 포트) → 저장
3. 계통 뷰: 분전반 선택 → 피더 행(IN peer=UPS, OUT peer), 차단기 번호 'NFB-1' 입력·상태 편집·전압 'AC 220V' 입력 → 저장 → DB fieldValues/specParams 확인 → 재로드 유지
4. 설계서: 자산 1개 배치 + 케이블 1개(lengthM 20 입력) + 기존 자산 이동 + 자산 1개 삭제 스테이지 → 설계서 버튼 → 신설/이설/철거/케이블 항목과 공량 합계 수기 검증(타입 시드 공량 × 수량) → note('길이 미입력') 확인용으로 lengthM 없는 케이블 1개 포함
5. 저장 후 설계서 → "산출할 변경이 없습니다"
6. 선번장 회귀: 슬롯별 core max(작은 슬롯 필러 행 없음 — 하드닝 확인)

- [ ] **Step 3: Commit** (수정 발생 시) — `fix(v2): Stage5B 브라우저 검증 반영 — <내용>`

---

## 완료 기준 (Stage 5B DoD)

1. 전 스위트 그린(core 43+5 / backend 189 / fe 69+α), 루트 빌드 EXIT 0.
2. 브라우저 6항목 통과 (공량 합계 수기 검증 포함).
3. main 머지.

## 명시적 비목표 (Stage 5B)

- 설계서 인쇄/엑셀 내보내기 — 후속
- 부속자재(재료비) 산출 — 구 시스템의 자재 DB 연동은 Stage 6+에서 카탈로그 확장과 함께 재설계
- 전압 상속 자동화(IN 전압 → OUT 회로 자동 표기) — 표시는 IN 셀만, 상속 로직은 후속(구 거동 확인 후)
- 계통도 그래픽(다이어그램) — 테이블 뷰가 구 PowerView 거동 동등, 다이어그램은 후속
- 서버 report API — 기각 확정(클라이언트 계산)
