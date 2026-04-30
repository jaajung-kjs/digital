/**
 * Layout / Block / spatial-cluster inspection of a DWG file.
 *
 * The standard inspect-dwg.ts dumps layers and entity types. This one digs
 * into "is this file logically multiple drawings inside one Model space?"
 *   - LAYOUT table  → AutoCAD layouts (Model + Paperspace tabs)
 *   - BLOCK_RECORD  → Model_Space / Paper_Space / user blocks
 *   - per-block entity counts via ownerBlockRecordSoftId
 *   - Model-space entities: rough bbox clustering (greedy, gap-based)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wasmDir = path.join(projectRoot, 'node_modules/@mlightcad/libredwg-web/wasm/');

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: tsx scripts/inspect-dwg-layouts.ts <dwg-or-dxf-file>...');
  process.exit(1);
}

type AnyEntity = Record<string, unknown> & { type: string; layer?: string };

function entityBBox(e: AnyEntity): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const upd = (acc: { minX: number; minY: number; maxX: number; maxY: number } | null, x: number, y: number) => {
    if (!isFinite(x) || !isFinite(y)) return acc;
    if (!acc) return { minX: x, minY: y, maxX: x, maxY: y };
    return {
      minX: Math.min(acc.minX, x),
      minY: Math.min(acc.minY, y),
      maxX: Math.max(acc.maxX, x),
      maxY: Math.max(acc.maxY, y),
    };
  };
  let acc: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  const t = e.type;
  if (t === 'LINE') {
    const s = e.startPoint as { x: number; y: number } | undefined;
    const ee = e.endPoint as { x: number; y: number } | undefined;
    if (s) acc = upd(acc, s.x, s.y);
    if (ee) acc = upd(acc, ee.x, ee.y);
  } else if (t === 'LWPOLYLINE' || t === 'POLYLINE2D' || t === 'POLYLINE3D') {
    const verts = e.vertices as Array<{ x: number; y: number }> | undefined;
    if (verts) for (const v of verts) acc = upd(acc, v.x, v.y);
  } else if (t === 'ARC' || t === 'CIRCLE' || t === 'ELLIPSE') {
    const c = e.center as { x: number; y: number } | undefined;
    const r = (e.radius as number | undefined) ?? (e.majorRadius as number | undefined) ?? 0;
    if (c) {
      acc = upd(acc, c.x - r, c.y - r);
      acc = upd(acc, c.x + r, c.y + r);
    }
  } else if (t === 'TEXT' || t === 'MTEXT' || t === 'POINT' || t === 'INSERT') {
    const ip = (e.insertionPoint ?? e.position) as { x: number; y: number } | undefined;
    if (ip) acc = upd(acc, ip.x, ip.y);
  }
  return acc;
}

interface Cluster {
  minX: number; minY: number; maxX: number; maxY: number;
  count: number;
  byType: Record<string, number>;
  sampleTexts: string[];
}

/**
 * Greedy grid-bin clustering: divide model-space into roughly-equal cells
 * (cellSize derived from total extent), then merge adjacent populated cells.
 * Good enough to spot "this file has 3 drawings in one model space".
 */
function clusterEntities(entities: AnyEntity[], targetCells = 60): Cluster[] {
  const bboxes: Array<{ e: AnyEntity; b: { minX: number; minY: number; maxX: number; maxY: number } }> = [];
  let totalBBox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const e of entities) {
    const b = entityBBox(e);
    if (!b) continue;
    bboxes.push({ e, b });
    if (!totalBBox) totalBBox = { ...b };
    else {
      totalBBox.minX = Math.min(totalBBox.minX, b.minX);
      totalBBox.minY = Math.min(totalBBox.minY, b.minY);
      totalBBox.maxX = Math.max(totalBBox.maxX, b.maxX);
      totalBBox.maxY = Math.max(totalBBox.maxY, b.maxY);
    }
  }
  if (!totalBBox) return [];
  const w = totalBBox.maxX - totalBBox.minX;
  const h = totalBBox.maxY - totalBBox.minY;
  const cellW = w / Math.max(1, Math.sqrt(targetCells));
  const cellH = h / Math.max(1, Math.sqrt(targetCells));
  const cells = new Map<string, Cluster>();
  const ix = (x: number) => Math.floor((x - totalBBox!.minX) / cellW);
  const iy = (y: number) => Math.floor((y - totalBBox!.minY) / cellH);
  for (const { e, b } of bboxes) {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const k = `${ix(cx)},${iy(cy)}`;
    let c = cells.get(k);
    if (!c) {
      c = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, count: 0, byType: {}, sampleTexts: [] };
      cells.set(k, c);
    }
    c.minX = Math.min(c.minX, b.minX);
    c.minY = Math.min(c.minY, b.minY);
    c.maxX = Math.max(c.maxX, b.maxX);
    c.maxY = Math.max(c.maxY, b.maxY);
    c.count++;
    c.byType[e.type] = (c.byType[e.type] ?? 0) + 1;
    if (c.sampleTexts.length < 4 && (e.type === 'TEXT' || e.type === 'MTEXT')) {
      const txt = (e.text as string | undefined)?.replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim();
      if (txt) c.sampleTexts.push(txt);
    }
  }

  // Merge adjacent populated cells (4-neighbour BFS) so a single drawing
  // that spans several cells becomes one cluster.
  const visited = new Set<string>();
  const merged: Cluster[] = [];
  for (const k of cells.keys()) {
    if (visited.has(k)) continue;
    const queue = [k];
    let mc: Cluster | null = null;
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const c = cells.get(cur)!;
      if (!mc) mc = { ...c, byType: { ...c.byType }, sampleTexts: [...c.sampleTexts] };
      else {
        mc.minX = Math.min(mc.minX, c.minX);
        mc.minY = Math.min(mc.minY, c.minY);
        mc.maxX = Math.max(mc.maxX, c.maxX);
        mc.maxY = Math.max(mc.maxY, c.maxY);
        mc.count += c.count;
        for (const [t, n] of Object.entries(c.byType)) mc.byType[t] = (mc.byType[t] ?? 0) + n;
        for (const txt of c.sampleTexts) if (mc.sampleTexts.length < 8) mc.sampleTexts.push(txt);
      }
      const [xs, ys] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = `${xs + dx},${ys + dy}`;
        if (cells.has(nk) && !visited.has(nk)) queue.push(nk);
      }
    }
    if (mc) merged.push(mc);
  }
  return merged.sort((a, b) => b.count - a.count);
}

