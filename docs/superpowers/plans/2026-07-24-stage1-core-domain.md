# Stage 1: 도메인 코어 + 신규 스키마 + 시드 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** capability 메타모델의 순수 도메인 코어(`packages/core`: 타입·검증·추적·시드 카탈로그)와 신규 Prisma 스키마를 만들고, 기존 31개 자산 타입이 데이터로 표현됨을 단위테스트로 증명한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-24-capability-metamodel-rebuild-design.md`의 1단계. 새 npm workspace `packages/core`(`@twin/core`)는 DB·HTTP 무관 순수 TS 패키지로, 이후 백엔드(services)와 프론트엔드가 동일 엔진을 import한다. 신규 Prisma 스키마는 `backend/prisma/next/`에 스테이징하고(구 스키마 무접촉), 별도 DB `digital_next`에 마이그레이션+시드하여 검증한다. Stage 2에서 본 스키마로 승격(컷오버)한다.

**Tech Stack:** TypeScript 5.6 (strict, ESM), vitest 4, Prisma 5.22 + PostgreSQL(docker-compose.dev), npm workspaces.

## Global Constraints

- 개발 DB는 `docker compose -f docker-compose.dev.yml up -d` 로만. **`docker compose build` 금지** (CLAUDE.md).
- 빌드 확인은 `npm run build` 로컬 타입체크만.
- `@twin/core`는 **runtime dependency 0** (순수 패키지 — Task 5의 가드레일 테스트가 강제).
- 구 스키마(`backend/prisma/schema.prisma`)와 구 시드는 **절대 수정하지 않는다** (Stage 1은 100% 추가만).
- 새 코드에 자산 role/타입 이름 문자열 분기(`if (typeKey === 'RACK')` 류) 금지 — 모든 거동은 spec 데이터에서 파생.
- node >= 20, `"type": "module"`.
- 커밋은 태스크마다. 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: `packages/core` 스캐폴드 + 카탈로그 타입 + 포트 인스턴스화

**Files:**
- Modify: `package.json` (루트 — workspaces에 `"packages/*"` 추가)
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/catalog/types.ts`
- Create: `packages/core/src/catalog/instantiatePorts.ts`
- Test: `packages/core/src/catalog/instantiatePorts.test.ts`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `AssetTypeSpec`, `ContainerSpec`, `PortTemplate`, `InternalLinkRule`, `PlacementSpec`, `LaborRules`, `FieldDef`, `Direction`, `PortRef`, `AssetRef`, `CableRef`, `instantiatePorts(spec, assetId, countOverrides?)` — 이후 모든 태스크가 이 타입을 사용.

- [ ] **Step 1: 워크스페이스 스캐폴드**

루트 `package.json`의 workspaces를 수정:

```json
  "workspaces": [
    "frontend",
    "backend",
    "packages/*"
  ],
```

`packages/core/package.json` 생성:

```json
{
  "name": "@twin/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^4.0.15"
  }
}
```

`packages/core/tsconfig.json` 생성:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src"]
}
```

Run: `npm install` (루트에서 — 워크스페이스 링크)
Expected: 에러 없이 완료, `node_modules/@twin/core` 심링크 생성.

- [ ] **Step 2: 카탈로그 타입 정의**

`packages/core/src/catalog/types.ts`:

```ts
/** 포트 방향. BI = 양방향(일반 통신 포트). */
export type Direction = 'IN' | 'OUT' | 'BI';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  unit?: string;
  options?: string[];
}

export interface PlacementSpec {
  placeable: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
}

export interface LaborRules {
  laborType: string | null;
  installHours: number;
  removeHours: number;
  relocateHours: number;
}

/** 빈 객체({}) = 모두 수용. 둘 다 있으면 OR. */
export interface AcceptRule {
  categoryKeys?: string[];
  typeKeys?: string[];
}

export interface ContainerSpec {
  key: string; // 타입 내 유일 (예: 'main')
  name: string; // 표시명 (예: '슬롯')
  slotCount: number | null; // null = 자유형(순서 리스트, 위치 검증 없음)
  allowSpan: boolean;
  accepts: AcceptRule;
}

export interface PortTemplate {
  group: string; // 타입 내 유일 (예: 'A', 'IN')
  count: number; // 기본 수량 — 인스턴스에서 오버라이드 가능(12C/24C 광슬롯)
  direction: Direction;
  medium: string; // CableGroup 이름과 대응하는 자유 문자열 ('광'|'전원'|...)
  namePattern: string; // '{n}' 치환 (예: '코어 {n}')
}

export interface InternalLinkRule {
  fromGroup: string;
  toGroup: string;
  mapping: 'byIndex' | 'all';
}

export interface AssetTypeSpec {
  key: string;
  name: string;
  categoryKey: string;
  sortOrder: number;
  placement: PlacementSpec;
  labor: LaborRules;
  fields: FieldDef[];
  containers: ContainerSpec[];
  ports: PortTemplate[];
  links: InternalLinkRule[];
}

/** ---- 인스턴스 참조 형상 (DB 행이 이 형상으로 매핑되어 순수 함수에 들어온다) ---- */

export interface AssetRef {
  id: string;
  typeKey: string;
  name: string;
  parentAssetId?: string | null;
  containerKey?: string | null;
  slotIndex?: number | null;
  slotSpan?: number | null;
}

export interface PortRef {
  id: string;
  assetId: string;
  group: string;
  index: number; // 1-based
  name: string;
  direction: Direction;
  medium: string;
}

export interface CableRef {
  id: string;
  aPortId: string;
  bPortId: string;
  categoryKey?: string | null;
}
```

`packages/core/src/index.ts`:

```ts
export * from './catalog/types.js';
export * from './catalog/instantiatePorts.js';
```

- [ ] **Step 3: 실패하는 테스트 작성**

