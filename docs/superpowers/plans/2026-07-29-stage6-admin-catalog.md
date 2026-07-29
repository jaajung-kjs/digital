# Stage 6: 관리자 타입정의 UI (Admin Catalog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 UI에서 자산 타입을 100% 정의(기본정보·배치·공량·커스텀필드·컨테이너·포트·내부링크)하고 케이블 카탈로그(그룹 공량·종류)를 관리하는 화면 — 재구축의 최종 목적("신형 장비 정의 → 배치·연결·추적·설계서 즉시 참여") 달성.

**Architecture:** 타입 스펙 검증은 @twin/core `validateTypeSpec` 순수 함수 한 곳(§6-4)이 유일 구현 — 백엔드 저장 전 검증과 프론트 폼 사전 검증이 공유한다. 백엔드는 타입 단위 원자 CRUD(PUT = 전체 교체, 명세는 delete-and-recreate)이며, 인스턴스가 존재하는 타입의 구조(containers/ports/links) 변경은 409 `TYPE_IN_USE`로 거부한다(YAGNI — 재인스턴스화는 비목표). 시드는 카탈로그가 관리자 편집 대상이 되므로 **빈 카탈로그일 때만** 실행(운영 데이터 원복 방지 원칙). 프론트는 워킹카피 스토어와 무관한 별도 화면(로컬 draft + react-query invalidate).

**Tech Stack:** 기존 v2 스택 그대로 — Express+Prisma(next-client)+zod / React+react-query+Tailwind, @twin/core dist 공유.

## Global Constraints

- **§6 단순화 서약**: 휴리스틱 금지(타입 이름/키 문자열 분기 금지 — 가드레일 테스트가 강제), 호환 헬퍼 금지, YAGNI, 같은 판정은 @twin/core 한 곳, 가드레일로 강제.
- **v2 격리**: `backend/src/v2/**`, `frontend/src/v2/**` 자립. 구 소스 무접촉 — 허용 접점은 `backend/src/index.ts` 마운트, `frontend/src/App.tsx` 라우트, `package.json`뿐. 구 CatalogTable(자산마스터) 코드는 참조(UX)만 하고 import 금지.
- **@twin/core 수정 시 `npm run build -w @twin/core` 필수** (dist가 main — 안 하면 백/프론트가 스테일 dist를 봄).
- **medium == CableGroup.key** ('fiber'/'power'/'network'/'control'/'ground') — 표시명 아님.
- **UI 규칙**: `frontend/src/components/ui` 공용 컴포넌트(DetailCard/DetailRow/Badge/Button/Select/Input/IconButton) 재사용, 본문 `text-sm`/라벨 `text-xs`, `text-xs` 미만 금지. 작업 전 `frontend/src/components/ui/CONVENTIONS.md` 필독.
- **프론트 패턴**: 반응형 슬라이스 구독(함수참조 구독 금지), 핸들러는 getState()/로컬 상태, blur/Enter 무변경 가드, `e.currentTarget`은 함수형 업데이터 밖에서 캡처, 훅은 조기 return 전 완료.
- **어드민 전용 뮤테이션**: 모든 카탈로그 쓰기 라우트는 `adminOnly` (backend/src/middleware/auth.ts — v2 자립 예외로 허용된 무상태 JWT auth).
- **에러 계약**: `HttpError(status, code, message, details)` — 코드는 `INVALID_TYPE_SPEC`(400, details=issues[]), `TYPE_IN_USE`(409), `CATEGORY_IN_USE`(409), `CABLE_CATEGORY_IN_USE`(409), `DUPLICATE_KEY`(409).
- **커밋 메시지**: 한국어, `feat(core):`/`feat(v2-be):`/`feat(v2-fe):` 스타일 + 푸터 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **dev 환경**: DB만 Docker(`docker-compose.dev.yml`), 서버는 `npm run dev`. Docker 빌드 금지.

---

### Task 1: @twin/core — validateTypeSpec 순수 검증기 + 전원 장비 시드 매체 교정 (TDD)

**Files:**
- Create: `packages/core/src/validation/typeSpec.ts`
- Create: `packages/core/src/validation/typeSpec.test.ts`
- Modify: `packages/core/src/index.ts` (export 추가)
- Modify: `packages/core/src/seed/catalog.ts` (CHARGER/UPS/BATTERY 포트 매체 교정)

**Interfaces:**
- Consumes: `AssetTypeSpec`, `FieldDef`, `ContainerSpec`, `PortTemplate`, `InternalLinkRule` (catalog/types.ts — 기존).
- Produces (후속 태스크 의존):
  ```ts
  export interface TypeSpecIssue { path: string; message: string }
  export interface TypeSpecContext { categoryKeys: string[]; mediumKeys: string[] }
  export function validateTypeSpec(spec: AssetTypeSpec, ctx: TypeSpecContext): TypeSpecIssue[]
  ```
  이슈 0개 = 유효. Task 2(백엔드 400 details), Task 3(프론트 폼 사전검증)이 그대로 사용.

