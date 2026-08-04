# 배경 도면 임포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 층 평면도에 DWG/DXF/DGN 배경 도면을 임포트하는 기능을 v2에 구현한다.

**Architecture:** 렌더링 경로(`renderBackgroundDrawing`)와 스키마 컬럼(`Floor.backgroundDrawing`)은 이미 존재하므로 **파서·엔드포인트·UI 트리거만** 만든다. 확장자 판정은 `parseBackground(buffer, fileName)` 한 곳에서만 일어나고, 각 포맷 파서는 DB를 모르는 순수 함수로 그 뒤에 숨는다. DWG/DXF는 삭제된 구 파서를 순수 함수로 이식하고, DGN v8은 `ezdgn-core`(Rust)를 WASM으로 빌드해 함수 하나(`dgn_to_background(bytes) → JSON`)만 노출한다.

**Tech Stack:** TypeScript / Express / Prisma / Vitest / React / Rust(wasm32-unknown-unknown) / wasm-pack / `@mlightcad/libredwg-web` / `ezdgn-core`

**참조 스펙:** `docs/superpowers/specs/2026-08-03-background-drawing-import-design.md`

## Global Constraints

- **개발 환경**: DB만 `docker compose -f docker-compose.dev.yml up -d`, 서버는 `npm run dev`. **`docker compose build` / `docker compose up` 금지.** 빌드 확인은 `npm run build`
- **`@twin/core` 수정 후 반드시 `npm run build -w @twin/core`** 를 실행한다 (백엔드·프론트는 `dist`를 소비한다)
- **UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md` 필독.** 공용 컴포넌트(`Button`·`IconButton`) 재사용, 타이포 스케일 `text-xs` 미만 금지, 일회용 `<div className>` 버튼/카드 생성 금지
- **좌표 관례: 1 canvas unit = 1 cm.** `points`·`lineweight`·`dashArray`·`BgText.size` 전부 cm 단위로 방출한다
- **Y축 뒤집기**: CAD는 Y가 위, canvas는 Y가 아래. 뒤집으면 회전 각도의 부호도 반전된다
- **테셀레이션 분할 수**: 부분 원호 **12분할**, 전체 원/타원 **24분할** (구 DWG 파서 값. 두 포맷의 곡선 밀도가 달라 보이면 안 된다)
- **DGN BYLEVEL 대체색**: `#404040`
- **업로드 크기 상한**: `50 * 1024 * 1024`
- **허용 확장자**: `.dwg` · `.dxf` · `.dgn` (대소문자 무시)
- **ezdgn git rev 핀**: `a7ca903d383dfb88b5b62c1535a38f21e093d848`
- **Rust**: 1.83 이상, 타겟 `wasm32-unknown-unknown`
- **테스트 픽스처는 공유 `sweepTestFixtures` 규약을 따른다** (`backend/src/v2/__tests__/helpers.ts`). 조직 이름 prefix가 스윕 목록에 없으면 잔재가 남는다
- **§6 단순화 서약**: 휴리스틱 금지(거동은 선언된 데이터에서 나온다), 호환 어댑터 금지, YAGNI, 판단 지점 1개

---

## File Structure

| 경로 | 책임 | 태스크 |
|---|---|---|
| `packages/core/src/canvas/backgroundTypes.ts` | `BackgroundDrawing` 계열 타입 (이동) | 1 |
| `frontend/src/v2/canvas/backgroundTypes.ts` | **삭제** | 1 |
| `backend/src/v2/background/parse.ts` | 확장자 → 파서 디스패치 (유일한 판단 지점) | 2 |
| `backend/src/v2/background/dwg.ts` | LibreDWG 파서 (구 코드 이식, 순수 함수) | 2 |
| `backend/src/v2/background.routes.ts` | `POST`/`DELETE` 엔드포인트 | 3 |
| `frontend/src/v2/api.ts` | `uploadBackground` · `deleteBackground` | 4 |
| `frontend/src/v2/components/FloorPlanView.tsx` | 층 탭 바의 임포트/제거 버튼 | 4 |
| `crates/dgn-background/` | Rust 크레이트 (DGN → BackgroundDrawing JSON) | 5, 6 |
| `backend/src/v2/background/wasm/` | wasm-pack 산출물 (커밋) | 5 |
| `backend/src/v2/background/dgn.ts` | WASM 로더 + 호출 | 5 |

---

## Task 1: BackgroundDrawing 타입을 @twin/core 로 이동

백엔드 파서가 프론트 타입을 import 할 수 없으므로, 두 곳이 공유하는 타입은 `@twin/core`(공유 순수 패키지)에 둔다. 타입 복제는 금지다.

**Files:**
- Create: `packages/core/src/canvas/backgroundTypes.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `frontend/src/v2/canvas/backgroundRenderer.ts:3,156`
- Modify: `frontend/src/v2/types.ts:27`
- Delete: `frontend/src/v2/canvas/backgroundTypes.ts`
- Test: `backend/src/v2/__tests__/guardrail.test.ts` (재정의 금지 가드 추가)

**Interfaces:**
- Produces: `@twin/core` 에서 `BackgroundDrawing`, `BgLayer`, `BgPath`, `BgText`, `BgFilled` 타입 export

- [ ] **Step 1: 현재 타입 파일을 core 로 복사**

`frontend/src/v2/canvas/backgroundTypes.ts` 의 내용을 그대로 `packages/core/src/canvas/backgroundTypes.ts` 로 옮긴다. 내용은 아래와 정확히 일치해야 한다(주석은 원본 유지):

```ts
export interface BgLayer {
  name: string;
  color: string;
  lineweight: number;
  linetype: string;
  dashArray?: number[];
  isVisible: boolean;
}

export interface BgPath {
  layer: string;
  points: number[];
  closed?: boolean;
  color?: string;
  lineweight?: number;
  linetype?: string;
  dashArray?: number[];
}

export interface BgText {
  layer: string;
  x: number;
  y: number;
  text: string;
  size: number;
  rotation?: number;
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'middle' | 'bottom' | 'baseline';
  color?: string;
  fontFamily?: string;
  isMultiLine?: boolean;
}

export interface BgFilled {
  layer: string;
  loops: number[][];
  color?: string;
  pattern?: 'solid';
}

export interface BackgroundDrawing {
  source: { fileName: string; importedAt: string; fileType: 'DWG' | 'DXF' | 'DGN' };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: BgLayer[];
  paths: BgPath[];
  texts: BgText[];
  filled: BgFilled[];
}
```

**주의:** `source.fileType` 에 `'DGN'` 을 추가했다(원본은 `'DWG' | 'DXF'`). 이 유니온이 넓어지지 않으면 Task 5가 컴파일되지 않는다.

- [ ] **Step 2: core 진입점에 export 추가**

`packages/core/src/index.ts` 끝에 한 줄 추가:

```ts
export * from './canvas/backgroundTypes.js';
```

- [ ] **Step 3: core 빌드**

Run: `npm run build -w @twin/core`
Expected: 성공. 실패하면 `.js` 확장자 누락을 먼저 의심한다(ESM 규약).

- [ ] **Step 4: 프론트 소비처를 core 로 전환하고 옛 파일 삭제**

`frontend/src/v2/canvas/backgroundRenderer.ts:3` 을 수정:

```ts
import type { BackgroundDrawing, BgFilled, BgLayer, BgPath, BgText } from '@twin/core';
```

같은 파일 156번째 줄의 재수출도 유지한다(소비처가 `backgroundRenderer` 경유로도 타입을 가져올 수 있어야 한다):

```ts
export type { BackgroundDrawing, BgLayer, BgPath, BgText, BgFilled };
```

`frontend/src/v2/types.ts:27` 을 수정:

```ts
  backgroundDrawing?: import('@twin/core').BackgroundDrawing | null;