`packages/core/src/catalog/instantiatePorts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AssetTypeSpec } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';

const slotType: AssetTypeSpec = {
  key: 'OFD-SLOT',
  name: '광슬롯',
  categoryKey: '통신',
  sortOrder: 1,
  placement: { placeable: false },
  labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
  fields: [],
  containers: [],
  ports: [
    { group: 'A', count: 4, direction: 'BI', medium: '광', namePattern: '성단 {n}' },
    { group: 'B', count: 4, direction: 'BI', medium: '광', namePattern: '선로 {n}' },
  ],
  links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

describe('instantiatePorts', () => {
  it('템플릿 수량만큼 1-based 인덱스와 이름 패턴으로 생성한다', () => {
    const ports = instantiatePorts(slotType, 'asset-1');
    expect(ports).toHaveLength(8);
    expect(ports[0]).toEqual({
      assetId: 'asset-1',
      group: 'A',
      index: 1,
      name: '성단 1',
      direction: 'BI',
      medium: '광',
    });
    expect(ports[7]!.name).toBe('선로 4');
  });

  it('그룹별 수량 오버라이드를 적용한다 (24C 슬롯)', () => {
    const ports = instantiatePorts(slotType, 'asset-1', { A: 24, B: 24 });
    expect(ports).toHaveLength(48);
    expect(ports[23]!.name).toBe('성단 24');
  });

  it('포트 템플릿이 없으면 빈 배열', () => {
    const bare = { ...slotType, ports: [], links: [] };
    expect(instantiatePorts(bare, 'x')).toEqual([]);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test -w @twin/core`
Expected: FAIL — `instantiatePorts.js` 모듈 없음.

- [ ] **Step 5: 구현**

`packages/core/src/catalog/instantiatePorts.ts`:

```ts
import type { AssetTypeSpec, PortRef } from './types.js';

/** 타입의 포트 템플릿에서 자산 인스턴스의 포트 목록을 생성한다. id는 저장 계층이 부여. */
export function instantiatePorts(
  spec: AssetTypeSpec,
  assetId: string,
  countOverrides: Record<string, number> = {},
): Omit<PortRef, 'id'>[] {
  return spec.ports.flatMap((tpl) => {
    const count = countOverrides[tpl.group] ?? tpl.count;
    return Array.from({ length: count }, (_, i) => ({
      assetId,
      group: tpl.group,
      index: i + 1,
      name: tpl.namePattern.replace('{n}', String(i + 1)),
      direction: tpl.direction,
      medium: tpl.medium,
    }));
  });
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -w @twin/core`
Expected: PASS (3 tests)

Run: `npm run typecheck -w @twin/core`
Expected: 에러 0

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/core
git commit -m "feat(core): @twin/core 워크스페이스 신설 — 카탈로그 타입 + 포트 인스턴스화"
```

---

### Task 2: 슬롯/수용 검증기

**Files:**
- Create: `packages/core/src/validation/slotPlacement.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/validation/slotPlacement.test.ts`

**Interfaces:**
- Consumes: `AssetTypeSpec`, `ContainerSpec` (Task 1)
- Produces: `validateSlotPlacement(args): SlotError | null`, `SlotOccupant`, `SlotError` — Stage 2 커밋 서비스가 사용. `null` = 유효.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/validation/slotPlacement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AssetTypeSpec } from '../catalog/types.js';
import { validateSlotPlacement } from './slotPlacement.js';

const rack: AssetTypeSpec = {
  key: 'RACK',
  name: '랙',
  categoryKey: '구조',
  sortOrder: 1,
  placement: { placeable: true, defaultWidth: 60, defaultHeight: 80 },
  labor: { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 2 },
  fields: [],
  containers: [
    { key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원'] } },
  ],
  ports: [],
  links: [],
};

const base = {
  parentType: rack,
  containerKey: 'main',
  child: { typeKey: 'PITR-5000', categoryKey: '통신' },
  slotIndex: 0,
  slotSpan: 1,
  occupants: [],
};

describe('validateSlotPlacement', () => {
  it('유효한 배치는 null', () => {
    expect(validateSlotPlacement(base)).toBeNull();
  });

  it('없는 컨테이너 key → container-not-found', () => {
    expect(validateSlotPlacement({ ...base, containerKey: 'nope' })).toBe('container-not-found');
  });

  it('수용 조건 불일치 → not-accepted', () => {
    expect(
      validateSlotPlacement({ ...base, child: { typeKey: 'HVAC', categoryKey: '공조' } }),
    ).toBe('not-accepted');
  });

  it('typeKeys 로도 수용된다 (OR)', () => {
    const ofdLike = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } }],
    };
    expect(
      validateSlotPlacement({
        ...base,
        parentType: ofdLike,
        child: { typeKey: 'OFD-SLOT', categoryKey: '통신' },
        slotIndex: null,
      }),
    ).toBeNull();
  });

  it('accepts 빈 객체 = 모두 수용', () => {
    const anyRack = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: {} }],
    };
    expect(
      validateSlotPlacement({ ...base, parentType: anyRack, child: { typeKey: 'X', categoryKey: 'Y' } }),
    ).toBeNull();
  });

  it('범위 밖 → out-of-range (slotIndex + span > slotCount)', () => {
    expect(validateSlotPlacement({ ...base, slotIndex: 11, slotSpan: 2 })).toBe('out-of-range');
    expect(validateSlotPlacement({ ...base, slotIndex: -1 })).toBe('out-of-range');
  });

  it('고정 슬롯 컨테이너에 slotIndex null → out-of-range', () => {
    expect(validateSlotPlacement({ ...base, slotIndex: null })).toBe('out-of-range');
  });

  it('span 금지 컨테이너에서 span>1 → span-not-allowed', () => {
    const noSpan = {
      ...rack,
      containers: [{ key: 'main', name: '슬롯', slotCount: 12, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: noSpan, slotSpan: 2 })).toBe('span-not-allowed');
  });

  it('기존 점유와 겹침 → overlap', () => {
    const occ = [{ assetId: 'other', slotIndex: 1, slotSpan: 2 }];
    expect(validateSlotPlacement({ ...base, slotIndex: 2, occupants: occ })).toBe('overlap');
    expect(validateSlotPlacement({ ...base, slotIndex: 3, occupants: occ })).toBeNull();
  });

  it('자유형 컨테이너(slotCount null)는 위치 검증 없이 수용만 본다', () => {
    const free = {
      ...rack,
      containers: [{ key: 'main', name: '목록', slotCount: null, allowSpan: false, accepts: {} }],
    };
    expect(validateSlotPlacement({ ...base, parentType: free, slotIndex: null })).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w @twin/core`
Expected: FAIL — `slotPlacement.js` 모듈 없음.

- [ ] **Step 3: 구현**

`packages/core/src/validation/slotPlacement.ts`:

```ts
import type { AssetTypeSpec } from '../catalog/types.js';

export interface SlotOccupant {
  assetId: string;
  slotIndex: number;
  slotSpan: number;
}

export type SlotError =
  | 'container-not-found'
  | 'not-accepted'
  | 'out-of-range'
  | 'span-not-allowed'
  | 'overlap';

/** 자산을 부모 컨테이너에 넣을 수 있는지 타입 명세로 판정한다. null = 유효. */
export function validateSlotPlacement(args: {
  parentType: AssetTypeSpec;
  containerKey: string;
  child: { typeKey: string; categoryKey: string };
  slotIndex: number | null;
  slotSpan: number;
  /** 같은 부모·같은 컨테이너의 기존 점유(검증 대상 자신은 제외하고 전달) */
  occupants: SlotOccupant[];
}): SlotError | null {
  const spec = args.parentType.containers.find((c) => c.key === args.containerKey);
  if (!spec) return 'container-not-found';

  const { categoryKeys, typeKeys } = spec.accepts;
  const hasRule = !!categoryKeys || !!typeKeys;
  const accepted =
    (categoryKeys?.includes(args.child.categoryKey) ?? false) ||
    (typeKeys?.includes(args.child.typeKey) ?? false);
  if (hasRule && !accepted) return 'not-accepted';

  if (spec.slotCount === null) return null; // 자유형

  if (args.slotIndex === null) return 'out-of-range';
  if (args.slotSpan > 1 && !spec.allowSpan) return 'span-not-allowed';
  if (args.slotIndex < 0 || args.slotIndex + args.slotSpan > spec.slotCount) return 'out-of-range';

  const overlaps = args.occupants.some(
    (o) => args.slotIndex! < o.slotIndex + o.slotSpan && o.slotIndex < args.slotIndex! + args.slotSpan,
  );
  if (overlaps) return 'overlap';

  return null;
}
```

`packages/core/src/index.ts`에 추가:

```ts
export * from './validation/slotPlacement.js';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -w @twin/core`
Expected: PASS (전체)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 슬롯/수용 범용 검증기 — 타입 명세 기반, role 분기 0"
```

---

### Task 3: 포트 연결 검증기

**Files:**
- Create: `packages/core/src/validation/connection.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/validation/connection.test.ts`

**Interfaces:**
- Consumes: `PortRef` (Task 1)
- Produces: `validateConnection(a, b, occupiedPortIds): ConnectError | null`, `ConnectError` — Stage 2 커밋 서비스·Stage 4 케이블 UX가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/validation/connection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PortRef } from '../catalog/types.js';
import { validateConnection } from './connection.js';

const port = (id: string, medium = '광'): PortRef => ({
  id,
  assetId: `asset-${id}`,
  group: 'A',
  index: 1,
  name: id,
  direction: 'BI',
  medium,
});

describe('validateConnection', () => {
  it('유효한 연결은 null', () => {
    expect(validateConnection(port('p1'), port('p2'), new Set())).toBeNull();
  });

  it('같은 포트끼리 → same-port', () => {
    expect(validateConnection(port('p1'), port('p1'), new Set())).toBe('same-port');
  });

  it('이미 점유된 포트 → port-occupied', () => {
    expect(validateConnection(port('p1'), port('p2'), new Set(['p2']))).toBe('port-occupied');
  });

  it('매체 불일치 → medium-mismatch', () => {
    expect(validateConnection(port('p1', '광'), port('p2', '전원'), new Set())).toBe('medium-mismatch');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w @twin/core`
Expected: FAIL — `connection.js` 모듈 없음.

- [ ] **Step 3: 구현**

`packages/core/src/validation/connection.ts`:

```ts
import type { PortRef } from '../catalog/types.js';

export type ConnectError = 'same-port' | 'port-occupied' | 'medium-mismatch';

/** 케이블을 두 포트에 물릴 수 있는지 판정. occupiedPortIds = 기존 케이블이 점유 중인 포트 id 집합. */
export function validateConnection(
  a: PortRef,
  b: PortRef,
  occupiedPortIds: ReadonlySet<string>,
): ConnectError | null {
  if (a.id === b.id) return 'same-port';
  if (occupiedPortIds.has(a.id) || occupiedPortIds.has(b.id)) return 'port-occupied';
  if (a.medium !== b.medium) return 'medium-mismatch';
  return null;
}
```

`packages/core/src/index.ts`에 추가:

```ts
export * from './validation/connection.js';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -w @twin/core`
Expected: PASS (전체)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 포트 연결 범용 검증기 (점유·매체 일치)"
```

---

### Task 4: 추적 그래프 엔진

**Files:**
- Create: `packages/core/src/trace/graph.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/trace/graph.test.ts`

**Interfaces:**
- Consumes: `AssetTypeSpec`, `AssetRef`, `PortRef`, `CableRef`, `instantiatePorts` (Task 1)
- Produces:
  - `buildTraceGraph({ types, assets, ports, cables }): TraceGraph`
  - `traceFrom(graph, startPortId): TraceHop[]` — `TraceHop = { kind: 'cable'|'internal'; cableId?: string; fromPortId: string; toPortId: string }`
  - Stage 4(케이블/추적)·Stage 5(선번장·계통)가 백/프론트 양쪽에서 이 엔진 하나를 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/trace/graph.test.ts` — 구 시스템의 3가지 role 거동(광슬롯 byIndex 채널 보존, 피더 IN/OUT 패스스루, 일반 설비 종단)을 데이터만으로 재현:

```ts
import { describe, expect, it } from 'vitest';
import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { instantiatePorts } from '../catalog/instantiatePorts.js';
import { buildTraceGraph, traceFrom } from './graph.js';

const device: AssetTypeSpec = {
  key: 'DEV',
  name: '장비',
  categoryKey: '통신',
  sortOrder: 1,
  placement: { placeable: true },
  labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
  fields: [],
  containers: [],
  ports: [{ group: 'P', count: 2, direction: 'BI', medium: '광', namePattern: '포트 {n}' }],
  links: [], // 내부 통과 없음 → 추적 종단
};

const slot: AssetTypeSpec = {
  ...device,
  key: 'OFD-SLOT',
  name: '광슬롯',
  ports: [
    { group: 'A', count: 4, direction: 'BI', medium: '광', namePattern: '성단 {n}' },
    { group: 'B', count: 4, direction: 'BI', medium: '광', namePattern: '선로 {n}' },
  ],
  links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

const feeder: AssetTypeSpec = {
  ...device,
  key: 'FEEDER',
  name: '피더',
  ports: [
    { group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' },
    { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' },
  ],
  links: [{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }],
};

const types = { DEV: device, 'OFD-SLOT': slot, FEEDER: feeder };

/** 헬퍼: 자산 + 포트 인스턴스 생성 (포트 id = `${assetId}:${group}${index}`) */
function makeAsset(typeKey: keyof typeof types, id: string): { asset: AssetRef; ports: PortRef[] } {
  const asset: AssetRef = { id, typeKey, name: id };
  const ports = instantiatePorts(types[typeKey], id).map((p) => ({
    ...p,
    id: `${id}:${p.group}${p.index}`,
  }));
  return { asset, ports };
}

describe('buildTraceGraph + traceFrom', () => {
  it('광슬롯 byIndex: 장비→슬롯 성단3→선로3→대국 장비까지 채널 보존 추적', () => {
    const a = makeAsset('DEV', 'devA');
    const s = makeAsset('OFD-SLOT', 'slot1');
    const b = makeAsset('DEV', 'devB');
    const cables: CableRef[] = [
      { id: 'c1', aPortId: 'devA:P1', bPortId: 'slot1:A3' },
      { id: 'c2', aPortId: 'slot1:B3', bPortId: 'devB:P1' },
    ];
    const graph = buildTraceGraph({
      types,
      assets: [a.asset, s.asset, b.asset],
      ports: [...a.ports, ...s.ports, ...b.ports],
      cables,
    });
    const hops = traceFrom(graph, 'devA:P1');
    expect(hops).toEqual([
      { kind: 'cable', cableId: 'c1', fromPortId: 'devA:P1', toPortId: 'slot1:A3' },
      { kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B3' },
      { kind: 'cable', cableId: 'c2', fromPortId: 'slot1:B3', toPortId: 'devB:P1' },
    ]);
  });

  it('byIndex는 다른 채널로 새지 않는다 (A3 → B4 없음)', () => {
    const s = makeAsset('OFD-SLOT', 'slot1');
    const graph = buildTraceGraph({ types, assets: [s.asset], ports: s.ports, cables: [] });
    const hops = traceFrom(graph, 'slot1:A3');
    expect(hops).toEqual([{ kind: 'internal', fromPortId: 'slot1:A3', toPortId: 'slot1:B3' }]);
  });

  it('피더 all 매핑: IN→OUT 패스스루 후 하류 케이블 추적', () => {
    const f = makeAsset('FEEDER', 'fdr1');
    const d = makeAsset('DEV', 'load1');
    const powerDev = { ...d, ports: d.ports.map((p) => ({ ...p, medium: '전원' })) };
    const cables: CableRef[] = [{ id: 'c1', aPortId: 'fdr1:OUT1', bPortId: 'load1:P1' }];
    const graph = buildTraceGraph({
      types,
      assets: [f.asset, d.asset],
      ports: [...f.ports, ...powerDev.ports],
      cables,
    });
    const hops = traceFrom(graph, 'fdr1:IN1');
    expect(hops).toEqual([
      { kind: 'internal', fromPortId: 'fdr1:IN1', toPortId: 'fdr1:OUT1' },
      { kind: 'cable', cableId: 'c1', fromPortId: 'fdr1:OUT1', toPortId: 'load1:P1' },
    ]);
  });

  it('links 없는 장비는 종단 — 다른 포트로 새지 않는다', () => {
    const a = makeAsset('DEV', 'devA');
    const b = makeAsset('DEV', 'devB');
    const c = makeAsset('DEV', 'devC');
    const cables: CableRef[] = [
      { id: 'c1', aPortId: 'devA:P1', bPortId: 'devB:P1' },
      { id: 'c2', aPortId: 'devB:P2', bPortId: 'devC:P1' }, // devB의 다른 포트
    ];
    const graph = buildTraceGraph({
      types,
      assets: [a.asset, b.asset, c.asset],
      ports: [...a.ports, ...b.ports, ...c.ports],
      cables,
    });
    const hops = traceFrom(graph, 'devA:P1');
    expect(hops).toEqual([{ kind: 'cable', cableId: 'c1', fromPortId: 'devA:P1', toPortId: 'devB:P1' }]);
  });

  it('역방향 추적도 동일 그래프로 동작한다 (B측에서 시작)', () => {
    const a = makeAsset('DEV', 'devA');
    const s = makeAsset('OFD-SLOT', 'slot1');
    const cables: CableRef[] = [{ id: 'c1', aPortId: 'devA:P1', bPortId: 'slot1:A2' }];
    const graph = buildTraceGraph({ types, assets: [a.asset, s.asset], ports: [...a.ports, ...s.ports], cables });
    const hops = traceFrom(graph, 'slot1:B2');
    expect(hops).toEqual([
      { kind: 'internal', fromPortId: 'slot1:B2', toPortId: 'slot1:A2' },
      { kind: 'cable', cableId: 'c1', fromPortId: 'slot1:A2', toPortId: 'devA:P1' },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w @twin/core`
Expected: FAIL — `graph.js` 모듈 없음.

- [ ] **Step 3: 구현**

`packages/core/src/trace/graph.ts`:

```ts
import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';

export interface TraceEdge {
  kind: 'cable' | 'internal';
  cableId?: string;
  toPortId: string;
}

export interface TraceGraph {
  edges: ReadonlyMap<string, readonly TraceEdge[]>;
  ports: ReadonlyMap<string, PortRef>;
}

export interface TraceHop {
  kind: 'cable' | 'internal';
  cableId?: string;
  fromPortId: string;
  toPortId: string;
}

/** 포트 노드 + 케이블 엣지 + 타입 InternalLinkRule 에서 파생한 내부 엣지로 그래프를 만든다. */
export function buildTraceGraph(args: {
  types: Record<string, AssetTypeSpec>;
  assets: AssetRef[];
  ports: PortRef[];
  cables: CableRef[];
}): TraceGraph {
  const edges = new Map<string, TraceEdge[]>();
  const push = (from: string, edge: TraceEdge) => {
    const list = edges.get(from);
    if (list) list.push(edge);
    else edges.set(from, [edge]);
  };

  for (const c of args.cables) {
    push(c.aPortId, { kind: 'cable', cableId: c.id, toPortId: c.bPortId });
    push(c.bPortId, { kind: 'cable', cableId: c.id, toPortId: c.aPortId });
  }

  const portsByAsset = new Map<string, PortRef[]>();
  for (const p of args.ports) {
    const list = portsByAsset.get(p.assetId);
    if (list) list.push(p);
    else portsByAsset.set(p.assetId, [p]);
  }

  for (const asset of args.assets) {
    const spec = args.types[asset.typeKey];
    if (!spec || spec.links.length === 0) continue;
    const mine = portsByAsset.get(asset.id) ?? [];
    const byGroup = new Map<string, PortRef[]>();
    for (const p of mine) {
      const list = byGroup.get(p.group);
      if (list) list.push(p);
      else byGroup.set(p.group, [p]);
    }
    for (const rule of spec.links) {
      const from = byGroup.get(rule.fromGroup) ?? [];
      const to = byGroup.get(rule.toGroup) ?? [];
      if (rule.mapping === 'byIndex') {
        const toByIndex = new Map(to.map((p) => [p.index, p]));
        for (const f of from) {
          const t = toByIndex.get(f.index);
          if (!t) continue;
          push(f.id, { kind: 'internal', toPortId: t.id });
          push(t.id, { kind: 'internal', toPortId: f.id });
        }
      } else {
        for (const f of from) {
          for (const t of to) {
            push(f.id, { kind: 'internal', toPortId: t.id });
            push(t.id, { kind: 'internal', toPortId: f.id });
          }
        }
      }
    }
  }

  return { edges, ports: new Map(args.ports.map((p) => [p.id, p])) };
}

/** 시작 포트에서 도달 가능한 모든 hop을 방문 순서(BFS)로 반환한다. */
export function traceFrom(graph: TraceGraph, startPortId: string): TraceHop[] {
  const hops: TraceHop[] = [];
  const visited = new Set<string>([startPortId]);
  const queue = [startPortId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of graph.edges.get(cur) ?? []) {
      if (visited.has(e.toPortId)) continue;
      visited.add(e.toPortId);
      const hop: TraceHop = { kind: e.kind, fromPortId: cur, toPortId: e.toPortId };
      if (e.cableId !== undefined) hop.cableId = e.cableId;
      hops.push(hop);
      queue.push(e.toPortId);
    }
  }
  return hops;
}
```

`packages/core/src/index.ts`에 추가:

```ts
export * from './trace/graph.js';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -w @twin/core`
Expected: PASS (전체). 특히 첫 테스트의 hops 순서가 기대와 정확히 일치해야 함.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 범용 추적 그래프 엔진 — 케이블 엣지 + 데이터 파생 내부 엣지, role 분기 0"
```

---

### Task 5: 시드 카탈로그 데이터 + 표현력 증명 + 순수성 가드레일

**Files:**
- Create: `packages/core/src/seed/catalog.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/seed/catalog.test.ts`
- Test: `packages/core/src/purity.guardrail.test.ts`

**Interfaces:**
- Consumes: `AssetTypeSpec` (Task 1)
- Produces: `SEED_CATEGORIES: { key: string; name: string; sortOrder: number }[]`, `SEED_ASSET_TYPES: AssetTypeSpec[]`, `SEED_CABLE_GROUPS: { key, name, color, laborType, installHoursPerM, removeHoursPerM, sortOrder }[]` — Task 6 DB 시드가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/seed/catalog.test.ts` — 시드가 "기존 7 role이 데이터로 표현됨"을 증명하는 불변식:

```ts
import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from './catalog.js';

const byKey = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)!;

describe('시드 카탈로그 — 구 role 7종의 데이터 표현 증명', () => {
  it('key 유일성 + 모든 타입의 categoryKey가 시드 분류에 존재', () => {
    const keys = SEED_ASSET_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const cats = new Set(SEED_CATEGORIES.map((c) => c.key));
    for (const t of SEED_ASSET_TYPES) expect(cats.has(t.categoryKey)).toBe(true);
  });

  it('RACK: 배치 가능 + 12슬롯 span 허용 컨테이너 (구 rack role)', () => {
    const rack = byKey('RACK');
    expect(rack.placement.placeable).toBe(true);
    expect(rack.containers[0]).toMatchObject({ slotCount: 12, allowSpan: true });
  });

  it('OFD: 광슬롯만 수용하는 자유형 컨테이너 (구 ofd role)', () => {
    const ofd = byKey('OFD');
    expect(ofd.containers[0]).toMatchObject({ slotCount: null, accepts: { typeKeys: ['OFD-SLOT'] } });
  });

  it('OFD-SLOT: A/B 광 포트 + byIndex 패스스루 (구 slot role의 채널 보존)', () => {
    const slot = byKey('OFD-SLOT');
    expect(slot.ports.map((p) => p.group)).toEqual(['A', 'B']);
    expect(slot.ports.every((p) => p.medium === '광')).toBe(true);
    expect(slot.links).toEqual([{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }]);
  });

  it('DIST(분전반): 피더만 수용 (구 panel role)', () => {
    expect(byKey('DIST').containers[0]!.accepts).toEqual({ typeKeys: ['FEEDER'] });
  });

  it('FEEDER: 전원 IN 1 + OUT 1 + all 패스스루 (구 feeder role의 방향성)', () => {
    const feeder = byKey('FEEDER');
    expect(feeder.ports).toEqual([
      { group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' },
    ]);
    expect(feeder.links).toEqual([{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }]);
  });

  it('구 seed의 타입 전수가 이관되었다 (31종 이상)', () => {
    expect(SEED_ASSET_TYPES.length).toBeGreaterThanOrEqual(31);
  });

  it('케이블 그룹 5종 이관 (전원/네트워크/광/제어/접지)', () => {
    expect(SEED_CABLE_GROUPS.length).toBeGreaterThanOrEqual(5);
    const names = SEED_CABLE_GROUPS.map((g) => g.name);
    for (const n of ['전원', '네트워크', '광']) expect(names).toContain(n);
  });
});
```

