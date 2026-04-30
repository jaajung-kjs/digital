import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname = backend/src/services → up 3 to project root
const WASM_DIR = path.resolve(__dirname, '../../../node_modules/@mlightcad/libredwg-web/wasm/');

// ==================== Types ====================

export type ImportMode = 'smart' | 'advanced';

export interface ImportOptions {
  mode: ImportMode;
  commit: boolean;
  /** Advanced mode: explicit layer names to include. Smart mode: ignored. */
  layers?: string[];
  /** Smart mode toggles. */
  includeOutline?: boolean;
  includeLabels?: boolean;
  /** Manual scale override (mm per canvas unit). Otherwise computed from drawing extent. */
  scaleMmPerUnit?: number;
}

/**
 * Layer metadata. Per AutoCAD's BYLAYER convention, entities only override
 * these defaults when their `colorIndex` / `lineType` / `lineweight` differ
 * from the layer's. The frontend can use these defaults to avoid embedding
 * styling in every path/text/filled record.
 */
export interface BgLayer {
  name: string;
  color: string; // '#RRGGBB' (ACI → RGB)
  lineweight: number; // px (already scale-adjusted)
  linetype: string; // 'solid' | 'dashed' | 'center' | 'hidden' | 'dashdot' | 'phantom' | name
  dashArray?: number[]; // px-units; absent when linetype='solid'
  isVisible: boolean; // false when off or frozen
}

export interface BgPath {
  layer: string;
  /** Flat [x1,y1,x2,y2,...] in canvas coords (Y already flipped). */
  points: number[];
  closed?: boolean;
  // BYLAYER overrides — present only when entity differs from layer default.
  color?: string;
  lineweight?: number;
  linetype?: string;
  dashArray?: number[];
}

export interface BgText {
  layer: string;
  /** Anchor in canvas coords (already alignment-corrected by halign/valign). */
  x: number;
  y: number;
  text: string;
  /** Pixel font size. */
  size: number;
  /** Radians, canvas coords. 0 omitted. */
  rotation?: number;
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'middle' | 'bottom' | 'baseline';
  color?: string; // BYLAYER override
  fontFamily?: string;
  isMultiLine?: boolean;
}

