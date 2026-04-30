// ============================================
// 평면도 (Floor Plan) 타입 — P8 신규 모델 반영
// ============================================
//
// 사용자는 설비(Equipment) 배치와 케이블(Cable) 연결만 한다.
// 도면 윤곽은 임포트한 backgroundDrawing(DWG)이 담당한다.
//
// P6 이후:
//  • Equipment 는 `kind` enum 으로 5종 (RACK / OFD / DISTRIBUTION / GROUNDING / HVAC) 식별.
//  • RACK 의 슬롯 자식들은 더 이상 Equipment 가 아니라 `RackModule` 별도 모델.
//  • Cable 의 endpoint 는 polymorphic — Equipment 또는 RackModule 한 쪽.

import type { EquipmentKind } from './equipmentKind';
import type { RackModule } from './rackModule';

// 평면도 장비.
//
// NOTE: P6 이후 Equipment 자체에는 `category`, `materialCategoryId/Code/Name`,
// `parentEquipmentId / startU / heightU`, `model / manufacturer / specification`
// 등 그루핑·세부 메타데이터가 더 이상 없다. 대신 `kind` 와 `properties` (JSON) 를 사용한다.
// 랙 슬롯 자식은 `RackModule` 별도 모델로 분리.
//
// 아래 `@deprecated` 필드들은 P8 호환 shim — UI 가 P9 에서 RackModule/EquipmentKind
// 기반으로 재구성될 때 모두 제거된다. 새 코드에서는 사용 금지.
export interface FloorPlanEquipment {
  id: string;
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  /** EQP-RACK 설비의 슬롯 수. RACK 외에는 null. */
  totalU: number | null;
  description?: string | null;
  manager?: string | null;
  height3d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  /** kind-specific metadata — 자유 형식 JSON. */
  properties?: Record<string, unknown> | null;

  // ── P8 deprecation shims — removed in P9 ──
  /** @deprecated P8 — 백엔드 응답엔 없음. UI 호환용 자리만 유지. */
  model?: string | null;
  /** @deprecated P8 — 백엔드 응답엔 없음. */
  manufacturer?: string | null;
  /** @deprecated P8 — 그루핑은 `kind` 사용. */
  materialCategoryId?: string | null;
  /** @deprecated P8 — 그루핑은 `kind` 사용. */
  materialCategoryCode?: string | null;
  /** @deprecated P8 — 그루핑은 `kind` 사용. */
  materialCategoryName?: string | null;
  /** @deprecated P8 — 색상은 RackModuleCategory.displayColor 등에서 가져온다. */
  displayColor?: string | null;
  /** @deprecated P8 — 자유 메타는 `properties` 로 통합. */
  specParams?: Record<string, unknown> | null;
  /** @deprecated P8 — 자유 메타는 `properties` 로 통합. */
  specification?: string | null;
  /** @deprecated P8 — 랙 자식은 RackModule 모델로 분리. */
  parentEquipmentId?: string | null;
  /** @deprecated P8 — RackModule.startU 사용. */
  startU?: number | null;
  /** @deprecated P8 — RackModule.heightU 사용. */
  heightU?: number | null;
}

// 평면도 케이블.
//
// endpoint 는 polymorphic — 양 쪽 각각 Equipment(non-RACK) 또는 RackModule.
// 정확히 한 쪽이 not-null 이라야 한다.
//
// P8 SHIM: 백엔드는 `sourceEquipmentId | null` 로 보내지만, UI 가 RackModule 을
// 처리하기 전 (P9) 까지는 어댑터에서 `''` 로 채워 넣어 string 으로 유지한다.
// `materialCategory*` aliases 는 P9 에서 제거.
export interface FloorPlanCable {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  /** P8 신규: rack module endpoint id. Equipment 쪽은 비어있을 수 있다. */
  sourceModuleId?: string | null;
  targetModuleId?: string | null;
  cableType: string;
  /** CableCategory join — 백엔드가 채워줌. */
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
  label?: string | null;
  color?: string | null;
  description?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;

  // ── P8 deprecation shims — removed in P9 ──
  /** @deprecated P8 — alias for `categoryId`. */
  materialCategoryId?: string | null;
  /** @deprecated P8 — alias for `categoryCode`. */
  materialCategoryCode?: string | null;
  /** @deprecated P8 — alias for `categoryName`. */
  materialCategoryName?: string | null;
}

export interface FloorPlanFiberPath {
  id: string;
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string | null;
}

export interface FloorPlanDetail {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  scaleRatio?: number | null;
  backgroundDrawing?: BackgroundDrawing | null;
  backgroundOpacity?: number;
  equipment: FloorPlanEquipment[];
  /**
   * Rack modules — fetched separately via `useRackModules(rackId)` per rack
   * in P9. The plan response itself does NOT include these (see floor.service.ts);
   * this field exists for editor convenience when an aggregate fetch is needed.
   */
  rackModules?: RackModule[];
  cables: FloorPlanCable[];
  fiberPaths: FloorPlanFiberPath[];
  version: number;
  updatedAt: string;
}

