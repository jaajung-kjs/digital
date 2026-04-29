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

export interface LayerInfo {
  name: string;
  entityCount: number;
  /** counts by entity type for quick scan */
  byType: Record<string, number>;
  /** heuristic: ratio of LWPOLYLINE/POLYLINE2D entities (architectural-ish) */
  polylineRatio: number;
  /** has TEXT/MTEXT */
  hasText: boolean;
  /** Original AutoCAD color index (1-255) */
  colorIndex?: number;
  /** Smart-detection score (higher = more likely outline) */
  outlineScore: number;
}

export interface BackgroundLabel {
  x: number;
  y: number;
  text: string;
  size: number;
}

export interface BackgroundOutline {
  /** Each polyline is a flat array [x1,y1,x2,y2,...] */
  polylines: number[][];
  color: string;
  strokeWidth: number;
}

export interface BackgroundDrawing {
  source: {
    fileName: string;
    importedAt: string;
    fileType: 'DWG' | 'DXF';
  };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  scaleMmPerUnit: number;
  outline: BackgroundOutline | null;
  labels: BackgroundLabel[];
  /** Layer names that contributed to outline (for transparency) */
  outlineLayers: string[];
  /** Layer names that contributed to labels */
  labelLayers: string[];
}

export interface ImportResult {
  backgroundDrawing: BackgroundDrawing;
  availableLayers: LayerInfo[];
  smartChoice: { outline: string[]; labels: string[] };
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

// ==================== Layer analysis ====================

const OUTLINE_KEYWORDS = [
  '건물', '벽', '실', '공간', '구분', '경계', '윤곽', '구조', '도근', '외곽',
  'wall', 'outline', 'boundary', 'building', 'plan', 'arch',
];

function scoreLayer(name: string, entities: DwgEntity[]): LayerInfo {
  const byType: Record<string, number> = {};
  let polylineCount = 0;
  let hasText = false;

  for (const e of entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D' || e.type === 'POLYLINE3D') polylineCount++;
    if (e.type === 'TEXT' || e.type === 'MTEXT') hasText = true;
  }

  const total = entities.length;
  const polylineRatio = total > 0 ? polylineCount / total : 0;

  // Heuristic outline score
  let score = 0;
  const lower = name.toLowerCase();
  for (const kw of OUTLINE_KEYWORDS) {
    if (name.includes(kw) || lower.includes(kw)) {
      score += 50;
      break;
    }
  }
  if (polylineRatio > 0.6) score += 30;
  else if (polylineRatio > 0.3) score += 15;
  if (total >= 5 && total <= 300) score += 10;
  if (total > 5000) score -= 20; // way too dense, probably not architectural outline

  return {
    name,
    entityCount: total,
    byType,
    polylineRatio,
    hasText,
    colorIndex: (entities[0] as { colorIndex?: number } | undefined)?.colorIndex,
    outlineScore: score,
  };
}

function indexEntitiesByLayer(db: DwgDatabase): Map<string, DwgEntity[]> {
  const map = new Map<string, DwgEntity[]>();
  for (const e of db.entities) {
    const layer = e.layer || '0';
    if (!map.has(layer)) map.set(layer, []);
    map.get(layer)!.push(e);
  }
  return map;
}

function buildLayerInfo(db: DwgDatabase): LayerInfo[] {
  const byLayer = indexEntitiesByLayer(db);
  const infos: LayerInfo[] = [];
  for (const [name, entities] of byLayer.entries()) {
    infos.push(scoreLayer(name, entities));
  }
  return infos.sort((a, b) => b.outlineScore - a.outlineScore || b.entityCount - a.entityCount);
}

function pickSmartLayers(layers: LayerInfo[]): { outline: string[]; labels: string[] } {
  // Outline: top-scoring layers above threshold, capped at 3
  const outlineCandidates = layers.filter((l) => l.outlineScore >= 30);
  const outline = outlineCandidates.slice(0, 3).map((l) => l.name);

  // If no clear winner, fall back to layer with most polylines (excluding default '0' if it's huge)
  if (outline.length === 0) {
    const byPoly = [...layers].sort((a, b) => {
      const aPoly = a.entityCount * a.polylineRatio;
      const bPoly = b.entityCount * b.polylineRatio;
      return bPoly - aPoly;
    });
    const fallback = byPoly.find((l) => l.entityCount * l.polylineRatio > 5);
    if (fallback) outline.push(fallback.name);
  }

  // Labels: any layer with TEXT/MTEXT
  const labels = layers.filter((l) => l.hasText).map((l) => l.name);

  return { outline, labels };
}

// ==================== Geometry extraction ====================

interface RawPolyline {
  points: Array<[number, number]>;
  layer: string;
}

interface RawText {
  x: number;
  y: number;
  text: string;
  size: number;
  layer: string;
}

/**
 * Extract polylines and text entities from selected layers.
 * Handles LINE, LWPOLYLINE, POLYLINE2D, ARC (approximated), CIRCLE (approximated).
 */
function extractGeometry(db: DwgDatabase, layerNames: Set<string>): {
  polylines: RawPolyline[];
  texts: RawText[];
} {
  const polylines: RawPolyline[] = [];
  const texts: RawText[] = [];

  for (const e of db.entities) {
    if (!layerNames.has(e.layer || '0')) continue;
    const lp = entityToPolyline(e);
    if (lp) {
      polylines.push({ points: lp, layer: e.layer || '0' });
      continue;
    }
    const t = entityToText(e);
    if (t) {
      texts.push({ ...t, layer: e.layer || '0' });
    }
  }

  return { polylines, texts };
}

type Point = [number, number];

function entityToPolyline(e: DwgEntity): Point[] | null {
  const any = e as unknown as Record<string, unknown>;
  switch (e.type) {
    case 'LINE': {
      const start = any.startPoint as { x: number; y: number } | undefined;
      const end = any.endPoint as { x: number; y: number } | undefined;
      if (start && end) return [[start.x, start.y], [end.x, end.y]];
      return null;
    }
    case 'LWPOLYLINE': {
      const verts = any.vertices as Array<{ x: number; y: number }> | undefined;
      if (verts && verts.length >= 2) {
        const pts: Point[] = verts.map((v) => [v.x, v.y]);
        if (any.closed) pts.push(pts[0]);
        return pts;
      }
      return null;
    }
    case 'POLYLINE2D': {
      const verts = any.vertices as Array<{ x: number; y: number }> | undefined;
      if (verts && verts.length >= 2) {
        const pts: Point[] = verts.map((v) => [v.x, v.y]);
        if (any.closed) pts.push(pts[0]);
        return pts;
      }
      return null;
    }
    case 'ARC': {
      const c = any.center as { x: number; y: number } | undefined;
      const r = any.radius as number | undefined;
      const sa = any.startAngle as number | undefined;
      const ea = any.endAngle as number | undefined;
      if (c && r != null && sa != null && ea != null) return approximateArc(c.x, c.y, r, sa, ea, 12);
      return null;
    }
    case 'CIRCLE': {
      const c = any.center as { x: number; y: number } | undefined;
      const r = any.radius as number | undefined;
      if (c && r != null) return approximateArc(c.x, c.y, r, 0, Math.PI * 2, 16);
      return null;
    }
    default:
      return null;
  }
}

function approximateArc(cx: number, cy: number, r: number, startA: number, endA: number, segs: number): Point[] {
  // libredwg returns angles in radians for ARC; CIRCLE we use 0..2π directly.
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

function entityToText(e: DwgEntity): { x: number; y: number; text: string; size: number } | null {
  const any = e as unknown as Record<string, unknown>;
  if (e.type === 'TEXT') {
    const ip = any.insertionPoint as { x: number; y: number } | undefined;
    const txt = any.text as string | undefined;
    const h = (any.textHeight as number | undefined) ?? 14;
    if (ip && txt && txt.trim()) return { x: ip.x, y: ip.y, text: txt.trim(), size: h };
    return null;
  }
  if (e.type === 'MTEXT') {
    const ip = any.insertionPoint as { x: number; y: number } | undefined;
    const txt = any.text as string | undefined;
    const h = (any.textHeight as number | undefined) ?? 14;
    if (ip && txt && txt.trim()) {
      // MTEXT may contain formatting codes — strip them
      const cleaned = txt.replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim();
      if (cleaned) return { x: ip.x, y: ip.y, text: cleaned, size: h };
    }
    return null;
  }
  return null;
}

// ==================== Simplification ====================

/**
 * Douglas-Peucker polyline simplification.
 */
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
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
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
  if (dx === 0 && dy === 0) {
    const ddx = p[0] - a[0];
    const ddy = p[1] - a[1];
    return Math.hypot(ddx, ddy);
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const projX = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const projY = a[1] + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

// ==================== Normalization ====================

const TARGET_CANVAS_WIDTH = 2000;
const TARGET_CANVAS_HEIGHT = 1500;
const TARGET_MARGIN = 50;

function computeBounds(polylines: RawPolyline[], texts: RawText[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polylines) {
    for (const [x, y] of pl.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  for (const t of texts) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 1; maxY = 1;
  }
  return { minX, minY, maxX, maxY };
}

function normalize(
  polylines: RawPolyline[],
  texts: RawText[],
  options: { canvasWidth: number; canvasHeight: number; margin: number; manualScale?: number },
): {
  outPolylines: RawPolyline[];
  outTexts: RawText[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  scaleMmPerUnit: number;
} {
  const src = computeBounds(polylines, texts);
  const srcW = Math.max(1, src.maxX - src.minX);
  const srcH = Math.max(1, src.maxY - src.minY);
  const targetW = options.canvasWidth - options.margin * 2;
  const targetH = options.canvasHeight - options.margin * 2;
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const offsetX = options.margin - src.minX * scale;
  // Y-flip: CAD has Y up, canvas has Y down. After flip, also offset by canvasHeight.
  const offsetY = options.canvasHeight - options.margin - (src.maxY - src.minY) * scale + src.minY * scale;
  // Simplification epsilon: ~half pixel after scaling
  const epsilonSrc = 0.5 / scale;

  const outPolylines = polylines
    .map((pl) => {
      const simplified = simplifyPolyline(pl.points, epsilonSrc);
      const transformed: Point[] = simplified.map(([x, y]) => [x * scale + offsetX, -y * scale + offsetY]);
      return { layer: pl.layer, points: transformed };
    })
    // Drop trivial polylines (less than 1 unit length)
    .filter((pl) => {
      if (pl.points.length < 2) return false;
      let total = 0;
      for (let i = 1; i < pl.points.length; i++) {
        total += Math.hypot(pl.points[i][0] - pl.points[i - 1][0], pl.points[i][1] - pl.points[i - 1][1]);
        if (total >= 1) return true;
      }
      return false;
    });

  const outTexts = texts.map((t) => ({
    layer: t.layer,
    x: t.x * scale + offsetX,
    y: -t.y * scale + offsetY,
    text: t.text,
    size: Math.max(8, Math.min(24, t.size * scale)),
  }));

  // Compute output bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of outPolylines) {
    for (const [x, y] of pl.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  for (const t of outTexts) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = options.canvasWidth; maxY = options.canvasHeight;
  }

  // 1 canvas unit = (1/scale) source units. If source is in mm: scaleMmPerUnit = 1/scale.
  // If user-provided override, use that.
  const scaleMmPerUnit = options.manualScale ?? (1 / scale);

  return {
    outPolylines,
    outTexts,
    bounds: { minX, minY, maxX, maxY },
    scaleMmPerUnit,
  };
}

// ==================== Main ====================

function flattenPolyline(p: Point[]): number[] {
  const out: number[] = [];
  for (const [x, y] of p) {
    out.push(x, y);
  }
  return out;
}

class DwgImportService {
  /**
   * Parse + extract + (optionally) commit a background drawing for a floor.
   */
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

    const layers = buildLayerInfo(db);
    const smartChoice = pickSmartLayers(layers);

    let outlineLayerSet: Set<string>;
    let labelLayerSet: Set<string>;

    if (options.mode === 'smart') {
      outlineLayerSet = new Set(options.includeOutline === false ? [] : smartChoice.outline);
      labelLayerSet = new Set(options.includeLabels === false ? [] : smartChoice.labels);
    } else {
      // Advanced: user-picked layers. Texts come from same set automatically.
      const picked = options.layers ?? [];
      outlineLayerSet = new Set(picked);
      labelLayerSet = new Set(picked);
    }

    const allSelected = new Set([...outlineLayerSet, ...labelLayerSet]);
    const { polylines, texts } = extractGeometry(db, allSelected);

    // Split: polylines tagged with outline-layers vs text-layers (texts always go to labels)
    const outlinePolys = polylines.filter((p) => outlineLayerSet.has(p.layer));
    const labelTexts = texts.filter((t) => labelLayerSet.has(t.layer));

    const { outPolylines, outTexts, bounds, scaleMmPerUnit } = normalize(
      outlinePolys,
      labelTexts,
      {
        canvasWidth: floor.canvasWidth || TARGET_CANVAS_WIDTH,
        canvasHeight: floor.canvasHeight || TARGET_CANVAS_HEIGHT,
        margin: TARGET_MARGIN,
        manualScale: options.scaleMmPerUnit,
      },
    );

    const backgroundDrawing: BackgroundDrawing = {
      source: {
        fileName,
        importedAt: new Date().toISOString(),
        fileType,
      },
      bounds,
      scaleMmPerUnit,
      outline: outPolylines.length > 0
        ? {
            polylines: outPolylines.map((p) => flattenPolyline(p.points)),
            color: '#666666',
            strokeWidth: 1.5,
          }
        : null,
      labels: outTexts.map((t) => ({ x: t.x, y: t.y, text: t.text, size: t.size })),
      outlineLayers: [...outlineLayerSet],
      labelLayers: [...labelLayerSet],
    };

    if (options.commit) {
      await prisma.floor.update({
        where: { id: floorId },
        data: { backgroundDrawing: backgroundDrawing as unknown as object },
      });
    }

    return {
      backgroundDrawing,
      availableLayers: layers,
      smartChoice,
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
