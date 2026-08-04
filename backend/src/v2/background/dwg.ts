import path from 'node:path';
import { createRequire } from 'node:module';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgDatabase,
  DwgEllipseEntity,
  DwgEntity,
  DwgHatchEntity,
  DwgInsertEntity,
  DwgMTextEntity,
  DwgLWPolylineEntity,
  DwgLineEntity,
  DwgSolidEntity,
  DwgSplineEntity,
  DwgTextEntity,
} from '@mlightcad/libredwg-web';
import type { BackgroundDrawing, BgFilled, BgLayer, BgPath, BgText } from '@twin/core';
import { HttpError } from '../errors.js';

// Resolve WASM dir from the actual package location instead of a hardcoded
// relative path. The compiled output lives in dist/services/, while the
// source lives in src/services/ — a fixed `../../../` works in dev (hoisted
// node_modules at project root) but resolves to `/` inside the production
// container (WORKDIR=/app, so dist/services + ../../../ = /).
//
// Resolving via the main entry (rather than `<pkg>/package.json`) avoids the
// package's `exports` allowlist — libredwg-web only exports the bundle, not
// `./package.json` or `./wasm/*`, so a direct subpath resolve throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. The main entry lives at `<pkg>/dist/...`,
// so going up one level lands on the package root.
const require = createRequire(import.meta.url);
const WASM_DIR = path.resolve(
  path.dirname(require.resolve('@mlightcad/libredwg-web')),
  '..',
  'wasm',
);

// 위 블록은 Stage 재구축으로 이 파일이 src/services/ → src/v2/background/ 로
// 옮겨진 뒤에도 그대로다: 해석 기준이 파일 위치가 아니라 패키지 main 엔트리라
// 디렉터리 깊이가 바뀌어도 영향받지 않는다. 상대경로로 되돌리지 말 것.

// ==================== WASM lifecycle ====================

let _libredwg: Awaited<ReturnType<typeof LibreDwg.create>> | null = null;

async function getLibreDwg() {
  if (!_libredwg) {
    _libredwg = await LibreDwg.create(WASM_DIR);
  }
  return _libredwg;
}

// ==================== Parsing ====================

