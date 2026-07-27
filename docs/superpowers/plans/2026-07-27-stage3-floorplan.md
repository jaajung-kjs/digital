# Stage 3: v2 평면도 (캔버스 이식 + 신모델 배치) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v2 워크스페이스에 평면도 뷰를 세운다 — 층 탭, 캔버스 렌더(자산·그리드·배경도면), placeable 타입 배치(drag-to-draw), 이동/리사이즈, 선택 동기화. 저장은 기존 워킹카피 커밋 경유(백엔드 변경 0 — floor 배치 검증은 2A에 이미 존재).

**Architecture:** 구 캔버스의 **순수 유틸 9개를 `frontend/src/v2/canvas/`로 이식**(V2Asset 필드명 x/y/width/height로 개명 적용, 스토어 import 0). 스토어 결합 훅(useCanvas/useCanvasEvents/editorStore)은 이식하지 않고 v2 패턴으로 소형 재작성: 뷰포트·툴 상태는 FloorPlanView 컴포넌트 로컬(React state + rAF 스케줄), 데이터는 워킹카피 반응형 슬라이스(s.saved/s.overlays + mergeEffective), 핸들러는 getState(). 선택은 페이지의 selectedAssetId를 공유(테이블·상세 패널과 동일 소스). 좌표계: 1 unit = 1cm, `ctx.translate(panX,panY); ctx.scale(zoom/100,zoom/100)`, 스크린→월드 `(client - rect - pan) / scale`.

**Tech Stack:** HTML5 Canvas 2D, React 18, 기존 v2 스토어/모달 재사용. 신규 의존성 0.

## Global Constraints

- **UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md` 필독·준수** — text-sm/text-xs, 시맨틱 토큰, z-index 토큰, 공용 컴포넌트.
- v2 자립 격리 유지: 구 feature/store/편집기 코드 import 금지. 순수 유틸은 **복사-개작**(파일 헤더에 `// ported from utils/floorplan/... (Stage 3)` 주석 1줄). 허용 import: `components/ui`, `utils/api`, v2 영역, `@twin/core`.
- 타입키/역할 분기 금지 (가드레일 시드 26키 동적 검사가 강제). 배치 가능 판정은 `type.placeable` 데이터만.
- 렌더는 반응형 슬라이스 구독(s.saved/s.overlays) + rAF 1회 스케줄, 핸들러는 `useV2WorkingCopy.getState()`. 함수 참조 구독 금지 (2B에서 확정된 패턴).
- 구 소스 무접촉. 수정 허용: `frontend/src/v2/**` + `pages/V2WorkspacePage.tsx`.
- 순수 로직(히트테스트·스냅·드래그 수학·뷰모델) TDD. 컴포넌트는 빌드 + 최종 브라우저 시나리오 검증.
- 2A 계약: floor 배치 create/update는 `floorId + x/y/width/height` (컨테이너 배치와 상호배타), placeable=false 타입은 서버가 422 NOT_PLACEABLE.
- 커밋 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: 캔버스 순수 유틸 이식 (V2 필드 적용) + TDD

**Files:**
- Create: `frontend/src/v2/canvas/constants.ts`, `frontend/src/v2/canvas/transform.ts`, `frontend/src/v2/canvas/hitTest.ts`, `frontend/src/v2/canvas/drag.ts`, `frontend/src/v2/canvas/renderers.ts`, `frontend/src/v2/canvas/gridRenderer.ts`, `frontend/src/v2/canvas/backgroundRenderer.ts`, `frontend/src/v2/canvas/backgroundTypes.ts`
- Test: `frontend/src/v2/canvas/__tests__/canvasCore.test.ts`