```

그다음 `frontend/src/v2/canvas/backgroundTypes.ts` 를 삭제한다.

- [ ] **Step 5: 타입 재정의 금지 가드레일 추가**

`backend/src/v2/__tests__/guardrail.test.ts` 에 아래 테스트를 추가한다. 이 파일의 기존 헬퍼(파일 수집 방식)를 그대로 따르되, 파일 상단의 기존 import 를 재사용한다:

```ts
it('BackgroundDrawing 타입은 @twin/core 에만 정의된다 (복제 금지)', () => {
  // 백엔드/프론트에 같은 타입을 다시 선언하면 두 정의가 조용히 갈라진다.
  // 허용된 정의처: packages/core/src/canvas/backgroundTypes.ts 단 하나.
  const offenders: string[] = [];
  for (const file of collectSourceFiles()) {
    if (file.endsWith('packages/core/src/canvas/backgroundTypes.ts')) continue;
    const src = readFileSync(file, 'utf8');
    if (/(?:interface|type)\s+BackgroundDrawing\b/.test(src)) offenders.push(file);
  }
  expect(offenders).toEqual([]);
});
```

`collectSourceFiles()` 와 `readFileSync` 가 이 파일에 이미 있는지 확인하고, 이름이 다르면 **기존 이름을 그대로 쓴다**(새 헬퍼를 만들지 않는다).

- [ ] **Step 6: 전체 검증**

Run: `npm run build && npm test -w backend && npm test -w frontend`
Expected: 전부 PASS. 이 태스크는 순수 이동이므로 **거동 변화가 0**이어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "refactor(core): BackgroundDrawing 타입을 @twin/core 로 이동 + 복제 금지 가드"
```

---

## Task 2: DWG/DXF 파서 이식 + 디스패치

구 파서 `backend/src/services/dwgImport.service.ts`(1,119줄, 커밋 `0fc01c63` 에서 삭제)를 **순수 함수로** 되살린다.

**Files:**
- Create: `backend/src/v2/background/dwg.ts`
- Create: `backend/src/v2/background/parse.ts`
- Create: `backend/src/v2/__tests__/fixtures/plan-sample.dwg` (기존 `plan/A08평면도B1.dwg` 복사)
- Create: `backend/src/v2/__tests__/background.parse.test.ts`
- Modify: `backend/package.json` (`@mlightcad/libredwg-web` 재추가)

**Interfaces:**
- Consumes: `@twin/core` 의 `BackgroundDrawing`, `BgLayer`, `BgPath`, `BgText`, `BgFilled`
- Produces:
  - `parseDwg(buffer: Buffer, fileType: 'DWG' | 'DXF', fileName: string): Promise<BackgroundDrawing>`
  - `parseBackground(buffer: Buffer, fileName: string): Promise<BackgroundDrawing>`

- [ ] **Step 1: 구 파서 원본을 확보**

```bash
git show 0fc01c63~1:backend/src/services/dwgImport.service.ts > /tmp/old-dwg.ts
wc -l /tmp/old-dwg.ts   # 1119 줄이어야 한다
```

- [ ] **Step 2: 의존성 재추가**

```bash
npm install @mlightcad/libredwg-web -w backend
```

- [ ] **Step 3: 실패하는 테스트를 먼저 작성**

`backend/src/v2/__tests__/fixtures/` 디렉터리를 만들고 픽스처를 복사한다:

```bash
mkdir -p backend/src/v2/__tests__/fixtures
cp "plan/A08평면도B1.dwg" backend/src/v2/__tests__/fixtures/plan-sample.dwg
```

`backend/src/v2/__tests__/background.parse.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBackground } from '../background/parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

describe('parseBackground — DWG', () => {
  it('실제 평면도 DWG 를 파싱해 레이어·경로·bounds 를 만든다', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'plan-sample.dwg');

    expect(bg.source.fileType).toBe('DWG');
    expect(bg.source.fileName).toBe('plan-sample.dwg');
    expect(bg.layers.length).toBeGreaterThan(0);
    expect(bg.paths.length).toBeGreaterThan(0);

    // bounds 는 유한값이고 폭·높이가 양수여야 한다.
    for (const v of [bg.bounds.minX, bg.bounds.minY, bg.bounds.maxX, bg.bounds.maxY]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(bg.bounds.maxX).toBeGreaterThan(bg.bounds.minX);
    expect(bg.bounds.maxY).toBeGreaterThan(bg.bounds.minY);

    // 모든 path 의 points 는 (x,y) 쌍이므로 길이가 짝수이고 최소 2점이다.
    for (const p of bg.paths) {
      expect(p.points.length % 2).toBe(0);
      expect(p.points.length).toBeGreaterThanOrEqual(4);
    }

    // 모든 path.layer 는 선언된 레이어 목록에 있어야 한다(고아 레이어 참조 금지).
    const names = new Set(bg.layers.map((l) => l.name));
    for (const p of bg.paths) expect(names.has(p.layer)).toBe(true);
  });

  it('층 도면은 실척이므로 cm 규모다 — 폭이 100cm 이상 100만cm 이하', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'plan-sample.dwg');
    const width = bg.bounds.maxX - bg.bounds.minX;
    expect(width).toBeGreaterThan(100);
    expect(width).toBeLessThan(1_000_000);
  });
});

describe('parseBackground — 디스패치', () => {
  it('미지원 확장자는 UNSUPPORTED_FORMAT 과 함께 DXF 변환을 안내한다', async () => {
    await expect(parseBackground(Buffer.from('x'), 'drawing.pdf')).rejects.toMatchObject({
      status: 400,
      code: 'UNSUPPORTED_FORMAT',
    });
    await expect(parseBackground(Buffer.from('x'), 'drawing.pdf')).rejects.toThrow(/DXF/);
  });

  it('확장자 판정은 대소문자를 무시한다', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'PLAN-SAMPLE.DWG');
    expect(bg.source.fileType).toBe('DWG');
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npm test -w backend -- background.parse`
Expected: FAIL — `Cannot find module '../background/parse.js'`

- [ ] **Step 5: 파서를 이식한다**

`/tmp/old-dwg.ts` 를 `backend/src/v2/background/dwg.ts` 로 옮기되 **다음만 바꾼다**:

1. **삭제할 import 2개**: `import prisma from '../config/prisma.js';`, `import { NotFoundError, ValidationError } from '../utils/errors.js';`
2. **추가할 import**: `import { HttpError } from '../errors.js';` 와 `import type { BackgroundDrawing, BgFilled, BgLayer, BgPath, BgText } from '@twin/core';`
3. **타입 선언 삭제**: 파일 안에 있던 `BgLayer`·`BgPath`·`BgText`·`BgFilled`·`BackgroundDrawing` **인터페이스 선언을 전부 지운다**(Task 1 가드레일이 이를 강제한다). `@twin/core` 에서 import 한다
4. **`ImportMode`·`ImportOptions`·`ImportResult` 삭제** — 단일 임포트로 확정했으므로 죽은 옵션이다
5. **`ValidationError` 사용처 → `HttpError`**: `throw new ValidationError('도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)')` 를 `throw new HttpError(400, 'PARSE_FAILED', '도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)')` 로 바꾼다
6. **클래스 → 순수 함수**: `class DwgImportService { async importToFloor(floorId, fileName, fileBuffer, options) {...} }` 와 `export const dwgImportService = new DwgImportService();` 를 없애고, 그 본문을 아래 시그니처의 최상위 함수로 만든다:

```ts
export async function parseDwg(
  buffer: Buffer,
  fileType: 'DWG' | 'DXF',
  fileName: string,
): Promise<BackgroundDrawing> {
  // (구 importToFloor 본문에서 아래를 제거한 나머지)
  //  - prisma.floor.findUnique / NotFoundError 블록 → 삭제 (라우트가 층을 검증한다)
  //  - fileType 재계산 → 삭제 (인자로 받는다)
  //  - layerFilter / includeLayer (구 4단계) → 삭제, 모든 레이어를 포함한다
  //  - 마지막의 floor 저장 로직 → 삭제, BackgroundDrawing 을 return 한다
}
```