- [ ] **Step 1: 실패하는 테스트 작성** — `packages/core/src/validation/typeSpec.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { validateTypeSpec } from './typeSpec';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from '../seed/catalog';
import type { AssetTypeSpec } from '../catalog/types';

const CTX = { categoryKeys: ['통신', '전원'], mediumKeys: ['fiber', 'power'] };

function base(over: Partial<AssetTypeSpec> = {}): AssetTypeSpec {
  return {
    key: 'T1', name: '테스트', categoryKey: '통신', sortOrder: 0,
    placement: { placeable: false },
    labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
    fields: [], containers: [], ports: [], links: [],
    ...over,
  };
}

describe('validateTypeSpec', () => {
  it('유효한 스펙은 이슈 0', () => {
    expect(validateTypeSpec(base(), CTX)).toEqual([]);
  });
  it('key 형식 위반(공백/한글/빈값)과 name 빈값을 거부한다', () => {
    expect(validateTypeSpec(base({ key: '한 글' }), CTX).some((i) => i.path === 'key')).toBe(true);
    expect(validateTypeSpec(base({ key: '' }), CTX).some((i) => i.path === 'key')).toBe(true);
    expect(validateTypeSpec(base({ name: '  ' }), CTX).some((i) => i.path === 'name')).toBe(true);
  });
  it('categoryKey 미존재를 거부한다', () => {
    expect(validateTypeSpec(base({ categoryKey: '없음' }), CTX).some((i) => i.path === 'categoryKey')).toBe(true);
  });
  it('음수 공량을 거부한다', () => {
    const s = base({ labor: { laborType: '통신내선공', installHours: -1, removeHours: 0, relocateHours: 0 } });
    expect(validateTypeSpec(s, CTX).some((i) => i.path === 'labor.installHours')).toBe(true);
  });
  it('필드 key 중복과 select 옵션 없음을 거부한다', () => {
    const dup = base({ fields: [
      { key: 'a', label: 'A', type: 'text' },
      { key: 'a', label: 'B', type: 'text' },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'fields[1].key')).toBe(true);
    const noOpt = base({ fields: [{ key: 's', label: 'S', type: 'select', options: [] }] });
    expect(validateTypeSpec(noOpt, CTX).some((i) => i.path === 'fields[0].options')).toBe(true);
  });
  it('컨테이너 key 중복·slotCount 0·자유형 span 을 거부한다', () => {
    const c = { name: '슬롯', allowSpan: false, accepts: {} };
    const dup = base({ containers: [
      { key: 'm', slotCount: 4, ...c },
      { key: 'm', slotCount: 4, ...c },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'containers[1].key')).toBe(true);
    const zero = base({ containers: [{ key: 'm', slotCount: 0, ...c }] });
    expect(validateTypeSpec(zero, CTX).some((i) => i.path === 'containers[0].slotCount')).toBe(true);
    const freeSpan = base({ containers: [{ key: 'm', slotCount: null, name: '슬롯', allowSpan: true, accepts: {} }] });
    expect(validateTypeSpec(freeSpan, CTX).some((i) => i.path === 'containers[0].allowSpan')).toBe(true);
  });
  it('포트 group 중복·count 0·미지 매체·{n} 누락 패턴을 거부한다', () => {
    const p = { count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: '코어 {n}' };
    const dup = base({ ports: [ { group: 'A', ...p }, { group: 'A', ...p } ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'ports[1].group')).toBe(true);
    const zero = base({ ports: [{ group: 'A', ...p, count: 0 }] });
    expect(validateTypeSpec(zero, CTX).some((i) => i.path === 'ports[0].count')).toBe(true);
    const badMedium = base({ ports: [{ group: 'A', ...p, medium: 'laser' }] });
    expect(validateTypeSpec(badMedium, CTX).some((i) => i.path === 'ports[0].medium')).toBe(true);
    const noN = base({ ports: [{ group: 'A', ...p, namePattern: '코어' }] });
    expect(validateTypeSpec(noN, CTX).some((i) => i.path === 'ports[0].namePattern')).toBe(true);
  });
  it('링크 룰: 미존재 그룹·자기 참조·중복 쌍을 거부한다', () => {
    const ports = [
      { group: 'A', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'A {n}' },
      { group: 'B', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'B {n}' },
    ];
    const ghost = base({ ports, links: [{ fromGroup: 'A', toGroup: 'X', mapping: 'byIndex' }] });
    expect(validateTypeSpec(ghost, CTX).some((i) => i.path === 'links[0].toGroup')).toBe(true);
    const self = base({ ports, links: [{ fromGroup: 'A', toGroup: 'A', mapping: 'all' }] });
    expect(validateTypeSpec(self, CTX).some((i) => i.path === 'links[0].toGroup')).toBe(true);
    const dup = base({ ports, links: [
      { fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' },
      { fromGroup: 'A', toGroup: 'B', mapping: 'all' },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'links[1]')).toBe(true);
  });
  it('시드 전 타입이 시드 카테고리/매체 컨텍스트에서 이슈 0 (모델 증명)', () => {
    const ctx = {
      categoryKeys: SEED_CATEGORIES.map((c) => c.key),
      mediumKeys: SEED_CABLE_GROUPS.map((g) => g.key),
    };
    for (const t of SEED_ASSET_TYPES) {
      expect({ key: t.key, issues: validateTypeSpec(t, ctx) }).toEqual({ key: t.key, issues: [] });
    }
  });
  it('전원 장비(CHARGER/UPS/BATTERY)는 power 매체 포트를 갖는다 (이월 해소)', () => {
    for (const key of ['CHARGER', 'UPS', 'BATTERY']) {
      const t = SEED_ASSET_TYPES.find((x) => x.key === key)!;
      expect(t.ports.every((p) => p.medium === 'power')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/validation/typeSpec.test.ts` (cwd: packages/core)
Expected: FAIL — `validateTypeSpec` 미존재 + 전원 장비 매체 단언 실패.

- [ ] **Step 3: 구현** — `packages/core/src/validation/typeSpec.ts`

