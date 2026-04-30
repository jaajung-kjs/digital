import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(path.resolve(__dirname, '..'), 'node_modules/@mlightcad/libredwg-web/wasm/');

async function main() {
  const target = process.argv[2];
  if (!target) { console.error('usage: tsx inspect-styling.ts <file>'); process.exit(1); }
  const lib = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(path.resolve(target));
  const dwg = lib.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Dwg_File_Type.DWG);
  if (!dwg) { console.error('parse fail'); process.exit(1); }
  const { database: db } = lib.convertEx(dwg);
  const ents = db.entities as Array<Record<string, unknown> & { type: string }>;

  // Layer table
  const layers = (db.tables.LAYER?.entries ?? []) as Array<Record<string, unknown>>;
  console.log(`\n=== LAYER table (${layers.length} entries) ===`);
  for (const l of layers.slice(0, 3)) {
    console.log(`  keys: ${Object.keys(l).join(', ')}`);
    console.log('  sample:', JSON.stringify(l).slice(0, 400));
  }

  // LTYPE table
  const ltypes = (db.tables.LTYPE?.entries ?? []) as Array<Record<string, unknown>>;
  console.log(`\n=== LTYPE table (${ltypes.length} entries) ===`);
  for (const l of ltypes.slice(0, 5)) {
    console.log(`  ${l.name}  keys: ${Object.keys(l).join(', ')}`);
    console.log('  sample:', JSON.stringify(l).slice(0, 400));
  }

  // Entity counts by type
  const counts: Record<string, number> = {};
  for (const e of ents) counts[e.type] = (counts[e.type] ?? 0) + 1;
  console.log('\n=== Entity types in db.entities ===', counts);

  // Sample entity styling fields (LINE/LWPOLYLINE)
  const lines = ents.filter((e) => e.type === 'LINE').slice(0, 2);
  for (const l of lines) {
    console.log(`\n  LINE keys: ${Object.keys(l).join(', ')}`);
    console.log('  sample:', JSON.stringify(l).slice(0, 400));
  }

  // SOLID
  const solids = ents.filter((e) => e.type === 'SOLID').slice(0, 2);
  console.log(`\n=== SOLID entities (${ents.filter(e => e.type === 'SOLID').length} total) ===`);
  for (const s of solids) {
    console.log(`  keys: ${Object.keys(s).join(', ')}`);
    console.log('  sample:', JSON.stringify(s).slice(0, 600));
  }

  // HATCH
  const hatches = ents.filter((e) => e.type === 'HATCH').slice(0, 2);
  console.log(`\n=== HATCH entities (${ents.filter(e => e.type === 'HATCH').length} total) ===`);
  for (const h of hatches) {
    console.log(`  keys: ${Object.keys(h).join(', ')}`);
    console.log('  sample:', JSON.stringify(h).slice(0, 800));
  }

  // Search blocks for SOLID/HATCH
  const blocks = (db.tables.BLOCK_RECORD?.entries ?? []) as Array<{ name: string; entities?: Array<Record<string, unknown> & { type: string }> }>;
  let blockSolids = 0, blockHatches = 0;
  let firstBlockHatch: Record<string, unknown> | null = null;
  let firstBlockSolid: Record<string, unknown> | null = null;
  for (const b of blocks) {
    for (const e of (b.entities ?? [])) {
      if (e.type === 'SOLID') { blockSolids++; if (!firstBlockSolid) firstBlockSolid = e; }
      if (e.type === 'HATCH') { blockHatches++; if (!firstBlockHatch) firstBlockHatch = e; }
    }
  }
  console.log(`\n=== In blocks: SOLID=${blockSolids}, HATCH=${blockHatches} ===`);
  if (firstBlockSolid) {
    console.log(`  first SOLID keys: ${Object.keys(firstBlockSolid).join(', ')}`);
    console.log('  sample:', JSON.stringify(firstBlockSolid).slice(0, 500));
  }
  if (firstBlockHatch) {
    console.log(`  first HATCH keys: ${Object.keys(firstBlockHatch).join(', ')}`);
    console.log('  sample:', JSON.stringify(firstBlockHatch).slice(0, 800));
  }

  // Sample TEXT to see halign/valign actual values
  const textEnts = ents.filter((e) => e.type === 'TEXT').slice(0, 3);
  console.log('\n=== TEXT samples ===');
  for (const t of textEnts) {
    console.log(`  keys: ${Object.keys(t).join(', ')}`);
    console.log('  sample:', JSON.stringify(t).slice(0, 400));
  }

  lib.dwg_free(dwg);
}
main().catch((e) => { console.error(e); process.exit(1); });