// libredwg 상태 코드(M-2, 후속 처리 조사 완료 — 고치지 않기로 함):
//
// libredwg 관례상 dwg_read_data 의 내부 상태 코드는 128 미만이 비치명 경고,
// 128 이상이 치명이다. 실제로 이 라이브러리는 내부에서 그 코드를 계산한다
// (@mlightcad/libredwg-web/lib/libredwg.js 의 dwg_read_data: `result.error`를
// 계산해 `console.log`로만 찍고 버린다 — 아래 stdout 의 "Open dwg file with
// error code: N" 로그가 그 흔적이다).
//
// 그러나 우리가 실제로 호출하는 공개 API `LibreDwg#dwg_read_data`(여기서
// `lib.dwg_read_data(ab, ftCode)`로 부르는 바로 그 메서드)의 타입 정의
// (node_modules/@mlightcad/libredwg-web/lib/libredwg.d.ts)는
//   dwg_read_data(fileContent, fileType): number | undefined
// 로, 반환값이 데이터 포인터 하나뿐이고 상태 코드는 노출하지 않는다 — 내부에서
// 계산한 값을 로그만 찍고 버린다.
//
// 저수준 `dwg_read_file`(상태 코드를 포함한 `{error, data}`를 실제로 반환하는
// 함수)은 wasm 모듈(MainModule, wasm/libredwg-web.d.ts)에 존재하긴 하지만,
// `dwg_read_data`가 내부적으로 하는 임시파일 쓰기(FS.writeFile)·읽기·정리
// (FS.unlink)를 우리가 다시 구현해야 접근할 수 있다 — 이는 라이브러리가
// 공개 계약으로 노출하지 않는 사적 구현(고정된 임시 파일명, 반환 타입도 `any`)을
// 그대로 베끼는 것이라 판단했다. 그래서 상태 코드 검사는 추가하지 않는다.
async function parseFile(buffer: Buffer, fileType: 'DWG' | 'DXF'): Promise<DwgDatabase> {
  const lib = await getLibreDwg();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const ftCode = fileType === 'DXF' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
  const dwgPtr = lib.dwg_read_data(ab, ftCode);
  if (dwgPtr == null) {
    throw new HttpError(400, 'PARSE_FAILED', '도면 파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 손상된 파일)');
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
 * Under the "1 canvas unit = 1 cm" convention we emit lineweight in **cm**
 * (mm·100 → mm → cm = lw / 1000). The renderer multiplies by the active zoom
 * factor (px/cm) to get screen pixels and clamps for legibility there.
 *
 * Default (DEFAULT/BYLAYER/missing) → 0.025 cm (≈ 0.25 mm), the AutoCAD
 * out-of-the-box default lineweight.
 */
function lineweightToCm(lw: number): number {
  if (lw == null || lw < 0) return 0.025;
  const cm = lw / 1000;
  if (cm <= 0) return 0.025;
  return cm;
}

// ==================== Linetype ====================

// Fallback dash patterns in **cm** units (1 canvas unit = 1 cm).
// Calibrated for architectural drawings: a CENTER line should be visible
// at typical zoom (~1 px/cm to 10 px/cm) without being noisy.
const LINETYPE_FALLBACK: Record<string, number[] | null> = {
  CONTINUOUS: null,
  BYLAYER: null,
  BYBLOCK: null,
  DASHED: [4, 2],
  CENTER: [10, 2, 2, 2],
  CENTER2: [4, 1, 1, 1],
  HIDDEN: [2, 2],
  HIDDEN2: [1, 1],
  DASHDOT: [4, 2, 0.5, 2],
  PHANTOM: [10, 2, 2, 2, 2, 2],
  DOT: [0.5, 2],
  DIVIDE: [6, 2, 0.5, 2, 0.5, 2],
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
    // elementLength is in drawing units (mm). Convert to cm (÷10) to match
    // the "1 canvas unit = 1 cm" coordinate convention. A 0-length entry
    // (pure dot) gets a tiny non-zero cm so dasharray doesn't degenerate.
    const out: number[] = [];
    for (const p of pattern) {
      const mm = Math.abs(p.elementLength ?? 0);
      const cm = mm / 10;
      out.push(cm <= 0 ? 0.1 : cm);
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
    const lwCm = lineweightToCm(l.lineweight ?? -3);
    const layer: BgLayer = {
      name,
      color: aciToRgb(colorIndex),
      lineweight: lwCm,
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
      lineweight: 0.025, // cm — AutoCAD's default "DEFAULT" lineweight (≈0.25 mm)
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

function insertAffine(insert: DwgInsertEntity): Affine {
  const ip = insert.insertionPoint;
  const sx = insert.xScale ?? 1;
  const sy = insert.yScale ?? 1;
  const rot = insert.rotation ?? 0;
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

/**
 * 엔티티 → 폴리라인. **libredwg 의 구체 엔티티 타입으로 좁혀서 읽는다.**
 *
 * 이전에는 `e as unknown as Record<string, unknown>` 로 캐스트한 뒤 문자열 키로
 * 필드를 읽었는데, 그러면 필드명을 틀려도 컴파일이 통과하고 런타임에 undefined 가
 * 되어 그 엔티티가 통째로 버려진다. 실제로 ELLIPSE 두 필드가 그렇게 틀려 있어
 * 실무 도면 한 장에서 타원 690 개(전체 엔티티의 19%)가 조용히 사라지고 있었다.
 * 구체 타입으로 캐스트하면 컴파일러가 라이브러리 정의와 대조해 준다.
 */
function entityToPolyline(e: DwgEntity): { pts: Point[]; closed: boolean } | null {
  switch (e.type) {
    case 'LINE': {
      const { startPoint: start, endPoint: end } = e as DwgLineEntity;
      if (start && end) return { pts: [[start.x, start.y], [end.x, end.y]], closed: false };
      return null;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const lw = e as DwgLWPolylineEntity;
      const verts = lw.vertices;
      if (verts && verts.length >= 2) {
        // DXF 70 그룹코드 비트 0 = 닫힘. libredwg 는 `closed` 불리언을 주지 않는다
        // (이전 코드가 `any.closed === true` 를 읽어 항상 false 였다).
        const closed = ((lw.flag ?? 0) & 1) === 1;
        const pts: Point[] = verts.map((v) => [v.x, v.y]);
        if (closed) pts.push(pts[0]);
        return { pts, closed };
      }
      return null;
    }
    case 'ARC': {
      const { center: c, radius: r, startAngle: sa, endAngle: ea } = e as DwgArcEntity;
      if (c && r != null && sa != null && ea != null) {
        return { pts: approximateArc(c.x, c.y, r, sa, ea, 12), closed: false };
      }
      return null;
    }
    case 'CIRCLE': {
      const { center: c, radius: r } = e as DwgCircleEntity;
      if (c && r != null) {
        return { pts: approximateArc(c.x, c.y, r, 0, Math.PI * 2, 24), closed: true };
      }
      return null;
    }
    case 'ELLIPSE': {
      // majorAxisEndPoint / axisRatio — 라이브러리 정의 그대로다.
      // (이전 코드는 majorAxisEndpoint / minorAxisRatio 로 읽어 항상 undefined 였고
      //  그 결과 모든 타원이 `return null` 로 버려졌다.)
      const el = e as DwgEllipseEntity;
      const c = el.center;
      const major = el.majorAxisEndPoint;
      const ratio = el.axisRatio ?? 1;
      const sa = el.startAngle ?? 0;
      const ea = el.endAngle ?? Math.PI * 2;
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
        const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-3;
        return { pts, closed };
      }
      return null;
    }
    case 'SPLINE': {
      const sp = e as DwgSplineEntity;
      const fit = sp.fitPoints;
      const ctrl = sp.controlPoints;
      const verts = fit && fit.length >= 2 ? fit : ctrl && ctrl.length >= 2 ? ctrl : null;
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
  // 캐스트하지 않는다 — colorIndex/lineType/lineweight 는 libredwg 의 DwgEntity
  // 기본 인터페이스에 이미 선언돼 있다. Record<string, unknown> 으로 우회하면
  // 라이브러리가 필드를 개명해도 컴파일이 통과하고 런타임에 undefined 가 된다.
  const { colorIndex, lineType, lineweight } = e;
  return { colorIndex, lineType, lineweight };
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
    const cm = lineweightToCm(lw);
    // Significant difference threshold: 0.005 cm = 0.05 mm.
    if (Math.abs(cm - layer.lineweight) > 0.005) out.lineweight = cm;
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
  /**
   * 반시계 여부. libredwg 의 실제 키는 `isCCW` 이고 **불리언**이다
   * (이전에는 `isCounterClockwise?: number` 로 선언하고 `=== 1` 로 비교해
   *  항상 undefined → 항상 반시계로 처리했다 — 시계방향 호 경계가 뒤집혔다).
   */
  isCCW?: boolean;
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
            const ccw = e.isCCW ?? true;
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
        const ins = e as DwgInsertEntity;
        const blockName = ins.name;
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
  const isMText = e.type === 'MTEXT';
  // TEXT 는 startPoint, MTEXT 는 insertionPoint 를 기준점으로 준다(라이브러리 정의).
  const t = e as DwgTextEntity;
  const mt = e as DwgMTextEntity;
  const ip: { x: number; y: number } | undefined = isMText ? mt.insertionPoint : t.startPoint;
  const txtRaw = (isMText ? mt.text : t.text)?.trim();
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
  const entityRot = (isMText ? mt.rotation : t.rotation) ?? 0;
  // Compose rotation with parent INSERT rotation extracted from xform.
  const xformRot = Math.atan2(xform[2], xform[0]);
  const rotation = entityRot + xformRot;
  // Source-unit text height; scaled by xform's scale magnitude.
  const sx = Math.hypot(xform[0], xform[2]);
  const heightMm = (isMText ? mt.textHeight : t.textHeight) ?? 14;
  const sizeSrc = heightMm * Math.max(0.001, sx);

  let hAlign: BgText['hAlign'];
  let vAlign: BgText['vAlign'];
  if (isMText) {
    const ap = decodeMtextAttach(mt.attachmentPoint);
    hAlign = ap.hAlign;
    vAlign = ap.vAlign;
  } else {
    hAlign = decodeTextHAlign(t.halign);
    vAlign = decodeTextVAlign(t.valign);
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
  const { corner1: c1, corner2: c2, corner3: c3, corner4: c4 } = e as DwgSolidEntity;
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
  const hatch = e as DwgHatchEntity;
  // v1: 단색 채움만 그린다(패턴 해치는 패턴 인스턴싱이 필요). solidFill 은 숫자 열거다.
  if (hatch.solidFill !== 1) return null;
  const paths = (hatch.boundaryPaths ?? []) as Array<{ vertices?: Array<{ x: number; y: number }>; edges?: HatchEdge[] }>;
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

/**
 * Under the "1 canvas unit = 1 cm" convention, importing a DWG no longer
 * fits the drawing into the canvas — it preserves real-world size. The
 * source DWG coords (mm) are divided by 10 to land in cm, the Y axis is
 * flipped (CAD: Y up → canvas: Y down), and an offset shifts the bounds
 * so they start at (0, 0).
 *
 * Resulting frame:
 *   x ∈ [0, (srcMaxX - srcMinX) / 10]
 *   y ∈ [0, (srcMaxY - srcMinY) / 10]
 */
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

/** mm → cm scale factor, hard-coded under the new convention. */
const MM_PER_CM = 10;
const SRC_TO_CM = 1 / MM_PER_CM;

function normalize(raw: ExtractedRaw) {
  const src = computeBounds(raw.paths, raw.texts, raw.filled);
  // Canvas-frame dimensions in cm.
  const widthCm = (src.maxX - src.minX) * SRC_TO_CM;
  const heightCm = (src.maxY - src.minY) * SRC_TO_CM;
  // Project: source-mm → cm, with origin at (0,0) and Y flipped.
  //   x_canvas = (x_src - minX) / 10
  //   y_canvas = (maxY - y_src) / 10
  const project = ([x, y]: Point): Point => [
    (x - src.minX) * SRC_TO_CM,
    (src.maxY - y) * SRC_TO_CM,
  ];
  // Simplification tolerance: ~0.5 cm ⇒ 5 mm in source units.
  const epsilonSrc = 5;

  return {
    project,
    epsilonSrc,
    srcBounds: src,
    /** Output frame width, in cm. */
    widthCm,
    /** Output frame height, in cm. */
    heightCm,
    /** mm → cm conversion factor (for entity-local sizes like text height). */
    srcToCm: SRC_TO_CM,
  };
}

// ==================== Parser ====================

function flattenPoints(pts: Point[]): number[] {
  const out: number[] = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    out[i * 2] = pts[i][0];
    out[i * 2 + 1] = pts[i][1];
  }
  return out;
}

/**
 * DWG/DXF 버퍼 → BackgroundDrawing (순수 함수 — DB 접근 없음).
 * 모든 레이어를 포함한다. 좌표는 cm(1 canvas unit = 1 cm), Y 는 이미 뒤집힌 상태.
 */
export async function parseDwg(
  buffer: Buffer,
  fileType: 'DWG' | 'DXF',
  fileName: string,
): Promise<BackgroundDrawing> {
  const db = await parseFile(buffer, fileType);

  // 1) Extract raw geometry (source-unit coords + raw entity styling).
  const raw = extractGeometry(db);

  // 2) Compute canvas projection (mm → cm + Y-flip + origin offset).
  const norm = normalize(raw);

  // 3) Build LTYPE map + layers (lineweights/dashArrays already in cm).
  const ltypeMap = buildLtypeMap(db);
  const { layers, byName: layerByName } = buildBgLayers(db, ltypeMap);

  // 4) Project + style entities.
  const paths: BgPath[] = [];
  for (const p of raw.paths) {
    const layer = layerByName.get(p.layer);
    if (!layer) continue;
    const simplified = simplifyPolyline(p.pts, norm.epsilonSrc);
    const projected = simplified.map(norm.project);
    if (projected.length < 2) continue;
    // Drop trivial-length paths: < 0.1 cm (1 mm) after projection.
    let total = 0;
    for (let i = 1; i < projected.length; i++) {
      total += Math.hypot(projected[i][0] - projected[i - 1][0], projected[i][1] - projected[i - 1][1]);
      if (total >= 0.1) break;
    }
    if (total < 0.1) continue;
    const override = resolveOverride(p.raw, layer, ltypeMap);
    paths.push({
      layer: p.layer,
      points: flattenPoints(projected),
      closed: p.closed || undefined,
      ...override,
    });
  }

  const texts: BgText[] = [];
  for (const t of raw.texts) {
    const layer = layerByName.get(t.layer);
    if (!layer) continue;
    const [cx, cy] = norm.project([t.x, t.y]);
    // Y-flip inverts rotation sign.
    const rotation = -t.rotation;
    // Source text height is mm; convert to cm.
    const sizeCm = t.size * norm.srcToCm;
    const override = resolveOverride(t.raw, layer, ltypeMap);
    texts.push({
      layer: t.layer,
      x: cx,
      y: cy,
      text: t.text,
      size: sizeCm,
      rotation: Math.abs(rotation) > 1e-3 ? rotation : undefined,
      hAlign: t.hAlign,
      vAlign: t.vAlign,
      color: override.color,
      isMultiLine: t.isMultiLine,
    });
  }

  const filled: BgFilled[] = [];
  for (const f of raw.filled) {
    const layer = layerByName.get(f.layer);
    if (!layer) continue;
    const projectedLoops = f.loops
      .map((loop) => loop.map(norm.project))
      .filter((loop) => loop.length >= 3);
    if (projectedLoops.length === 0) continue;
    const override = resolveOverride(f.raw, layer, ltypeMap);
    filled.push({
      layer: f.layer,
      loops: projectedLoops.map(flattenPoints),
      color: override.color,
      pattern: f.pattern,
    });
  }

  // 5) Compute output bounds (in cm) for the projected scene.
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
    minX = 0; minY = 0; maxX = Math.max(1, norm.widthCm); maxY = Math.max(1, norm.heightCm);
  }

  const source = { fileName, importedAt: new Date().toISOString(), fileType };

  return {
    source,
    bounds: { minX, minY, maxX, maxY },
    layers,
    paths,
    texts,
    filled,
  };
}