**Interfaces:**
- Consumes: 구 순수 유틸 원본(읽기 전용 참조): `utils/canvas/canvasDrawing.ts`, `utils/canvas/canvasTransform.ts`, `utils/floorplan/renderers.ts`, `utils/floorplan/hitTestUtils.ts`, `utils/floorplan/dragSystem.ts`, `features/editor/renderers/gridRenderer.ts`, `features/editor/renderers/backgroundLayerRenderer.ts`, `types/floorPlan.ts`(BackgroundDrawing 계열 타입)
- Produces (이후 태스크가 사용하는 정확한 시그니처):
  - `constants.ts`: `SELECTION_STYLES`, `ELEMENT_COLORS` (구 값 그대로)
  - `transform.ts`: `snapToGrid(x, y, gridSize, enabled?): {x,y}` · `screenToWorld(clientX, clientY, rect: DOMRect, panX, panY, zoom): {x,y}` (신규 순수화: `(client - rect.left - pan) / (zoom/100)`)
  - `hitTest.ts`: `hitTestAsset(x, y, a: PlacedAsset): boolean` · `findAssetAt(x, y, assets: PlacedAsset[]): PlacedAsset | null` (뒤에서부터 = 위에 그려진 것 우선) — `PlacedAsset = Pick<V2Asset,'id'|'name'|'x'|'y'|'width'|'height'>` (x/y/width/height는 non-null 보장 후 전달)
  - `drag.ts`: `DragSession { startMouse:{x,y}; assetId; initial:{x,y}; moved:boolean }` · `createDragSession(asset, mouse): DragSession` · `dragDelta(session, mouse, snapFn): {x,y}` (initial + delta에 snap 적용) · `DRAG_THRESHOLD = 3` · `isThresholdMet(session, mouse): boolean`
  - `renderers.ts`: `renderPlacedAssets(ctx, assets: PlacedAsset[], selectedId: string|null): void` (구 renderAssetItem/Items를 V2 필드로 개작, 선택 하이라이트 포함) · `renderDrawPreview(ctx, start, end): void` (구 renderAssetDrawPreview 그대로 — 치수 라벨 포함)
  - `gridRenderer.ts`: `renderGrid(ctx, majorSize, left, top, right, bottom): void` (구 코드 그대로)
  - `backgroundRenderer.ts` + `backgroundTypes.ts`: `renderBackgroundDrawing(ctx, bg: BackgroundDrawing, opacity, zoom, hiddenLayers?): void` (구 코드+타입 그대로 복사 — 타입은 backgroundTypes.ts로)

- [ ] **Step 1: 실패하는 테스트 작성** — `canvasCore.test.ts` (렌더러 제외 순수 수학 전수):

```ts
import { describe, expect, it } from 'vitest';
import { snapToGrid, screenToWorld } from '../transform';
import { findAssetAt, hitTestAsset } from '../hitTest';
import { createDragSession, dragDelta, isThresholdMet } from '../drag';

const rect = { left: 100, top: 50 } as DOMRect;
const a = (id: string, x: number, y: number, w = 60, h = 80) => ({ id, name: id, x, y, width: w, height: h });

describe('transform', () => {
  it('snapToGrid: 10 단위 반올림, disabled면 원값', () => {
    expect(snapToGrid(14, 26, 10)).toEqual({ x: 10, y: 30 });
    expect(snapToGrid(14, 26, 10, false)).toEqual({ x: 14, y: 26 });
  });
  it('screenToWorld: pan/zoom 역변환', () => {
    // zoom 200%, pan(20,10): world = (client-rect-pan)/2
    expect(screenToWorld(160, 100, rect, 20, 10, 200)).toEqual({ x: 20, y: 20 });
  });
});

describe('hitTest', () => {
  it('AABB 내부/경계 포함, 외부 제외', () => {
    expect(hitTestAsset(10, 10, a('r', 0, 0))).toBe(true);
    expect(hitTestAsset(60, 80, a('r', 0, 0))).toBe(true);
    expect(hitTestAsset(61, 10, a('r', 0, 0))).toBe(false);
  });
  it('findAssetAt: 겹치면 나중 그려진(배열 뒤) 것 우선', () => {
    const list = [a('아래', 0, 0), a('위', 10, 10)];
    expect(findAssetAt(20, 20, list)!.id).toBe('위');
    expect(findAssetAt(5, 5, list)!.id).toBe('아래');
    expect(findAssetAt(999, 999, list)).toBeNull();
  });
});

describe('drag', () => {
  it('threshold 3 미만은 미충족', () => {
    const s = createDragSession(a('r', 100, 100), { x: 10, y: 10 });
    expect(isThresholdMet(s, { x: 12, y: 10 })).toBe(false);
    expect(isThresholdMet(s, { x: 14, y: 10 })).toBe(true);
  });
  it('dragDelta: initial+delta에 snap 적용', () => {
    const s = createDragSession(a('r', 100, 100), { x: 10, y: 10 });
    const snap = (x: number, y: number) => snapToGrid(x, y, 10);
    expect(dragDelta(s, { x: 33, y: 17 }, (p) => snap(p.x, p.y))).toEqual({ x: 120, y: 110 });
  });
});
```