async function main() {
  const libredwg = await LibreDwg.create(wasmDir);

  for (const file of targets) {
    const abs = path.resolve(file);
    console.log('\n========================================');
    console.log('FILE:', abs);
    console.log('========================================');

    const buffer = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const fileType = ext === '.dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
    const dwg = libredwg.dwg_read_data(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      fileType,
    );
    if (!dwg) {
      console.error('  parse failed');
      continue;
    }
    const { database: db } = libredwg.convertEx(dwg);

    // Layout tabs (Model + Paperspace)
    const layouts = (db.tables as unknown as Record<string, { entries?: unknown[] }>)?.LAYOUT?.entries
      ?? (db as unknown as Record<string, unknown[]>).layouts
      ?? [];
    console.log(`\nLayouts (${layouts.length}):`);
    for (const l of layouts as Array<Record<string, unknown>>) {
      const name = l.name ?? l.layoutName ?? '?';
      const tabOrder = l.tabOrder ?? '?';
      const block = l.blockRecordSoftId ?? l.blockRecordHardId ?? '?';
      console.log(`  - ${name}  tab=${tabOrder}  block=${block}`);
    }

    // Block records — special spaces + user blocks
    const blocks = (db.tables.BLOCK_RECORD?.entries ?? []) as Array<Record<string, unknown>>;
    console.log(`\nBlock records (${blocks.length}):`);
    const specialBlocks = blocks.filter((b) => typeof b.name === 'string' && (b.name as string).startsWith('*'));
    console.log(`  specials (${specialBlocks.length}):`);
    for (const b of specialBlocks.slice(0, 20)) console.log(`    ${b.name}  handle=${b.handle}`);
    if (specialBlocks.length > 20) console.log(`    ... ${specialBlocks.length - 20} more`);

    // Per-owner entity counts
    const byOwner = new Map<string, number>();
    for (const e of db.entities) {
      const owner = (e as unknown as { ownerBlockRecordSoftId?: string }).ownerBlockRecordSoftId ?? '?';
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    }
    console.log('\nEntities by owner block-record:');
    const ownerSorted = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [owner, n] of ownerSorted) {
      const blk = blocks.find((b) => b.handle === owner);
      console.log(`  ${owner.padEnd(8)} ${String(blk?.name ?? '(unknown)').padEnd(30)} ${n}`);
    }

    // Spatial clustering of model-space entities
    const modelSpace = blocks.find((b) => (b.name as string) === '*Model_Space') as { handle?: string } | undefined;
    const modelOwner = modelSpace?.handle;
    const msEntities = (db.entities as unknown as AnyEntity[]).filter((e) => {
      const ow = (e as unknown as { ownerBlockRecordSoftId?: string }).ownerBlockRecordSoftId;
      return modelOwner ? ow === modelOwner : true;
    });
    console.log(`\nModel-space entities: ${msEntities.length}`);

    const clusters = clusterEntities(msEntities, 60);
    console.log(`\nSpatial clusters (top 8 by entity count):`);
    for (const c of clusters.slice(0, 8)) {
      const w = c.maxX - c.minX;
      const h = c.maxY - c.minY;
      console.log(`  - count=${c.count}  bbox=(${c.minX.toFixed(1)},${c.minY.toFixed(1)})..(${c.maxX.toFixed(1)},${c.maxY.toFixed(1)})  size=${w.toFixed(1)}x${h.toFixed(1)}`);
      const types = Object.entries(c.byType).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`      top types: ${types.map(([t, n]) => `${t}:${n}`).join(' ')}`);
      if (c.sampleTexts.length) console.log(`      sample texts: ${c.sampleTexts.slice(0, 5).join(' | ').slice(0, 200)}`);
    }
    console.log(`\nTotal clusters: ${clusters.length}`);

    libredwg.dwg_free(dwg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