export interface BgFilled {
  layer: string;
  /** loops[0] = outer, loops[1..] = holes. Each loop is a flat [x1,y1,...] (closed implicit). */
  loops: number[][];
  color?: string; // BYLAYER override
  pattern?: 'solid'; // v1: solid only; HATCH patterned fill TBD
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

export interface ImportResult {
  backgroundDrawing: BackgroundDrawing;
  committed: boolean;
}

// ==================== WASM lifecycle ====================

let _libredwg: Awaited<ReturnType<typeof LibreDwg.create>> | null = null;

async function getLibreDwg() {
  if (!_libredwg) {
    _libredwg = await LibreDwg.create(WASM_DIR);
  }
  return _libredwg;
}

// ==================== Parsing ====================

async function parseFile(buffer: Buffer, fileType: 'DWG' | 'DXF'): Promise<DwgDatabase> {
  const lib = await getLibreDwg();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const ftCode = fileType === 'DXF' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
  const dwgPtr = lib.dwg_read_data(ab, ftCode);
  if (dwgPtr == null) {
    throw new ValidationError('도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)');
  }
  try {
    const { database } = lib.convertEx(dwgPtr);
    return database;
  } finally {
    lib.dwg_free(dwgPtr);
  }
}

// ==================== ACI palette ====================

/**
 * AutoCAD Color Index 0..255 → RGB hex.
 * Generated from the standard AutoCAD palette algorithm (HSV-based for 10..249,
 * fixed grayscale for 250..255). Matches values produced by ezdxf, libreDXF, etc.
 *
 * Index 0 = BYBLOCK, 256 = BYLAYER — both should be resolved by the caller.
 * Index 7 (white-on-black / black-on-white) is rendered as black on light bg.
 */
const ACI_FIXED: Record<number, string> = {
  0: '#000000', // BYBLOCK fallback
  1: '#FF0000',
  2: '#FFFF00',
  3: '#00FF00',
  4: '#00FFFF',
  5: '#0000FF',
  6: '#FF00FF',
  7: '#000000', // black on light bg
  8: '#414141',
  9: '#808080',
};

const ACI_GRAYSCALE: string[] = ['#333333', '#505050', '#696969', '#828282', '#BEBEBE', '#FFFFFF'];

function hsvToHex(h: number, s: number, v: number): string {
  // h in [0,360), s,v in [0,1]
  const c = v * s;
  const hp = (h / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; b = 0; }
  else if (hp < 2) { r = x; g = c; b = 0; }
  else if (hp < 3) { r = 0; g = c; b = x; }
  else if (hp < 4) { r = 0; g = x; b = c; }
  else if (hp < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const m = v - c;
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return '#' + [R, G, B].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/**
 * AutoCAD palette index 10..249 — 24 hue steps × 5 sat/val combos × 2 brightness levels.
 * Standard formula: idx = 10 + (hue*10) + (level*2) + (light?1:0).
 * The hue ordering follows: 0=Red, 1=R-Y, 2=Yellow, 3=Y-G, ... around the wheel
 * in 15° increments (24 hues total). Each hue has 10 entries:
 *   primary, light-primary, dim, light-dim, ...
 * We implement the canonical formula used by ezdxf (also AutoCAD ACAD.PAT default).
 */
function aciHueRgb(idx: number): string {
  // idx in 10..249. Decompose: hueGroup = (idx - 10) >> 1 mod 24, halfGroup = (idx-10) >> 5
  const offset = idx - 10;
  const hueIndex = Math.floor(offset / 10) % 24; // 0..23
  const within = offset % 10; // 0..9
  // 5 sat/val pairs × 2 (full/half saturation)
  // Pair index 0..4: (sat=1,val=1), (sat=1,val=0.65), (sat=1,val=0.5), (sat=1,val=0.3), (sat=1,val=0.15)
  // The "+1" odd entries dim further.
  const pair = Math.floor(within / 2);
  const odd = within % 2 === 1;
  const valTable = [1.0, 0.65, 0.5, 0.3, 0.15];
  const v = valTable[pair];
  const s = odd ? 0.5 : 1.0;
  const hue = hueIndex * 15;
  return hsvToHex(hue, s, v * (odd ? 1 : 1));
}

const ACI_CACHE: Map<number, string> = new Map();
function aciToRgb(idx: number | undefined, layerColor?: string): string {
  if (idx == null || idx === 256 || idx === 0) return layerColor ?? '#000000';
  if (idx >= 1 && idx <= 9) return ACI_FIXED[idx];
  if (idx >= 250 && idx <= 255) return ACI_GRAYSCALE[idx - 250];
  if (idx >= 10 && idx <= 249) {
    const cached = ACI_CACHE.get(idx);
    if (cached) return cached;
    const c = aciHueRgb(idx);
    ACI_CACHE.set(idx, c);
    return c;
  }
  return layerColor ?? '#666666';
}

// ==================== Lineweight ====================

/**
 * DWG lineweight: integer encoding of mm·100.
 *  -1 = BYLAYER, -2 = BYBLOCK, -3 = DEFAULT.
 *  positive = 0.01mm units.
 *
 * Canvas-px conversion: 1 canvas-unit = scaleMmPerUnit mm,
 * therefore 1 mm = (1 / scaleMmPerUnit) canvas-units (= px since the canvas
 * coords already are screen px after normalize).
 *
 * Clamp to [0.5, 4] px so lineweights stay legible across drawing scales.
 */
function lineweightToPx(lw: number, scaleMmPerUnit: number): number {
  if (lw == null || lw < 0) return 1.0;
  const mm = lw / 100;
  if (mm <= 0) return 1.0;
  const px = mm / scaleMmPerUnit;
  return Math.max(0.5, Math.min(4, px));
}

// ==================== Linetype ====================

const LINETYPE_FALLBACK: Record<string, number[] | null> = {
  CONTINUOUS: null,
  BYLAYER: null,
  BYBLOCK: null,
  DASHED: [8, 4],
  CENTER: [16, 4, 4, 4],
  CENTER2: [8, 2, 2, 2],
  HIDDEN: [4, 4],
  HIDDEN2: [2, 2],
  DASHDOT: [8, 4, 1, 4],
  PHANTOM: [16, 4, 4, 4, 4, 4],
  DOT: [1, 4],
  DIVIDE: [12, 4, 1, 4, 1, 4],
};

interface LtypeEntry {
  name: string;
  pattern?: Array<{ elementLength: number }>;
}

/**
 * Build a name → dashArray map from the LTYPE table.
 * Pattern entries have elementLength: positive = dash, negative = gap, 0 = dot.
 */
function buildLtypeMap(db: DwgDatabase): Map<string, number[] | null> {
  const map = new Map<string, number[] | null>();
  const entries = (db.tables.LTYPE?.entries ?? []) as LtypeEntry[];
  for (const lt of entries) {
    const name = (lt.name ?? '').toUpperCase();
    if (!name) continue;
    if (name === 'CONTINUOUS' || name === 'BYLAYER' || name === 'BYBLOCK') {
      map.set(name, null);
      continue;
    }
    const pattern = lt.pattern;
    if (!pattern || pattern.length === 0) {
      // Use fallback if known
      map.set(name, LINETYPE_FALLBACK[name] ?? null);
      continue;
    }
    // Convert each element to absolute pixel length.
    // elementLength is in drawing units (mm in our case after normalize),
    // but normalize hasn't run yet on these source-units. We rely on the
    // simple proxy: 1 unit ≈ scaleMmPerUnit px (after canvas mapping the
    // proportions stay roughly the same, and dashArray works on px regardless).
    // Convert: drawing-unit → mm (scaleMmPerUnit) → px (1mm = 1/scaleMmPerUnit px).
    // i.e. drawing-unit → px ratio = 1. So we use absolute pattern values directly,
    // clamped to a sane visual range.
    const out: number[] = [];
    for (const p of pattern) {
      const v = Math.abs(p.elementLength ?? 0);
      out.push(v === 0 ? 1 : Math.max(1, Math.min(20, v)));
    }
    if (out.length === 0) map.set(name, LINETYPE_FALLBACK[name] ?? null);
    else map.set(name, out);
  }
  // Ensure common standard names always have a fallback even if absent in the file
  for (const k of Object.keys(LINETYPE_FALLBACK)) {
    if (!map.has(k)) map.set(k, LINETYPE_FALLBACK[k]);
  }
  return map;
}

function normalizeLinetypeName(name: string): string {
  const u = (name ?? '').toUpperCase().replace(/\s/g, '').trim();
  return u || 'CONTINUOUS';
}

function linetypeKey(name: string): string {
  // Frontend-friendly identifier
  const u = normalizeLinetypeName(name);
  if (u === 'CONTINUOUS' || u === 'BYLAYER' || u === 'BYBLOCK') return 'solid';
  return u.toLowerCase();
}

// ==================== Layer table ====================

interface RawLayer {
  name: string;
  colorIndex?: number;
  lineType?: string;
  lineweight?: number;
  off?: boolean;
  frozen?: boolean;
}

function buildBgLayers(
  db: DwgDatabase,
  scaleMmPerUnit: number,
  ltypeMap: Map<string, number[] | null>,
): { layers: BgLayer[]; byName: Map<string, BgLayer> } {
  const entries = (db.tables.LAYER?.entries ?? []) as unknown as RawLayer[];
  const layers: BgLayer[] = [];
  const byName = new Map<string, BgLayer>();
  for (const l of entries) {
    const name = l.name || '0';
    const colorIndex = l.colorIndex ?? 7;
    const ltRaw = l.lineType ?? 'CONTINUOUS';
    const ltUpper = normalizeLinetypeName(ltRaw);
    const dashArr = ltypeMap.get(ltUpper) ?? LINETYPE_FALLBACK[ltUpper] ?? null;
    const lwPx = lineweightToPx(l.lineweight ?? -3, scaleMmPerUnit);
    const layer: BgLayer = {
      name,
      color: aciToRgb(colorIndex),
      lineweight: lwPx,
      linetype: linetypeKey(ltUpper),
      dashArray: dashArr ?? undefined,
      isVisible: !(l.off === true) && !(l.frozen === true),
    };
    layers.push(layer);
    byName.set(name, layer);
  }
  // Synthesize default '0' layer if missing
  if (!byName.has('0')) {
    const def: BgLayer = {
      name: '0',
      color: '#000000',
      lineweight: 1.0,
      linetype: 'solid',
      isVisible: true,
    };
    layers.push(def);
    byName.set('0', def);
  }
  return { layers, byName };
}

// ==================== Geometry primitives ====================

type Point = [number, number];
type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function applyAffine([a, b, c, d, tx, ty]: Affine, [x, y]: Point): Point {
  return [a * x + b * y + tx, c * x + d * y + ty];
}

function composeAffine(parent: Affine, child: Affine): Affine {
  const [pa, pb, pc, pd, ptx, pty] = parent;
  const [ca, cb, cc, cd, ctx, cty] = child;
  return [
    pa * ca + pb * cc,
    pa * cb + pb * cd,
    pc * ca + pd * cc,
    pc * cb + pd * cd,
    pa * ctx + pb * cty + ptx,
    pc * ctx + pd * cty + pty,
  ];
}

function insertAffine(insert: Record<string, unknown>): Affine {
  const ip = insert.insertionPoint as { x: number; y: number } | undefined;
  const sx = (insert.xScale as number | undefined) ?? 1;
  const sy = (insert.yScale as number | undefined) ?? 1;
  const rot = (insert.rotation as number | undefined) ?? 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  return [sx * cosR, -sy * sinR, sx * sinR, sy * cosR, ip?.x ?? 0, ip?.y ?? 0];
}

interface BlockEntry {
  name: string;
  entities?: DwgEntity[];
}

function buildBlockMap(db: DwgDatabase): Map<string, BlockEntry> {
  const map = new Map<string, BlockEntry>();
  const entries = (db.tables.BLOCK_RECORD?.entries ?? []) as BlockEntry[];
  for (const b of entries) if (b.name) map.set(b.name, b);
  return map;
}

const MAX_INSERT_DEPTH = 4;

// ==================== Entity → primitive ====================

function entityToPolyline(e: DwgEntity): { pts: Point[]; closed: boolean } | null {
  const any = e as unknown as Record<string, unknown>;
  switch (e.type) {
    case 'LINE': {
      const start = any.startPoint as { x: number; y: number } | undefined;
      const end = any.endPoint as { x: number; y: number } | undefined;
      if (start && end) return { pts: [[start.x, start.y], [end.x, end.y]], closed: false };
      return null;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const verts = any.vertices as Array<{ x: number; y: number }> | undefined;
      if (verts && verts.length >= 2) {
        const closed = any.closed === true;
        const pts: Point[] = verts.map((v) => [v.x, v.y]);
        if (closed) pts.push(pts[0]);
        return { pts, closed };
      }
      return null;
    }
    case 'ARC': {
      const c = any.center as { x: number; y: number } | undefined;
      const r = any.radius as number | undefined;
      const sa = any.startAngle as number | undefined;
      const ea = any.endAngle as number | undefined;
      if (c && r != null && sa != null && ea != null) {
        return { pts: approximateArc(c.x, c.y, r, sa, ea, 12), closed: false };
      }
      return null;
    }
    case 'CIRCLE': {
      const c = any.center as { x: number; y: number } | undefined;
      const r = any.radius as number | undefined;
      if (c && r != null) {
        return { pts: approximateArc(c.x, c.y, r, 0, Math.PI * 2, 24), closed: true };
      }
      return null;
    }
    case 'ELLIPSE': {
      const c = any.center as { x: number; y: number } | undefined;
      const major = any.majorAxisEndpoint as { x: number; y: number } | undefined;
      const ratio = (any.minorAxisRatio as number | undefined) ?? 1;
      const sa = (any.startAngle as number | undefined) ?? 0;
      const ea = (any.endAngle as number | undefined) ?? Math.PI * 2;
      if (c && major) {
        const a = Math.hypot(major.x, major.y);
        const b = a * ratio;
        const rotation = Math.atan2(major.y, major.x);
        const segs = 24;
        let a0 = sa;
        let a1 = ea;
        if (a1 < a0) a1 += Math.PI * 2;
        const pts: Point[] = [];
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const ang = a0 + (a1 - a0) * t;
          const lx = a * Math.cos(ang);
          const ly = b * Math.sin(ang);
          const cosR = Math.cos(rotation);
          const sinR = Math.sin(rotation);
          pts.push([c.x + lx * cosR - ly * sinR, c.y + lx * sinR + ly * cosR]);
        }
        const closed = Math.abs((a1 - a0) - Math.PI * 2) < 1e-3;
        return { pts, closed };
      }
      return null;
    }
    case 'SPLINE': {
      const fit = any.fitPoints as Array<{ x: number; y: number }> | undefined;
      const ctrl = any.controlPoints as Array<{ x: number; y: number }> | undefined;
      const verts = (fit && fit.length >= 2) ? fit : (ctrl && ctrl.length >= 2 ? ctrl : null);
      if (verts) return { pts: verts.map((v) => [v.x, v.y]), closed: false };
      return null;
    }
    default:
      return null;
  }
}

function approximateArc(cx: number, cy: number, r: number, startA: number, endA: number, segs: number): Point[] {
  let a0 = startA;
  let a1 = endA;
  if (a1 < a0) a1 += Math.PI * 2;
  const pts: Point[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = a0 + (a1 - a0) * t;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ==================== Entity styling overrides ====================

interface RawStyleOverride {
  colorIndex?: number;
  lineType?: string;
  lineweight?: number;
}

function readEntityStyleRaw(e: DwgEntity): RawStyleOverride {
  const any = e as unknown as Record<string, unknown>;
  return {
    colorIndex: any.colorIndex as number | undefined,
    lineType: any.lineType as string | undefined,
    lineweight: any.lineweight as number | undefined,
  };
}

interface ResolvedOverride {
  color?: string;
  lineweight?: number;
  linetype?: string;
  dashArray?: number[];
}

/**
 * Resolve entity-level styling against its layer's defaults. We only emit
 * overrides where the entity actually differs (BYLAYER convention).
 *
 * AutoCAD entity codes:
 *   colorIndex 256 = BYLAYER, 0 = BYBLOCK, 1..255 = explicit ACI.
 *   lineType '' or 'BYLAYER' or 'BYBLOCK' = inherit; else explicit.
 *   lineweight -1 = BYLAYER, -2 = BYBLOCK, -3 = DEFAULT, ≥0 = explicit (mm·100).
 */
function resolveOverride(
  raw: RawStyleOverride,
  layer: BgLayer,
  scaleMmPerUnit: number,
  ltypeMap: Map<string, number[] | null>,
): ResolvedOverride {
  const out: ResolvedOverride = {};
  const ci = raw.colorIndex;
  if (ci != null && ci !== 256 && ci !== 0) {
    const c = aciToRgb(ci);
    if (c.toLowerCase() !== layer.color.toLowerCase()) out.color = c;
  }
  const lw = raw.lineweight;
  if (lw != null && lw >= 0) {
    const px = lineweightToPx(lw, scaleMmPerUnit);
    if (Math.abs(px - layer.lineweight) > 0.05) out.lineweight = px;
  }
  const lt = raw.lineType;
  if (lt && lt !== '' && lt.toUpperCase() !== 'BYLAYER' && lt.toUpperCase() !== 'BYBLOCK') {
    const ltUpper = normalizeLinetypeName(lt);
    const ltKey = linetypeKey(ltUpper);
    if (ltKey !== layer.linetype) {
      out.linetype = ltKey;
      const dash = ltypeMap.get(ltUpper) ?? LINETYPE_FALLBACK[ltUpper] ?? null;
      if (dash) out.dashArray = dash;
    }
  }
  return out;
}

// ==================== Text alignment ====================

function decodeTextHAlign(h: number | undefined): 'left' | 'center' | 'right' | undefined {
  switch (h) {
    case 0: return 'left';
    case 1: return 'center';
    case 2: return 'right';
    case 3: return 'center'; // Aligned (between two points)
    case 4: return 'center'; // Middle
    case 5: return 'center'; // Fit
    default: return undefined;
  }
}

function decodeTextVAlign(v: number | undefined): 'top' | 'middle' | 'bottom' | 'baseline' | undefined {
  switch (v) {
    case 0: return 'baseline';
    case 1: return 'bottom';
    case 2: return 'middle';
    case 3: return 'top';
    default: return undefined;
  }
}

/**
 * MTEXT attachmentPoint 1..9 → halign/valign pair.
 *  1=TL 2=TC 3=TR 4=ML 5=MC 6=MR 7=BL 8=BC 9=BR
 */
function decodeMtextAttach(p: number | undefined): { hAlign?: BgText['hAlign']; vAlign?: BgText['vAlign'] } {
  if (p == null) return {};
  const row = Math.ceil(p / 3); // 1=top,2=mid,3=bot
  const col = ((p - 1) % 3) + 1; // 1=L,2=C,3=R
  const vAlign: BgText['vAlign'] = row === 1 ? 'top' : row === 2 ? 'middle' : 'bottom';
  const hAlign: BgText['hAlign'] = col === 1 ? 'left' : col === 2 ? 'center' : 'right';
  return { hAlign, vAlign };
}

// ==================== Hatch boundary edges → polyline ====================

interface HatchEdge {
  type: number; // 1=Line, 2=Arc, 3=Ellipse, 4=Spline
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  isCounterClockwise?: number;
  controlPoints?: Array<{ x: number; y: number }>;
  fitDatum?: Array<{ x: number; y: number }>;
}

function hatchEdgesToPolyline(edges: HatchEdge[]): Point[] {
  const out: Point[] = [];
  const push = (p: { x: number; y: number }) => {
    if (out.length === 0 || out[out.length - 1][0] !== p.x || out[out.length - 1][1] !== p.y) {
      out.push([p.x, p.y]);
    }
  };
  for (const e of edges) {
    switch (e.type) {
      case 1: { // Line
        if (e.start) push(e.start);
        if (e.end) push(e.end);
        break;
      }
      case 2: { // Arc
        const { center, radius, startAngle, endAngle } = e;
        if (center && radius != null && startAngle != null && endAngle != null) {
          const ccw = e.isCounterClockwise == null ? true : e.isCounterClockwise === 1;
          let a0 = startAngle;
          let a1 = endAngle;
          if (!ccw) {
            // Reverse traversal
            const tmp = a0; a0 = a1; a1 = tmp;
          }
          if (a1 < a0) a1 += Math.PI * 2;
          const segs = 12;
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const a = a0 + (a1 - a0) * t;
            push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
          }
        }
        break;
      }
      case 4: { // Spline — control polygon as best-effort approximation
        const cps = e.fitDatum && e.fitDatum.length >= 2 ? e.fitDatum : e.controlPoints;
        if (cps) for (const cp of cps) push(cp);
        break;
      }
      // type 3 (Ellipse) skipped — uncommon in HATCH boundaries
      default:
        break;
    }
  }
  return out;
}

// ==================== Geometry extraction ====================

interface RawPath {
  layer: string;
  pts: Point[];
  closed: boolean;
  raw: RawStyleOverride;
}

interface RawText {
  layer: string;
  text: string;
  x: number;
  y: number;
  size: number; // source-units (height)
  rotation: number; // radians, source-frame
  hAlign?: BgText['hAlign'];
  vAlign?: BgText['vAlign'];
  isMultiLine?: boolean;
  raw: RawStyleOverride;
}

interface RawFilled {
  layer: string;
  loops: Point[][];
  pattern: 'solid';
  raw: RawStyleOverride;
}

interface ExtractedRaw {
  paths: RawPath[];
  texts: RawText[];
  filled: RawFilled[];
}

function extractGeometry(db: DwgDatabase): ExtractedRaw {
  const paths: RawPath[] = [];
  const texts: RawText[] = [];
  const filled: RawFilled[] = [];
  const blockMap = buildBlockMap(db);

  function visit(entities: DwgEntity[], xform: Affine, depth: number) {
    for (const e of entities) {
      if (e.type === 'INSERT') {
        if (depth >= MAX_INSERT_DEPTH) continue;
        const ins = e as unknown as Record<string, unknown>;
        const blockName = ins.name as string | undefined;
        if (!blockName) continue;
        const block = blockMap.get(blockName);
        const subEntities = block?.entities;
        if (!subEntities || subEntities.length === 0) continue;
        const local = insertAffine(ins);
        visit(subEntities, composeAffine(xform, local), depth + 1);
        continue;
      }

      // Polyline-shaped entities
      const lp = entityToPolyline(e);
      if (lp) {
        const transformed = lp.pts.map((p) => applyAffine(xform, p));
        paths.push({
          layer: e.layer || '0',
          pts: transformed,
          closed: lp.closed,
          raw: readEntityStyleRaw(e),
        });
        continue;
      }

      // TEXT / MTEXT
      if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const t = entityToTextRaw(e, xform);
        if (t) texts.push(t);
        continue;
      }

      // SOLID / TRACE
      if (e.type === 'SOLID' || e.type === 'TRACE') {
        const f = entityToSolidFilled(e, xform);
        if (f) filled.push(f);
        continue;
      }

      // HATCH
      if (e.type === 'HATCH') {
        const f = entityToHatchFilled(e, xform);
        if (f) filled.push(f);
        continue;
      }
    }
  }

  visit(db.entities, IDENTITY, 0);
  return { paths, texts, filled };
}

function entityToTextRaw(e: DwgEntity, xform: Affine): RawText | null {
  const any = e as unknown as Record<string, unknown>;
  const isMText = e.type === 'MTEXT';
  const ip = (any.startPoint ?? any.insertionPoint ?? any.alignmentPoint) as { x: number; y: number } | undefined;
  const txtRaw = (any.text as string | undefined)?.trim();
  if (!ip || !txtRaw) return null;
  let cleaned = txtRaw;
  let isMultiLine = false;
  if (isMText) {
    isMultiLine = /\\P/.test(txtRaw);
    cleaned = txtRaw.replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
    if (isMultiLine) cleaned = cleaned.replace(/\\P/g, '\n');
  }
  cleaned = cleaned.trim();
  if (!cleaned) return null;

  const [tx, ty] = applyAffine(xform, [ip.x, ip.y]);
  const entityRot = (any.rotation as number | undefined) ?? 0;
  // Compose rotation with parent INSERT rotation extracted from xform.
  const xformRot = Math.atan2(xform[2], xform[0]);
  const rotation = entityRot + xformRot;
  // Source-unit text height; scaled by xform's scale magnitude.
  const sx = Math.hypot(xform[0], xform[2]);
  const heightMm = (any.textHeight as number | undefined) ?? 14;
  const sizeSrc = heightMm * Math.max(0.001, sx);

  let hAlign: BgText['hAlign'];
  let vAlign: BgText['vAlign'];
  if (isMText) {
    const ap = decodeMtextAttach(any.attachmentPoint as number | undefined);
    hAlign = ap.hAlign;
    vAlign = ap.vAlign;
  } else {
    hAlign = decodeTextHAlign(any.halign as number | undefined);
    vAlign = decodeTextVAlign(any.valign as number | undefined);
  }

  return {
    layer: e.layer || '0',
    text: cleaned,
    x: tx,
    y: ty,
    size: sizeSrc,
    rotation,
    hAlign,
    vAlign,
    isMultiLine: isMultiLine || undefined,
    raw: readEntityStyleRaw(e),
  };
}

function entityToSolidFilled(e: DwgEntity, xform: Affine): RawFilled | null {
  const any = e as unknown as Record<string, unknown>;
  const c1 = any.corner1 as { x: number; y: number } | undefined;
  const c2 = any.corner2 as { x: number; y: number } | undefined;
  const c3 = any.corner3 as { x: number; y: number } | undefined;
  const c4 = any.corner4 as { x: number; y: number } | undefined;
  if (!c1 || !c2 || !c3) return null;
  // SOLID corner ordering is non-obvious: actual polygon traversal is
  // c1, c2, c4, c3 (DXF spec); when c4 ≈ c3, it degenerates to a triangle.
  const corners = [c1, c2, c4 ?? c3, c3];
  const pts: Point[] = corners.map((p) => applyAffine(xform, [p.x, p.y]));
  return {
    layer: e.layer || '0',
    loops: [pts],
    pattern: 'solid',
    raw: readEntityStyleRaw(e),
  };
}

function entityToHatchFilled(e: DwgEntity, xform: Affine): RawFilled | null {
  const any = e as unknown as Record<string, unknown>;
  const solidFill = any.solidFill as number | undefined;
  // v1: only solid fills are rendered. Patterned hatches need pattern instancing.
  if (solidFill !== 1) return null;
  const paths = (any.boundaryPaths ?? []) as Array<{ vertices?: Array<{ x: number; y: number }>; edges?: HatchEdge[] }>;
  if (!paths.length) return null;
  const loops: Point[][] = [];
  for (const p of paths) {
    let pts: Point[];
    if (p.vertices && p.vertices.length >= 3) {
      pts = p.vertices.map((v) => [v.x, v.y]);
    } else if (p.edges && p.edges.length > 0) {
      pts = hatchEdgesToPolyline(p.edges);
    } else {
      continue;
    }
    if (pts.length < 3) continue;
    loops.push(pts.map((pt) => applyAffine(xform, pt)));
  }
  if (loops.length === 0) return null;
  return {
    layer: e.layer || '0',
    pattern: 'solid',
    loops,
    raw: readEntityStyleRaw(e),
  };
}

// ==================== Simplification ====================

function simplifyPolyline(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpendicularDist(points[i], points[a], points[b]);
      if (d > maxDist) { maxDist = d; idx = i; }
    }
    if (idx !== -1 && maxDist > eps) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpendicularDist(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const projX = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const projY = a[1] + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

// ==================== Normalization ====================

const TARGET_CANVAS_WIDTH = 2000;
const TARGET_CANVAS_HEIGHT = 1500;
const TARGET_MARGIN = 50;

function computeBounds(paths: RawPath[], texts: RawText[], filled: RawFilled[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of paths) for (const [x, y] of p.pts) eat(x, y);
  for (const t of texts) eat(t.x, t.y);
  for (const f of filled) for (const loop of f.loops) for (const [x, y] of loop) eat(x, y);
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
  return { minX, minY, maxX, maxY };
}

interface NormalizeOptions {
  canvasWidth: number;
  canvasHeight: number;
  margin: number;
  manualScale?: number;
}

function normalize(raw: ExtractedRaw, opts: NormalizeOptions) {
  const src = computeBounds(raw.paths, raw.texts, raw.filled);
  const srcW = Math.max(1, src.maxX - src.minX);
  const srcH = Math.max(1, src.maxY - src.minY);
  const targetW = opts.canvasWidth - opts.margin * 2;
  const targetH = opts.canvasHeight - opts.margin * 2;
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const offsetX = opts.margin - src.minX * scale;
  // Y-flip
  const offsetY = opts.canvasHeight - opts.margin - (src.maxY - src.minY) * scale + src.minY * scale;
  const epsilonSrc = 0.5 / scale;
  const project = ([x, y]: Point): Point => [x * scale + offsetX, -y * scale + offsetY];

  return {
    project,
    scale,
    offsetX,
    offsetY,
    epsilonSrc,
    srcBounds: src,
    canvasWidth: opts.canvasWidth,
    canvasHeight: opts.canvasHeight,
    scaleMmPerUnit: opts.manualScale ?? 1 / scale,
  };
}

// ==================== Service ====================

function flattenPoints(pts: Point[]): number[] {
  const out: number[] = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    out[i * 2] = pts[i][0];
    out[i * 2 + 1] = pts[i][1];
  }
  return out;
}

class DwgImportService {
  async importToFloor(
    floorId: string,
    fileName: string,
    fileBuffer: Buffer,
    options: ImportOptions,
  ): Promise<ImportResult> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const fileType: 'DWG' | 'DXF' = fileName.toLowerCase().endsWith('.dxf') ? 'DXF' : 'DWG';
    const db = await parseFile(fileBuffer, fileType);

    // 1) Extract raw geometry (source-unit coords + raw entity styling).
    const raw = extractGeometry(db);

    // 2) Compute canvas projection.
    const norm = normalize(raw, {
      canvasWidth: floor.canvasWidth || TARGET_CANVAS_WIDTH,
      canvasHeight: floor.canvasHeight || TARGET_CANVAS_HEIGHT,
      margin: TARGET_MARGIN,
      manualScale: options.scaleMmPerUnit,
    });

    // 3) Now that scaleMmPerUnit is known, build LTYPE map + layers.
    const ltypeMap = buildLtypeMap(db);
    const { layers, byName: layerByName } = buildBgLayers(db, norm.scaleMmPerUnit, ltypeMap);

    // 4) Optional layer filter (advanced mode).
    const layerFilter: Set<string> | null =
      options.mode === 'smart' ? null : new Set(options.layers ?? []);
    const includeLayer = (name: string) => !layerFilter || layerFilter.has(name);

    // 5) Project + style entities.
    const paths: BgPath[] = [];
    for (const p of raw.paths) {
      if (!includeLayer(p.layer)) continue;
      const layer = layerByName.get(p.layer);
      if (!layer) continue;
      const simplified = simplifyPolyline(p.pts, norm.epsilonSrc);
      const projected = simplified.map(norm.project);
      // Drop trivial-length paths (< 1 px after projection).
      if (projected.length < 2) continue;
      let total = 0;
      for (let i = 1; i < projected.length; i++) {
        total += Math.hypot(projected[i][0] - projected[i - 1][0], projected[i][1] - projected[i - 1][1]);
        if (total >= 1) break;
      }
      if (total < 1) continue;
      const override = resolveOverride(p.raw, layer, norm.scaleMmPerUnit, ltypeMap);
      paths.push({
        layer: p.layer,
        points: flattenPoints(projected),
        closed: p.closed || undefined,
        ...override,
      });
    }

    const texts: BgText[] = [];
    for (const t of raw.texts) {
      if (!includeLayer(t.layer)) continue;
      const layer = layerByName.get(t.layer);
      if (!layer) continue;
      const [px, py] = norm.project([t.x, t.y]);
      // Y-flip inverts rotation sign.
      const rotation = -t.rotation;
      const pxSize = Math.max(8, Math.min(48, t.size * norm.scale));
      const override = resolveOverride(t.raw, layer, norm.scaleMmPerUnit, ltypeMap);
      texts.push({
        layer: t.layer,
        x: px,
        y: py,
        text: t.text,
        size: pxSize,
        rotation: Math.abs(rotation) > 1e-3 ? rotation : undefined,
        hAlign: t.hAlign,
        vAlign: t.vAlign,
        color: override.color,
        isMultiLine: t.isMultiLine,
      });
    }

    const filled: BgFilled[] = [];
    for (const f of raw.filled) {
      if (!includeLayer(f.layer)) continue;
      const layer = layerByName.get(f.layer);
      if (!layer) continue;
      const projectedLoops = f.loops
        .map((loop) => loop.map(norm.project))
        .filter((loop) => loop.length >= 3);
      if (projectedLoops.length === 0) continue;
      const override = resolveOverride(f.raw, layer, norm.scaleMmPerUnit, ltypeMap);
      filled.push({
        layer: f.layer,
        loops: projectedLoops.map(flattenPoints),
        color: override.color,
        pattern: f.pattern,
      });
    }

    // 6) Compute output bounds for the projected scene.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    for (const p of paths) {
      for (let i = 0; i < p.points.length; i += 2) eat(p.points[i], p.points[i + 1]);
    }
    for (const t of texts) eat(t.x, t.y);
    for (const f of filled) {
      for (const loop of f.loops) {
        for (let i = 0; i < loop.length; i += 2) eat(loop[i], loop[i + 1]);
      }
    }
    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = norm.canvasWidth; maxY = norm.canvasHeight;
    }

    const backgroundDrawing: BackgroundDrawing = {
      source: { fileName, importedAt: new Date().toISOString(), fileType },
      bounds: { minX, minY, maxX, maxY },
      scaleMmPerUnit: norm.scaleMmPerUnit,
      layers,
      paths,
      texts,
      filled,
    };

    if (options.commit) {
      await prisma.floor.update({
        where: { id: floorId },
        data: { backgroundDrawing: backgroundDrawing as unknown as object },
      });
    }

    return {
      backgroundDrawing,
      committed: options.commit,
    };
  }

  async clearBackground(floorId: string): Promise<void> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');
    await prisma.floor.update({
      where: { id: floorId },
      data: { backgroundDrawing: null as unknown as object },
    });
  }

  async setOpacity(floorId: string, opacity: number): Promise<void> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');
    const clamped = Math.max(0, Math.min(1, opacity));
    await prisma.floor.update({
      where: { id: floorId },
      data: { backgroundOpacity: clamped },
    });
  }
}

export const dwgImportService = new DwgImportService();