(주의: dragDelta의 snapFn 시그니처는 `(pos: {x,y}) => {x,y}`로 통일 — 테스트 코드가 계약.)

- [ ] **Step 2: RED 확인** — `npm test -w frontend -- run src/v2` FAIL.

- [ ] **Step 3: 이식 구현** — 각 파일을 구 원본에서 복사 후 개작:
  - 필드 개명: `positionX→x`, `positionY→y`, `width2d→width`, `height2d→height` (renderers/hitTest/drag)
  - 구 `findItemAt(x,y,_elements,assets)`의 `_elements` 파라미터 제거, 배열 역순 탐색으로 변경(`for (let i = assets.length - 1; ...)`)
  - `screenToWorld`는 구 useCanvasEvents의 getCanvasCoordinates 수식을 순수 함수화
  - `renderPlacedAssets`: 구 renderAssetItems 루프 + renderAssetItem(선택 시 SELECTION_STYLES) — rotation은 V2에 없으므로 제거
  - backgroundRenderer/backgroundTypes/gridRenderer/constants는 로직 무수정 복사(import 경로만 조정)
  - 모든 파일 헤더에 `// ported from <원본경로> (Stage 3)` 1줄

- [ ] **Step 4: GREEN + 빌드** — `npm test -w frontend -- run src/v2` PASS, `npm run build -w frontend` EXIT 0.

- [ ] **Step 5: Commit** — `feat(v2-fe): 캔버스 순수 유틸 이식(V2 필드) — 변환·히트테스트·드래그·렌더러`

---

### Task 2: FloorPlanView — 뷰포트·렌더 루프·층 탭·선택 연동 + 뷰 토글

**Files:**
- Create: `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/floorPlanSelectors.ts`
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx`
- Test: `frontend/src/v2/__tests__/floorPlanSelectors.test.ts`

**Interfaces:**
- Consumes: Task 1 캔버스 유틸, `useV2WorkingCopy`(s.saved/s.overlays), `mergeEffective`, `V2Floor`
- Produces:
  - `floorPlanSelectors.ts`: `placedAssetsOf(assets: V2Asset[], floorId: string): PlacedAsset[]` — `floorId` 일치 + `x/y/width/height` 전부 non-null인 자산만, PlacedAsset로 투영 (순수, TDD)
  - `FloorPlanView({ substationId, selectedAssetId, onSelectAsset })`:
    - 층 탭바(saved.floors, sortOrder순; 층 없으면 "층이 없습니다 — 조직 트리에서 추가" 안내) + 활성 층 로컬 state
    - 캔버스: 컨테이너 100% 채움 + ResizeObserver로 canvas.width/height 동기화, rAF 1회 스케줄 렌더(중복 스케줄 방지 ref 플래그)
    - 렌더 순서: clear → translate/scale → 배경도면(floor.backgroundDrawing 있으면, opacity=floor.backgroundOpacity) → renderGrid(major 100) → renderPlacedAssets(선택 하이라이트) → (Task 3의) 배치 프리뷰
    - 뷰포트: 로컬 state `{zoom: 100, panX: 0, panY: 0}` — 휠 = 커서 중심 줌(10~1000 클램프, 구 zoomToCenter 수식을 커서 기준으로), 중클릭 or Space+드래그 = 팬 (window mousemove/up은 활성 시에만 부착)
    - 클릭: `screenToWorld` → `findAssetAt` → `onSelectAsset(id | null)`
    - 재렌더 트리거: saved/overlays/selectedAssetId/뷰포트/활성층 변경 시 rAF 스케줄 (반응형 슬라이스 구독)
  - `V2WorkspacePage`: 변전소 선택 시 상단에 뷰 토글 `현황 | 평면도` (로컬 state, 기본 현황). 평면도 뷰에서도 우측 AssetDetailPanel 유지(같은 selectedAssetId), SaveBar/ConflictDialog는 공통.

- [ ] **Step 1: 셀렉터 TDD**

```ts
import { describe, expect, it } from 'vitest';
import { placedAssetsOf } from '../floorPlanSelectors';