`source` 필드는 이 함수에서 만든다:

```ts
  const source = { fileName, importedAt: new Date().toISOString(), fileType };
```

7. **WASM 경로 해석 블록과 그 주석을 반드시 그대로 옮긴다.** 파일 상단의 `createRequire` + `WASM_DIR` 블록이다. 이건 실제로 겪은 배포 함정 두 가지의 해결책이라 주석까지 보존한다:
   - dist/src 경로 차이로 고정 상대경로가 컨테이너에서 `/` 로 해석되는 문제
   - libredwg-web 의 `exports` 허용목록이 `<pkg>/package.json` 직접 resolve 를 막는 문제(`ERR_PACKAGE_PATH_NOT_EXPORTED`)

   단, 새 위치가 `src/v2/background/` 로 한 단계 더 깊어졌지만 **이 블록은 패키지 main 엔트리 기준으로 해석하므로 경로 수정이 필요 없다.** 상대경로로 바꾸지 말 것.

- [ ] **Step 6: 디스패치를 만든다**

`backend/src/v2/background/parse.ts`:

```ts
import path from 'node:path';
import type { BackgroundDrawing } from '@twin/core';
import { HttpError } from '../errors.js';
import { parseDwg } from './dwg.js';

/**
 * 확장자 → 파서 디스패치. **확장자를 판정하는 유일한 지점**이다.
 * 포맷이 늘어도 여기 분기 하나와 파서 모듈 하나만 추가된다.
 */
export async function parseBackground(
  buffer: Buffer,
  fileName: string,
): Promise<BackgroundDrawing> {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.dwg':
      return parseDwg(buffer, 'DWG', fileName);
    case '.dxf':
      return parseDwg(buffer, 'DXF', fileName);
    default:
      throw new HttpError(
        400,
        'UNSUPPORTED_FORMAT',
        `${ext || '알 수 없는 형식'} 는 지원하지 않습니다. CAD 프로그램에서 DXF로 내보낸 뒤 올려주세요`,
      );
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test -w backend -- background.parse`
Expected: PASS (4개)

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(background): DWG/DXF 파서 이식(순수 함수) + 확장자 디스패치"
```

---

## Task 3: 업로드·삭제 엔드포인트

**Files:**
- Create: `backend/src/v2/background.routes.ts`
- Modify: `backend/src/v2/router.ts`
- Create: `backend/src/v2/__tests__/background.routes.test.ts`

**Interfaces:**
- Consumes: `parseBackground(buffer, fileName)` (Task 2)
- Produces: `POST /api/v2/floors/:id/background`, `DELETE /api/v2/floors/:id/background`

- [ ] **Step 1: 실패하는 테스트를 먼저 작성**

`backend/src/v2/__tests__/background.routes.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';
import { nextDb } from '../db.js';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dwg = fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-sample.dwg'));

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };

// 스윕 prefix 규약: helpers.ts 의 nameStartsWith 에 't6-bg-' 를 추가해야 회수된다.
const PREFIX = 't6-bg-';
let floorId = '';

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${PREFIX}hq` } });
  const br = await nextDb.branch.create({ data: { name: `${PREFIX}br`, headquartersId: hq.id } });
  const ss = await nextDb.substation.create({ data: { name: `${PREFIX}ss`, branchId: br.id } });
  const fl = await nextDb.floor.create({ data: { name: `${PREFIX}1F`, substationId: ss.id } });
  floorId = fl.id;
});

afterAll(async () => {
  await sweepTestFixtures();
});

describe('POST /api/v2/floors/:id/background', () => {
  it('관리자가 DWG 를 올리면 파싱 결과가 층에 저장되고 갱신된 층이 반환된다', async () => {
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(200);

    expect(res.body.id).toBe(floorId);
    expect(res.body.backgroundDrawing).toBeTruthy();
    expect(res.body.backgroundDrawing.source.fileType).toBe('DWG');
    expect(res.body.backgroundDrawing.paths.length).toBeGreaterThan(0);

    // DB 에 실제로 저장되었는지 확인한다(응답만 맞고 저장이 빠지는 실수 방지).
    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    expect(row?.backgroundDrawing).toBeTruthy();
  });

  it('미지원 확장자는 400 UNSUPPORTED_FORMAT', async () => {
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'drawing.pdf' })
      .expect(400);
    expect(res.body.error).toBe('UNSUPPORTED_FORMAT');
    expect(res.body.message).toMatch(/DXF/);
  });

  it('없는 층은 404', async () => {
    const res = await request(app)
      .post('/api/v2/floors/00000000-0000-0000-0000-000000000000/background')
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('비관리자는 403', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(viewer)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(403);
  });

  it('미인증은 401', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(401);
  });
});

describe('DELETE /api/v2/floors/:id/background', () => {
  it('배경을 제거하면 null 이 되고 갱신된 층이 반환된다', async () => {
    await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dwg, { filename: 'plan-sample.dwg' })
      .expect(200);

    const res = await request(app)
      .delete(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .expect(200);

    expect(res.body.backgroundDrawing).toBeNull();
    const row = await nextDb.floor.findUnique({ where: { id: floorId } });
    expect(row?.backgroundDrawing).toBeNull();
  });

  it('비관리자는 403', async () => {
    await request(app).delete(`/api/v2/floors/${floorId}/background`).set(viewer).expect(403);
  });
});
```

- [ ] **Step 2: 스윕 prefix 등록**

`backend/src/v2/__tests__/helpers.ts` 의 `sweepTestFixtures()` 안 `nameStartsWith` 배열에 `'t6-bg-'` 를 추가한다:

```ts
  const nameStartsWith = ['t4-cb-', 't2a-', 't5-rc-', 't6-bg-'];
```

이걸 빠뜨리면 픽스처 조직이 DB에 영구히 쌓인다.

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -w backend -- background.routes`
Expected: FAIL — 404 (라우트 없음)

- [ ] **Step 4: 라우터 구현**

`backend/src/v2/background.routes.ts`:

```ts
/**
 * v2 층 배경 도면 임포트 라우트.
 *
 * 층은 조직(org) 엔티티이고 조직 편집은 즉시 쓰기다 — 배경 도면도 워킹카피
 * 커밋 채널을 거치지 않는다(사진과 다른 점: 사진은 자산에 속한 레코드라
 * 자산 편집 세션과 함께 움직여야 했지만, 배경은 층의 속성이다).
 * 참고: docs/superpowers/specs/2026-08-03-background-drawing-import-design.md §4
 *
 * org.routes.ts 에 넣지 않은 이유: 그 파일은 4종 조직의 일반 CRUD 스켈레톤이라
 * multipart 파싱 엔드포인트를 끼우면 대칭이 깨진다.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { authenticate, adminOnly } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { parseBackground } from './background/parse.js';

export const backgroundRouter = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 원본 파일은 보관하지 않는다(재파싱·다운로드 요구 없음) — 메모리에서 파싱하고 버린다.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

/** multer 오류를 v2 HttpError 계약으로 옮긴다. */
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, 'FILE_TOO_LARGE', '도면 파일은 50MB 이하만 올릴 수 있습니다'));
        return;
      }
      next(new HttpError(400, 'INVALID_UPLOAD', '파일 업로드에 실패했습니다'));
      return;
    }
    next(err);
  });
}