```ts
import type { AssetTypeSpec } from '../catalog/types';

export interface TypeSpecIssue { path: string; message: string }
export interface TypeSpecContext { categoryKeys: string[]; mediumKeys: string[] }

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DIRECTIONS = new Set(['IN', 'OUT', 'BI']);
const FIELD_TYPES = new Set(['text', 'number', 'date', 'select']);
const MAPPINGS = new Set(['byIndex', 'all']);

/**
 * 타입 스펙 구조 검증 — 저장 가능 여부 판정의 유일 구현.
 * 백엔드(저장 전)와 프론트 폼(사전 표시)이 공유한다. 이슈 0 = 유효.
 */
export function validateTypeSpec(spec: AssetTypeSpec, ctx: TypeSpecContext): TypeSpecIssue[] {
  const issues: TypeSpecIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (!KEY_RE.test(spec.key)) push('key', '키는 영문/숫자/대시/언더스코어만 허용됩니다');
  if (spec.name.trim() === '') push('name', '이름을 입력하세요');
  if (!ctx.categoryKeys.includes(spec.categoryKey)) push('categoryKey', '존재하지 않는 분류입니다');

  for (const k of ['installHours', 'removeHours', 'relocateHours'] as const) {
    if (spec.labor[k] < 0) push(`labor.${k}`, '공량은 0 이상이어야 합니다');
  }

  const fieldKeys = new Set<string>();
  spec.fields.forEach((f, i) => {
    if (f.key.trim() === '') push(`fields[${i}].key`, '필드 키를 입력하세요');
    else if (fieldKeys.has(f.key)) push(`fields[${i}].key`, `필드 키 중복: ${f.key}`);
    fieldKeys.add(f.key);
    if (f.label.trim() === '') push(`fields[${i}].label`, '필드 라벨을 입력하세요');
    if (!FIELD_TYPES.has(f.type)) push(`fields[${i}].type`, '지원하지 않는 자료형입니다');
    if (f.type === 'select' && (f.options ?? []).length === 0) push(`fields[${i}].options`, 'select 필드는 옵션이 1개 이상 필요합니다');
  });

  const containerKeys = new Set<string>();
  spec.containers.forEach((c, i) => {
    if (!KEY_RE.test(c.key)) push(`containers[${i}].key`, '컨테이너 키는 영문/숫자/대시/언더스코어만 허용됩니다');
    else if (containerKeys.has(c.key)) push(`containers[${i}].key`, `컨테이너 키 중복: ${c.key}`);
    containerKeys.add(c.key);
    if (c.name.trim() === '') push(`containers[${i}].name`, '컨테이너 이름을 입력하세요');
    if (c.slotCount !== null && c.slotCount < 1) push(`containers[${i}].slotCount`, '슬롯 수는 1 이상이거나 자유형(null)이어야 합니다');
    if (c.slotCount === null && c.allowSpan) push(`containers[${i}].allowSpan`, '자유형 컨테이너는 span 을 가질 수 없습니다');
  });

  const portGroups = new Set<string>();
  spec.ports.forEach((p, i) => {
    if (!KEY_RE.test(p.group)) push(`ports[${i}].group`, '포트 그룹은 영문/숫자/대시/언더스코어만 허용됩니다');
    else if (portGroups.has(p.group)) push(`ports[${i}].group`, `포트 그룹 중복: ${p.group}`);
    portGroups.add(p.group);
    if (p.count < 1) push(`ports[${i}].count`, '포트 수량은 1 이상이어야 합니다');
    if (!DIRECTIONS.has(p.direction)) push(`ports[${i}].direction`, '방향은 IN/OUT/BI 중 하나여야 합니다');
    if (!ctx.mediumKeys.includes(p.medium)) push(`ports[${i}].medium`, `존재하지 않는 매체입니다: ${p.medium}`);
    if (!p.namePattern.includes('{n}')) push(`ports[${i}].namePattern`, "이름 패턴에 '{n}' 이 필요합니다");
  });

  const linkPairs = new Set<string>();
  spec.links.forEach((l, i) => {
    if (!portGroups.has(l.fromGroup)) push(`links[${i}].fromGroup`, `존재하지 않는 포트 그룹: ${l.fromGroup}`);
    if (!portGroups.has(l.toGroup)) push(`links[${i}].toGroup`, `존재하지 않는 포트 그룹: ${l.toGroup}`);
    else if (l.fromGroup === l.toGroup) push(`links[${i}].toGroup`, '자기 그룹으로의 링크는 허용되지 않습니다');
    if (!MAPPINGS.has(l.mapping)) push(`links[${i}].mapping`, '매핑은 byIndex/all 중 하나여야 합니다');
    const pair = `${l.fromGroup}→${l.toGroup}`;
    if (linkPairs.has(pair)) push(`links[${i}]`, `링크 룰 중복: ${pair}`);
    linkPairs.add(pair);
  });

  return issues;
}
```

- [ ] **Step 4: 시드 교정** — `packages/core/src/seed/catalog.ts`의 CHARGER·UPS·BATTERY 3곳 ports를 다음으로 교체:

```ts
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'power', namePattern: '전원 {n}' },
    ],
```

- [ ] **Step 5: index export 추가** — `packages/core/src/index.ts`에 한 줄:

```ts
export { validateTypeSpec, type TypeSpecIssue, type TypeSpecContext } from './validation/typeSpec';
```

- [ ] **Step 6: 테스트 통과 + 코어 전체 확인**

Run: `npx vitest run` (cwd: packages/core)
Expected: 전체 PASS (기존 48 + 신규 ~10). 기존 테스트 중 UPS 등의 network 매체를 단언하는 것이 있으면 **power 기준으로 갱신**(회귀가 아니라 이월 해소 — 계획 명시 변경).

