// ported from frontend/src/types/floorPlan.ts (Stage 3)

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
  source: { fileName: string; importedAt: string; fileType: 'DWG' | 'DXF' | 'DGN' };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: BgLayer[];
  paths: BgPath[];
  texts: BgText[];
  filled: BgFilled[];
}