// ============================================
// 임포트된 배경 도면 (DWG/DXF에서 추출) — DWG-A 신규 모델
// ============================================
//
// Backend `dwgImport.service.ts` 의 BgLayer/BgPath/BgText/BgFilled/BackgroundDrawing
// 과 1:1 대응. BYLAYER 규칙: entity 의 color/lineweight/linetype/dashArray 가
// undefined 면 layer 의 default 를 사용하고, 정의되어 있으면 override.

export interface BgLayer {
  name: string;
  /** '#RRGGBB' (ACI → RGB). */
  color: string;
  /** px (이미 scale-adjusted). */
  lineweight: number;
  /** 'solid' | 'dashed' | 'center' | 'hidden' | 'dashdot' | 'phantom' | name */
  linetype: string;
  /** px-units. linetype='solid' 면 absent. */
  dashArray?: number[];
  /** layer off / frozen 이면 false. */
  isVisible: boolean;
}

export interface BgPath {
  layer: string;
  /** Flat [x1,y1,x2,y2,...] in canvas coords (Y already flipped). */
  points: number[];
  closed?: boolean;
  // BYLAYER overrides — entity 가 layer default 와 다를 때만 채워진다.
  color?: string;
  lineweight?: number;
  linetype?: string;
  dashArray?: number[];
}

export interface BgText {
  layer: string;
  /** Anchor in canvas coords (이미 hAlign/vAlign 으로 정렬된 값). */
  x: number;
  y: number;
  text: string;
  /** Pixel font size. */
  size: number;
  /** Radians, canvas coords. 0 이면 omitted. */
  rotation?: number;
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'middle' | 'bottom' | 'baseline';
  color?: string;
  fontFamily?: string;
  isMultiLine?: boolean;
}

export interface BgFilled {
  layer: string;
  /** loops[0] = outer, loops[1..] = holes. 각 loop 는 flat [x1,y1,...] (closed implicit). */
  loops: number[][];
  color?: string;
  /** v1: 'solid' 만 — HATCH patterned fill TBD. */
  pattern?: 'solid';
}

export interface BackgroundDrawing {
  source: { fileName: string; importedAt: string; fileType: 'DWG' | 'DXF' };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  scaleMmPerUnit: number;
  layers: BgLayer[];
  paths: BgPath[];
  texts: BgText[];
  filled: BgFilled[];
}

export interface DwgImportResult {
  backgroundDrawing: BackgroundDrawing;
  committed: boolean;
}

// ============================================
// API 요청 타입 — bulkUpdatePlan payload
// ============================================
//
// Mirrors backend `UpdatePlanInput` (floor.service.ts P6/P7). The shape is:
//   - `equipment`: 도면 위 5종 (RACK 포함). `kind` 필수.
//   - `rackModules`: 별도 배열 — undefined 면 기존 모듈 유지, 배열이면 reconciliation.
//   - `cables`: source/target 각각 polymorphic.
//   - `fiberPaths` / `deletedFiberPathIds`: 변동 없음.

export interface UpdateFloorPlanEquipmentInput {
  id?: string | null;
  tempId?: string;
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation?: number;
  totalU?: number | null;
  description?: string | null;
  manager?: string | null;
  height3d?: number | null;
  properties?: Record<string, unknown> | null;
}

export interface UpdateFloorPlanRackModuleInput {
  id?: string | null;
  tempId?: string;
  /** real rack equipment id OR equipment.tempId — backend resolves it. */
  rackEquipmentId: string;
  categoryId: string;
  name: string;
  startU: number;
  heightU: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: Record<string, unknown> | null;
  sortOrder?: number;
}

export interface UpdateFloorPlanCableInput {
  id?: string | null;
  source: { equipmentId?: string | null; moduleId?: string | null };
  target: { equipmentId?: string | null; moduleId?: string | null };
  cableType: string;
  label?: string | null;
  length?: number | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  categoryId?: string | null;
  specParams?: Record<string, unknown> | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number | null;
  totalLength?: number | null;
  description?: string | null;
}

export interface UpdateFloorPlanRequest {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  scaleRatio?: number | null;
  backgroundOpacity?: number;
  equipment?: UpdateFloorPlanEquipmentInput[];
  rackModules?: UpdateFloorPlanRackModuleInput[];
  cables?: UpdateFloorPlanCableInput[];
  fiberPaths?: {
    id: string;
    ofdAId: string;
    ofdBId: string;
    portCount: number;
    description?: string;
  }[];
  deletedFiberPathIds?: string[];
}

export interface BulkUpdatePlanResponse {
  id: string;
  version: number;
  message: string;
  equipmentIdMap: Record<string, string>;
  rackModuleIdMap: Record<string, string>;
  fiberPathIdMap: Record<string, string>;
  auditLogId: string | null;
  // constructionReport: opaque on the client — we only store/display it.
  constructionReport: unknown | null;
}

// 평면도 위 장비 아이템 (테이블/요약 표시용)
export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  name: string;
  floorId: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation: number;
  height3d?: number;
  frontImageUrl?: string;
  rearImageUrl?: string;
  manager?: string;
  description?: string;
}

// 에디터 도구
export type EditorTool = 'select' | 'equipment' | 'cable';