- [ ] **Step 7: dist 빌드 (필수)**

Run: `npm run build -w @twin/core`
Expected: EXIT 0.

- [ ] **Step 8: 커밋**

```bash
git add packages/core
git commit -m "feat(core): validateTypeSpec 타입스펙 검증기 + 전원 장비 시드 매체 교정(network→power)"
```

---

### Task 2: 백엔드 — 카탈로그 CRUD API + 빈-카탈로그 시드 정책 (통합 TDD)

**Files:**
- Modify: `backend/src/v2/catalog.routes.ts` (CRUD 추가; GET에 `assetCount` 포함)
- Modify: `backend/src/v2/schemas.ts` (카탈로그 zod 스키마)
- Modify: `backend/prisma/next/seed.ts` (빈 카탈로그 가드)
- Test: `backend/src/v2/__tests__/catalog.crud.test.ts`

**Interfaces:**
- Consumes: `validateTypeSpec`/`TypeSpecContext` (@twin/core, Task 1), `HttpError`, `adminOnly`, `nextDb`, `typeRowToSpec`(spec.ts).
- Produces (Task 3 의존 — REST 계약):
  - `GET /v2/catalog` → 기존 형상 + `types[].assetCount: number`
  - `POST /v2/catalog/types` body=`TypeUpsertBody` → 201 `{ id }` / 400 `INVALID_TYPE_SPEC` details=`TypeSpecIssue[]` / 409 `DUPLICATE_KEY`
  - `PUT /v2/catalog/types/:id` body=`TypeUpsertBody`(key 불변 — body.key 무시) → 200 / 409 `TYPE_IN_USE`(인스턴스 존재+구조 변경)
  - `DELETE /v2/catalog/types/:id` → 204 / 409 `TYPE_IN_USE`
  - `POST /v2/catalog/categories` `{key,name,sortOrder}` / `PATCH /v2/catalog/categories/:id` `{name?,sortOrder?}` / `DELETE /v2/catalog/categories/:id` → 409 `CATEGORY_IN_USE`(타입 존재)
  - `PATCH /v2/catalog/cable-groups/:id` `{name?,color?,laborType?,installHoursPerM?,removeHoursPerM?}` (key 불변)
  - `POST /v2/catalog/cable-categories` `{groupId,name,sortOrder}` / `PATCH /v2/catalog/cable-categories/:id` `{name?,sortOrder?}` / `DELETE /v2/catalog/cable-categories/:id` → 409 `CABLE_CATEGORY_IN_USE`(케이블 존재)
  - `TypeUpsertBody` = `{ key, name, categoryId, sortOrder, isActive, placeable, defaultWidth, defaultHeight, laborType, installHours, removeHours, relocateHours, fieldDefs: FieldDef[], containers: {key,name,slotCount,allowSpan,accepts}[], ports: {group,count,direction,medium,namePattern}[], links: {fromGroup,toGroup,mapping}[] }`

- [ ] **Step 1: zod 스키마 추가** — `backend/src/v2/schemas.ts` 말미:

```ts
// ---------- 카탈로그 관리 (Stage 6) ----------
const keyRe = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const fieldDefSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(['text', 'number', 'date', 'select']),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
});
export const containerSpecBodySchema = z.object({
  key: z.string().regex(keyRe),
  name: z.string().trim().min(1),
  slotCount: z.number().int().min(1).nullable(),
  allowSpan: z.boolean(),
  accepts: z.object({
    categoryKeys: z.array(z.string()).optional(),
    typeKeys: z.array(z.string()).optional(),
  }),
});
export const portTemplateBodySchema = z.object({
  group: z.string().regex(keyRe),
  count: z.number().int().min(1),
  direction: z.enum(['IN', 'OUT', 'BI']),
  medium: z.string().min(1),
  namePattern: z.string().min(1),
});
export const linkRuleBodySchema = z.object({
  fromGroup: z.string().min(1),
  toGroup: z.string().min(1),
  mapping: z.enum(['byIndex', 'all']),
});
export const typeUpsertSchema = z.object({
  key: z.string().regex(keyRe),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  placeable: z.boolean(),
  defaultWidth: z.number().positive().nullable(),
  defaultHeight: z.number().positive().nullable(),
  laborType: z.string().trim().min(1).nullable(),
  installHours: z.number().min(0),
  removeHours: z.number().min(0),
  relocateHours: z.number().min(0),
  fieldDefs: z.array(fieldDefSchema),
  containers: z.array(containerSpecBodySchema),
  ports: z.array(portTemplateBodySchema),
  links: z.array(linkRuleBodySchema),
});
export const categoryCreateSchema = z.object({ key: z.string().min(1), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });
export const cableGroupPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().min(1).optional(),
  laborType: z.string().trim().min(1).nullable().optional(),
  installHoursPerM: z.number().min(0).optional(),
  removeHoursPerM: z.number().min(0).optional(),
});
export const cableCategoryCreateSchema = z.object({ groupId: z.string().uuid(), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const cableCategoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });
```

- [ ] **Step 2: 실패하는 통합 테스트 작성** — `backend/src/v2/__tests__/catalog.crud.test.ts`. 기존 v2 통합 테스트 파일(예: `__tests__/org.routes.test.ts`)의 셋업 관례(supertest·admin 토큰·트랜잭션/정리)를 그대로 따른다. 케이스:

```ts
// 관례 셋업 생략 — 기존 v2 통합테스트와 동일하게 admin/viewer 토큰 준비
describe('catalog CRUD', () => {
  it('viewer 는 모든 쓰기 라우트에서 403', async () => { /* POST/PUT/DELETE 각 1회 */ });
  it('카테고리 생성→수정→삭제, 타입 존재 시 삭제 409 CATEGORY_IN_USE', async () => {});
  it('타입 생성: 유효 payload 201 + GET 재조회 시 명세(containers/ports/links) 왕복 일치', async () => {});
  it('타입 생성: medium 이 케이블그룹에 없으면 400 INVALID_TYPE_SPEC + details 에 ports[i].medium', async () => {});
  it('타입 생성: key 중복이면 409 DUPLICATE_KEY', async () => {});
  it('PUT: 비구조 필드(이름/공량/fieldDefs/배치)는 인스턴스가 있어도 수정된다', async () => {});
  it('PUT: 인스턴스 존재 + 구조(ports) 변경이면 409 TYPE_IN_USE', async () => {});
  it('PUT: 인스턴스 존재라도 구조가 기존과 동일하면 200 (동일성 비교는 id 제외 정렬 후)', async () => {});
  it('DELETE: 인스턴스 존재 시 409 TYPE_IN_USE, 없으면 204 후 GET 에서 사라짐', async () => {});
  it('케이블 그룹 PATCH 공량 수정 + 케이블 카테고리 CRUD, 케이블 참조 시 삭제 409', async () => {});
  it('GET /v2/catalog 의 types[].assetCount 가 인스턴스 수를 반영한다', async () => {});
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -w backend -- --run src/v2/__tests__/catalog.crud.test.ts`
Expected: FAIL — 라우트 미존재(404).

- [ ] **Step 4: 라우트 구현** — `backend/src/v2/catalog.routes.ts` 확장. 핵심 로직:

```ts
import { validateTypeSpec, specFromCatalog } from '@twin/core';
import { adminOnly } from '../middleware/auth.js';
import { HttpError } from './errors.js';
import {
  typeUpsertSchema, categoryCreateSchema, categoryPatchSchema,
  cableGroupPatchSchema, cableCategoryCreateSchema, cableCategoryPatchSchema, idParamSchema,
} from './schemas.js';

// GET / — 기존 쿼리에 assetCount 추가:
//   nextDb.assetType.findMany({ include: { ..., _count: { select: { assets: true } } }, ... })
//   res.json 시 types.map(({ _count, ...t }) => ({ ...t, assetCount: _count.assets }))

/** body → 코어 spec 형상 (검증용). categoryId→key 는 호출부에서 해소해 넘긴다. */
function bodyToSpec(body: TypeUpsertBody, categoryKey: string) {
  return {
    key: body.key, name: body.name, categoryKey, sortOrder: body.sortOrder,
    placement: { placeable: body.placeable, defaultWidth: body.defaultWidth ?? undefined, defaultHeight: body.defaultHeight ?? undefined },
    labor: { laborType: body.laborType, installHours: body.installHours, removeHours: body.removeHours, relocateHours: body.relocateHours },
    fields: body.fieldDefs, containers: body.containers, ports: body.ports, links: body.links,
  };
}

async function specContext(tx: typeof nextDb) {
  const [categories, groups] = await Promise.all([
    tx.assetCategory.findMany({ select: { key: true } }),
    tx.cableGroup.findMany({ select: { key: true } }),
  ]);
  return { categoryKeys: categories.map((c) => c.key), mediumKeys: groups.map((g) => g.key) };
}

/** 구조(containers/ports/links) 동일성 — id/정렬 무시 캐노니컬 비교. */
function structuralKey(containers: ..., ports: ..., links: ...): string {
  const canon = {
    containers: [...containers].sort((a, b) => a.key.localeCompare(b.key))
      .map((c) => ({ key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts })),
    ports: [...ports].sort((a, b) => a.group.localeCompare(b.group))
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern })),
    links: [...links].sort((a, b) => `${a.fromGroup}→${a.toGroup}`.localeCompare(`${b.fromGroup}→${b.toGroup}`))
      .map((l) => ({ fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping })),
  };
  return JSON.stringify(canon);
}

// POST /types: zod parse → categoryId 존재 확인 → validateTypeSpec(bodyToSpec, ctx)
//   issues.length > 0 → throw new HttpError(400, 'INVALID_TYPE_SPEC', '타입 정의가 유효하지 않습니다', issues)
//   key 중복(P2002 또는 사전 findUnique) → 409 DUPLICATE_KEY
//   $transaction: assetType.create + 명세 3종 create (sortOrder = 배열 인덱스)
// PUT /types/:id: 로드(+_count.assets) → 검증 동일(key 는 DB 값 사용, body.key 무시)
//   if assetCount > 0 && structuralKey(기존) !== structuralKey(body) → 409 TYPE_IN_USE
//     (message 에 assetCount 포함: `사용 중인 타입입니다 (자산 ${n}개) — 구조 변경 불가`)
//   $transaction: assetType.update(비구조 필드) + 구조 변경 시 명세 deleteMany→create
// DELETE /types/:id: _count.assets > 0 → 409 TYPE_IN_USE; else assetType.delete (명세는 onDelete Cascade)
// categories/cable-groups/cable-categories: 표준 CRUD + IN_USE 가드(각각 types/cables count)
```

전 라우트 `adminOnly`. 세부는 org.routes.ts의 try/catch-next 패턴을 따른다.

- [ ] **Step 5: 시드 가드** — `backend/prisma/next/seed.ts` `main()` 트랜잭션 시작 직후:

```ts
    // Stage 6 이후 카탈로그는 관리자 편집 대상(운영 데이터) — 빈 카탈로그일 때만 시드.
    // (운영 데이터 원복 방지 원칙: 참조데이터 upsert 는 편집 UI 가 없던 Stage 5 까지의 정책)
    const existing = await tx.assetType.count();
    if (existing > 0) {
      console.log('[seed:next] catalog already populated — skip');
      return null;
    }
```

(`counts` 반환/로그는 null 가드 처리.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -w backend -- --run`
Expected: 기존 189 + 신규 전체 PASS.

- [ ] **Step 7: dev DB 시드 재실행으로 매체 교정 반영** (자산 0이므로 안전 — Task 6 검증 전제)

Run: `docker compose -f docker-compose.dev.yml up -d && npm run db:next:seed -w backend`
Expected: skip 로그 발생 시 `psql`로 `TRUNCATE "AssetType" CASCADE; TRUNCATE "AssetCategory" CASCADE; TRUNCATE "CableGroup" CASCADE;` 후 재시드(개발 DB 한정 — 자산 0 확인 후).

- [ ] **Step 8: 커밋**

```bash
git add backend/src/v2 backend/prisma/next/seed.ts
git commit -m "feat(v2-be): 카탈로그 CRUD API(타입/분류/케이블) + 인스턴스 구조가드 + 빈-카탈로그 시드 정책"
```

---

### Task 3: 프론트 — admin API·훅 + 타입 draft 모듈 (TDD)

**Files:**
- Modify: `frontend/src/v2/api.ts` (카탈로그 뮤테이션 함수)
- Modify: `frontend/src/v2/hooks.ts` (`useCatalogMutations`)
- Modify: `frontend/src/v2/types.ts` (`V2AssetType.assetCount` 추가, `TypeUpsertBody` 타입)
- Create: `frontend/src/v2/catalogDraft.ts`
- Test: `frontend/src/v2/__tests__/catalogDraft.test.ts`

**Interfaces:**
- Consumes: `validateTypeSpec`/`TypeSpecIssue` (@twin/core), Task 2 REST 계약, `V2Catalog`/`V2AssetType`.
- Produces (Task 4/5 의존):
  ```ts
  // catalogDraft.ts
  export interface TypeDraft { /* TypeUpsertBody 와 동일 형상 (id 없는 로컬 편집본) */ }
  export function typeToDraft(t: V2AssetType): TypeDraft
  export function emptyDraft(categoryId: string): TypeDraft
  export function draftIssues(draft: TypeDraft, catalog: V2Catalog): TypeSpecIssue[]  // categoryId→key 해소 후 validateTypeSpec 위임
  export function isDraftDirty(draft: TypeDraft, original: V2AssetType | null): boolean  // 신규(null)는 항상 dirty
  // hooks.ts
  export function useCatalogMutations(): {
    createType, updateType, deleteType, createCategory, patchCategory, deleteCategory,
    patchCableGroup, createCableCategory, patchCableCategory, deleteCableCategory,
  } // 각각 react-query useMutation, 성공 시 ['v2','catalog'] invalidate
  ```

- [ ] **Step 1: 실패하는 테스트** — `catalogDraft.test.ts`:

```ts
describe('catalogDraft', () => {
  it('typeToDraft → draftToBody 왕복이 서버 형상과 일치한다 (id/assetCount 제거, 명세 sortOrder 제거)', () => {});
  it('draftIssues: categoryId 를 key 로 해소해 validateTypeSpec 에 위임한다 (미지 categoryId → categoryKey 이슈)', () => {});
  it('draftIssues: 카탈로그의 cableGroups 키가 mediumKeys 로 쓰인다 (power 포트 유효, laser 무효)', () => {});
  it('isDraftDirty: 원본과 동일하면 false, 필드 하나 바꾸면 true, 신규(null)는 true', () => {});
});
```

- [ ] **Step 2: 실패 확인** → Run: `npm test -w frontend -- --run src/v2/__tests__/catalogDraft.test.ts` → FAIL.

- [ ] **Step 3: 구현.** `catalogDraft.ts`는 순수 모듈(React 무관). `draftIssues`:

```ts
export function draftIssues(draft: TypeDraft, catalog: V2Catalog): TypeSpecIssue[] {
  const categoryKey = catalog.categories.find((c) => c.id === draft.categoryId)?.key ?? '';
  return validateTypeSpec(
    {
      key: draft.key, name: draft.name, categoryKey, sortOrder: draft.sortOrder,
      placement: { placeable: draft.placeable, defaultWidth: draft.defaultWidth ?? undefined, defaultHeight: draft.defaultHeight ?? undefined },
      labor: { laborType: draft.laborType, installHours: draft.installHours, removeHours: draft.removeHours, relocateHours: draft.relocateHours },
      fields: draft.fieldDefs, containers: draft.containers, ports: draft.ports, links: draft.links,
    },
    {
      categoryKeys: catalog.categories.map((c) => c.key),
      mediumKeys: catalog.cableGroups.map((g) => g.key),
    },
  );
}
```

`api.ts` 뮤테이션은 기존 `api.post/put/patch/delete` 래퍼 관례를 따른다.

- [ ] **Step 4: 통과 확인** → `npm test -w frontend -- --run` 전체 그린.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 카탈로그 admin API/훅 + TypeDraft 모듈(코어 validateTypeSpec 사전검증)"
```

---

### Task 4: 프론트 — 관리자 카탈로그 화면 골격 (타입 리스트·분류 관리·기본정보/배치/공량 편집)

**Files:**
- Create: `frontend/src/v2/pages/V2CatalogAdminPage.tsx`
- Create: `frontend/src/v2/components/admin/TypeListPanel.tsx`
- Create: `frontend/src/v2/components/admin/TypeBasicsForm.tsx`
- Modify: `frontend/src/App.tsx` (라우트 1줄: `<Route path="/v2/catalog" element={<V2CatalogAdminPage />} />`)
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx` (헤더에 `자산 카탈로그` 링크 — `<Link to="/v2/catalog">`)
- Test: `frontend/src/v2/__tests__/TypeBasicsForm.test.tsx`

**Interfaces:**
- Consumes: `useV2Catalog`, `useCatalogMutations`, `typeToDraft`/`emptyDraft`/`draftIssues`/`isDraftDirty` (Task 3), 공용 ui 컴포넌트.
- Produces: `V2CatalogAdminPage` 내 선택 상태(`selectedTypeId: string | null`)와 draft 로컬 state — Task 5 의 명세 편집 섹션이 같은 draft setState 를 prop 으로 받는다: `onChange(patch: Partial<TypeDraft>)`.

**레이아웃** (구 자산마스터 편집형 테이블 UX 의 2패널 확장 — CONVENTIONS 준수):
- 좌측 280px: 분류(카테고리)별 그룹 타입 리스트 — 타입명 + `assetCount` 배지 + 비활성 흐림. 하단 `+ 타입 추가` / 분류 행 우측 연필(이름 변경)·`+`(분류 추가)·휴지통(빈 분류만).
- 우측: 선택 타입의 편집 폼. 상단 저장바(이슈 요약 + `저장`/`취소` — dirty 아닐 때 비활성). 섹션: 기본정보(키[신규만 편집]/이름/분류/정렬/활성) · 배치(placeable, 기본 W/H) · 공량(노무유형/신설/철거/이설) — DetailCard + DetailRow.

- [ ] **Step 1: 실패하는 폼 테스트** — `TypeBasicsForm.test.tsx`: (a) 원본 값 렌더, (b) 이름 변경 시 `onChange({name})` 1회 호출, (c) `draftIssues` 결과의 해당 path 이슈가 필드 하단 `text-xs text-danger` 로 표시, (d) 기존 타입은 key input 이 disabled.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현.** 폼 입력은 언컨트롤드+`key={original}` 리마운트 대신 컨트롤드 draft 값 사용(로컬 draft 라 재렌더 안전). 저장 클릭: `draftIssues` 0 확인 → create/update 뮤테이션 → 409/400 을 저장바에 표면화(`TYPE_IN_USE` message 그대로, `INVALID_TYPE_SPEC` details 를 path 별 표시). 성공 시 invalidate + 신규면 응답 id 로 선택 유지.
- [ ] **Step 4: 통과 확인** → `npm test -w frontend -- --run` 그린.
- [ ] **Step 5: 커밋**

```bash
git add frontend/src/v2 frontend/src/App.tsx
git commit -m "feat(v2-fe): 관리자 카탈로그 화면 골격 — 타입 리스트/분류 관리/기본·배치·공량 편집"
```

---

### Task 5: 프론트 — 명세 편집 섹션(필드/컨테이너/포트/링크) + 케이블 카탈로그 관리

**Files:**
- Create: `frontend/src/v2/components/admin/FieldDefsEditor.tsx`
- Create: `frontend/src/v2/components/admin/ContainersEditor.tsx`
- Create: `frontend/src/v2/components/admin/PortsEditor.tsx`
- Create: `frontend/src/v2/components/admin/LinksEditor.tsx`
- Create: `frontend/src/v2/components/admin/CableCatalogPanel.tsx`
- Modify: `frontend/src/v2/pages/V2CatalogAdminPage.tsx` (섹션 배선 + `케이블` 탭)
- Test: `frontend/src/v2/__tests__/PortsEditor.test.tsx`

**Interfaces:**
- Consumes: Task 4 의 draft/`onChange` prop 계약, `V2Catalog`(매체 select = cableGroups, accepts select = categories/types), `useCatalogMutations`.
- Produces: 완성된 타입 정의 한 화면 — 스펙 §3 "기본정보 + 슬롯 명세 + 포트 템플릿 + 통과 규칙 + 공량을 한 화면에서".

**공통 편집 테이블 패턴** (4개 에디터 동일): 행 배열 편집 — 각 행 인라인 입력, 행 끝 삭제 IconButton, 말미 `+ 추가` 버튼(기본값 행 push). `onChange({ ports: next })` 처럼 배열 전체 교체. 이슈는 `draftIssues` 의 path(`ports[2].medium`)를 파싱해 해당 행/셀 하이라이트.

- 필드: key/label/type(select: text·number·date·select)/unit/options(콤마 구분 입력, type=select 일 때만).
- 컨테이너: key/name/slotCount(빈값=자유형 null)/allowSpan(체크, 자유형이면 disabled)/accepts — 분류 멀티선택 + 타입 멀티선택(체크박스 팝오버, `{}`=모두 수용 안내).
- 포트: group/count/direction(select IN·OUT·BI)/medium(select = `catalog.cableGroups` key+name 표시)/namePattern.
- 링크: fromGroup·toGroup(select = 현재 draft.ports 의 group 목록)/mapping(byIndex·all).
- **구조 잠금**: `original.assetCount > 0` 이면 컨테이너/포트/링크 3개 에디터 read-only + 상단 안내 배지: `자산 {n}개가 이 타입을 사용 중 — 구조(컨테이너·포트·링크)는 변경할 수 없습니다`. 필드/기본정보/공량은 편집 가능 유지.
- **케이블 탭**: 그룹 테이블(이름/색/노무유형/설치·철거 공량 per m 인라인 편집 — key 는 표시만) + 그룹별 종류(카테고리) 리스트(추가/이름변경/삭제 — 삭제 409 표면화).

- [ ] **Step 1: 실패하는 테스트** — `PortsEditor.test.tsx`: (a) draft.ports 행 렌더, (b) `+ 추가` 클릭 → onChange 에 기본행 추가된 배열, (c) medium select 옵션이 catalog.cableGroups 에서 파생, (d) `assetCount>0` 이면 입력 전부 disabled.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 4개 에디터 + 케이블 패널 구현, 페이지 배선.**
- [ ] **Step 4: 통과 확인** → `npm test -w frontend -- --run` 그린 + `npm run build` EXIT 0.
- [ ] **Step 5: 커밋**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 타입 명세 편집(필드/컨테이너/포트/링크) + 구조잠금 + 케이블 카탈로그 관리"
```

---

### Task 6: 종합 검증 — E2E 한 줄기(타입 정의→배치→연결→추적→설계서) + 브라우저 검증

**Files:** 없음(검증·수정 태스크). 발견 버그는 이 태스크에서 수정 커밋.

**절차:**

- [ ] **Step 1: 전 스위트** — core `npx vitest run`(packages/core) / `npm test -w backend -- --run` / `npm test -w frontend -- --run` / `npm run build` 전부 그린 확인.
- [ ] **Step 2: dev 기동** — DB docker + `npm run dev`, `/v2` 로그인(admin/admin123). dev DB 는 Task 2 Step 7 로 재시드된 상태(전원 장비 power 매체).
- [ ] **Step 3: 브라우저 시나리오 (각 단계 후 DB 직접 확인 의무)**
  1. **분류/타입 CRUD**: `/v2/catalog` 진입 → 분류 `시험` 추가 → 신규 타입 `시험장비`(key TEST-DEV, 분류 시험, placeable+기본크기, 공량 통신내선공 신설 2h, 커스텀필드 1개, 포트 IN 1/OUT 1 power, 링크 IN→OUT byIndex) 저장 → DB `AssetType`/`AssetPortTemplate`/`AssetLinkRule` 행 확인.
  2. **사전검증 UX**: 매체를 존재하지 않는 값으로 만들 수 없음(select), 이름 패턴에서 `{n}` 제거 시 저장 전 이슈 표시 + 저장 차단.
  3. **E2E 한 줄기** (스펙 §5): 검증 조직 생성 → 평면도에서 `시험장비` 2대 배치(팔레트에 자동 등장 = capability 질의 증명) → 저장 → 케이블 도구로 F-CV 전원 케이블 A.OUT↔B.IN 연결 → 저장 → 연결 탭 추적: internal link(IN→OUT) 경유 hop 확인 → 설계서: 신설 2대 × 2h = 4h 확인 → DB Cable/Port 확인.
  4. **구조 잠금**: 인스턴스 있는 `시험장비` 의 포트 섹션 read-only 확인 → API 로 강제 PUT 시 409 TYPE_IN_USE(브라우저 fetch) → 기본정보(이름) 수정은 저장 성공.
  5. **전원 장비 이월 해소**: UPS 1대 추가 → 전원 케이블이 UPS 포트에 연결됨(5B에서 차단됐던 케이스) → 계통 뷰 무회귀 확인.
  6. **케이블 카탈로그**: F-CV 그룹 installHoursPerM 수정 → 설계서 케이블 공량에 반영 확인 → 원복.
  7. **분류/타입 삭제 가드**: 인스턴스 존재 타입 삭제 409 표면화, 타입 존재 분류 삭제 409 표면화.
  8. **정리**: 검증 조직·자산·케이블 삭제(저장) → `시험장비` 타입·`시험` 분류 삭제 → DB 잔재 0 확인.
- [ ] **Step 4: 시드 정책 확인** — `npm run db:next:seed -w backend` 재실행 → `skip` 로그 + 관리자 편집(예: 남겨둔 공량 수정 1건으로 사전 확인 후 원복) 원복되지 않음 확인.
- [ ] **Step 5: 발견 버그 수정 + 재검증 후 커밋, 레저 기록.**

---

## Self-Review 결과

- **스펙 커버리지**: §3 "관리자 타입 정의 화면 — 한 화면에서"(Task 4+5), §5 E2E 한 줄기(Task 6-3), 카탈로그 CRUD API(§3 백엔드, Task 2), 검증기 한 곳(§6-4, Task 1), 시드 멱등 원칙과 관리자 편집 공존(Task 2 시드 가드), device 매체 이월(Task 1 시드 교정 + Task 6-5 증명). 포트 수량 인스턴스 오버라이드 UI(portCounts)는 기존 이월 그대로 — 이번 스코프 아님(레저 기록 유지).
- **비목표 재확인**: 타입 편집의 기존 인스턴스 재인스턴스화(구조 잠금으로 대체 — YAGNI), CableGroup 생성/삭제(매체 키는 뷰 파라미터와 결합 — 편집은 공량/표시명만), 관리자 화면의 role 기반 프론트 가드(서버 adminOnly 가 판정 — 프론트는 403 표면화).
- **타입 일관성**: `TypeUpsertBody`(Task 2) = `TypeDraft`(Task 3) 형상 동일 — draft 가 곧 body. `validateTypeSpec(spec, ctx)` 시그니처 Task 1/2/3 일치. `assetCount` 는 GET 파생 필드(Task 2 produce, Task 4/5 consume).
- **플레이스홀더 스캔**: Task 2 Step 4 는 org.routes.ts 관례 위임(기존 코드가 레포에 존재 — 허용 참조), 나머지 코드 블록 완결.