const asset = (id: string, extra: object) => ({
  id, name: id, typeId: 't', substationId: 's', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
  fieldValues: {}, updatedAt: '', ports: [], ...extra,
});

describe('placedAssetsOf', () => {
  it('해당 층 + 좌표 완전한 자산만 투영', () => {
    const list = [
      asset('a', { floorId: 'f1', x: 0, y: 0, width: 60, height: 80 }),
      asset('b', { floorId: 'f2', x: 0, y: 0, width: 60, height: 80 }),
      asset('c', { floorId: 'f1', x: null, y: 0, width: 60, height: 80 }), // 불완전 → 제외
      asset('d', {}), // 미배치 → 제외
    ];
    expect(placedAssetsOf(list as never, 'f1').map((p) => p.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (`placedAssetsOf`는 filter+map 순수 함수)

- [ ] **Step 3: FloorPlanView + 페이지 토글 구현** (인터페이스 명세대로. CONVENTIONS: 탭바는 상세 패널 탭 스타일과 동일 — `border-b-2 border-primary` 활성. 캔버스 배경 `bg-surface-2`.)

- [ ] **Step 4: 검증** — 테스트 전체 그린 + `npm run build -w frontend` EXIT 0. 브라우저: 층 탭 표시, 저장된 배치 자산이 캔버스에 보임(수동으로 psql/현황에서 자산이 있다면), 휠 줌·팬 동작, 자산 클릭 → 상세 패널.

- [ ] **Step 5: Commit** — `feat(v2-fe): 평면도 뷰 — 캔버스 렌더 루프·뷰포트·층 탭·선택 연동`

---

### Task 3: 배치 — placeable 팔레트 + drag-to-draw + AddAssetModal floor 컨텍스트

**Files:**
- Modify: `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/components/AddAssetModal.tsx`
- Test: `frontend/src/v2/__tests__/floorPlacement.test.ts` (+ 순수 헬퍼 `frontend/src/v2/floorPlacement.ts`)

**Interfaces:**
- Consumes: `useV2Catalog`(placeable 타입), `stageAssetCreate`, `makeNewAsset`(확장), Task 1 `renderDrawPreview`/`snapToGrid`
- Produces:
  - `floorPlacement.ts`: `normalizeRect(start, end): {x,y,width,height}` (min/abs) · `MIN_DRAW = 10` · `isDrawLargeEnough(rect): boolean` (순수, TDD)
  - `makeNewAsset` 확장 (`frontend/src/v2/newAsset.ts`): `placement` 유니온 확장 — `{ kind: 'container'; parentAssetId; containerKey; slotIndex; slotSpan }` | `{ kind: 'floor'; floorId; x; y; width; height }`. 기존 호출부(AddAssetModal 컨테이너 경로) 함께 갱신. 기존 테스트 시그니처 갱신 + floor 케이스 테스트 추가.
  - `AddAssetModal`에 `floorContext?: { floorId: string; rect: {x,y,width,height} }` prop: 있으면 타입 목록을 `placeable` 타입만으로 필터, 슬롯 셀렉트 없음, 확인 시 floor placement로 stageAssetCreate.
  - `FloorPlanView` 배치 UX: 캔버스 상단에 placeable 타입 팔레트 바(카탈로그에서 `placeable===true` 타입 버튼들, 활성 armed 상태 하이라이트). armed 상태에서 캔버스 drag-to-draw(스냅 10) → `renderDrawPreview` 표시 → 놓으면 `isDrawLargeEnough` 검사 후 AddAssetModal(floorContext, 타입 프리셀렉트) 오픈 → 생성 후 disarm. ESC로 disarm.

- [ ] **Step 1: 순수 헬퍼 TDD**

```ts
import { describe, expect, it } from 'vitest';
import { isDrawLargeEnough, normalizeRect } from '../floorPlacement';

describe('normalizeRect', () => {
  it('역방향 드래그 정규화', () => {
    expect(normalizeRect({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });
});
describe('isDrawLargeEnough', () => {
  it('10 미만 변은 거부', () => {
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 9, height: 50 })).toBe(false);
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN** (makeNewAsset 확장 포함 — 기존 newAsset.test.ts의 placement 케이스를 새 유니온으로 갱신하고 floor 케이스 추가:

```ts
it('floor placement 반영', () => {
  const a = makeNewAsset({ type: mkType('t1', 'RACK', 'c-struct'), name: '랙', substationId: 'ss',
    placement: { kind: 'floor', floorId: 'f1', x: 10, y: 20, width: 60, height: 80 } });
  expect(a).toMatchObject({ floorId: 'f1', x: 10, y: 20, width: 60, height: 80, parentAssetId: null });
});
```
)

- [ ] **Step 3: 검증** — 테스트 전체 그린 + 빌드 EXIT 0. 브라우저: 팔레트에서 랙 arm → 드래그로 사각형 → 모달 이름 입력 → 캔버스+현황 테이블 동시 등장(dirty↑) → 저장 → 새로고침 유지.

- [ ] **Step 4: Commit** — `feat(v2-fe): 평면도 배치 — placeable 팔레트·drag-to-draw·floor 컨텍스트 모달`

---

### Task 4: 이동/리사이즈

**Files:**
- Modify: `frontend/src/v2/components/FloorPlanView.tsx`
- Create: `frontend/src/v2/components/AssetResizeHandles.tsx` (v2판)
- Test: `frontend/src/v2/__tests__/resizeMath.test.ts` (+ `frontend/src/v2/canvas/resize.ts`)

**Interfaces:**
- Consumes: Task 1 `drag.ts`/`snapToGrid`, `stageAssetUpdate`(getState 경유)
- Produces:
  - `canvas/resize.ts` (순수, TDD): `HANDLES: {key:'tl'|'t'|'tr'|'r'|'br'|'b'|'bl'|'l'; fx:0|0.5|1; fy:0|0.5|1}[]` · `applyResize(rect, handleKey, worldDelta, minSize=20, snapFn?): {x,y,width,height}` — 각 핸들별 엣지 이동, min 20 클램프(고정 반대변 기준), snap 적용
  - 이동: 캔버스 mousedown(자산 위, 팬/armed 아님) → DragSession → threshold 충족 시 이동 시작 → mousemove마다 `dragDelta` → **로컬 프리뷰 상태**(드래그 중 stage 남발 금지 — undo 1건 보장) → mouseup에 `stageAssetUpdate(id, {x,y})` 1회
  - 리사이즈: 선택 자산에 8핸들 DOM 오버레이(스크린 좌표 = world*scale+pan, 9px, `bg-surface border border-primary`), 포인터 드래그 → 로컬 프리뷰 → 완료 시 `stageAssetUpdate(id, {x,y,width,height})` 1회
  - 캔버스 렌더는 드래그/리사이즈 중 프리뷰 값을 우선 사용

- [ ] **Step 1: resize 수학 TDD**

```ts
import { describe, expect, it } from 'vitest';
import { applyResize } from '../canvas/resize';

const rect = { x: 100, y: 100, width: 60, height: 80 };
describe('applyResize', () => {
  it('br: 우하단 확장', () => {
    expect(applyResize(rect, 'br', { x: 10, y: 20 })).toEqual({ x: 100, y: 100, width: 70, height: 100 });
  });
  it('tl: 좌상단 이동 + 크기 감소, 반대변 고정', () => {
    expect(applyResize(rect, 'tl', { x: 10, y: 10 })).toEqual({ x: 110, y: 110, width: 50, height: 70 });
  });
  it('min 20 클램프: 고정변 유지', () => {
    expect(applyResize(rect, 'r', { x: -100, y: 0 })).toEqual({ x: 100, y: 100, width: 20, height: 80 });
    expect(applyResize(rect, 'l', { x: 100, y: 0 })).toEqual({ x: 140, y: 100, width: 20, height: 80 });
  });
  it('엣지 핸들은 한 축만', () => {
    expect(applyResize(rect, 't', { x: 50, y: -10 })).toEqual({ x: 100, y: 90, width: 60, height: 90 });
  });
});
```

- [ ] **Step 2: RED → 구현 → GREEN → 빌드 EXIT 0**

- [ ] **Step 3: 검증** — 브라우저: 자산 드래그 이동(스냅), 8핸들 리사이즈(min 20), 각 조작당 undo 1건, 저장 후 유지.

- [ ] **Step 4: Commit** — `feat(v2-fe): 평면도 이동/리사이즈 — 로컬 프리뷰·완료시 1회 스테이지`

---

### Task 5: 종합 검증 + 마무리

**Files:**
- Test: 기존 스위트 전체 (신규 파일 없음 — 가드레일은 v2 디렉토리 walk이라 canvas/도 자동 포함됨을 확인)

- [ ] **Step 1: 전체 검증**

```bash
npm test -w frontend -- run src/v2   # 캔버스 유틸/셀렉터/배치/리사이즈 포함 전체
npm test -w @twin/core               # 39 유지
npm test -w backend                  # 168 유지
npm run build                        # 루트 EXIT 0
```

- [ ] **Step 2: 브라우저 종합 시나리오 (컨트롤러 검증)**
1. 변전소 선택 → 평면도 탭 → 층 탭 표시
2. 팔레트에서 랙 arm → drag-to-draw → 이름 입력 → 캔버스 표시 + 현황 테이블 동기 (설치장소 = 층 이름)
3. 드래그 이동(스냅 확인) + 리사이즈 → 저장 → 새로고침 후 위치/크기 유지 (DB 값 확인)
4. 캔버스에서 자산 클릭 → 우측 상세 패널 동기 / 테이블에서 선택 → (평면도 전환 시) 캔버스 하이라이트
5. placeable=false 타입(광슬롯 등)이 팔레트에 없음 확인
6. 줌/팬 후 배치 좌표 정확성 (줌 200%에서 배치 → 저장 좌표 검증)

- [ ] **Step 3: Commit** (검증 중 수정 발생 시) — `fix(v2-fe): 평면도 브라우저 검증 반영 — <내용>`

---

## 완료 기준 (Stage 3 Definition of Done)

1. 프론트 v2 스위트 전체 PASS (+캔버스 수학 테스트), 코어 39·백엔드 168 유지, 루트 빌드 EXIT 0.
2. 브라우저 종합 시나리오 6항목 통과 (서버 저장 DB 확인 포함 — 2B 교훈: 스테이지 상태를 저장 성공으로 오판 금지).
3. main 머지.

## 명시적 비목표 (Stage 3)

- DWG 업로드/임포트 파이프라인 (배경도면 **렌더**만 — 데이터가 있으면 그림. 임포트 UI는 후속 스테이지)
- 케이블 렌더/연결 (Stage 4)
- 랙 프리셋 배치 (Stage 6 타입 정의와 함께)
- 자산 회전(rotation) — 구 모델에도 미사용
- 다중 선택/정렬 도구 — 구 기능 범위 확인 후 후속
- 배경도면 레이어 토글 UI — 렌더러는 hiddenLayers를 받지만 UI는 후속