`packages/core/src/purity.guardrail.test.ts` — 코어 순수성 강제:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('코어 순수성 가드레일', () => {
  it('runtime dependency 0', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('src 에서 node 내장/외부 모듈 import 금지 (테스트 파일 제외)', () => {
    const srcDir = new URL('.', import.meta.url).pathname;
    const files = walk(srcDir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/from ['"](node:|@prisma|express|axios)/);
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w @twin/core`
Expected: FAIL — `catalog.js` 모듈 없음. (가드레일 테스트는 PASS해도 무방)

- [ ] **Step 3: 시드 데이터 작성**

`packages/core/src/seed/catalog.ts` — 아래 골격을 그대로 쓰되, `...구_seed_이관` 부분은 **`backend/prisma/seed/assetTypes.ts`의 전체 엔트리(31종)를 다음 번역 규칙으로 기계적으로 이관**한다 (이름·분류·labor 수치를 그대로 복사):

번역 규칙 (구 role → 새 spec):
- `role: 'rack'` → `placement.placeable: true`, `containers: [{ key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원', '공조'] } }]`
- `role: 'ofd'` → `placeable: true`, `containers: [{ key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } }]`
- `role: 'slot'` → `placeable: false`, `ports: [{ group: 'A', count: 12, direction: 'BI', medium: '광', namePattern: '성단 {n}' }, { group: 'B', count: 12, direction: 'BI', medium: '광', namePattern: '선로 {n}' }]`, `links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }]`
- `role: 'panel'` → `placeable: true`, `containers: [{ key: 'main', name: '회로', slotCount: null, allowSpan: false, accepts: { typeKeys: ['FEEDER'] } }]`
- `role: 'feeder'` → `placeable: false`, `ports: [{ group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' }, { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' }]`, `links: [{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }]`
- `role: 'standalone'` → `placeable: true`, containers/ports/links 없음
- `role: 'device'` → `placeable: false`, `ports: [{ group: 'P', count: 2, direction: 'BI', medium: '네트워크', namePattern: '포트 {n}' }]` (구 모델에 포트 정의가 없으므로 기본 2포트 — 운영에서 타입 편집으로 조정)

파일 골격:

```ts
import type { AssetTypeSpec } from '../catalog/types.js';

export const SEED_CATEGORIES = [
  { key: '구조', name: '구조', sortOrder: 1 },
  { key: '통신', name: '통신', sortOrder: 2 },
  { key: '전원', name: '전원', sortOrder: 3 },
  { key: '공조', name: '공조', sortOrder: 4 },
] as const;

const NO_LABOR = { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 };

export const SEED_ASSET_TYPES: AssetTypeSpec[] = [
  {
    key: 'RACK',
    name: '랙',
    categoryKey: '구조',
    sortOrder: 10,
    placement: { placeable: true, defaultWidth: 60, defaultHeight: 80 },
    labor: { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 2 },
    fields: [],
    containers: [
      { key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원', '공조'] } },
    ],
    ports: [],
    links: [],
  },
  {
    key: 'OFD',
    name: 'OFD(광분배함)',
    categoryKey: '통신',
    sortOrder: 20,
    placement: { placeable: true, defaultWidth: 40, defaultHeight: 40 },
    labor: { laborType: '통신내선공', installHours: 1, removeHours: 0.5, relocateHours: 1 },
    fields: [],
    containers: [
      { key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } },
    ],
    ports: [],
    links: [],
  },
  {
    key: 'OFD-SLOT',
    name: '광슬롯',
    categoryKey: '통신',
    sortOrder: 21,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [],
    containers: [],
    ports: [
      { group: 'A', count: 12, direction: 'BI', medium: '광', namePattern: '성단 {n}' },
      { group: 'B', count: 12, direction: 'BI', medium: '광', namePattern: '선로 {n}' },
    ],
    links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
  },
  {
    key: 'DIST',
    name: '분전반',
    categoryKey: '전원',
    sortOrder: 30,
    placement: { placeable: true, defaultWidth: 40, defaultHeight: 60 },
    labor: { laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 2 },
    fields: [],
    containers: [
      { key: 'main', name: '회로', slotCount: null, allowSpan: false, accepts: { typeKeys: ['FEEDER'] } },
    ],
    ports: [],
    links: [],
  },
  {
    key: 'FEEDER',
    name: '피더',
    categoryKey: '전원',
    sortOrder: 33,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [
      { key: 'breakerNo', label: '차단기 번호', type: 'text' },
      { key: 'switchState', label: '개폐 상태', type: 'select', options: ['ON', 'OFF'] },
    ],
    containers: [],
    ports: [
      { group: 'IN', count: 1, direction: 'IN', medium: '전원', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: '전원', namePattern: 'OUT' },
    ],
    links: [{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }],
  },
  // ...구_seed_이관: backend/prisma/seed/assetTypes.ts 의 나머지 전 엔트리
  //    (GROUNDING, HVAC, RTU, SCADA, UPS, 네트워크스위치, SPD, UTM, NAC,
  //     PITR-2000, PITR-5000, ...)를 위 번역 규칙으로 추가.
  //    labor 수치는 구 seed의 laborType/installHours/removeHours/relocateHours 를 그대로 복사.
];

export const SEED_CABLE_GROUPS = [
  { key: 'power', name: '전원', color: '#ef4444', laborType: '통신내선공', installHoursPerM: 0.03, removeHoursPerM: 0.015, sortOrder: 1 },
  { key: 'network', name: '네트워크', color: '#3b82f6', laborType: '통신내선공', installHoursPerM: 0.02, removeHoursPerM: 0.01, sortOrder: 2 },
  { key: 'fiber', name: '광', color: '#22c55e', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02, sortOrder: 3 },
  // ...구 backend/prisma/seed/cableCategories.ts 의 나머지 그룹(제어·접지)도 동일 이관
] as const;
```

`packages/core/src/index.ts`에 추가:

```ts
export * from './seed/catalog.js';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -w @twin/core`
Expected: PASS (전체 — 31종 이관 완료 시 개수 테스트 포함)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): 시드 카탈로그 — 구 31타입의 capability 데이터 표현 + 순수성 가드레일"
```

---

### Task 6: 신규 Prisma 스키마 + 마이그레이션 + DB 시드

**Files:**
- Create: `backend/prisma/next/schema.prisma`
- Create: `backend/prisma/next/seed.ts`
- Modify: `backend/.env` (`DATABASE_URL_NEXT` 추가 — 커밋 금지 대상이면 `.env.example`에도 기록)
- Modify: `backend/package.json` (scripts 2개 추가)

**Interfaces:**
- Consumes: `SEED_CATEGORIES`, `SEED_ASSET_TYPES`, `SEED_CABLE_GROUPS` (Task 5)
- Produces: DB `digital_next`의 신규 스키마 + 생성 클라이언트 `backend/src/generated/next-client` — Stage 2 백엔드 컷오버가 이 클라이언트로 전환.

- [ ] **Step 1: 신규 스키마 작성**

`backend/prisma/next/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../src/generated/next-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL_NEXT")
}

// ---------- 조직/공간 (구 모델 유지) ----------

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  role         String   @default("viewer") // 'admin' | 'viewer'
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Headquarters {
  id        String   @id @default(uuid())
  name      String   @unique
  sortOrder Int      @default(0)
  branches  Branch[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Branch {
  id             String       @id @default(uuid())
  name           String
  sortOrder      Int          @default(0)
  headquartersId String
  headquarters   Headquarters @relation(fields: [headquartersId], references: [id])
  substations    Substation[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([headquartersId, name])
}

model Substation {
  id        String   @id @default(uuid())
  name      String   @unique
  sortOrder Int      @default(0)
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id])
  floors    Floor[]
  assets    Asset[]
  cables    Cable[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Floor {
  id                String     @id @default(uuid())
  name              String
  sortOrder         Int        @default(0)
  substationId      String
  substation        Substation @relation(fields: [substationId], references: [id])
  backgroundDrawing Json?
  backgroundOpacity Float      @default(0.5)
  assets            Asset[]
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  @@unique([substationId, name])
}

// ---------- 카탈로그 (타입 정의 = 데이터) ----------

model AssetCategory {
  id        String      @id @default(uuid())
  key       String      @unique
  name      String
  sortOrder Int         @default(0)
  types     AssetType[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model AssetType {
  id             String              @id @default(uuid())
  key            String              @unique
  name           String
  categoryId     String
  category       AssetCategory       @relation(fields: [categoryId], references: [id])
  sortOrder      Int                 @default(0)
  isActive       Boolean             @default(true)
  // 배치 명세
  placeable      Boolean             @default(false)
  defaultWidth   Float?
  defaultHeight  Float?
  // 공량 규칙
  laborType      String?
  installHours   Float               @default(0)
  removeHours    Float               @default(0)
  relocateHours  Float               @default(0)
  // 커스텀 필드 정의 (FieldDef[])
  fieldDefs      Json                @default("[]")
  containerSpecs AssetContainerSpec[]
  portTemplates  AssetPortTemplate[]
  linkRules      AssetLinkRule[]
  assets         Asset[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
}

model AssetContainerSpec {
  id          String    @id @default(uuid())
  typeId      String
  type        AssetType @relation(fields: [typeId], references: [id], onDelete: Cascade)
  key         String
  name        String
  slotCount   Int? // null = 자유형
  allowSpan   Boolean   @default(false)
  // AcceptRule (categoryKeys/typeKeys)
  accepts     Json      @default("{}")
  sortOrder   Int       @default(0)

  @@unique([typeId, key])
}

model AssetPortTemplate {
  id          String    @id @default(uuid())
  typeId      String
  type        AssetType @relation(fields: [typeId], references: [id], onDelete: Cascade)
  group       String
  count       Int
  direction   String // 'IN' | 'OUT' | 'BI'
  medium      String
  namePattern String
  sortOrder   Int       @default(0)

  @@unique([typeId, group])
}

model AssetLinkRule {
  id        String    @id @default(uuid())
  typeId    String
  type      AssetType @relation(fields: [typeId], references: [id], onDelete: Cascade)
  fromGroup String
  toGroup   String
  mapping   String // 'byIndex' | 'all'

  @@unique([typeId, fromGroup, toGroup])
}

// ---------- 케이블 카탈로그 ----------

model CableGroup {
  id                String          @id @default(uuid())
  key               String          @unique
  name              String
  color             String
  laborType         String?
  installHoursPerM  Float           @default(0)
  removeHoursPerM   Float           @default(0)
  sortOrder         Int             @default(0)
  categories        CableCategory[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model CableCategory {
  id        String     @id @default(uuid())
  name      String
  groupId   String
  group     CableGroup @relation(fields: [groupId], references: [id])
  sortOrder Int        @default(0)
  cables    Cable[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@unique([groupId, name])
}

// ---------- 인스턴스 ----------

model Asset {
  id            String      @id @default(uuid())
  name          String
  typeId        String
  type          AssetType   @relation(fields: [typeId], references: [id])
  substationId  String
  substation    Substation  @relation(fields: [substationId], references: [id])
  status        String      @default("normal")
  // 위치 A: 평면도 배치
  floorId       String?
  floor         Floor?      @relation(fields: [floorId], references: [id])
  x             Float?
  y             Float?
  width         Float?
  height        Float?
  // 위치 B: 컨테이너 수용
  parentAssetId String?
  parentAsset   Asset?      @relation("AssetChildren", fields: [parentAssetId], references: [id])
  children      Asset[]     @relation("AssetChildren")
  containerKey  String?
  slotIndex     Int?
  slotSpan      Int?
  // 커스텀 필드 값 { [fieldKey]: value }
  fieldValues   Json        @default("{}")
  ports         Port[]
  logs          MaintenanceLog[]
  inspections   InspectionLog[]
  photos        AssetPhoto[]
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([substationId])
  @@index([parentAssetId])
  @@index([floorId])
}

model Port {
  id          String  @id @default(uuid())
  assetId     String
  asset       Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)
  group       String
  index       Int
  name        String
  direction   String // 'IN' | 'OUT' | 'BI'
  medium      String
  cablesA     Cable[] @relation("CableA")
  cablesB     Cable[] @relation("CableB")

  @@unique([assetId, group, index])
  @@index([assetId])
}

model Cable {
  id           String         @id @default(uuid())
  name         String?
  substationId String
  substation   Substation     @relation(fields: [substationId], references: [id])
  aPortId      String
  aPort        Port           @relation("CableA", fields: [aPortId], references: [id])
  bPortId      String
  bPort        Port           @relation("CableB", fields: [bPortId], references: [id])
  categoryId   String?
  category     CableCategory? @relation(fields: [categoryId], references: [id])
  pathPoints   Json           @default("[]")
  specParams   Json           @default("{}")
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  @@index([substationId])
  @@index([aPortId])
  @@index([bPortId])
}

// ---------- 이력 (타입 무관 제네릭 — 구 모델 유지) ----------

model MaintenanceLog {
  id         String   @id @default(uuid())
  assetId    String
  asset      Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  occurredAt DateTime
  content    String
  action     String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model InspectionLog {
  id          String   @id @default(uuid())
  assetId     String
  asset       Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  inspectedAt DateTime
  content     String
  result      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AssetPhoto {
  id        String   @id @default(uuid())
  assetId   String
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  filePath  String
  caption   String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: env + scripts 추가**

`backend/.env`의 기존 `DATABASE_URL`을 읽고, DB 이름만 `digital_next`로 바꾼 `DATABASE_URL_NEXT`를 같은 파일에 추가한다 (예: `postgresql://user:pass@localhost:5432/digital_next`). `.env.example`이 있으면 거기에도 추가.

`backend/package.json` scripts에 추가:

```json
    "db:next:migrate": "prisma migrate dev --schema prisma/next/schema.prisma",
    "db:next:seed": "tsx prisma/next/seed.ts",
```

- [ ] **Step 3: 마이그레이션 실행**

Run:

```bash
docker compose -f docker-compose.dev.yml up -d
npx prisma validate --schema backend/prisma/next/schema.prisma
npm run db:next:migrate -w backend -- --name init
```

Expected: `digital_next` DB 자동 생성, 마이그레이션 `init` 적용, 클라이언트가 `backend/src/generated/next-client`에 생성됨.

- [ ] **Step 4: 시드 스크립트 작성**

`backend/prisma/next/seed.ts` — `@twin/core` 시드 데이터를 upsert (참조데이터 멱등 원칙 — 매 실행 안전):

```ts
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from '@twin/core';
import { PrismaClient } from '../../src/generated/next-client/index.js';

const prisma = new PrismaClient();

async function main() {
  for (const c of SEED_CATEGORIES) {
    await prisma.assetCategory.upsert({
      where: { key: c.key },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: { key: c.key, name: c.name, sortOrder: c.sortOrder },
    });
  }

  for (const t of SEED_ASSET_TYPES) {
    const category = await prisma.assetCategory.findUniqueOrThrow({ where: { key: t.categoryKey } });
    const base = {
      name: t.name,
      categoryId: category.id,
      sortOrder: t.sortOrder,
      placeable: t.placement.placeable,
      defaultWidth: t.placement.defaultWidth ?? null,
      defaultHeight: t.placement.defaultHeight ?? null,
      laborType: t.labor.laborType,
      installHours: t.labor.installHours,
      removeHours: t.labor.removeHours,
      relocateHours: t.labor.relocateHours,
      fieldDefs: t.fields,
    };
    const type = await prisma.assetType.upsert({
      where: { key: t.key },
      update: base,
      create: { key: t.key, ...base },
    });
    // 명세는 delete-and-recreate (타입 편집 전 단계라 참조 없음 — 멱등)
    await prisma.assetContainerSpec.deleteMany({ where: { typeId: type.id } });
    await prisma.assetPortTemplate.deleteMany({ where: { typeId: type.id } });
    await prisma.assetLinkRule.deleteMany({ where: { typeId: type.id } });
    for (const [i, c] of t.containers.entries()) {
      await prisma.assetContainerSpec.create({
        data: { typeId: type.id, key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts, sortOrder: i },
      });
    }
    for (const [i, p] of t.ports.entries()) {
      await prisma.assetPortTemplate.create({
        data: { typeId: type.id, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, sortOrder: i },
      });
    }
    for (const l of t.links) {
      await prisma.assetLinkRule.create({
        data: { typeId: type.id, fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping },
      });
    }
  }

  for (const g of SEED_CABLE_GROUPS) {
    await prisma.cableGroup.upsert({
      where: { key: g.key },
      update: { name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
      create: { key: g.key, name: g.name, color: g.color, laborType: g.laborType, installHoursPerM: g.installHoursPerM, removeHoursPerM: g.removeHoursPerM, sortOrder: g.sortOrder },
    });
  }

  const counts = {
    categories: await prisma.assetCategory.count(),
    types: await prisma.assetType.count(),
    containerSpecs: await prisma.assetContainerSpec.count(),
    portTemplates: await prisma.assetPortTemplate.count(),
    linkRules: await prisma.assetLinkRule.count(),
    cableGroups: await prisma.cableGroup.count(),
  };
  console.log('[seed:next]', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 5: 시드 실행 + 검증**

Run: `npm run db:next:seed -w backend` (두 번 실행 — 멱등성 확인)
Expected: 두 번 모두 성공, 출력 예 — `[seed:next] {"categories":4,"types":31,...}` 수치가 두 실행에서 동일.

Run: `npm run build` (루트 — 기존 프론트/백엔드가 깨지지 않았는지 타입체크)
Expected: 성공 (Stage 1은 100% 추가만이므로 기존 빌드 영향 0).

주의: `backend/src/generated/next-client`가 backend `tsc` 빌드에 포함되어 에러가 나면 `backend/tsconfig.json`의 `exclude`에 `"src/generated"`를 추가한다.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/next backend/package.json backend/tsconfig.json
git commit -m "feat(backend): 신규 capability 스키마 스테이징(prisma/next) + digital_next 마이그레이션/시드"
```

(생성된 `backend/src/generated/`는 `.gitignore` 대상인지 확인 — 구 클라이언트 관례를 따른다. `backend/.env`는 커밋하지 않는다.)

---

## 완료 기준 (Stage 1 Definition of Done)

1. `npm test -w @twin/core` 전체 PASS — 검증기·추적·시드 표현력·순수성 가드레일 포함.
2. `npm run db:next:migrate` + `db:next:seed` 성공, 시드 2회 실행 멱등.
3. `npm run build` 성공 — 기존 시스템 무영향.
4. main 머지 (스펙의 "단계마다 머지" 원칙).

Stage 2(워킹카피/커밋 배선 + 현황 뷰) 계획은 이 단계 머지 후 별도 작성한다.
