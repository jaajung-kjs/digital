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
// `parentEquipmentId`, `model / manufacturer / specification`
// 등 그루핑·세부 메타데이터가 더 이상 없다. 대신 `kind` 와 `properties` (JSON) 를 사용한다.
// 랙 슬롯 자식은 `RackModule` 별도 모델로 분리 (slotIndex / slotSpan).
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
  /** 설치일 (ISO date string). InfoTab 편집 / 도면 저장 경로로 동기화. */
  installDate?: string | null;
  height3d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  /** kind-specific metadata — 자유 형식 JSON. */
  properties?: Record<string, unknown> | null;

  // ── P8 deprecation shims — do not use in new code ──
  /** @deprecated P8 */
  model?: string | null;
  /** @deprecated P8 */
  manufacturer?: string | null;
  /** @deprecated P8 */
  materialCategoryId?: string | null;
  /** @deprecated P8 */
  materialCategoryCode?: string | null;
  /** @deprecated P8 */
  materialCategoryName?: string | null;
  /** @deprecated P8 */
  displayColor?: string | null;
  /** @deprecated P8 */
  specParams?: Record<string, unknown> | null;
  /** @deprecated P8 */
  specification?: string | null;
  /** @deprecated P8 */
  parentEquipmentId?: string | null;
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
  // CM-B: scaleRatio 필드 제거 — 캔버스 1 unit = 1 cm 통일 후 의미 없음.
  // 백엔드는 응답에 여전히 포함하지만 프론트엔드 타입에서는 노출하지 않는다.
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
  /** cm. 캔버스 1 unit = 1 cm 약속에 맞춰 cm 단위로 저장 (CM-A 이후). */
  lineweight: number;
  /** 'solid' | 'dashed' | 'center' | 'hidden' | 'dashdot' | 'phantom' | name */
  linetype: string;
  /** cm. linetype='solid' 면 absent. */
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
  /** cm. 캔버스 1 unit = 1 cm 약속 — 폰트 크기도 cm 로 저장 (렌더 시 zoom 곱). */
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
  // CM-B: scaleMmPerUnit 필드 제거 — 캔버스 1 unit = 1 cm 통일 후 의미 없음
  // (backend 는 호환을 위해 = 10 으로 계속 emit 하지만 프론트는 무시).
  layers: BgLayer[];
  paths: BgPath[];
  texts: BgText[];
  filled: BgFilled[];
}

export interface DwgImportResult {
  backgroundDrawing: BackgroundDrawing;
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
  installDate?: string | null;
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
  slotIndex: number;
  slotSpan: number;
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
  // CM-B: scaleRatio 폐기 — 더 이상 클라이언트가 보내지 않는다.
  backgroundOpacity?: number;
  // 3-state: undefined = unchanged, null = clear, object = replace.
  backgroundDrawing?: BackgroundDrawing | null;
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
