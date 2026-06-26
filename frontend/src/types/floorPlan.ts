// ============================================
// 평면도 (Floor Plan) 타입 — P8 신규 모델 반영
// ============================================
//
// 사용자는 자산(Asset) 배치와 케이블(Cable) 연결만 한다.
// 도면 윤곽은 임포트한 backgroundDrawing(DWG)이 담당한다.
//
// P6 이후:
//  • Asset 은 `kind` enum 으로 5종 (RACK / OFD / DISTRIBUTION / GROUNDING / HVAC) 식별.
//  • RACK 의 슬롯 자식들은 더 이상 Asset 이 아니라 `RackModule` 별도 모델.
//  • Cable 의 endpoint 는 polymorphic — Asset 또는 RackModule 한 쪽.

import type { RackModule } from './rackModule';

// 평면도 케이블.
//
// endpoint 는 polymorphic — 양 쪽 각각 Asset(non-RACK) 또는 RackModule.
// 정확히 한 쪽이 not-null 이라야 한다.
//
// 케이블 endpoint = 단일 asset id(sourceAssetId/targetAssetId). 백엔드 DTO 의
// source.assetId 를 cableDtoToLocal 이 이 flat 자리로 옮긴다(없으면 '' 로 유지).
export interface FloorPlanCable {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  /** P8 신규: rack module endpoint id. Asset 쪽은 비어있을 수 있다. */
  sourceModuleId?: string | null;
  targetModuleId?: string | null;
  /** 분전반 회로 endpoint id. */
  sourceCircuitId?: string | null;
  targetCircuitId?: string | null;
  /** CableCategory join — 백엔드가 채워줌. */
  categoryId?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  groupColor?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
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
  // GET /plan 폴백용 saved 설비 — fit(자동 맞춤)이 읽는 배치 필드만 노출.
  assets: { positionX: number; positionY: number; width: number; height: number }[];
  /**
   * Rack modules — fetched separately via `useRackModules(rackId)` per rack
   * in P9. The plan response itself does NOT include these (see floor.service.ts);
   * this field exists for editor convenience when an aggregate fetch is needed.
   */
  rackModules?: RackModule[];
  cables: FloorPlanCable[];
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
//   - `assets`: 도면 위 5종 (RACK 포함). `kind` 필수.
//   - `rackModules`: 별도 배열 — undefined 면 기존 모듈 유지, 배열이면 reconciliation.
//   - `cables`: source/target 각각 polymorphic.

// 에디터 도구
export type EditorTool = 'select' | 'asset' | 'cable';