backgroundRouter.post(
  '/floors/:id/background',
  authenticate,
  adminOnly,
  uploadSingle,
  async (req, res, next) => {
    try {
      const floor = await nextDb.floor.findUnique({ where: { id: req.params.id } });
      if (!floor) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');

      const file = req.file;
      if (!file) throw new HttpError(400, 'INVALID_UPLOAD', '도면 파일이 없습니다');

      const drawing = await parseBackground(file.buffer, file.originalname);
      const updated = await nextDb.floor.update({
        where: { id: floor.id },
        data: { backgroundDrawing: drawing as unknown as object },
      });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

backgroundRouter.delete('/floors/:id/background', authenticate, adminOnly, async (req, res, next) => {
  try {
    const floor = await nextDb.floor.findUnique({ where: { id: req.params.id } });
    if (!floor) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');
    const updated = await nextDb.floor.update({
      where: { id: floor.id },
      data: { backgroundDrawing: null },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 5: 라우터 등록**

`backend/src/v2/router.ts` 에 import 와 마운트를 추가한다:

```ts
import { backgroundRouter } from './background.routes.js';
```

```ts
v2Router.use('/', backgroundRouter);
```

마운트 위치는 `orgRouter` 줄 바로 위에 둔다(경로가 `/floors/...` 로 겹치지 않으므로 순서는 무관하지만 조직 관련끼리 모은다).

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -w backend -- background.routes`
Expected: PASS (7개)

- [ ] **Step 7: 전체 백엔드 스위트**

Run: `npm test -w backend`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(background): 층 배경 업로드/삭제 엔드포인트"
```

---

## Task 4: 프론트엔드 임포트 UI

이 태스크가 끝나면 **DWG/DXF 임포트가 사용자에게 완결된 기능**이 된다.

**Files:**
- Modify: `frontend/src/v2/api.ts`
- Modify: `frontend/src/v2/components/FloorPlanView.tsx` (층 탭 바 ~1007행)
- Create: `frontend/src/v2/components/__tests__/FloorPlanView.background.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v2/floors/:id/background`, `DELETE /api/v2/floors/:id/background` (Task 3)
- Produces: `uploadBackground(floorId: string, file: File): Promise<V2Floor>`, `deleteBackground(floorId: string): Promise<V2Floor>`

- [ ] **Step 1: CONVENTIONS.md 를 읽는다**

Run: `cat frontend/src/components/ui/CONVENTIONS.md`

버튼은 공용 `Button`·`IconButton` 을 쓴다. 일회용 `<button className>` 을 새로 만들지 않는다. 타이포는 `text-xs` 미만 금지.

- [ ] **Step 2: API 함수 추가**

`frontend/src/v2/api.ts` 에 추가한다. `uploadPhoto` 바로 아래에 두고, `Content-Type: undefined` 관례와 그 이유 주석을 동일하게 적용한다:

```ts
export async function uploadBackground(floorId: string, file: File): Promise<V2Floor> {
  const formData = new FormData();
  formData.append('file', file);
  // Content-Type을 명시하지 않는다 — 브라우저가 multipart boundary를 채워야 하는데,
  // httpClient 인스턴스 기본 헤더가 application/json이라 여기서 undefined로 덮어써
  // axios가 FormData를 JSON으로 오인(stringify)하지 않도록 한다.
  return (await api.post(`/v2/floors/${floorId}/background`, formData, {
    headers: { 'Content-Type': undefined },
  })).data;
}

export async function deleteBackground(floorId: string): Promise<V2Floor> {
  return (await api.delete(`/v2/floors/${floorId}/background`)).data;
}
```

`V2Floor` 가 이 파일에서 import 되어 있지 않으면 `import type { V2Floor } from './types';` 를 추가한다.

- [ ] **Step 3: 실패하는 테스트를 먼저 작성**

`frontend/src/v2/components/__tests__/FloorPlanView.background.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api', async (orig) => ({
  ...(await orig<typeof import('../../api')>()),
  uploadBackground: vi.fn(),
  deleteBackground: vi.fn(),
}));

import * as api from '../../api';

// FloorPlanView 는 캔버스와 스토어에 의존한다. 기존 FloorPlanView 테스트 파일의
// 렌더 헬퍼·스토어 시드 방식을 그대로 재사용한다 — 새 하네스를 만들지 않는다.
import { renderFloorPlanView, seedFloors } from './FloorPlanView.harness';

describe('FloorPlanView — 배경 도면 임포트', () => {
  beforeEach(() => vi.clearAllMocks());

  it('관리자에게 배경 임포트 버튼이 보인다', async () => {
    seedFloors([{ id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null }]);
    renderFloorPlanView({ role: 'admin' });
    expect(await screen.findByTestId('background-import-button')).toBeInTheDocument();
  });

  it('비관리자에게는 보이지 않는다', async () => {
    seedFloors([{ id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null }]);
    renderFloorPlanView({ role: 'viewer' });
    await screen.findByText('1F');
    expect(screen.queryByTestId('background-import-button')).not.toBeInTheDocument();
  });

  it('파일을 고르면 활성 층 id 로 업로드한다', async () => {
    seedFloors([{ id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null }]);
    vi.mocked(api.uploadBackground).mockResolvedValue({
      id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null,
    } as never);
    renderFloorPlanView({ role: 'admin' });

    const input = await screen.findByTestId('background-import-input');
    await userEvent.upload(input, new File(['x'], 'plan.dwg'));

    await waitFor(() => expect(api.uploadBackground).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.uploadBackground).mock.calls[0][0]).toBe('f1');
  });

  it('업로드 실패 메시지를 표시한다', async () => {
    seedFloors([{ id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null }]);
    vi.mocked(api.uploadBackground).mockRejectedValue({
      response: { data: { error: 'UNSUPPORTED_FORMAT', message: '.pdf 는 지원하지 않습니다' } },
    });
    renderFloorPlanView({ role: 'admin' });

    const input = await screen.findByTestId('background-import-input');
    await userEvent.upload(input, new File(['x'], 'plan.pdf'));

    expect(await screen.findByText(/지원하지 않습니다/)).toBeInTheDocument();
  });

  it('배경이 없는 층에는 제거 버튼이 없고, 있는 층에만 나온다', async () => {
    seedFloors([{ id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: null }]);
    const { rerenderWithFloors } = renderFloorPlanView({ role: 'admin' });
    await screen.findByTestId('background-import-button');
    expect(screen.queryByTestId('background-remove-button')).not.toBeInTheDocument();

    rerenderWithFloors([
      { id: 'f1', name: '1F', sortOrder: 0, backgroundDrawing: { source: {}, bounds: {}, layers: [], paths: [], texts: [], filled: [] } },
    ]);
    expect(await screen.findByTestId('background-remove-button')).toBeInTheDocument();
  });
});
```

**주의:** `FloorPlanView.harness` 는 기존 FloorPlanView 테스트가 쓰는 렌더 헬퍼를 가리킨다. `frontend/src/v2/components/__tests__/` 에서 기존 FloorPlanView 테스트 파일을 먼저 읽고, **거기 있는 렌더 방식·스토어 시드 방식을 그대로 재사용**한다. 헬퍼가 인라인이면 그 파일에서 export 하거나 위 import 를 실제 방식으로 대체한다. 새 하네스를 만들지 않는다.

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test -w frontend -- FloorPlanView.background`
Expected: FAIL — `background-import-button` 을 찾지 못함

- [ ] **Step 5: 층 탭 바에 트리거 추가**

`frontend/src/v2/components/FloorPlanView.tsx` 의 층 탭 바(약 1007행, `floors.length === 0 ? ... : floors.map(...)` 블록)가 있는 컨테이너에 버튼을 붙인다.

컴포넌트 상단에 상태를 추가한다:

```tsx
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
```

핸들러:

```tsx
  async function handleBackgroundFile(e: React.ChangeEvent<HTMLInputElement>) {
    // 프로젝트 관례: 비동기 이전에 e.currentTarget 을 먼저 읽는다.
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = ''; // 같은 파일 재선택 허용
    if (!file || activeFloorId == null) return;
    setBgError(null);
    setBgBusy(true);
    try {
      await uploadBackground(activeFloorId, file);
      await queryClient.invalidateQueries({ queryKey: workingCopyQueryKey });
    } catch (err) {
      setBgError(apiErrorMessage(err, '배경 도면 임포트에 실패했습니다'));
    } finally {
      setBgBusy(false);
    }
  }

  async function handleBackgroundRemove() {
    if (activeFloorId == null) return;
    setBgError(null);
    setBgBusy(true);
    try {
      await deleteBackground(activeFloorId);
      await queryClient.invalidateQueries({ queryKey: workingCopyQueryKey });
    } catch (err) {
      setBgError(apiErrorMessage(err, '배경 도면 제거에 실패했습니다'));
    } finally {
      setBgBusy(false);
    }
  }
```

`queryClient` 와 `workingCopyQueryKey` 는 **이 파일 또는 형제 컴포넌트가 이미 쓰는 것을 그대로 쓴다.** 워킹카피 쿼리 키를 새로 만들지 말고, 기존 워킹카피 로딩 코드에서 사용 중인 키/무효화 방식을 찾아 동일하게 호출한다.

탭 바 JSX (관리자에게만):

```tsx
        {isAdmin && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={bgBusy || activeFloorId == null}
              data-testid="background-import-button"
              onClick={() => backgroundInputRef.current?.click()}
            >
              {bgBusy ? '임포트 중…' : '배경 임포트'}
            </Button>
            <input
              ref={backgroundInputRef}
              type="file"
              accept=".dwg,.dxf"
              className="hidden"
              data-testid="background-import-input"
              onChange={handleBackgroundFile}
            />
            {activeFloor?.backgroundDrawing && (
              <Button
                variant="secondary"
                size="sm"
                disabled={bgBusy}
                data-testid="background-remove-button"
                onClick={handleBackgroundRemove}
              >
                배경 제거
              </Button>
            )}
          </>
        )}
        {bgError && <p className="text-xs text-danger">{bgError}</p>}
```

`isAdmin` 은 이 파일이 이미 쓰는 권한 판정을 재사용한다. 없으면 인증 스토어에서 가져오되 **새 판정 로직을 만들지 않는다** — 다른 컴포넌트의 관리자 판정과 같은 방식을 쓴다.

import 추가:

```tsx
import { deleteBackground, uploadBackground } from '../api';
import { apiErrorMessage } from '../apiError';
import { Button } from '../../components/ui';
```

**`accept` 는 지금 `.dwg,.dxf` 다.** Task 7에서 `.dgn` 을 추가한다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -w frontend -- FloorPlanView.background`
Expected: PASS (5개)

- [ ] **Step 7: 전체 프론트 스위트 + 빌드**

Run: `npm test -w frontend && npm run build`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(background): 층 탭 바 배경 임포트/제거 UI"
```

---

## Task 5: DGN Rust 크레이트 + WASM 빌드 파이프라인

이 태스크는 **빌드 파이프라인과 좌표/직렬화 기계**를 세운다. 엔티티는 `Line` 하나만 처리한다 — 나머지는 Task 6.

**Files:**
- Create: `crates/dgn-background/Cargo.toml`
- Create: `crates/dgn-background/src/lib.rs`
- Create: `crates/dgn-background/README.md`
- Create: `backend/src/v2/background/dgn.ts`
- Create: `backend/src/v2/__tests__/fixtures/test_dgnv8.dgn`
- Create: `backend/src/v2/__tests__/fixtures/README.md`
- Create: `backend/src/v2/__tests__/background.dgn.test.ts`
- Commit: `backend/src/v2/background/wasm/*` (wasm-pack 산출물)
- Modify: `.gitignore` (wasm 산출물이 무시되지 않도록 확인)

**Interfaces:**
- Produces: `parseDgn(buffer: Buffer, fileName: string): Promise<BackgroundDrawing>`
- Produces (Rust): `dgn_to_background(bytes: &[u8]) -> Result<String, JsValue>` — `BackgroundDrawing` JSON

- [ ] **Step 1: Rust 툴체인과 wasm-pack 을 확인/설치**

```bash
rustc --version   # 1.83 이상. 없으면:
#   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
rustup target add wasm32-unknown-unknown
cargo install wasm-pack   # 이미 있으면 생략
```

- [ ] **Step 2: 픽스처를 내려받아 커밋**

```bash
mkdir -p backend/src/v2/__tests__/fixtures
curl -sSL -o backend/src/v2/__tests__/fixtures/test_dgnv8.dgn \
  https://raw.githubusercontent.com/OSGeo/gdal/18e7cceb43a0dd58be474c9fdd5384baa3cde7c9/autotest/ogr/data/dgnv8/test_dgnv8.dgn
shasum -a 256 backend/src/v2/__tests__/fixtures/test_dgnv8.dgn
# 8f32f87ce4b16881aa64f5cb9f75c98851833f96fef37ca0ad31aa6bb18d1df0 이어야 한다
```

`backend/src/v2/__tests__/fixtures/README.md` 를 작성한다:

```markdown
# 테스트 픽스처

| 파일 | 출처 | SHA-256 |
|---|---|---|
| `plan-sample.dwg` | 저장소 내 `plan/A08평면도B1.dwg` (AC1018 / AutoCAD 2004) | — |
| `test_dgnv8.dgn` | OSGeo/GDAL `autotest/ogr/data/dgnv8/test_dgnv8.dgn`, 커밋 `18e7cceb43a0dd58be474c9fdd5384baa3cde7c9` | `8f32f87ce4b16881aa64f5cb9f75c98851833f96fef37ca0ad31aa6bb18d1df0` |

GDAL 배포본의 일반 라이선스는 MIT 계열이다. 원본 바이트를 변경 없이 배치했다.
```

- [ ] **Step 3: 실패하는 테스트를 먼저 작성**

`backend/src/v2/__tests__/background.dgn.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDgn } from '../background/dgn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dgn = fs.readFileSync(path.join(__dirname, 'fixtures', 'test_dgnv8.dgn'));

describe('parseDgn — WASM 파이프라인', () => {
  it('커밋된 wasm 산출물로 V8 파일을 파싱한다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');

    expect(bg.source.fileType).toBe('DGN');
    expect(bg.source.fileName).toBe('test_dgnv8.dgn');
    expect(bg.paths.length).toBeGreaterThan(0);
  });

  it('레이어 이름은 level 번호로 합성된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.layers.map((l) => l.name)).toContain('Level 64');
    for (const l of bg.layers) expect(l.isVisible).toBe(true);
  });

  it('모든 path.layer 는 선언된 레이어 목록에 있다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const names = new Set(bg.layers.map((l) => l.name));
    for (const p of bg.paths) expect(names.has(p.layer)).toBe(true);
  });

  it('bounds 가 유한값이고 points 는 짝수 길이다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    for (const v of [bg.bounds.minX, bg.bounds.minY, bg.bounds.maxX, bg.bounds.maxY]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const p of bg.paths) expect(p.points.length % 2).toBe(0);
  });

  it('손상된 바이트는 PARSE_FAILED 로 거절한다', async () => {
    await expect(parseDgn(Buffer.from('not a dgn'), 'bad.dgn')).rejects.toMatchObject({
      status: 400,
      code: 'PARSE_FAILED',
    });
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test -w backend -- background.dgn`
Expected: FAIL — `Cannot find module '../background/dgn.js'`

- [ ] **Step 5: Rust 크레이트를 만든다**

`crates/dgn-background/Cargo.toml`:

```toml
[package]
name = "dgn-background"
version = "0.1.0"
edition = "2021"
rust-version = "1.83"

[lib]
crate-type = ["cdylib"]

[dependencies]
ezdgn-core = { git = "https://github.com/monozukuri-ai/ezdgn", rev = "a7ca903d383dfb88b5b62c1535a38f21e093d848" }
wasm-bindgen = "0.2"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
```

`crates/dgn-background/src/lib.rs`:

```rust
//! DGN v8 → BackgroundDrawing JSON.
//!
//! WASM 경계는 함수 하나다. 파싱·엔티티 순회·좌표 변환·bounds 계산·직렬화를
//! 전부 여기서 끝내고 JSON 문자열 하나만 반환한다 — 객체 그래프를 경계 밖으로
//! 넘기지 않으므로 바인딩 코드가 사실상 없다.
//!
//! 관례(스펙 §4): 1 canvas unit = 1 cm, Y축 뒤집기, BYLEVEL 대체색 #404040.

use ezdgn_core::{read_v8, V8Document, V8ElementData};
use std::collections::BTreeSet;
use wasm_bindgen::prelude::*;

/// master unit → cm 배율. ezdgn 이 master 단위로 좌표를 주므로
/// 모델 메타데이터의 단위명을 보고 cm 로 환산한다.
fn master_to_cm(unit: &str) -> f64 {
    match unit.trim().to_ascii_lowercase().as_str() {
        "m" | "meter" | "metre" | "meters" | "metres" => 100.0,
        "cm" | "centimeter" | "centimetre" => 1.0,
        "mm" | "millimeter" | "millimetre" => 0.1,
        "km" => 100_000.0,
        "in" | "inch" | "inches" => 2.54,
        "ft" | "foot" | "feet" => 30.48,
        _ => 100.0, // 미지 단위는 m 로 간주한다(DGN 기본 master unit).
    }
}

/// DGN line_weight(0..31) → cm. 구 DWG 파서의 환산과 같은 규모를 쓴다.
fn weight_to_cm(w: u32) -> f64 {
    // 0 = 가장 얇은 선. 1 단계당 0.0025 cm(=0.025 mm).
    (w.min(31) as f64) * 0.0025
}

/// 좌표 누적기 — bounds 를 방출 좌표에서 계산한다.
struct Bounds {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

impl Bounds {
    fn new() -> Self {
        Bounds { min_x: f64::INFINITY, min_y: f64::INFINITY, max_x: f64::NEG_INFINITY, max_y: f64::NEG_INFINITY }
    }
    fn add(&mut self, x: f64, y: f64) {
        if x < self.min_x { self.min_x = x; }
        if y < self.min_y { self.min_y = y; }
        if x > self.max_x { self.max_x = x; }
        if y > self.max_y { self.max_y = y; }
    }
    fn finish(&self) -> (f64, f64, f64, f64) {
        if self.min_x > self.max_x {
            (0.0, 0.0, 0.0, 0.0) // 도형이 하나도 없을 때
        } else {
            (self.min_x, self.min_y, self.max_x, self.max_y)
        }
    }
}

fn num(v: f64) -> String {
    if v.is_finite() { format!("{:.4}", v) } else { "0".to_string() }
}

#[wasm_bindgen]
pub fn dgn_to_background(bytes: &[u8]) -> Result<String, JsValue> {
    let doc: V8Document =
        read_v8(bytes, Default::default()).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut bounds = Bounds::new();
    let mut levels: BTreeSet<u32> = BTreeSet::new();
    let mut paths: Vec<String> = Vec::new();

    for model in &doc.models {
        let scale = master_to_cm(&model.metadata.master_unit);
        for e in &model.elements {
            let level = e.common.level;
            // 좌표: master → cm, Y 뒤집기.
            let mut pts: Vec<(f64, f64)> = Vec::new();
            if let V8ElementData::Line { start, end } = &e.data {
                pts.push((start.master.0 * scale, -start.master.1 * scale));
                pts.push((end.master.0 * scale, -end.master.1 * scale));
            }
            if pts.len() < 2 {
                continue;
            }
            levels.insert(level);
            let mut flat: Vec<String> = Vec::with_capacity(pts.len() * 2);
            for (x, y) in &pts {
                bounds.add(*x, *y);
                flat.push(num(*x));
                flat.push(num(*y));
            }
            paths.push(format!(
                "{{\"layer\":\"Level {}\",\"points\":[{}],\"lineweight\":{}}}",
                level,
                flat.join(","),
                num(weight_to_cm(e.common.line_weight))
            ));
        }
    }

    let layers: Vec<String> = levels
        .iter()
        .map(|l| {
            format!(
                "{{\"name\":\"Level {}\",\"color\":\"#404040\",\"lineweight\":0.02,\"linetype\":\"solid\",\"isVisible\":true}}",
                l
            )
        })
        .collect();

    let (min_x, min_y, max_x, max_y) = bounds.finish();
    Ok(format!(
        "{{\"bounds\":{{\"minX\":{},\"minY\":{},\"maxX\":{},\"maxY\":{}}},\
          \"layers\":[{}],\"paths\":[{}],\"texts\":[],\"filled\":[]}}",
        num(min_x), num(min_y), num(max_x), num(max_y),
        layers.join(","), paths.join(",")
    ))
}
```

**JSON 이스케이프는 Task 5에 없다.** 이 태스크가 방출하는 문자열은 전부 `Level {n}` 처럼 생성한 값이라 이스케이프가 필요한 문자가 들어올 수 없다. 파일에서 온 문자열(문자 엔티티)을 방출하는 Task 6에서 이스케이프 함수를 도입한다 — 지금 만들면 미사용 경고만 남는다.

**주의:** `model.metadata.master_unit` · `e.common.level` · `e.common.line_weight` · `start.master` 의 정확한 필드명과 타입은 `ezdgn-core` 판 API 를 따른다. 컴파일 오류가 나면 `cargo doc -p ezdgn-core --open` 또는 크레이트 소스(`~/.cargo/git/checkouts/ezdgn-*/`)의 `crates/ezdgn-core/src/v8/entity.rs` 에서 실제 정의를 확인해 맞춘다. `V8Point.master` 는 3D 좌표이므로 x·y 접근 방식이 튜플이 아니라 필드일 수 있다.

`source` 는 Rust 가 만들지 않는다 — 파일명·임포트 시각은 TS 쪽이 안다.

- [ ] **Step 6: wasm 빌드 + 산출물 커밋**

```bash
cd crates/dgn-background
wasm-pack build --release --target nodejs --out-dir ../../backend/src/v2/background/wasm
cd ../..
rm -f backend/src/v2/background/wasm/package.json backend/src/v2/background/wasm/.gitignore
ls -la backend/src/v2/background/wasm/
```

`package.json` 을 지우는 이유: 남기면 npm 워크스페이스가 유령 패키지로 인식한다.
`.gitignore` 를 지우는 이유: wasm-pack 이 out-dir 전체를 무시하는 파일을 넣는데, 우리는 **산출물을 커밋해야** 한다.

산출물이 저장소 루트 `.gitignore` 에 걸리지 않는지 확인한다:

```bash
git check-ignore -v backend/src/v2/background/wasm/*.wasm || echo "무시되지 않음 — 정상"
```

- [ ] **Step 7: 재빌드 절차 문서화**

`crates/dgn-background/README.md`:

```markdown
# dgn-background

DGN v8 → `BackgroundDrawing` JSON 변환기. `ezdgn-core`(Rust)를 WASM 으로 감싼다.

## 재빌드

산출물(`backend/src/v2/background/wasm/`)은 **저장소에 커밋되어 있다.** 컨테이너
빌드는 Rust 툴체인도 네트워크도 필요 없다. 이 크레이트나 ezdgn rev 를 바꿨을 때만
아래를 실행하고 산출물을 함께 커밋한다.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
cd crates/dgn-background
wasm-pack build --release --target nodejs --out-dir ../../backend/src/v2/background/wasm
cd ../..
rm -f backend/src/v2/background/wasm/package.json backend/src/v2/background/wasm/.gitignore
```

`package.json` 은 반드시 지운다 — 남기면 npm 워크스페이스가 유령 패키지로 인식한다.

## ezdgn 고정

`Cargo.toml` 이 git rev 를 핀으로 고정한다(`ezdgn-core` 는 crates.io 에 없다).
rev 를 올릴 때는 `backend/src/v2/__tests__/background.dgn.test.ts` 가 통과하는지 확인한다.
```

- [ ] **Step 8: TS 로더를 만든다**

`backend/src/v2/background/dgn.ts`:

```ts
/**
 * DGN v8 파서 — 커밋된 WASM 산출물을 감싼다.
 *
 * WASM 경계는 함수 하나이고 Rust 가 BackgroundDrawing 의 본체(bounds/layers/
 * paths/texts/filled)를 JSON 으로 만들어 준다. 여기서는 파일명·임포트 시각만
 * 얹는다 — 그건 Rust 가 알 수 없는 정보다.
 */
import type { BackgroundDrawing } from '@twin/core';
import { HttpError } from '../errors.js';
import { dgn_to_background } from './wasm/dgn_background.js';

export async function parseDgn(buffer: Buffer, fileName: string): Promise<BackgroundDrawing> {
  let json: string;
  try {
    json = dgn_to_background(buffer);
  } catch (e) {
    throw new HttpError(
      400,
      'PARSE_FAILED',
      '도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)',
      { cause: String(e) },
    );
  }
  const body = JSON.parse(json) as Omit<BackgroundDrawing, 'source'>;
  return {
    source: { fileName, importedAt: new Date().toISOString(), fileType: 'DGN' },
    ...body,
  };
}
```

**주의:** `./wasm/dgn_background.js` 의 실제 파일명은 wasm-pack 이 크레이트 이름에서 만든다(`dgn-background` → `dgn_background`). Step 6 의 `ls` 출력으로 확인해 맞춘다. `HttpError` 의 4번째 인자(details) 시그니처가 다르면 이 프로젝트의 실제 시그니처에 맞춘다.

- [ ] **Step 9: 테스트 통과 확인**

Run: `npm test -w backend -- background.dgn`
Expected: PASS (5개)

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat(background): DGN v8 Rust/WASM 파이프라인 + 좌표·직렬화 기계"
```

---

## Task 6: DGN 엔티티 전체 매핑

Task 5가 `Line` 만 처리했다. 나머지 엔티티와 심볼로지를 채운다.

**Files:**
- Modify: `crates/dgn-background/src/lib.rs`
- Modify: `backend/src/v2/__tests__/background.dgn.test.ts`
- Rebuild: `backend/src/v2/background/wasm/*`

**Interfaces:**
- Consumes/Produces: Task 5와 동일 (`dgn_to_background`, `parseDgn`)

- [ ] **Step 1: 실패하는 테스트를 먼저 추가**

`backend/src/v2/__tests__/background.dgn.test.ts` 에 아래 describe 를 추가한다. 픽스처의 실측값 기준이다(엔티티 34개: LINE 4, TEXT 4, LINE_STRING 2, ELLIPSE 3, ARC 3, SHAPE 2, CELL 2, COMPLEX_CHAIN 3, COMPLEX_SHAPE 3, CURVE 2, BSPLINE_CURVE 2, 그 외 4):

```ts
describe('parseDgn — 엔티티 매핑', () => {
  it('문자를 방출하고 비ASCII 를 보존한다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.texts.length).toBe(4);
    expect(bg.texts.map((t) => t.text)).toContain('myTéxt');
    for (const t of bg.texts) {
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      expect(t.size).toBeGreaterThan(0);
    }
  });

  it('Line 만 있을 때보다 경로가 늘어난다 — LineString·Shape·Arc·Ellipse·복합체가 포함된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    // Line 4개만 처리하던 Task 5 대비 확연히 많아야 한다.
    expect(bg.paths.length).toBeGreaterThan(15);
  });

  it('Shape 은 closed 로 표시된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.paths.some((p) => p.closed === true)).toBe(true);
  });

  it('원호/타원은 테셀레이션되어 다점 경로가 된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    // 부분 원호 12분할 → 13점(26 좌표), 전체 타원 24분할 → 25점(50 좌표).
    expect(bg.paths.some((p) => p.points.length >= 26)).toBe(true);
  });

  it('색상은 팔레트로 변환되고 BYLEVEL(256)은 #404040 로 대체된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const colored = [...bg.paths, ...bg.texts].filter((x) => x.color != null);
    expect(colored.length).toBeGreaterThan(0);
    for (const x of colored) expect(x.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('레벨 1·64 가 모두 레이어로 나온다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const names = bg.layers.map((l) => l.name);
    expect(names).toContain('Level 1');
    expect(names).toContain('Level 64');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w backend -- background.dgn`
Expected: FAIL — `texts.length` 가 0

- [ ] **Step 3: 팔레트 상수를 추가**

`crates/dgn-background/src/lib.rs` 에 MicroStation 기본 256색 팔레트를 정적 배열로 넣는다. 구 DWG 파서가 ACI 팔레트를 상수 테이블로 가진 것과 같은 형태다:

```rust
/// MicroStation 기본 색상표(index 0..255) → RGB.
/// DGN 은 파일마다 색상표를 가질 수 있지만 v8 level/color table 은 미해석이므로
/// 기본 팔레트를 쓴다. 배경 도면 용도에서는 충분하다.
const MS_PALETTE: [[u8; 3]; 256] = [
    [255, 255, 255], [0, 0, 255], [0, 255, 0], [255, 0, 0],
    [255, 255, 0], [255, 0, 255], [0, 255, 255], [0, 0, 0],
    // ... index 8..255
];

fn color_hex(index: u32) -> String {
    if index == 256 {
        return "#404040".to_string(); // BYLEVEL — level 색상표 미해석
    }
    let c = MS_PALETTE[(index as usize).min(255)];
    format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2])
}
```

**팔레트 채우는 법:** 256개 전부를 손으로 적지 말고, ezdgn 파이썬 패키지가 가진 팔레트를 덤프해 생성한다:

```bash
python3 -m venv /tmp/ezdgn-venv && /tmp/ezdgn-venv/bin/pip install -q ezdgn
/tmp/ezdgn-venv/bin/python - <<'PY'
import ezdgn
# ezdgn 이 노출하는 기본 팔레트 접근자를 확인해 256개 RGB 를 뽑는다.
# 노출하지 않으면 index 0..255 에 대해 resolve_color 를 호출해 수집한다.
print([hasattr(ezdgn, n) for n in ('DEFAULT_PALETTE', 'resolve_color')])
PY
```

접근자가 없으면 **인덱스 0..7 만 위 고정값으로 두고 8..255 는 `#404040` 으로 채우되, 그 사실을 주석에 적는다.** 추측한 색을 진짜처럼 넣지 않는다.

- [ ] **Step 4: 엔티티 매핑을 채운다**

`dgn_to_background` 의 엔티티 루프를 확장한다. 스펙 §4 매핑표를 따른다:

```rust
const ARC_SEGMENTS: usize = 12;      // 부분 원호
const CIRCLE_SEGMENTS: usize = 24;   // 전체 원/타원

/// 타원/원호를 폴리라인으로 근사한다. sweep 이 2π 에 가까우면 24분할.
fn tessellate(
    cx: f64, cy: f64, rx: f64, ry: f64, rot: f64, a0: f64, a1: f64,
) -> Vec<(f64, f64)> {
    let sweep = (a1 - a0).abs();
    let segs = if (sweep - std::f64::consts::TAU).abs() < 1e-6 { CIRCLE_SEGMENTS } else { ARC_SEGMENTS };
    let (cr, sr) = (rot.cos(), rot.sin());
    (0..=segs)
        .map(|i| {
            let t = i as f64 / segs as f64;
            let a = a0 + (a1 - a0) * t;
            let (lx, ly) = (rx * a.cos(), ry * a.sin());
            (cx + lx * cr - ly * sr, cy + lx * sr + ly * cr)
        })
        .collect()
}
```

엔티티별 처리:

| ezdgn `V8ElementData` | 처리 |
|---|---|
| `Line { start, end }` | 2점 경로 |
| `LineString { vertices }` | 정점 그대로 |
| `Shape { vertices }` | 정점 그대로 + `closed: true` |
| `Curve { vertices }` · `BSplineCurve` | 제어점을 폴리라인으로 근사(정점 그대로) |
| `Ellipse { primary_axis_master, secondary_axis_master, rotation_radians, center }` | `tessellate(cx, cy, rx, ry, rot, 0, TAU)` |
| `Arc { start_angle_radians, sweep_angle_radians, .., center }` | `tessellate(cx, cy, rx, ry, rot, a0, a0 + sweep)` |
| `Text { origin, text, height_master, rotation_radians, justification }` | `BgText` — 아래 참조 |
| `Cell` · `ComplexChain` · `ComplexShape` | **헤더 자체는 건너뛰고** 자식을 순회한다. `model.children(e)` / `descendants` 로 접근한다 |
| `PointString` · `Dimension` · `SharedCellInstance` | 생략 |

`BgText` 방출. **여기서 처음으로 파일에서 온 문자열을 JSON 에 넣으므로 이스케이프 함수를 도입한다** (Task 5의 문자열은 전부 생성값이라 필요 없었다):

```rust
/// JSON 문자열 이스케이프. 도면의 문자에는 따옴표·역슬래시·제어문자가 들어올 수 있다.
fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}
```

```rust
// Y 를 뒤집으면 회전 부호가 반전된다.
let rotation = -e_rotation_radians.unwrap_or(0.0);
// justification(u16) → hAlign/vAlign.
// MicroStation 은 0..14 를 (좌/중/우) × (하단/중간/상단/베이스라인) 격자로 쓴다.
let h = match justification % 3 { 0 => "left", 1 => "center", _ => "right" };
let v = match justification / 3 { 0 => "bottom", 1 => "middle", 2 => "top", _ => "baseline" };
```

**`justification` 격자 해석이 확실치 않으면 `hAlign`/`vAlign` 을 방출하지 않는다** — 렌더러가 기본값을 쓴다. 틀린 정렬은 없는 정렬보다 나쁘다.

복합체(`Cell`/`ComplexChain`/`ComplexShape`) 순회는 **헤더를 두 번 세지 않도록** 주의한다. `model.elements` 를 순회하면 자식도 그 안에 들어 있으므로, 헤더만 건너뛰고 자식은 자연스럽게 처리된다. `model.entities`(집약 뷰)를 쓰면 자식이 빠진다 — 어느 쪽을 쓰는지 명확히 하고 중복 방출이 없는지 테스트로 확인한다.

- [ ] **Step 5: 재빌드**

```bash
cd crates/dgn-background
wasm-pack build --release --target nodejs --out-dir ../../backend/src/v2/background/wasm
cd ../..
rm -f backend/src/v2/background/wasm/package.json backend/src/v2/background/wasm/.gitignore
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -w backend -- background.dgn`
Expected: PASS (11개)

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(background): DGN 엔티티 전체 매핑(문자·도형·곡선·복합체) + 팔레트"
```

---

## Task 7: DGN 배선 — 디스패치·엔드포인트·UI

**Files:**
- Modify: `backend/src/v2/background/parse.ts`
- Modify: `backend/src/v2/__tests__/background.parse.test.ts`
- Modify: `backend/src/v2/__tests__/background.routes.test.ts`
- Modify: `frontend/src/v2/components/FloorPlanView.tsx` (`accept` 속성)

**Interfaces:**
- Consumes: `parseDgn(buffer, fileName)` (Task 5·6)

- [ ] **Step 1: 실패하는 테스트를 먼저 추가**

`backend/src/v2/__tests__/background.parse.test.ts` 에 추가:

```ts
describe('parseBackground — DGN', () => {
  it('.dgn 을 DGN 파서로 보낸다', async () => {
    const bg = await parseBackground(fixture('test_dgnv8.dgn'), 'test_dgnv8.dgn');
    expect(bg.source.fileType).toBe('DGN');
    expect(bg.paths.length).toBeGreaterThan(0);
  });

  it('.DGN 대문자도 받는다', async () => {
    const bg = await parseBackground(fixture('test_dgnv8.dgn'), 'TEST.DGN');
    expect(bg.source.fileType).toBe('DGN');
  });
});
```

`backend/src/v2/__tests__/background.routes.test.ts` 에 추가:

```ts
  it('DGN 을 올리면 파싱 결과가 층에 저장된다', async () => {
    const dgnBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'test_dgnv8.dgn'));
    const res = await request(app)
      .post(`/api/v2/floors/${floorId}/background`)
      .set(admin)
      .attach('file', dgnBytes, { filename: 'test_dgnv8.dgn' })
      .expect(200);
    expect(res.body.backgroundDrawing.source.fileType).toBe('DGN');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -w backend -- background`
Expected: FAIL — `.dgn` 이 `UNSUPPORTED_FORMAT` 로 거절됨

- [ ] **Step 3: 디스패치에 분기 추가**

`backend/src/v2/background/parse.ts` 에 import 와 case 하나를 추가한다:

```ts
import { parseDgn } from './dgn.js';
```

```ts
    case '.dgn':
      return parseDgn(buffer, fileName);
```

- [ ] **Step 4: 프론트 accept 확장**

`frontend/src/v2/components/FloorPlanView.tsx` 의 파일 input:

```tsx
              accept=".dwg,.dxf,.dgn"
```

- [ ] **Step 5: 전체 검증**

Run: `npm run build && npm test -w backend && npm test -w frontend`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(background): DGN 을 디스패치·엔드포인트·UI 에 배선"
```

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| §3 파서 계약 단일 판단 지점 | 2 (Step 6) |
| §3 파서는 순수 함수, DB 미접근 | 2 (Step 5 항목 6), 5 (Step 8) |
| §3 타입을 `@twin/core` 로 이동 | 1 |
| §4 `POST`/`DELETE` 엔드포인트, 50MB, 권한 | 3 |
| §4 원본 파일 미보관 | 3 (memoryStorage) |
| §4 즉시 쓰기(커밋 채널 아님) | 3 |
| §4 좌표·단위·Y뒤집기·cm | 2(이식), 5(Rust) |
| §4 DGN WASM 경계 1함수 + 산출물 커밋 | 5 |
| §4 wasm-pack `package.json` 제거 | 5 (Step 6), README |
| §4 엔티티·심볼로지 매핑표 | 6 |
| §4 구 파서 WASM 경로 주석 보존 | 2 (Step 5 항목 7) |
| §4 동기 파싱 수용 | — 코드 변경 없음(문서화 완료) |
| §5 프론트 API·트리거·에러·CONVENTIONS | 4 |
| §6 픽스처 출처 기록 | 5 (Step 2) |
| §6 백엔드/프론트 테스트 | 2·3·4·5·6·7 |
| §7 비목표 | 구현하지 않음 |

**2. 플레이스홀더 스캔** — "적절히 처리" 류 없음. 다만 세 곳에 **의도적 확인 지시**가 있다: (a) Task 4의 기존 렌더 하네스/권한 판정/쿼리 키 재사용, (b) Task 5의 `ezdgn-core` 실제 필드명, (c) Task 6의 팔레트 출처. 셋 다 "추측하지 말고 실제를 확인하라"는 지시이며, 특히 (c)는 **모르면 추측한 색을 넣지 말라**고 명시했다.

**3. 타입 일관성** — `parseBackground(buffer, fileName)` · `parseDwg(buffer, fileType, fileName)` · `parseDgn(buffer, fileName)` · `dgn_to_background(bytes)` · `uploadBackground(floorId, file)` · `deleteBackground(floorId)` 가 전 태스크에서 동일하게 쓰였다. `BackgroundDrawing.source.fileType` 유니온에 `'DGN'` 을 추가하는 것을 Task 1 Step 1에 명시했다(누락 시 Task 5 컴파일 실패).

**4. 알려진 위험**

- Task 5·6의 Rust 코드는 `ezdgn-core` API 표면을 정확히 알지 못한 상태로 작성됐다. 필드명 불일치로 컴파일 오류가 날 수 있고, 각 태스크에 실제 정의 확인 절차를 넣어 두었다
- 실제 대형 DGN 도면 미검증(스펙 §8). 실물 파일 확보 시 성능·미지원 엔티티 비율을 측정한다
